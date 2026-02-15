/**
 * Cognition System HTTP Server — Composition Root
 *
 * Creates services, state, event listeners, and mounts route modules.
 * All route handlers live in ./routes/; helpers in ./server-utils/.
 *
 * @author @darianrosebrook
 */

import * as express from 'express';
import * as cors from 'cors';
import {
  createServiceClients,
  resilientFetch,
  TTSClient,
} from '@conscious-bot/core';
import { ReActArbiter } from './react-arbiter/ReActArbiter';
import {
  eventDrivenThoughtGenerator,
  ContextualThought,
} from './event-driven-thought-generator';
import { LLMInterface } from './cognitive-core/llm-interface';
import {
  updateBotStateCache,
  patchBotStateCache,
  getBotStateCache,
  botStateCacheAgeMs,
  STALE_THRESHOLD_MS,
  isCompletePosition,
} from './bot-state-cache';
import {
  ObservationReasoner,
  ObservationPayload,
  ObservationInsight,
} from './environmental/observation-reasoner';
import { createSaliencyReasonerState } from './environmental/saliency-reasoner';

import { EnhancedThoughtGenerator } from './thought-generator';
import {
  getInteroState,
  halveStressAxes,
  setStressAxes,
  decayStressAxes,
  updateStressFromIntrusion,
} from './interoception-store';
import { logStressAtBoundary } from './stress-boundary-logger';
import {
  recordInteroSnapshot,
  getInteroHistory,
  loadInteroHistory,
  getInteroHistorySummary,
} from './intero-history';
import {
  buildWorldStateSnapshot,
  computeStressAxes,
  blendAxes,
  buildStressContext,
} from './stress-axis-computer';
import { IntrusiveThoughtProcessor } from './intrusive-thought-processor';
import { SocialAwarenessManager } from './social-awareness-manager';
import { SocialMemoryManager } from '../../memory/src/social/social-memory-manager';

// Extracted modules
import { CognitiveStreamLogger } from './cognitive-stream-logger';
import { CognitiveMetricsTracker } from './cognitive-metrics-tracker';
import { CognitiveStateTracker } from './cognitive-state-tracker';
import { createInitialState, CognitionMutableState } from './cognition-state';
import { THOUGHT_CYCLE_MS } from './server-utils/constants';
import { ObservationQueueItem } from './server-utils/observation-helpers';
import { createThoughtStreamHelpers } from './server-utils/thought-stream-helpers';
import { createServerLogger } from './server-utils/server-logger';

// Route modules
import { createSystemRoutes } from './routes/system-routes';
import { createTelemetryRoutes } from './routes/telemetry-routes';
import { createReasoningRoutes } from './routes/reasoning-routes';
import { createThoughtRoutes } from './routes/thought-routes';
import { createCognitiveStreamRoutes } from './routes/cognitive-stream-routes';
import { createSocialRoutes } from './routes/social-routes';
import { createProcessRoutes } from './routes/process-routes';
import { createSocialMemoryRoutes } from './routes/social-memory-routes';
import { createReflectionRoutes } from './routes/reflection-routes';

// ============================================================================
// Service creation
// ============================================================================

const cognitiveLogger = CognitiveStreamLogger.getInstance();
const serverLogger = createServerLogger({ subsystem: 'cognition-server' });

const observationLogDebug = process.env.OBSERVATION_LOG_DEBUG === '1';
function logObservation(message: string, payload?: unknown): void {
  if (observationLogDebug && payload !== undefined) {
    serverLogger.debug(message, {
      event: 'observation_log',
      tags: ['observation', 'debug'],
      fields: { payload },
    });
  } else {
    serverLogger.debug(message, {
      event: 'observation_log',
      tags: ['observation', 'debug'],
    });
  }
}

async function resilientFetchLogged(
  url: string,
  options: Parameters<typeof resilientFetch>[1],
  logContext: {
    event: string;
    tags: string[];
    fields?: Record<string, unknown>;
  }
): Promise<Response | null> {
  const response = await resilientFetch(url, { ...options, silent: true });
  if (!response?.ok) {
    serverLogger.warn('Resilient fetch failed', {
      event: logContext.event,
      tags: logContext.tags,
      fields: {
        label: options?.label ?? url,
        status: response?.status ?? 'unavailable',
        ...logContext.fields,
      },
    });
  }
  return response;
}

const llmInterface = new LLMInterface();
const observationTimeoutMs = process.env.COGNITION_OBSERVATION_TIMEOUT_MS
  ? parseInt(process.env.COGNITION_OBSERVATION_TIMEOUT_MS, 10)
  : 35000;
