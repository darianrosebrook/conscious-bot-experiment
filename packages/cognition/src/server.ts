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

// Route modules
import { createSystemRoutes } from './routes/system-routes';
import { createTelemetryRoutes } from './routes/telemetry-routes';
import { createReasoningRoutes } from './routes/reasoning-routes';
import { createThoughtRoutes } from './routes/thought-routes';
import { createCognitiveStreamRoutes } from './routes/cognitive-stream-routes';
import { createSocialRoutes } from './routes/social-routes';
import { createProcessRoutes } from './routes/process-routes';
import { createSocialMemoryRoutes } from './routes/social-memory-routes';

// ============================================================================
// Service creation
// ============================================================================

const cognitiveLogger = CognitiveStreamLogger.getInstance();

const observationLogDebug = process.env.OBSERVATION_LOG_DEBUG === '1';
function logObservation(message: string, payload?: unknown): void {
  if (observationLogDebug && payload !== undefined) {
    console.log(message, payload);
  } else {
    console.log(message);
  }
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
    console.warn(
      '⚠️ Social memory system could not be initialized:',
      (error as Error)?.message
    );
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
      console.warn('Failed to log thought generation start:', error);
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
        resilientFetch(`${mcUrl}/state`, { label: 'mc/state' }),
        resilientFetch(`${planningUrl}/state`, { label: 'planning/state' }),
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
      console.log(
        `[Agency ${uptimeMin}m] llm=${counters.llmCalls} goals=${counters.goalTags} drives=${counters.driveTicks} sigDedup=${counters.signatureSuppressions} contentDedup=${counters.contentSuppressions} intents=${counters.intentExtractions}`
      );
    } catch (error) {
      console.error('Error generating periodic thought:', error);

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
          console.warn('Failed to log thought generation error:', logError);
        });
    }
  }, 60000);

  console.log('Enhanced thought generator started with 60-second intervals');
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
        console.warn('Failed to log thought generation stop:', error);
      });

    console.log('Enhanced thought generator stopped');
  }
}

// ============================================================================
// Event listeners (with .catch() on fire-and-forget async calls)
// ============================================================================

enhancedThoughtGenerator.on('thoughtGenerated', (thought) => {
  state.cognitiveThoughts.push(thought);
  sendThoughtToCognitiveStream(thought).catch((err: any) => {
    console.warn(
      '[Cognition] Failed to send thought to stream:',
      err?.message || err
    );
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
        console.warn('Failed to log thought processing start:', error);
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
      console.warn(
        '[Cognition] Failed to send thought to stream:',
        err?.message || err
      );
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
      console.warn('Failed to log intrusive thought generation:', error);
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
    console.warn(
      '[Cognition] Failed to send thought to stream:',
      err?.message || err
    );
  });
});

intrusiveThoughtProcessor.on(
  'thoughtRecorded',
  ({ thought, action, timestamp }) => {
    console.log('Thought recorded (no action):', thought);

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
      console.warn(
        '[Cognition] Failed to send thought to stream:',
        err?.message || err
      );
    });
  }
);

intrusiveThoughtProcessor.on('processingError', ({ thought, error }) => {
  console.error('Error processing intrusive thought:', { thought, error });

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
    console.warn(
      '[Cognition] Failed to send thought to stream:',
      err?.message || err
    );
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
      console.warn('Failed to log social consideration:', error);
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
    console.warn(
      '[Cognition] Failed to send thought to stream:',
      err?.message || err
    );
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
      console.warn('Failed to log chat consideration:', error);
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
    console.warn(
      '[Cognition] Failed to send thought to stream:',
      err?.message || err
    );
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
      console.log(
        '🧠 Thought generated event received:',
        data.thought.type,
        '-',
        data.thought.content.substring(0, 60)
      );

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

      await resilientFetch(`${dashboardUrl}/api/ws/cognitive-stream`, {
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
      });
    } catch (error) {
      console.warn(
        '⚠️ Failed to forward generated thought to dashboard:',
        error
      );
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
    console.error('[LLM Generate] Error:', error);
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
  console.error('[Cognition] Uncaught exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason: any) => {
  console.error('[Cognition] Unhandled rejection:', reason);
});

// ============================================================================
// Start server
// ============================================================================

const server = app.listen(port, () => {
  const startupMessage = `🧠 Cognition service running on port ${port}`;

  cognitiveLogger
    .logStatus('cognition_service_started', startupMessage, {
      port: port,
      cognitiveSystem: 'cognition-system',
      category: 'system',
      tags: ['server', 'startup'],
    })
    .catch((error) => {
      console.warn('Failed to log server startup:', error);
    });

  console.log(startupMessage);

  loadInteroHistory();

  // LLM backend health check + model preload
  setTimeout(() => {
    const cfg = llmInterface.getConfig();
    const host = cfg.host ?? 'localhost';
    const llmPort = cfg.port ?? 5002;
    const healthUrl = `http://${host}:${llmPort}/health`;
    resilientFetch(healthUrl, { timeoutMs: 5000, label: 'llm/health' })
      .then((r) => {
        if (r?.ok) {
          console.log(
            `[Cognition] LLM backend (MLX/Ollama) reachable at ${healthUrl}`
          );
          llmInterface.preloadModel().catch(() => {});
        } else {
          console.warn(
            `[Cognition] LLM backend at ${healthUrl} returned ${r?.status ?? 'unknown'} - observation reasoning may fall back`
          );
        }
      })
      .catch(() => {
        console.warn(
          `[Cognition] LLM backend not reachable at ${healthUrl} - start the MLX sidecar (e.g. pnpm start) or set COGNITION_LLM_HOST/PORT. Observation reasoning will use fallback until it is.`
        );
      });
  }, 2000);

  console.log(
    `📊 Cognitive metrics endpoint: http://localhost:${port}/metrics`
  );
  console.log(
    `💭 Thought generation endpoint: http://localhost:${port}/generate-thoughts`
  );
  console.log(
    `🎯 ReAct arbiter endpoint: http://localhost:${port}/react-arbiter`
  );
  console.log(
    `🤝 Social cognition endpoint: http://localhost:${port}/social-cognition`
  );
  console.log(
    `🧠 Social consideration endpoint: http://localhost:${port}/consider-social`
  );
  console.log(
    `🤔 Nearby entities processing endpoint: http://localhost:${port}/process-nearby-entities`
  );
  console.log(
    `💬 Chat consideration endpoint: http://localhost:${port}/consider-chat`
  );
  console.log(
    `🚪 Departure communication endpoint: http://localhost:${port}/consider-departure`
  );
  console.log(`🧠 Cognitive stream endpoints:`);
  console.log(
    `  Get recent thoughts: http://localhost:${port}/api/cognitive-stream/recent`
  );
  console.log(
    `  ✅ Mark thoughts processed: http://localhost:${port}/api/cognitive-stream/:id/processed`
  );
  console.log(`🧠 Social memory endpoints:`);
  console.log(
    `  Get remembered entities: http://localhost:${port}/social-memory/entities`
  );
  console.log(
    `  🔍 Search entities by fact: http://localhost:${port}/social-memory/search`
  );
  console.log(
    `  📊 Social memory stats: http://localhost:${port}/social-memory/stats`
  );
});

server.on('connection', (socket) => {
  socket.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code !== 'ECONNRESET' && err.code !== 'EPIPE') {
      console.warn('[Cognition] Socket error:', err.message);
    }
  });
});