const observationReasoner = new ObservationReasoner(llmInterface, {
  disabled: process.env.COGNITION_LLM_OBSERVATION_DISABLED === 'true',
  timeoutMs: observationTimeoutMs,
});

const saliencyState = createSaliencyReasonerState();
const metricsTracker = new CognitiveMetricsTracker();
const cognitiveStateTracker = new CognitiveStateTracker(metricsTracker);
const ttsClient = new TTSClient();
const dashboardUrl = process.env.DASHBOARD_ENDPOINT || 'http://localhost:3000';

const reactArbiter = new ReActArbiter({
  provider: 'mlx',
  model: 'gemma3n:e2b',
  maxTokens: 1000,
  temperature: 0.3,
  timeout: 30000,
  retries: 3,
});

const enhancedThoughtGenerator = new EnhancedThoughtGenerator({
  thoughtInterval: 60000,
  maxThoughtsPerCycle: 1,
  enableIdleThoughts: true,
  enableContextualThoughts: true,
  enableEventDrivenThoughts: true,
});

const intrusiveThoughtProcessor = new IntrusiveThoughtProcessor({
  enableActionParsing: true,
  enableTaskCreation: true,
  enablePlanningIntegration: true,
  enableMinecraftIntegration: true,
  planningEndpoint: process.env.PLANNING_ENDPOINT || 'http://localhost:3002',
  minecraftEndpoint: process.env.MINECRAFT_ENDPOINT || 'http://localhost:3005',
});

const socialAwarenessManager = new SocialAwarenessManager({
  maxDistance: 15,
  considerationCooldownMs: 30000,
  enableVerboseLogging: true,
  cognitionEndpoint: 'http://localhost:3003',
  enableSocialMemory: true,
  socialMemoryManager: null as any,
});

const cognitionSystem = {
  cognitiveCore: {
    contextOptimizer: { isActive: () => false },
    conversationManager: { isActive: () => false },
    creativeSolver: { isActive: () => false },
  },
  constitutionalFilter: { getRulesCount: () => 0 },
  intrusionInterface: { isActive: () => false },
  selfModel: {
    getIdentityCount: () => 0,
    getActiveIdentities: () => [] as any[],
  },
  socialCognition: { getAgentCount: () => 0, getRelationshipCount: () => 0 },
};

// ============================================================================
// State container
// ============================================================================

const state = createInitialState();

// Initialize social memory manager asynchronously
(async () => {
  try {
    const memoryModule = await import('@conscious-bot/memory');
    const { KnowledgeGraphCore } = memoryModule;
    const knowledgeGraph = new KnowledgeGraphCore({
      persistToStorage: true,
      storageDirectory: './memory-storage',
    });
    state.socialMemoryManager = new SocialMemoryManager(knowledgeGraph as any, {
      enableVerboseLogging: true,
    });
    // Update social awareness manager with the initialized manager
    (socialAwarenessManager as any).socialMemoryManager =
      state.socialMemoryManager;
  } catch (error) {
    serverLogger.warn('Social memory system could not be initialized', {
      event: 'social_memory_init_failed',
      tags: ['social-memory', 'init', 'warn'],
      fields: { error: (error as Error)?.message },
    });
  }
})();

// ============================================================================
// Observation queue
// ============================================================================

let observationQueue: ObservationQueueItem[] = [];
let observationQueueRunning = false;

function drainObservationQueue(): void {
  if (observationQueueRunning || observationQueue.length === 0) return;
  observationQueueRunning = true;
  const pending = observationQueue;
  observationQueue = [];
  const byNewest = [...pending].sort((a, b) => b.createdAt - a.createdAt);
  const newest = byNewest[0];
  const stale = byNewest.slice(1);
  for (const item of stale) {
    const insight = observationReasoner.getStaleFallback(
      item.observation,
      item.observation.observationId
    );
    item.resolve(insight);
  }
  observationReasoner
    .reason(newest.observation)
    .then((insight) => {
      newest.resolve(insight);
    })
    .catch((err) => {
      newest.reject(err);
    })
    .finally(() => {
      observationQueueRunning = false;
      if (observationQueue.length > 0) drainObservationQueue();
    });
}

function enqueueObservation(
  observation: ObservationPayload
): Promise<ObservationInsight> {
  return new Promise<ObservationInsight>((resolve, reject) => {
    observationQueue.push({
      observation,
      resolve,
      reject,
      createdAt: Date.now(),
    });
    drainObservationQueue();
  });
}

// ============================================================================
// Thought stream helpers
// ============================================================================

const { sendThoughtToCognitiveStream, runConsiderationStep } =
  createThoughtStreamHelpers({
    dashboardUrl,
    ttsClient,
    llmInterface,
  });

// ============================================================================
// Thought generation control
// ============================================================================

function startThoughtGeneration() {
  if (state.thoughtGenerationInterval) {
    clearInterval(state.thoughtGenerationInterval);
  }

  cognitiveLogger
    .logStatus(
      'thought_generation_started',
      'Enhanced thought generator started with 60-second intervals',
      {
        interval: 60000,
        cognitiveSystem: 'cognition-system',
        category: 'system',
        tags: ['thought_generation', 'started'],
      }
    )
    .catch((error) => {
      serverLogger.warn('Failed to log thought generation start', {
        event: 'thought_generation_log_start_failed',
        tags: ['thought-generation', 'log', 'warn'],
        fields: { error: error instanceof Error ? error.message : String(error) },
      });
    });

  // Generate initial thought
  enhancedThoughtGenerator.generateThought({
    currentState: {},
    currentTasks: [],
    recentEvents: [],
    emotionalState: 'neutral',
    memoryContext: {},
  });

  // Set up periodic thought generation every 60 seconds
  state.thoughtGenerationInterval = setInterval(async () => {
    try {
      const mcUrl = process.env.MINECRAFT_ENDPOINT || 'http://localhost:3005';
      const planningUrl =
        process.env.PLANNING_SERVICE_URL || 'http://localhost:3002';
      const [botRes, planningRes] = await Promise.all([
        resilientFetchLogged(
          `${mcUrl}/state`,
          { label: 'mc/state' },
          {
            event: 'resilient_fetch_failed',
            tags: ['resilient-fetch', 'mc'],
            fields: { url: `${mcUrl}/state` },
          }
        ),
        resilientFetchLogged(
          `${planningUrl}/state`,
          { label: 'planning/state' },
          {
            event: 'resilient_fetch_failed',
            tags: ['resilient-fetch', 'planning'],
            fields: { url: `${planningUrl}/state` },
          }
        ),
      ]);
      const botState = botRes?.ok ? await botRes.json() : null;
      const planningState = planningRes?.ok ? await planningRes.json() : null;

      const rawState = (botState as any)?.data || {};
      const innerData = rawState.data || {};
      const rawInventory = innerData.inventory;
      const inventory = Array.isArray(rawInventory)
        ? rawInventory
        : Array.isArray(rawInventory?.items)
          ? rawInventory.items
          : [];
      const currentState = {
        ...innerData,
        inventory,
        timeOfDay: innerData.timeOfDay,
        weather: innerData.weather,
        biome: innerData.biome,
        dimension: innerData.dimension,
        nearbyHostiles: innerData.nearbyHostiles,
        nearbyPassives: innerData.nearbyPassives,
        nearbyLogs: innerData.nearbyLogs,
        nearbyOres: innerData.nearbyOres,
        nearbyWater: innerData.nearbyWater,
        gameMode: rawState.worldState?.player?.gameMode,
      };
      const currentTasks = (planningState as any)?.state?.tasks?.current || [];
      const recentEvents = (botState as any)?.data?.recentEvents || [];

      // Compute and blend stress axes from world state
      if (botState) {
        const snapshot = buildWorldStateSnapshot(
          botState,
          state.spawnPosition,
          {
            msSinceLastRest: state.msSinceLastRest,
            msSinceLastProgress: state.msSinceLastProgress,
          }
        );
        const computed = computeStressAxes(snapshot);
        const blended = blendAxes(getInteroState().stressAxes, computed);
        setStressAxes(blended);
        decayStressAxes();
      }
      state.msSinceLastRest += THOUGHT_CYCLE_MS;
      state.msSinceLastProgress += THOUGHT_CYCLE_MS;

      const compositeStress = getInteroState().stress;
      const emotionalState =
        compositeStress > 60
          ? 'uneasy'
          : compositeStress > 35
            ? 'attentive'
            : 'neutral';

      recordInteroSnapshot(getInteroState(), emotionalState);
      updateBotStateCache(currentState, currentTasks, emotionalState);

      const stressCtx = buildStressContext(getInteroState().stressAxes);

      (currentState as any).isNight =
        ((currentState as any).timeOfDay ?? 0) >= 13000;

      await enhancedThoughtGenerator.generateThought({
        currentState,
        currentTasks,
        recentEvents,
        emotionalState,
        memoryContext: {},
        stressContext: stressCtx || undefined,
      });

      // Agency counter delta logging
      const counters = enhancedThoughtGenerator.getAgencyCounters();
      const uptimeMin = Math.round(
        (Date.now() - counters.startedAtMs) / 60_000
      );
      serverLogger.info('Agency counters snapshot', {
        event: 'agency_counters',
        tags: ['thought-generation', 'metrics'],
        fields: {
          uptimeMin,
          llmCalls: counters.llmCalls,
          goalTags: counters.goalTags,
          driveTicks: counters.driveTicks,
          signatureSuppressions: counters.signatureSuppressions,
          contentSuppressions: counters.contentSuppressions,
          intentExtractions: counters.intentExtractions,
        },
      });
    } catch (error) {
      serverLogger.error('Error generating periodic thought', {
        event: 'thought_generation_error',
        tags: ['thought-generation', 'error'],
        fields: { error: error instanceof Error ? error.message : String(error) },
      });

      cognitiveLogger
        .logEvent(
          'thought_generation_error',
          `Error generating periodic thought: ${error instanceof Error ? error.message : 'Unknown error'}`,
          {
            error: error instanceof Error ? error.message : 'Unknown error',
            cognitiveSystem: 'cognition-system',
            category: 'error',
            tags: ['thought_generation', 'error'],
          }
        )
        .catch((logError) => {
          serverLogger.warn('Failed to log thought generation error', {
            event: 'thought_generation_log_error_failed',
            tags: ['thought-generation', 'log', 'warn'],
            fields: {
              error:
                logError instanceof Error ? logError.message : String(logError),
            },
          });
        });
    }
  }, 60000);

  serverLogger.info('Enhanced thought generator started', {
    event: 'thought_generation_started',
    tags: ['thought-generation', 'started'],
    fields: { intervalMs: 60000 },
  });
}

function stopThoughtGeneration() {
  if (state.thoughtGenerationInterval) {
    clearInterval(state.thoughtGenerationInterval);
    state.thoughtGenerationInterval = null;

    cognitiveLogger
      .logStatus(
        'thought_generation_stopped',
        'Enhanced thought generator stopped',
        {
          cognitiveSystem: 'cognition-system',
          category: 'system',
          tags: ['thought_generation', 'stopped'],
        }
      )
      .catch((error) => {
        serverLogger.warn('Failed to log thought generation stop', {
          event: 'thought_generation_log_stop_failed',
          tags: ['thought-generation', 'log', 'warn'],
          fields: {
            error: error instanceof Error ? error.message : String(error),
          },
        });
      });

    serverLogger.info('Enhanced thought generator stopped', {
      event: 'thought_generation_stopped',
      tags: ['thought-generation', 'stopped'],
    });
  }
}

// ============================================================================
// Event listeners (with .catch() on fire-and-forget async calls)
// ============================================================================

enhancedThoughtGenerator.on('thoughtGenerated', (thought) => {
  state.cognitiveThoughts.push(thought);
  sendThoughtToCognitiveStream(thought).catch((err: any) => {
    serverLogger.warn('Failed to send thought to stream', {
      event: 'thought_stream_send_failed',
      tags: ['thought-stream', 'send', 'warn'],
      fields: { error: err?.message || String(err) },
    });
  });
});

intrusiveThoughtProcessor.on(
  'thoughtProcessingStarted',
  ({ thought, timestamp }) => {
    cognitiveLogger
      .logThoughtProcessing(thought, 'started', {
        cognitiveSystem: 'intrusive-processor',
        category: 'processing',
        tags: ['intrusive', 'processing', 'started'],
      })
      .catch((error) => {
        serverLogger.warn('Failed to log thought processing start', {
          event: 'thought_processing_log_start_failed',
          tags: ['intrusive', 'processing', 'log', 'warn'],
          fields: {
            error: error instanceof Error ? error.message : String(error),
          },
        });
      });

    const processingThought = {
      id: `processing-started-${timestamp}`,
      type: 'reflection',
      content: `Processing intrusive thought: "${thought}"`,
      timestamp,
      context: {
        emotionalState: 'focused',
        confidence: 0.6,
        cognitiveSystem: 'intrusive-processor',
      },
      metadata: {
        thoughtType: 'processing-start',
        source: 'intrusive-thought',
      },
    };

    sendThoughtToCognitiveStream(processingThought).catch((err: any) => {
      serverLogger.warn('Failed to send thought to stream', {
        event: 'thought_stream_send_failed',
        tags: ['thought-stream', 'send', 'warn'],
        fields: { error: err?.message || String(err) },
      });
    });
  }
);

intrusiveThoughtProcessor.on('thoughtGenerated', ({ thought, timestamp }) => {
  cognitiveLogger
    .logEvent(
      'intrusive_thought_generated',
      `Intrusive thought generated as internal thought: "${thought.content}"`,
      {
        emotionalState: 'curious',
        confidence: 0.7,
        cognitiveSystem: 'intrusive-processor',
        category: 'thought_generation',
        tags: ['intrusive', 'generated', 'internal'],
      }
    )
    .catch((error) => {
      serverLogger.warn('Failed to log intrusive thought generation', {
        event: 'intrusive_thought_log_failed',
        tags: ['intrusive', 'thought', 'log', 'warn'],
        fields: { error: error instanceof Error ? error.message : String(error) },
      });
    });

  const generatedThought = {
    id: `intrusive-generated-${timestamp}`,
    type: thought.type || 'intrusive',
    content: thought.content,
    timestamp: thought.timestamp || timestamp,
    context: thought.context,
    metadata: thought.metadata,
  };

  sendThoughtToCognitiveStream(generatedThought).catch((err: any) => {
    serverLogger.warn('Failed to send thought to stream', {
      event: 'thought_stream_send_failed',
      tags: ['thought-stream', 'send', 'warn'],
      fields: { error: err?.message || String(err) },
    });
  });
});

intrusiveThoughtProcessor.on(
  'thoughtRecorded',
  ({ thought, action, timestamp }) => {
    serverLogger.info('Thought recorded (no action)', {
      event: 'intrusive_thought_recorded',
      tags: ['intrusive', 'thought', 'recorded'],
      fields: { thought },
    });

    const recordedThought = {
      id: `thought-recorded-${timestamp}`,
      type: 'reflection',
      content: `Recorded thought: "${thought}" (no immediate action required)`,
      timestamp,
      context: {
        emotionalState: 'neutral',
        confidence: 0.5,
        cognitiveSystem: 'intrusive-processor',
      },
      metadata: {
        thoughtType: 'thought-recording',
        source: 'intrusive-thought',
        hasAction: false,
      },
    };

    sendThoughtToCognitiveStream(recordedThought).catch((err: any) => {
      serverLogger.warn('Failed to send thought to stream', {
        event: 'thought_stream_send_failed',
        tags: ['thought-stream', 'send', 'warn'],
        fields: { error: err?.message || String(err) },
      });
    });
  }
);

intrusiveThoughtProcessor.on('processingError', ({ thought, error }) => {
  serverLogger.error('Error processing intrusive thought', {
    event: 'intrusive_thought_processing_error',
    tags: ['intrusive', 'processing', 'error'],
    fields: { thought, error: String(error) },
  });

  const errorThought = {
    id: `processing-error-${Date.now()}`,
    type: 'reflection',
    content: `Failed to process intrusive thought: "${thought}". Error: ${error}`,
    timestamp: Date.now(),
    context: {
      emotionalState: 'concerned',
      confidence: 0.3,
      cognitiveSystem: 'intrusive-processor',
    },
    metadata: {
      thoughtType: 'processing-error',
      error: error,
    },
  };

  sendThoughtToCognitiveStream(errorThought).catch((err: any) => {
    serverLogger.warn('Failed to send thought to stream', {
      event: 'thought_stream_send_failed',
      tags: ['thought-stream', 'send', 'warn'],
      fields: { error: err?.message || String(err) },
    });
  });
});

socialAwarenessManager.on('socialConsiderationGenerated', (result: any) => {
  cognitiveLogger
    .logSocialConsideration(
      `${result.entity.type} ${result.entity.id}`,
      result.reasoning,
      {
        shouldAcknowledge: result.shouldAcknowledge,
        priority: result.priority,
        distance: result.entity.distance,
        action: result.action,
        entityType: result.entity.type,
        entityId: result.entity.id,
      }
    )
    .catch((error) => {
      serverLogger.warn('Failed to log social consideration', {
        event: 'social_consideration_log_failed',
        tags: ['social', 'consideration', 'log', 'warn'],
        fields: { error: error instanceof Error ? error.message : String(error) },
      });
    });

  const considerationThought = {
    id: `social-consideration-${result.timestamp}`,
    type: 'social_consideration',
    content: result.reasoning,
    timestamp: result.timestamp,
    context: {
      emotionalState: 'thoughtful',
      confidence: 0.7,
      cognitiveSystem: 'social-awareness',
    },
    metadata: {
      thoughtType: 'social-consideration',
      entityType: result.entity.type,
      entityId: result.entity.id,
      distance: result.entity.distance,
      shouldAcknowledge: result.shouldAcknowledge,
      priority: result.priority,
      action: result.action,
    },
  };

  sendThoughtToCognitiveStream(considerationThought).catch((err: any) => {
    serverLogger.warn('Failed to send thought to stream', {
      event: 'thought_stream_send_failed',
      tags: ['thought-stream', 'send', 'warn'],
      fields: { error: err?.message || String(err) },
    });
  });
});

socialAwarenessManager.on('chatConsiderationGenerated', (result: any) => {
  cognitiveLogger
    .logSocialConsideration(
      `chat from ${result.message.sender}`,
      result.reasoning,
      {
        sender: result.message.sender,
        senderType: result.message.senderType,
        shouldRespond: result.shouldRespond,
        priority: result.priority,
        responseContent: result.responseContent,
        responseType: result.responseType,
        trigger: 'incoming-chat',
      }
    )
    .catch((error) => {
      serverLogger.warn('Failed to log chat consideration', {
        event: 'chat_consideration_log_failed',
        tags: ['social', 'chat', 'log', 'warn'],
        fields: { error: error instanceof Error ? error.message : String(error) },
      });
    });

  const chatConsiderationThought = {
    id: `chat-consideration-${result.timestamp}`,
    type: 'social_consideration',
    content: result.reasoning,
    timestamp: result.timestamp,
    context: {
      emotionalState: 'thoughtful',
      confidence: 0.7,
      cognitiveSystem: 'social-awareness',
    },
    metadata: {
      thoughtType: 'chat-consideration',
      sender: result.message.sender,
      senderType: result.message.senderType,
      shouldRespond: result.shouldRespond,
      priority: result.priority,
      responseContent: result.responseContent,
      responseType: result.responseType,
      trigger: 'incoming-chat',
    },
  };

  sendThoughtToCognitiveStream(chatConsiderationThought).catch((err: any) => {
    serverLogger.warn('Failed to send thought to stream', {
      event: 'thought_stream_send_failed',
      tags: ['thought-stream', 'send', 'warn'],
      fields: { error: err?.message || String(err) },
    });
  });
});

// Event-driven thought generator: forward to dashboard
eventDrivenThoughtGenerator.on(
  'thoughtGenerated',
  async (data: {
    thought: ContextualThought;
    event: any;
    forced?: boolean;
  }) => {
    try {
      serverLogger.info('Thought generated event received', {
        event: 'event_thought_generated',
        tags: ['event-driven', 'thought'],
        fields: {
          type: data.thought.type,
          preview: data.thought.content.substring(0, 60),
        },
      });

      state.cognitiveThoughts.push({
        id: data.thought.id,
        type: data.thought.type,
        content: data.thought.content,
        attribution: data.thought.attribution,
        context: data.thought.context,
        metadata: data.thought.metadata,
        timestamp: data.thought.timestamp,
        processed: data.thought.processed || false,
        convertEligible: (data.thought as any).convertEligible,
      });

      const MAX_COGNITIVE_THOUGHTS = 200;
      if (state.cognitiveThoughts.length > MAX_COGNITIVE_THOUGHTS) {
        state.cognitiveThoughts = state.cognitiveThoughts.slice(
          -MAX_COGNITIVE_THOUGHTS
        );
      }

      await resilientFetchLogged(
        `${dashboardUrl}/api/ws/cognitive-stream`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: data.thought.type,
            content: data.thought.content,
            attribution: data.thought.attribution,
            context: data.thought.context,
            metadata: data.thought.metadata,
            id: data.thought.id,
            timestamp: data.thought.timestamp,
            processed: data.thought.processed,
          }),
          label: 'dashboard/cognitive-stream',
        },
        {
          event: 'resilient_fetch_failed',
          tags: ['resilient-fetch', 'dashboard'],
          fields: { url: `${dashboardUrl}/api/ws/cognitive-stream` },
        }
      );
    } catch (error) {
      serverLogger.warn('Failed to forward generated thought to dashboard', {
        event: 'dashboard_forward_failed',
        tags: ['dashboard', 'thought', 'warn'],
        fields: { error: error instanceof Error ? error.message : String(error) },
      });
    }
  }
);

// ============================================================================
// Express app + middleware
// ============================================================================

const app = express.default();
const port = process.env.PORT ? parseInt(process.env.PORT) : 3003;

app.use(cors.default());
app.use(express.json());

// Middleware to track network requests
app.use((req, res, next) => {
  state.networkRequestCount++;
  if (state.networkRequestCount > 1000) {
    state.networkRequestCount = state.networkRequestCount % 100;
  }

  const startTime = Date.now();
  res.on('finish', () => {
    const success = res.statusCode < 400;
    const operationType = req.path.includes('/chat')
      ? 'conversation'
      : req.path.includes('/optimize')
        ? 'optimization'
        : req.path.includes('/solve')
          ? 'solution_generation'
          : req.path.includes('/intrusion')
            ? 'intrusion_handled'
            : 'api_request';
    cognitiveStateTracker.recordOperation(operationType, success, startTime);

    const durationMs = Date.now() - startTime;
    serverLogger.info('Request completed', {
      event: 'middleware_request',
      tags: ['middleware', 'request'],
      fields: {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs,
        operationType,
        success,
      },
    });
  });

  next();
});

// ============================================================================
// Mount route modules
// ============================================================================

app.use(
  createSystemRoutes({
    startThoughtGeneration,
    stopThoughtGeneration,
    isRunning: () => state.thoughtGenerationInterval !== null,
    getReadyState: () => ({
      ready: state.systemReady,
      readyAt: state.readyAt,
      source: state.readySource,
    }),
    markReady: (source: string) => {
      if (!state.systemReady) {
        state.systemReady = true;
        state.readyAt = new Date().toISOString();
        state.readySource = source;
      }
    },
    getTtsEnabled: () => state.ttsEnabled,
    setTtsEnabled: (enabled: boolean) => { state.ttsEnabled = enabled; },
  })
);

app.use(
  createTelemetryRoutes({
    metricsTracker,
    cognitiveStateTracker,
    cognitionSystem,
    getInteroState,
    getInteroHistory,
    getInteroHistorySummary,
    halveStressAxes,
    setSpawnPosition: (pos) => {
      state.spawnPosition = pos;
    },
    resetTimers: () => {
      state.msSinceLastRest = 0;
    },
    getNetworkRequestCount: () => state.networkRequestCount,
  })
);

app.use(
  createReasoningRoutes({
    reactArbiter,
  })
);

app.use(
  createThoughtRoutes({
    state,
    enhancedThoughtGenerator,
    sendThoughtToCognitiveStream,
  })
);

app.use(
  createCognitiveStreamRoutes({
    state,
    enhancedThoughtGenerator,
    intrusiveThoughtProcessor,
  })
);

app.use(
  createSocialRoutes({
    state,
    enhancedThoughtGenerator,
    socialAwarenessManager,
    sendThoughtToCognitiveStream,
  })
);

app.use(
  createProcessRoutes({
    state,
    intrusiveThoughtProcessor,
    llmInterface,
    observationReasoner,
    saliencyState,
    enhancedThoughtGenerator,
    reactArbiter,
    sendThoughtToCognitiveStream,
    runConsiderationStep,
    enqueueObservation,
    logObservation,
  })
);

app.use(
  createSocialMemoryRoutes({
    getSocialMemoryManager: () => state.socialMemoryManager,
  })
);

app.use(
  createReflectionRoutes({
    llmInterface,
  })
);

// ============================================================================
// LLM Generation Endpoint (for keep-alive integration)
// ============================================================================

/**
 * Simple LLM generation endpoint for keep-alive intention checking.
 * This allows the planning service's keep-alive integration to generate
 * thoughts via the cognition service's LLM interface.
 */
app.post('/api/llm/generate', async (req, res) => {
  const { prompt } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    res.status(400).json({ error: 'Missing or invalid prompt' });
    return;
  }

  try {
    // Use the LLM interface to generate a response
    const response = await llmInterface.generateInternalThought(prompt, {
      currentGoals: [],
      recentMemories: [],
      agentState: {},
    });

    res.json({
      text: response.text,
      content: response.text,
      confidence: response.confidence,
      model: response.model,
      metadata: response.metadata,
    });
  } catch (error) {
    serverLogger.error('LLM generate error', {
      event: 'llm_generate_error',
      tags: ['llm', 'generate', 'error'],
      fields: { error: error instanceof Error ? error.message : String(error) },
    });
    res.status(500).json({
      error: 'LLM generation failed',
      message: (error as Error).message,
    });
  }
});

// ============================================================================
// Process error handlers
// ============================================================================

process.on('uncaughtException', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EPIPE' || err.code === 'ECONNRESET') {
    return;
  }
  serverLogger.error('Uncaught exception', {
    event: 'process_uncaught_exception',
    tags: ['process', 'error'],
    fields: { error: err.message, code: err.code },
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason: any) => {
  serverLogger.error('Unhandled rejection', {
    event: 'process_unhandled_rejection',
    tags: ['process', 'error'],
    fields: { error: reason instanceof Error ? reason.message : String(reason) },
  });
});

// ============================================================================
// Start server
// ============================================================================

const server = app.listen(port, () => {
  const startupMessage = `Cognition service running on port ${port}`;

  cognitiveLogger
    .logStatus('cognition_service_started', startupMessage, {
      port: port,
      cognitiveSystem: 'cognition-system',
      category: 'system',
      tags: ['server', 'startup'],
    })
    .catch((error) => {
      serverLogger.warn('Failed to log server startup', {
        event: 'server_startup_log_failed',
        tags: ['server', 'startup', 'log', 'warn'],
        fields: { error: error instanceof Error ? error.message : String(error) },
      });
    });

  serverLogger.info(startupMessage, {
    event: 'server_started',
    tags: ['server', 'startup'],
    fields: { port },
  });

  loadInteroHistory();

  // LLM backend health check + model preload
  setTimeout(() => {
    const cfg = llmInterface.getConfig();
    const host = cfg.host ?? 'localhost';
    const llmPort = cfg.port ?? 5002;
    const healthUrl = `http://${host}:${llmPort}/health`;
    resilientFetchLogged(
      healthUrl,
      { timeoutMs: 5000, label: 'llm/health' },
      {
        event: 'resilient_fetch_failed',
        tags: ['resilient-fetch', 'llm'],
        fields: { url: healthUrl },
      }
    )
      .then((r) => {
        if (r?.ok) {
          serverLogger.info('LLM backend reachable', {
            event: 'llm_health_ok',
            tags: ['llm', 'health'],
            fields: { healthUrl },
          });
          llmInterface.preloadModel().catch(() => {});
        } else {
          serverLogger.warn('LLM backend health check returned non-OK', {
            event: 'llm_health_non_ok',
            tags: ['llm', 'health', 'warn'],
            fields: { healthUrl, status: r?.status ?? 'unknown' },
          });
        }
      })
      .catch(() => {
        serverLogger.warn('LLM backend not reachable', {
          event: 'llm_health_unreachable',
          tags: ['llm', 'health', 'warn'],
          fields: { healthUrl },
        });
      });
  }, 2000);

  const endpoints = [
    { name: 'metrics', url: `http://localhost:${port}/metrics` },
    { name: 'thought_generation', url: `http://localhost:${port}/generate-thoughts` },
    { name: 'react_arbiter', url: `http://localhost:${port}/react-arbiter` },
    { name: 'social_cognition', url: `http://localhost:${port}/social-cognition` },
    { name: 'social_consideration', url: `http://localhost:${port}/consider-social` },
    { name: 'nearby_entities', url: `http://localhost:${port}/process-nearby-entities` },
    { name: 'chat_consideration', url: `http://localhost:${port}/consider-chat` },
    { name: 'departure_communication', url: `http://localhost:${port}/consider-departure` },
    { name: 'cognitive_stream_recent', url: `http://localhost:${port}/api/cognitive-stream/recent` },
    { name: 'cognitive_stream_processed', url: `http://localhost:${port}/api/cognitive-stream/:id/processed` },
    { name: 'social_memory_entities', url: `http://localhost:${port}/social-memory/entities` },
    { name: 'social_memory_search', url: `http://localhost:${port}/social-memory/search` },
    { name: 'social_memory_stats', url: `http://localhost:${port}/social-memory/stats` },
  ];

  // Log endpoints summary (collapsed) - detailed listing only in debug mode
  const endpointNames = endpoints.map((e) => e.name).join(', ');
  serverLogger.info(`Registered ${endpoints.length} endpoints`, {
    event: 'server_endpoints_registered',
    tags: ['server', 'startup'],
    fields: { count: endpoints.length, endpoints: endpointNames },
  });

  // Detailed endpoint logging only when COGNITION_DEBUG is set
  if (process.env.COGNITION_DEBUG === '1') {
    for (const endpoint of endpoints) {
      serverLogger.debug('Server endpoint', {
        event: 'server_endpoint',
        tags: ['server', 'endpoint'],
        fields: { name: endpoint.name, url: endpoint.url },
      });
    }
  }
});

server.on('connection', (socket) => {
  socket.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code !== 'ECONNRESET' && err.code !== 'EPIPE') {
      serverLogger.warn('Socket error', {
        event: 'socket_error',
        tags: ['socket', 'warn'],
        fields: { error: err.message, code: err.code },
      });
    }
  });
});
