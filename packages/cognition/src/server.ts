/**
 * Cognition System HTTP Server
 *
 * Provides HTTP API endpoints for the cognition system.
 *
 * @author @darianrosebrook
 */

import * as express from 'express';
import * as cors from 'cors';
import { createServiceClients } from '@conscious-bot/core';
import { ReActArbiter } from './react-arbiter/ReActArbiter';
import {
  eventDrivenThoughtGenerator,
  ContextualThought,
} from './event-driven-thought-generator';
import { LLMInterface } from './cognitive-core/llm-interface';
import {
  ObservationReasoner,
  ObservationPayload,
} from './environmental/observation-reasoner';

/**
 * Cognitive Stream Logger
 *
 * Centralized logging system that sends cognition system logs to the cognitive stream
 * for dashboard visibility and emergent behavior observation.
 *
 * @author @darianrosebrook
 */
class CognitiveStreamLogger {
  private static instance: CognitiveStreamLogger;
  private cognitiveStreamUrl: string;

  private constructor() {
    this.cognitiveStreamUrl = process.env.DASHBOARD_ENDPOINT
      ? `${process.env.DASHBOARD_ENDPOINT}/api/ws/cognitive-stream`
      : 'http://localhost:3000/api/ws/cognitive-stream';
  }

  public static getInstance(): CognitiveStreamLogger {
    if (!CognitiveStreamLogger.instance) {
      CognitiveStreamLogger.instance = new CognitiveStreamLogger();
    }
    return CognitiveStreamLogger.instance;
  }

  /**
   * Send a log entry to the cognitive stream
   */
  async logToCognitiveStream(
    type: string,
    content: string,
    context: {
      emotionalState?: string;
      confidence?: number;
      cognitiveSystem?: string;
      category?: string;
      tags?: string[];
    } = {}
  ): Promise<void> {
    try {
      const response = await fetch(this.cognitiveStreamUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: type || 'system_log',
          content: content,
          attribution: 'self',
          context: {
            emotionalState: context.emotionalState || 'neutral',
            confidence: context.confidence || 0.5,
            cognitiveSystem: context.cognitiveSystem || 'cognition-system',
            ...context,
          },
          metadata: {
            thoughtType: type || 'system_log',
            category: context.category || 'system',
            tags: context.tags || ['system', 'log'],
            source: 'cognition-system',
            timestamp: Date.now(),
          },
        }),
      });

      if (!response.ok) {
        console.warn(
          '❌ Failed to send log to cognitive stream:',
          response.status
        );
      }
    } catch (error) {
      console.warn('❌ Error sending log to cognitive stream:', error);
    }
  }

  /**
   * Log a cognition system event
   */
  async logEvent(
    eventType: string,
    content: string,
    context: any = {}
  ): Promise<void> {
    await this.logToCognitiveStream('system_event', content, {
      emotionalState: 'neutral',
      confidence: 0.7,
      cognitiveSystem: 'cognition-system',
      category: 'system',
      tags: ['event', eventType],
      ...context,
    });
  }

  /**
   * Log a thought processing event
   */
  async logThoughtProcessing(
    thought: string,
    status: 'started' | 'completed' | 'error',
    context: any = {}
  ): Promise<void> {
    const content = `Thought processing ${status}: "${thought}"`;
    await this.logToCognitiveStream('thought_processing', content, {
      emotionalState: status === 'error' ? 'concerned' : 'focused',
      confidence: status === 'error' ? 0.3 : 0.6,
      cognitiveSystem: 'intrusive-processor',
      category: 'processing',
      tags: ['thought', 'processing', status],
      ...context,
    });
  }

  /**
   * Log a task creation event
   */
  async logTaskCreation(
    taskTitle: string,
    source: string,
    context: any = {}
  ): Promise<void> {
    const content = `Task created: "${taskTitle}" (from ${source})`;
    await this.logToCognitiveStream('task_creation', content, {
      emotionalState: 'focused',
      confidence: 0.8,
      cognitiveSystem: 'planning-integration',
      category: 'task',
      tags: ['task', 'created', source],
      ...context,
    });
  }

  /**
   * Log a social consideration
   */
  async logSocialConsideration(
    entity: string,
    reasoning: string,
    context: any = {}
  ): Promise<void> {
    const content = `Social consideration: ${entity} - ${reasoning}`;
    await this.logToCognitiveStream('social_consideration', content, {
      emotionalState: 'thoughtful',
      confidence: 0.7,
      cognitiveSystem: 'social-awareness',
      category: 'social',
      tags: ['social', 'consideration', entity],
      ...context,
    });
  }

  /**
   * Log a system status update
   */
  async logStatus(
    status: string,
    details: string,
    context: any = {}
  ): Promise<void> {
    const content = `System status: ${status} - ${details}`;
    await this.logToCognitiveStream('system_status', content, {
      emotionalState: 'neutral',
      confidence: 0.5,
      cognitiveSystem: 'cognition-system',
      category: 'status',
      tags: ['status', status.toLowerCase()],
      ...context,
    });
  }

  /**
   * Log a performance metric
   */
  async logMetric(
    metric: string,
    value: number | string,
    context: any = {}
  ): Promise<void> {
    const content = `Metric: ${metric} = ${value}`;
    await this.logToCognitiveStream('system_metric', content, {
      emotionalState: 'neutral',
      confidence: 0.5,
      cognitiveSystem: 'cognition-system',
      category: 'metric',
      tags: ['metric', metric.toLowerCase()],
      ...context,
    });
  }
}

// Initialize the cognitive stream logger
const cognitiveLogger = CognitiveStreamLogger.getInstance();

const llmInterface = new LLMInterface();
const observationReasoner = new ObservationReasoner(llmInterface, {
  disabled: process.env.COGNITION_LLM_OBSERVATION_DISABLED === 'true',
});

const app = express.default();
const port = process.env.PORT ? parseInt(process.env.PORT) : 3003;

// Network request tracking
let networkRequestCount = 0;

// Cognitive metrics tracking
app.use(cors.default());

// Type definitions for Express
interface Request extends express.Request {}
interface Response extends express.Response {}
class CognitiveMetricsTracker {
  private optimizationCount = 0;
  private conversationCount = 0;
  private solutionsGenerated = 0;
  private violationsBlocked = 0;
  private intrusionsHandled = 0;

  incrementOptimizationCount(): void {
    this.optimizationCount++;
  }

  getOptimizationCount(): number {
    return this.optimizationCount;
  }

  incrementConversationCount(): void {
    this.conversationCount++;
  }

  getConversationCount(): number {
    return this.conversationCount;
  }

  incrementSolutionsGenerated(): void {
    this.solutionsGenerated++;
  }

  getSolutionsGenerated(): number {
    return this.solutionsGenerated;
  }

  incrementViolationsBlocked(): void {
    this.violationsBlocked++;
  }

  getViolationsBlocked(): number {
    return this.violationsBlocked;
  }

  incrementIntrusionsHandled(): void {
    this.intrusionsHandled++;
  }

  getIntrusionsHandled(): number {
    return this.intrusionsHandled;
  }

  reset(): void {
    this.optimizationCount = 0;
    this.conversationCount = 0;
    this.solutionsGenerated = 0;
    this.violationsBlocked = 0;
    this.intrusionsHandled = 0;
  }

  getAllMetrics(): Record<string, number> {
    return {
      optimizationCount: this.optimizationCount,
      conversationCount: this.conversationCount,
      solutionsGenerated: this.solutionsGenerated,
      violationsBlocked: this.violationsBlocked,
      intrusionsHandled: this.intrusionsHandled,
    };
  }
}

const POSITION_REDACTION_GRANULARITY = 5;
const HOSTILE_KEYWORDS = [
  'zombie',
  'skeleton',
  'creeper',
  'spider',
  'witch',
  'enderman',
  'pillager',
  'vindicator',
  'evoker',
  'ravager',
  'phantom',
  'blaze',
  'ghast',
  'guardian',
  'warden',
];

function redactPositionForLog(position?: { x: number; y: number; z: number }) {
  if (!position) return undefined;
  const round = (value: number) =>
    Math.round(value / POSITION_REDACTION_GRANULARITY) *
    POSITION_REDACTION_GRANULARITY;
  return {
    x: round(position.x),
    y: round(position.y),
    z: round(position.z),
  };
}

function coerceNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function inferThreatLevel(
  name?: string
): 'unknown' | 'friendly' | 'neutral' | 'hostile' {
  if (!name) return 'unknown';
  const lowerName = name.toLowerCase();
  if (HOSTILE_KEYWORDS.some((keyword) => lowerName.includes(keyword))) {
    return 'hostile';
  }
  if (lowerName.includes('villager') || lowerName.includes('golem')) {
    return 'friendly';
  }
  if (
    lowerName.includes('cow') ||
    lowerName.includes('sheep') ||
    lowerName.includes('pig')
  ) {
    return 'neutral';
  }
  return 'unknown';
}

function buildObservationPayload(
  raw: any,
  metadata: any = {}
): ObservationPayload | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  let bot = raw.bot || metadata?.bot || undefined;
  if (!bot || !bot.position) {
    // Try to get bot position from metadata
    if (metadata?.botPosition) {
      bot = { position: metadata.botPosition };
    } else {
      return null;
    }
  }

  const position = bot.position;
  if (
    position === undefined ||
    position.x === undefined ||
    position.y === undefined ||
    position.z === undefined
  ) {
    return null;
  }

  const observationId =
    typeof raw.observationId === 'string'
      ? raw.observationId
      : `obs-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const baseCategory =
    raw.category === 'environment' ? 'environment' : 'entity';
  const entity = raw.entity || metadata?.entity || undefined;
  const event = raw.event || undefined;

  const payload: ObservationPayload = {
    observationId,
    category: entity ? 'entity' : baseCategory,
    bot: {
      position: {
        x: Number(position.x) || 0,
        y: Number(position.y) || 0,
        z: Number(position.z) || 0,
      },
      health: coerceNumber(bot.health) || coerceNumber(metadata?.botHealth),
      food: coerceNumber(bot.food) || coerceNumber(metadata?.botFood),
      dimension: typeof bot.dimension === 'string' ? bot.dimension : undefined,
      gameMode: typeof bot.gameMode === 'string' ? bot.gameMode : undefined,
    },
    entity: entity
      ? {
          id: (entity.id ?? metadata?.entityId ?? observationId).toString(),
          name:
            typeof entity.name === 'string'
              ? entity.name
              : (metadata?.entityType ?? 'unknown'),
          displayName: entity.displayName,
          kind: entity.kind,
          threatLevel:
            entity.threatLevel ??
            metadata?.threatLevel ??
            inferThreatLevel(entity.name),
          distance:
            coerceNumber(entity.distance ?? metadata?.distance) ?? undefined,
          position: entity.position
            ? {
                x: Number(entity.position.x) || 0,
                y: Number(entity.position.y) || 0,
                z: Number(entity.position.z) || 0,
              }
            : undefined,
          velocity: entity.velocity
            ? {
                x: Number(entity.velocity.x) || 0,
                y: Number(entity.velocity.y) || 0,
                z: Number(entity.velocity.z) || 0,
              }
            : undefined,
        }
      : undefined,
    event: event
      ? {
          type: event.type ?? metadata?.eventType ?? 'unknown',
          description: event.description ?? metadata?.description,
          severity: event.severity ?? metadata?.severity,
          position: event.position
            ? {
                x: Number(event.position.x) || 0,
                y: Number(event.position.y) || 0,
                z: Number(event.position.z) || 0,
              }
            : undefined,
        }
      : undefined,
    context:
      raw.context ??
      (metadata && Object.keys(metadata).length > 0 ? metadata : undefined),
    timestamp: coerceNumber(raw.timestamp) ?? Date.now(),
  };

  return payload;
}

const metricsTracker = new CognitiveMetricsTracker();

// Enhanced cognitive state tracking
class CognitiveStateTracker {
  private activeConversations = new Set<string>();
  private recentOperations: Array<{
    type: string;
    timestamp: number;
    duration?: number;
    success: boolean;
  }> = [];
  private cognitiveStates: Array<{
    timestamp: number;
    cognitiveLoad: number;
    attentionLevel: number;
    creativityLevel: number;
    activeProcesses: number;
  }> = [];

  // Conversation tracking
  startConversation(conversationId: string): void {
    this.activeConversations.add(conversationId);
    metricsTracker.incrementConversationCount();
    this.recordOperation('conversation_start', true);
  }

  endConversation(conversationId: string): void {
    this.activeConversations.delete(conversationId);
    this.recordOperation('conversation_end', true);
  }

  getActiveConversationCount(): number {
    return this.activeConversations.size;
  }

  // Operation tracking
  recordOperation(type: string, success: boolean, startTime?: number): void {
    const operation = {
      type,
      timestamp: Date.now(),
      duration: startTime ? Date.now() - startTime : undefined,
      success,
    };

    this.recentOperations.push(operation);

    // Keep only last 100 operations
    if (this.recentOperations.length > 100) {
      this.recentOperations.shift();
    }

    // Update specific metrics based on operation type
    switch (type) {
      case 'optimization':
        metricsTracker.incrementOptimizationCount();
        break;
      case 'solution_generation':
        metricsTracker.incrementSolutionsGenerated();
        break;
      case 'violation_blocked':
        metricsTracker.incrementViolationsBlocked();
        break;
      case 'intrusion_handled':
        metricsTracker.incrementIntrusionsHandled();
        break;
    }
  }

  // Cognitive state tracking
  recordCognitiveState(): void {
    const state = {
      timestamp: Date.now(),
      cognitiveLoad: calculateCognitiveLoad(),
      attentionLevel: calculateAttentionLevel(),
      creativityLevel: calculateCreativityLevel(),
      activeProcesses: getActiveProcessCount(),
    };

    this.cognitiveStates.push(state);

    // Keep only last 1000 states (about 16 minutes at 1 per second)
    if (this.cognitiveStates.length > 1000) {
      this.cognitiveStates.shift();
    }
  }

  // Analytics and insights
  getOperationStats(timeWindow: number = 300000): {
    // Default 5 minutes
    total: number;
    successful: number;
    failed: number;
    byType: Record<string, number>;
    averageDuration: number;
  } {
    const cutoff = Date.now() - timeWindow;
    const recentOps = this.recentOperations.filter(
      (op) => op.timestamp > cutoff
    );

    const stats = {
      total: recentOps.length,
      successful: recentOps.filter((op) => op.success).length,
      failed: recentOps.filter((op) => !op.success).length,
      byType: {} as Record<string, number>,
      averageDuration: 0,
    };

    // Group by type
    recentOps.forEach((op) => {
      stats.byType[op.type] = (stats.byType[op.type] || 0) + 1;
    });

    // Calculate average duration
    const opsWithDuration = recentOps.filter((op) => op.duration !== undefined);
    if (opsWithDuration.length > 0) {
      stats.averageDuration =
        opsWithDuration.reduce((sum, op) => sum + (op.duration || 0), 0) /
        opsWithDuration.length;
    }

    return stats;
  }

  getCognitiveStateHistory(timeWindow: number = 300000): Array<{
    timestamp: number;
    cognitiveLoad: number;
    attentionLevel: number;
    creativityLevel: number;
    activeProcesses: number;
  }> {
    const cutoff = Date.now() - timeWindow;
    return this.cognitiveStates.filter((state) => state.timestamp > cutoff);
  }

  getHealthMetrics(): {
    averageCognitiveLoad: number;
    averageAttentionLevel: number;
    averageCreativityLevel: number;
    operationSuccessRate: number;
    systemStability: number;
  } {
    const recentStates = this.getCognitiveStateHistory();
    const recentStats = this.getOperationStats();

    const averageCognitiveLoad =
      recentStates.length > 0
        ? recentStates.reduce((sum, state) => sum + state.cognitiveLoad, 0) /
          recentStates.length
        : 0;

    const averageAttentionLevel =
      recentStates.length > 0
        ? recentStates.reduce((sum, state) => sum + state.attentionLevel, 0) /
          recentStates.length
        : 0;

    const averageCreativityLevel =
      recentStates.length > 0
        ? recentStates.reduce((sum, state) => sum + state.creativityLevel, 0) /
          recentStates.length
        : 0;

    const operationSuccessRate =
      recentStats.total > 0 ? recentStats.successful / recentStats.total : 1;

    // System stability based on variance in cognitive states
    const cognitiveLoadVariance =
      recentStates.length > 1
        ? this.calculateVariance(recentStates.map((s) => s.cognitiveLoad))
        : 0;

    const systemStability = Math.max(0, 1 - cognitiveLoadVariance);

    return {
      averageCognitiveLoad,
      averageAttentionLevel,
      averageCreativityLevel,
      operationSuccessRate,
      systemStability,
    };
  }

  private calculateVariance(values: number[]): number {
    if (values.length < 2) return 0;

    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map((val) => Math.pow(val - mean, 2));
    return squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
  }

  reset(): void {
    this.activeConversations.clear();
    this.recentOperations = [];
    this.cognitiveStates = [];
  }
}

const cognitiveStateTracker = new CognitiveStateTracker();

// Middleware
app.use(cors.default());
app.use(express.json());

// Middleware to track network requests
app.use((req, res, next) => {
  networkRequestCount++;

  // Reset counter every minute to prevent overflow
  if (networkRequestCount > 1000) {
    networkRequestCount = networkRequestCount % 100; // Keep some history
  }

  const startTime = Date.now();

  // Track successful operations
  res.on('finish', () => {
    const success = res.statusCode < 400;
    const duration = Date.now() - startTime;

    // Record operation based on endpoint
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

// Initialize ReAct Arbiter
const reactArbiter = new ReActArbiter({
  provider: 'mlx',
  model: 'gemma3n:e2b',
  maxTokens: 1000,
  temperature: 0.3,
  timeout: 30000,
  retries: 3,
});

// Import enhanced components
import { EnhancedThoughtGenerator } from './thought-generator';
import { IntrusiveThoughtProcessor } from './intrusive-thought-processor';
import { SocialAwarenessManager } from './social-awareness-manager';
import { SocialMemoryManager } from '../../memory/src/social/social-memory-manager';

// Initialize enhanced thought generator
const enhancedThoughtGenerator = new EnhancedThoughtGenerator({
  thoughtInterval: 60000, // 60 seconds between thoughts to reduce spam
  maxThoughtsPerCycle: 1,
  enableIdleThoughts: true,
  enableContextualThoughts: true,
  enableEventDrivenThoughts: true,
});

// Initialize enhanced intrusive thought processor
const intrusiveThoughtProcessor = new IntrusiveThoughtProcessor({
  enableActionParsing: true,
  enableTaskCreation: true,
  enablePlanningIntegration: true,
  enableMinecraftIntegration: true,
  planningEndpoint: process.env.PLANNING_ENDPOINT || 'http://localhost:3002',
  minecraftEndpoint: process.env.MINECRAFT_ENDPOINT || 'http://localhost:3005',
});

// Initialize social memory manager
let socialMemoryManager: SocialMemoryManager | null = null;
(async () => {
  try {
    const memoryModule = await import('@conscious-bot/memory');
    const { KnowledgeGraphCore } = memoryModule;
    const knowledgeGraph = new KnowledgeGraphCore({
      persistToStorage: true,
      storageDirectory: './memory-storage',
    });
    socialMemoryManager = new SocialMemoryManager(knowledgeGraph, {
      enableVerboseLogging: true,
    });
  } catch (error) {
    console.warn(
      '⚠️ Social memory system could not be initialized:',
      (error as Error)?.message
    );
  }
})();

// Initialize social awareness manager
const socialAwarenessManager = new SocialAwarenessManager({
  maxDistance: 15,
  considerationCooldownMs: 30000,
  enableVerboseLogging: true,
  cognitionEndpoint: 'http://localhost:3003',
  enableSocialMemory: true,
  socialMemoryManager: socialMemoryManager,
});

// Initialize cognition system (simplified for now)
const cognitionSystem = {
  cognitiveCore: {
    contextOptimizer: { isActive: () => false },
    conversationManager: { isActive: () => false },
    creativeSolver: { isActive: () => false },
  },
  constitutionalFilter: { getRulesCount: () => 0 },
  intrusionInterface: { isActive: () => false },
  selfModel: { getIdentityCount: () => 0, getActiveIdentities: () => [] },
  socialCognition: { getAgentCount: () => 0, getRelationshipCount: () => 0 },
};

// Store cognitive thoughts for external access
let cognitiveThoughts: any[] = [];

// Function to send thoughts to cognitive stream
async function sendThoughtToCognitiveStream(thought: any) {
  try {
    const response = await fetch(
      'http://localhost:3000/api/ws/cognitive-stream',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: thought.type || 'reflection',
          content: thought.content,
          attribution: 'self',
          context: {
            emotionalState: thought.context?.emotionalState || 'neutral',
            confidence: thought.context?.confidence || 0.5,
            cognitiveSystem: thought.context?.cognitiveSystem || 'generator',
          },
          metadata: {
            thoughtType: thought.metadata?.thoughtType || thought.type,
            ...thought.metadata,
          },
        }),
      }
    );

    if (response.ok) {
      console.log(
        '✅ Thought sent to cognitive stream:',
        thought.content.substring(0, 50) + '...'
      );
    } else {
      console.error('❌ Failed to send thought to cognitive stream');
    }
  } catch (error) {
    console.error('❌ Error sending thought to cognitive stream:', error);
  }
}

// Start periodic thought generation
let thoughtGenerationInterval: NodeJS.Timeout | null = null;

function startThoughtGeneration() {
  if (thoughtGenerationInterval) {
    clearInterval(thoughtGenerationInterval);
  }

  // Log the start of thought generation
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
  thoughtGenerationInterval = setInterval(async () => {
    try {
      // Fetch real bot state and planning data
      const [botState, planningState] = await Promise.all([
        fetch('http://localhost:3005/state')
          .then((res) => res.json())
          .catch(() => null),
        fetch('http://localhost:3002/state')
          .then((res) => res.json())
          .catch(() => null),
      ]);

      const currentState = (botState as any)?.data || {};
      const currentTasks = (planningState as any)?.state?.tasks?.current || [];
      const recentEvents = (botState as any)?.data?.recentEvents || [];

      await enhancedThoughtGenerator.generateThought({
        currentState,
        currentTasks,
        recentEvents,
        emotionalState: 'neutral',
        memoryContext: {},
      });
    } catch (error) {
      console.error('Error generating periodic thought:', error);

      // Log the error to cognitive stream
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
  }, 60000); // 60 seconds

  console.log('✅ Enhanced thought generator started with 60-second intervals');
}

function stopThoughtGeneration() {
  if (thoughtGenerationInterval) {
    clearInterval(thoughtGenerationInterval);
    thoughtGenerationInterval = null;

    // Log the stop of thought generation
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

    console.log('🛑 Enhanced thought generator stopped');
  }
}

// Set up event listeners for enhanced components
enhancedThoughtGenerator.on('thoughtGenerated', (thought) => {
  // Log the thought generation to cognitive stream

  cognitiveThoughts.push(thought);

  // Send the thought to the cognitive stream
  sendThoughtToCognitiveStream(thought);
});

intrusiveThoughtProcessor.on(
  'thoughtProcessingStarted',
  ({ thought, timestamp }) => {
    // Log the processing start to cognitive stream
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

    sendThoughtToCognitiveStream(processingThought);
  }
);

intrusiveThoughtProcessor.on('thoughtGenerated', ({ thought, timestamp }) => {
  // Log the intrusive thought generation to cognitive stream
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

  sendThoughtToCognitiveStream(generatedThought);
});

// Legacy event listeners for action parsing and task creation - now disabled
// since intrusive thoughts generate internal thoughts instead of tasks
/*
intrusiveThoughtProcessor.on(
  'actionParsed',
  ({ thought, action, timestamp }) => {
    console.log('Action parsed from intrusive thought:', { thought, action });

    const parsingThought = {
      id: `action-parsed-${timestamp}`,
      type: 'planning',
      content: action
        ? `Parsed action from thought: "${thought}" → ${action.type} ${action.target}`
        : `No actionable content found in: "${thought}"`,
      timestamp,
      context: {
        emotionalState: action ? 'focused' : 'neutral',
        confidence: action ? 0.7 : 0.5,
        cognitiveSystem: 'intrusive-processor',
      },
      metadata: {
        thoughtType: 'action-parsing',
        actionType: action?.type,
        actionTarget: action?.target,
        source: 'intrusive-thought',
      },
    };

    sendThoughtToCognitiveStream(parsingThought);
  }
);

intrusiveThoughtProcessor.on(
  'taskCreationStarted',
  ({ thought, action, timestamp }) => {
    console.log('Started creating task from intrusive thought:', {
      thought,
      action,
    });

    const taskStartThought = {
      id: `task-creation-started-${timestamp}`,
      type: 'planning',
      content: `Creating task from action: ${action.type} ${action.target}`,
      timestamp,
      context: {
        emotionalState: 'focused',
        confidence: 0.8,
        cognitiveSystem: 'intrusive-processor',
      },
      metadata: {
        thoughtType: 'task-creation-start',
        actionType: action.type,
        actionTarget: action.target,
        source: 'intrusive-thought',
      },
    };

    sendThoughtToCognitiveStream(taskStartThought);
  }
);

intrusiveThoughtProcessor.on(
  'taskCreated',
  ({ thought, task, action, timestamp }) => {
    console.log('Task created from intrusive thought:', {
      thought,
      task,
      action,
    });

    // Send task creation thought to cognitive stream
    const taskThought = {
      id: `task-created-${timestamp}`,
      type: 'planning',
      content: `Created task from intrusive thought: "${thought}". Task: ${task.title}`,
      timestamp,
      context: {
        emotionalState: 'focused',
        confidence: 0.8,
        cognitiveSystem: 'intrusive-processor',
      },
      metadata: {
        thoughtType: 'task-creation',
        taskId: task.id,
        source: 'intrusive-thought',
      },
    };

    sendThoughtToCognitiveStream(taskThought);
  }
);

intrusiveThoughtProcessor.on(
  'planningIntegrationStarted',
  ({ task, timestamp }) => {
    console.log('Started planning integration for task:', task.title);

    const planningStartThought = {
      id: `planning-integration-started-${timestamp}`,
      type: 'planning',
      content: `Integrating task into planning system: ${task.title}`,
      timestamp,
      context: {
        emotionalState: 'focused',
        confidence: 0.7,
        cognitiveSystem: 'planning-integration',
      },
      metadata: {
        thoughtType: 'planning-integration-start',
        taskId: task.id,
        source: 'intrusive-thought',
      },
    };

    sendThoughtToCognitiveStream(planningStartThought);
  }
);

intrusiveThoughtProcessor.on('planningSystemUpdated', ({ task, result }) => {
  console.log('Planning system updated with task:', { task, result });

  // Send planning update thought to cognitive stream
  const planningThought = {
    id: `planning-update-${Date.now()}`,
    type: 'planning',
    content: `Planning system updated: ${task.title} - ${result.success ? 'Success' : 'Failed'}`,
    timestamp: Date.now(),
    context: {
      emotionalState: 'focused',
      confidence: 0.7,
      cognitiveSystem: 'planning-integration',
    },
    metadata: {
      thoughtType: 'planning-update',
      taskId: task.id,
      success: result.success,
    },
  };

  sendThoughtToCognitiveStream(planningThought);
});
*/

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

    sendThoughtToCognitiveStream(recordedThought);
  }
);

intrusiveThoughtProcessor.on('processingError', ({ thought, error }) => {
  console.error('Error processing intrusive thought:', { thought, error });

  // Send error thought to cognitive stream
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

  sendThoughtToCognitiveStream(errorThought);
});

// Social awareness manager event listeners
socialAwarenessManager.on('socialConsiderationGenerated', (result: any) => {
  // Log the social consideration to cognitive stream
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

  sendThoughtToCognitiveStream(considerationThought);
});

// Chat consideration event listeners
socialAwarenessManager.on('chatConsiderationGenerated', (result: any) => {
  // Log the chat consideration to cognitive stream
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

  sendThoughtToCognitiveStream(chatConsiderationThought);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    system: 'cognition',
    timestamp: Date.now(),
    version: '0.1.0',
  });
});

// Start thought generation endpoint
app.post('/start-thoughts', (req, res) => {
  try {
    startThoughtGeneration();
    res.json({
      success: true,
      message: 'Enhanced thought generator started',
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Error starting thought generation:', error);
    res.status(500).json({
      error: 'Failed to start thought generation',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Stop thought generation endpoint
app.post('/stop-thoughts', (req, res) => {
  try {
    stopThoughtGeneration();
    res.json({
      success: true,
      message: 'Enhanced thought generator stopped',
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Error stopping thought generation:', error);
    res.status(500).json({
      error: 'Failed to stop thought generation',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get thought generation status endpoint
app.get('/thoughts-status', (req, res) => {
  res.json({
    isRunning: thoughtGenerationInterval !== null,
    interval: thoughtGenerationInterval ? 30000 : null,
    timestamp: Date.now(),
  });
});

// Get cognition system state
app.get('/state', (req, res) => {
  try {
    const state = {
      cognitiveCore: {
        contextOptimizer: {
          active: cognitionSystem.cognitiveCore.contextOptimizer.isActive(),
          optimizationCount: metricsTracker.getOptimizationCount(),
        },
        conversationManager: {
          activeConversations:
            cognitiveStateTracker.getActiveConversationCount(),
          totalConversations: metricsTracker.getConversationCount(),
        },
        creativeSolver: {
          active: cognitionSystem.cognitiveCore.creativeSolver.isActive(),
          solutionsGenerated: metricsTracker.getSolutionsGenerated(),
        },
      },
      constitutionalFilter: {
        rulesCount: cognitionSystem.constitutionalFilter.getRulesCount(),
        violationsBlocked: metricsTracker.getViolationsBlocked(),
      },
      intrusionInterface: {
        active: cognitionSystem.intrusionInterface.isActive(),
        intrusionsHandled: metricsTracker.getIntrusionsHandled(),
      },
      selfModel: {
        identityCount: cognitionSystem.selfModel.getIdentityCount(),
        activeIdentities: cognitionSystem.selfModel.getActiveIdentities(),
      },
      socialCognition: {
        agentModels: cognitionSystem.socialCognition.getAgentCount(),
        relationships: cognitionSystem.socialCognition.getRelationshipCount(),
      },
    };

    res.json(state);
  } catch (error) {
    console.error('Error getting cognition state:', error);
    res.status(500).json({ error: 'Failed to get cognition state' });
  }
});

// Get cognitive thoughts
app.get('/thoughts', (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const since = parseInt(req.query.since as string) || 0;

    // Get thoughts from both sources
    const generatedThoughts = enhancedThoughtGenerator.getThoughtHistory(1000); // Get all generated thoughts
    const allThoughts = [...cognitiveThoughts, ...generatedThoughts];

    // Filter by timestamp if specified
    const filteredThoughts =
      since > 0
        ? allThoughts.filter((thought) => thought.timestamp > since)
        : allThoughts;

    // Sort by timestamp (newest first)
    filteredThoughts.sort((a, b) => b.timestamp - a.timestamp);

    // Apply limit
    const limitedThoughts = filteredThoughts.slice(0, limit);

    res.json({
      thoughts: limitedThoughts,
      count: limitedThoughts.length,
      total: allThoughts.length,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Error getting cognitive thoughts:', error);
    res.status(500).json({ error: 'Failed to get cognitive thoughts' });
  }
});

// Receive and store thoughts from external sources (like Minecraft interface)
app.post('/thoughts', (req, res) => {
  try {
    const { type, content, attribution, context, metadata, id, timestamp } =
      req.body;

    if (!type || !content) {
      return res.status(400).json({
        error: 'Missing required fields: type and content are required',
      });
    }

    // Create a cognitive thought object
    const thought = {
      id:
        id ||
        `external-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: type,
      content: content,
      attribution: attribution || 'minecraft-interface',
      context: context || {
        emotionalState: 'neutral',
        confidence: 0.5,
        cognitiveSystem: 'minecraft-interface',
      },
      metadata: {
        thoughtType: 'external-input',
        source: 'minecraft-interface',
        ...metadata,
      },
      timestamp: timestamp || Date.now(),
    };

    // Store the thought
    cognitiveThoughts.push(thought);

    // Send to cognitive stream if available
    sendThoughtToCognitiveStream(thought);

    console.log(
      `✅ Received external thought: ${thought.type} - ${thought.content.substring(0, 50)}...`
    );

    res.json({
      success: true,
      thoughtId: thought.id,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Error storing external thought:', error);
    res.status(500).json({ error: 'Failed to store external thought' });
  }
});

// Process cognitive task
app.post('/process', async (req, res) => {
  try {
    const { type, content, metadata } = req.body;

    console.log(`Processing ${type} request:`, { content, metadata });

    if (type === 'intrusion') {
      // Use enhanced intrusive thought processor to generate internal thought
      const result =
        await intrusiveThoughtProcessor.processIntrusiveThought(content);

      // Send the generated internal thought to the cognitive stream with self attribution
      if (result.thought) {
        try {
          const cognitiveStreamResponse = await fetch(
            'http://localhost:3000/api/ws/cognitive-stream',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: result.thought.type || 'intrusive',
                content: result.thought.content,
                attribution: 'self',
                context: result.thought.context,
                metadata: result.thought.metadata,
                id: result.thought.id,
                timestamp: result.thought.timestamp,
                processed: true,
              }),
            }
          );

          if (cognitiveStreamResponse.ok) {
            console.log(
              '✅ Intrusive thought processed as internal thought and sent to cognitive stream'
            );
          } else {
            console.error(
              '❌ Failed to send intrusive thought to cognitive stream as internal thought'
            );
          }
        } catch (error) {
          console.error(
            '❌ Error sending intrusive thought to cognitive stream as internal thought:',
            error
          );
        }
      }

      res.json({
        processed: result.accepted,
        type: 'intrusion',
        response: result.response,
        thought: result.thought,
        timestamp: Date.now(),
      });
    } else if (type === 'environmental_awareness') {
      // Process environmental awareness (entity detection, events, etc.)
      console.log('Processing environmental awareness:', { content, metadata });

      try {
        // The minecraft interface sends data directly in req.body, not in req.body.observation
        const rawObservation = req.body as any;
        const observation = buildObservationPayload(
          rawObservation,
          rawObservation?.metadata
        );

        if (observation) {
          console.log('cognition.observation.llm_request', {
            observationId: observation.observationId,
            category: observation.category,
          });

          const insight = await observationReasoner.reason(observation);

          if (insight.fallback) {
            console.warn('cognition.observation.fallback', {
              observationId: observation.observationId,
              reason: insight.error,
            });
          }

          const sanitizedBotPosition = redactPositionForLog(
            observation.bot.position
          );
          const sanitizedEntityPosition = redactPositionForLog(
            observation.entity?.position
          );

          const internalThought = {
            type: 'environmental',
            content: insight.thought.text,
            attribution: 'self',
            context: {
              emotionalState: insight.fallback ? 'cautious' : 'curious',
              confidence: insight.thought.confidence ?? 0.75,
              cognitiveSystem:
                insight.thought.source === 'llm'
                  ? 'environmental-llm'
                  : 'environmental-fallback',
              observationId: observation.observationId,
            },
            metadata: {
              thoughtType: 'environmental',
              source: observation.category,
              observationId: observation.observationId,
              fallback: insight.fallback,
              entity: observation.entity
                ? {
                    name:
                      observation.entity.displayName || observation.entity.name,
                    threatLevel: observation.entity.threatLevel,
                    distance: observation.entity.distance,
                    position: sanitizedEntityPosition,
                  }
                : undefined,
              event: observation.event
                ? {
                    type: observation.event.type,
                    description: observation.event.description,
                    severity: observation.event.severity,
                    position: redactPositionForLog(observation.event.position),
                  }
                : undefined,
              botPosition: sanitizedBotPosition,
              timestamp: observation.timestamp,
            },
            id: `thought-${Date.now()}-env-${Math.random()
              .toString(36)
              .substr(2, 9)}`,
            timestamp: Date.now(),
            processed: true,
          };

          const cognitiveStreamResponse = await fetch(
            'http://localhost:3000/api/ws/cognitive-stream',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(internalThought),
            }
          );

          if (!cognitiveStreamResponse.ok) {
            console.warn(
              '❌ Failed to send observation thought to cognitive stream'
            );
          }

          const primaryTask = insight.actions.tasks?.[0];

          res.json({
            processed: true,
            type: 'environmental_awareness',
            observationId: observation.observationId,
            thought: insight.thought,
            actions: insight.actions,
            fallback: insight.fallback,
            error: insight.error,
            shouldRespond: insight.actions.shouldRespond,
            response: insight.actions.response ?? '',
            shouldCreateTask: insight.actions.shouldCreateTask,
            taskSuggestion: primaryTask?.description,
            internalThought,
            timestamp: Date.now(),
          });
          return;
        }

        // Fallback to minimal processing when observation payload missing
        const fallbackThought = {
          type: 'environmental',
          content: content || 'Maintaining awareness of surroundings.',
          attribution: 'self',
          context: {
            emotionalState: 'alert',
            confidence: 0.5,
            cognitiveSystem: 'environmental-fallback',
          },
          metadata: {
            thoughtType: 'environmental',
            source: 'legacy-content',
            fallback: true,
            botPosition: redactPositionForLog(metadata?.botPosition),
            entityType: metadata?.entityType,
            distance: metadata?.distance,
          },
          id: `thought-${Date.now()}-env-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: Date.now(),
          processed: true,
        };

        await fetch('http://localhost:3000/api/ws/cognitive-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fallbackThought),
        });

        res.json({
          processed: true,
          type: 'environmental_awareness',
          observationId: fallbackThought.id,
          thought: {
            text: fallbackThought.content,
            confidence: 0.5,
            categories: ['fallback'],
            source: 'fallback',
          },
          actions: {
            shouldRespond: false,
            response: undefined,
            shouldCreateTask: false,
            tasks: [],
          },
          fallback: true,
          shouldRespond: false,
          response: '',
          shouldCreateTask: false,
          taskSuggestion: undefined,
          internalThought: fallbackThought,
          timestamp: Date.now(),
        });
      } catch (error) {
        console.error('❌ Error processing environmental awareness:', error);
        res.json({
          processed: false,
          type: 'environmental_awareness',
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: Date.now(),
        });
      }
    } else if (type === 'social_interaction') {
      // Process social interaction (chat from players, etc.)
      console.log('Processing social interaction:', { content, metadata });

      try {
        // Create an internal thought about the social interaction
        const internalThought = {
          type: 'social',
          content: `Social interaction: ${content}`,
          attribution: 'self',
          context: {
            emotionalState: 'interested',
            confidence: 0.9,
            cognitiveSystem: 'social-processor',
            sender: metadata?.sender,
            message: metadata?.message,
          },
          metadata: {
            thoughtType: 'social',
            source: 'player-chat',
            sender: metadata?.sender,
            message: metadata?.message,
            environment: metadata?.environment,
            botPosition: metadata?.botPosition,
            ...metadata,
          },
          id: `thought-${Date.now()}-social-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: Date.now(),
          processed: false,
        };

        // Send to cognitive stream
        const cognitiveStreamResponse = await fetch(
          'http://localhost:3000/api/ws/cognitive-stream',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(internalThought),
          }
        );

        let shouldRespond = false;
        let response = '';
        let shouldCreateTask = false;
        let taskSuggestion = '';

        // Decide on response based on message content - be selective
        const message = metadata?.message?.toLowerCase() || '';
        const sender = metadata?.sender || 'unknown';

        // Only respond to direct questions or important messages
        if (message.includes('?')) {
          // This is a question - respond
          shouldRespond = true;
          response = `I'm processing your question about "${message}". Let me think about that.`;
          shouldCreateTask = true;
          taskSuggestion = `Answer question from ${sender}: "${message}"`;
        } else if (message.includes('help') || message.includes('assist')) {
          // Direct request for help
          shouldRespond = true;
          response = `I can help with exploration, resource gathering, and various tasks. What specifically do you need?`;
          shouldCreateTask = true;
          taskSuggestion = `Provide assistance requested by ${sender}`;
        } else if (message.includes('danger') || message.includes('threat')) {
          // Immediate safety concern
          shouldRespond = true;
          response = `I understand there's a safety concern. I'm monitoring the situation.`;
          shouldCreateTask = true;
          taskSuggestion = `Address safety concern from ${sender}`;
        } else if (
          message.length < 10 &&
          (message.includes('hello') || message.includes('hi'))
        ) {
          // Short greeting - respond occasionally
          shouldRespond = Math.random() < 0.4; // 40% chance
          if (shouldRespond) {
            response = `Hello! I'm currently focused on my tasks, but I noticed your greeting.`;
          }
          shouldCreateTask = false; // Don't create tasks for casual greetings
        }
        // For other messages, stay silent - don't spam responses

        res.json({
          processed: true,
          type: 'social_interaction',
          shouldRespond,
          response,
          shouldCreateTask,
          taskSuggestion,
          internalThought,
          timestamp: Date.now(),
        });
      } catch (error) {
        console.error('❌ Error processing social interaction:', error);
        res.json({
          processed: false,
          type: 'social_interaction',
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: Date.now(),
        });
      }
    } else if (type === 'environmental_event') {
      // Process environmental events (block changes, item pickups, health changes, etc.)
      console.log('Processing environmental event:', { content, metadata });

      try {
        // Create an internal thought about the environmental event
        const internalThought = {
          type: 'environmental',
          content: `Environmental observation: ${content}`,
          attribution: 'self',
          context: {
            emotionalState: 'observant',
            confidence: 0.8,
            cognitiveSystem: 'environmental-processor',
            eventType: metadata?.eventType,
            eventData: metadata?.eventData,
          },
          metadata: {
            thoughtType: 'environmental',
            source: 'environmental-event',
            eventType: metadata?.eventType,
            eventData: metadata?.eventData,
            botPosition: metadata?.botPosition,
            ...metadata,
          },
          id: `thought-${Date.now()}-env-event-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: Date.now(),
          processed: false,
        };

        // Send to cognitive stream
        const cognitiveStreamResponse = await fetch(
          'http://localhost:3000/api/ws/cognitive-stream',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(internalThought),
          }
        );

        let shouldRespond = false;
        let response = '';
        let shouldCreateTask = false;
        let taskSuggestion = '';

        // Decide on response based on event type - be very selective
        const eventType = metadata?.eventType || '';
        const eventData = metadata?.eventData || {};

        // Only respond to critical or very interesting events
        if (eventType === 'health_loss' && eventData.damage > 5) {
          // Only respond to significant damage
          shouldRespond = true;
          response = `That hurt! I should be more careful in this area.`;
          shouldCreateTask = true;
          taskSuggestion = `Investigate and avoid the source of damage`;
        } else if (
          eventType === 'block_break' &&
          eventData.oldBlock &&
          eventData.oldBlock !== 'air'
        ) {
          // Only respond to interesting block changes, not every fire tick
          shouldRespond = Math.random() < 0.2; // 20% chance for interesting blocks
          if (shouldRespond) {
            response = `Interesting environmental change detected.`;
          }
          shouldCreateTask = false; // Don't spam tasks for every block change
        }
        // Most environmental events (item pickups, minor changes) should be silent

        res.json({
          processed: true,
          type: 'environmental_event',
          shouldRespond,
          response,
          shouldCreateTask,
          taskSuggestion,
          internalThought,
          timestamp: Date.now(),
        });
      } catch (error) {
        console.error('❌ Error processing environmental event:', error);
        res.json({
          processed: false,
          type: 'environmental_event',
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: Date.now(),
        });
      }
    } else if (type === 'external_chat') {
      // Process external chat message
      console.log('Processing external chat message:', { content, metadata });

      try {
        // Get actual inventory data
        let actualInventory = { items: [], armor: [], tools: [] };
        try {
          const inventoryResponse = await fetch(
            'http://localhost:3005/inventory'
          );
          if (inventoryResponse.ok) {
            const inventoryData = await inventoryResponse.json();
            actualInventory = (await (inventoryData as any).data) || {
              items: [],
              armor: [],
              tools: [],
            };
          }
        } catch (error) {
          console.error('Failed to fetch actual inventory:', error);
        }

        // Use ReAct arbiter for all responses - let the bot use its own tools and reasoning
        const response = await reactArbiter.reason({
          snapshot: {
            stateId: 'chat-response',
            position: { x: 0, y: 64, z: 0 },
            biome: 'unknown',
            time: 6000,
            light: 15,
            hazards: ['none'],
            nearbyEntities: [],
            nearbyBlocks: [],
            weather: 'clear',
          },
          inventory: {
            stateId: 'chat-inventory',
            items: actualInventory.items || [],
            armor: actualInventory.armor || [],
            tools: actualInventory.tools || [],
          },
          goalStack: [
            {
              id: 'chat-response-goal',
              type: 'social',
              description: 'Respond to player message',
              priority: 0.8,
              utility: 0.9,
              source: 'user',
            },
          ],
          memorySummaries: [],
        });

        const responseText =
          response.thoughts ||
          `Hello ${metadata?.sender || 'Player'}! I received your message: "${content}". How can I help you in this Minecraft world?`;

        // Generate cognitive thoughts about the interaction
        const cognitiveThought = await enhancedThoughtGenerator.generateThought(
          {
            currentState: {
              position: { x: 0, y: 64, z: 0 },
              health: 20,
              inventory: [],
            },
            currentTasks: [
              {
                id: 'chat-response',
                title: 'Respond to player message',
                progress: 0.5,
                status: 'active',
                type: 'social',
              },
            ],
            recentEvents: [
              {
                id: 'chat-event',
                type: 'player_message',
                timestamp: Date.now(),
                data: { sender: metadata?.sender, content },
              },
            ],
            emotionalState: metadata?.emotion || 'neutral',
            memoryContext: {},
          }
        );

        const cognitiveThoughts = cognitiveThought ? [cognitiveThought] : [];

        res.json({
          processed: true,
          type: 'external_chat',
          response: responseText,
          cognitiveThoughts: cognitiveThoughts,
          metadata: {
            sender: metadata?.sender,
            messageType: metadata?.messageType,
            intent: metadata?.intent,
            emotion: metadata?.emotion,
            requiresResponse: metadata?.requiresResponse,
            responsePriority: metadata?.responsePriority,
          },
          timestamp: Date.now(),
        });
      } catch (error) {
        console.error('Error processing external chat:', error);

        // Fallback response
        res.json({
          processed: false,
          type: 'external_chat',
          response: `I received your message: "${content}". I'm having trouble processing it right now, but I'll try to help!`,
          cognitiveThoughts: [],
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: Date.now(),
        });
      }
    } else {
      // Handle other cognitive tasks
      const result = {
        processed: true,
        type,
        content,
        context: req.body.context,
        timestamp: Date.now(),
      };

      res.json(result);
    }
  } catch (error) {
    console.error('Error processing cognitive task:', error);
    res.status(500).json({ error: 'Failed to process cognitive task' });
  }
});

// Generate authentic thoughts using enhanced thought generator
app.post('/generate-thoughts', async (req, res) => {
  try {
    const { situation, context, thoughtTypes } = req.body;

    console.log(`Generating thoughts for situation:`, {
      situation,
      thoughtTypes,
    });

    // Use enhanced thought generator
    const thought = await enhancedThoughtGenerator.generateThought({
      currentState: context.currentState,
      currentTasks: context.currentState?.currentTasks || [],
      recentEvents: context.recentEvents || [],
      emotionalState: context.emotional || 'neutral',
      memoryContext: context.memoryContext,
    });

    const thoughts = thought ? [thought] : [];

    // Store thoughts for external access
    thoughts.forEach((thought) => {
      cognitiveThoughts.push(thought);
    });

    // Keep only the last 100 thoughts to prevent memory leaks
    if (cognitiveThoughts.length > 100) {
      cognitiveThoughts.splice(0, cognitiveThoughts.length - 100);
    }

    const result = {
      thoughts,
      count: thoughts.length,
      timestamp: Date.now(),
    };

    res.json(result);
  } catch (error) {
    console.error('Error generating thoughts:', error);
    res.status(500).json({ error: 'Failed to generate thoughts' });
  }
});

// Process social consideration for nearby entities
app.post('/consider-social', async (req, res) => {
  try {
    const { entity, context } = req.body;

    if (!entity || !entity.type) {
      return res.status(400).json({
        error: 'Missing required fields: entity.type',
      });
    }

    console.log(`🤔 Processing social consideration for ${entity.type}:`, {
      entityId: entity.id,
      distance: entity.distance,
      hostile: entity.hostile,
      friendly: entity.friendly,
    });

    // Use enhanced thought generator for social consideration
    const thought = await enhancedThoughtGenerator.generateSocialConsideration(
      entity,
      context
    );

    const thoughts = thought ? [thought] : [];

    // Store thoughts for external access
    thoughts.forEach((thought) => {
      cognitiveThoughts.push(thought);
    });

    // Keep only the last 100 thoughts to prevent memory leaks
    if (cognitiveThoughts.length > 100) {
      cognitiveThoughts.splice(0, cognitiveThoughts.length - 100);
    }

    const result = {
      processed: true,
      entity: entity,
      thought: thought,
      socialDecision: thoughts.length > 0 ? thought?.content : null,
      timestamp: Date.now(),
    };

    res.json(result);
  } catch (error) {
    console.error('Error processing social consideration:', error);
    res.status(500).json({ error: 'Failed to process social consideration' });
  }
});

// Process nearby entities for social consideration
app.post('/process-nearby-entities', async (req, res) => {
  try {
    const { entities, context } = req.body;

    if (!Array.isArray(entities)) {
      return res.status(400).json({
        error: 'entities must be an array',
      });
    }

    console.log(
      `🤔 Processing ${entities.length} nearby entities for social consideration`
    );

    // Use social awareness manager
    const results = await socialAwarenessManager.processNearbyEntities(
      entities,
      context
    );

    // Send social consideration thoughts to cognitive stream
    for (const result of results) {
      const considerationThought = {
        id: `social-consideration-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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
          trigger: 'entity-nearby',
        },
        category: 'social',
        tags: ['social', 'entity-nearby', 'consideration'],
      };

      await sendThoughtToCognitiveStream(considerationThought);
    }

    res.json({
      processed: true,
      entitiesConsidered: entities.length,
      considerationsGenerated: results.length,
      results: results.map((r) => ({
        entity: r.entity,
        shouldAcknowledge: r.shouldAcknowledge,
        priority: r.priority,
        action: r.action,
      })),
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Error processing nearby entities:', error);
    res.status(500).json({ error: 'Failed to process nearby entities' });
  }
});

// Process chat messages for response consideration
app.post('/consider-chat', async (req, res) => {
  try {
    const { message, context } = req.body;

    if (!message || !message.sender || !message.content) {
      return res.status(400).json({
        error: 'Missing required fields: message.sender, message.content',
      });
    }

    console.log(`💬 Processing chat consideration for ${message.sender}:`, {
      message: message.content.substring(0, 50) + '...',
      senderType: message.senderType,
      isDirect: message.isDirect,
    });

    // Use social awareness manager for chat consideration
    const result = await socialAwarenessManager.processChatMessage(
      message,
      context
    );

    // Send chat consideration to cognitive stream
    if (result) {
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
        category: 'social',
        tags: ['social', 'chat', 'consideration'],
      };

      await sendThoughtToCognitiveStream(chatConsiderationThought);
    }

    res.json({
      processed: true,
      message: message,
      shouldRespond: result?.shouldRespond || false,
      reasoning: result?.reasoning || 'No consideration generated',
      responseContent: result?.responseContent,
      responseType: result?.responseType,
      priority: result?.priority || 'low',
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Error processing chat consideration:', error);
    res.status(500).json({ error: 'Failed to process chat consideration' });
  }
});

// Consider departure communication
app.post('/consider-departure', async (req, res) => {
  try {
    const { currentArea, newTask, context } = req.body;

    if (!currentArea || !newTask) {
      return res.status(400).json({
        error: 'Missing required fields: currentArea, newTask',
      });
    }

    console.log(`🚪 Considering departure communication:`, {
      area: currentArea.name,
      newTask: newTask.title,
      entitiesNearby: currentArea.entities.length,
    });

    // Use social awareness manager for departure communication
    const result = await socialAwarenessManager.generateDepartureCommunication(
      currentArea,
      newTask,
      context
    );

    // Send departure consideration to cognitive stream
    if (result.shouldAnnounce) {
      const departureThought = {
        id: `departure-consideration-${Date.now()}`,
        type: 'social_consideration',
        content: result.reasoning,
        timestamp: Date.now(),
        context: {
          emotionalState: 'focused',
          confidence: 0.8,
          cognitiveSystem: 'social-awareness',
        },
        metadata: {
          thoughtType: 'departure-consideration',
          area: currentArea.name,
          task: newTask.title,
          shouldAnnounce: result.shouldAnnounce,
          priority: result.priority,
          trigger: 'task-departure',
        },
        category: 'social',
        tags: ['social', 'departure', 'communication'],
      };

      await sendThoughtToCognitiveStream(departureThought);
    }

    res.json({
      processed: true,
      shouldAnnounce: result.shouldAnnounce,
      message: result.message,
      reasoning: result.reasoning,
      priority: result.priority,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Error processing departure consideration:', error);
    res
      .status(500)
      .json({ error: 'Failed to process departure consideration' });
  }
});

// Process social cognition for external messages
app.post('/process-social', async (req, res) => {
  try {
    const { message, sender, context } = req.body;

    console.log(`Processing social cognition for message from ${sender}:`, {
      message,
    });

    // Mock social cognition system (dev-only)
    if (process.env.ALLOW_COGNITION_MOCKS !== 'true') {
      return res.status(503).json({
        error: 'Social cognition not configured (mocks disabled)',
      });
    }
    // In a real implementation, this would use the actual TheoryOfMindEngine
    const thoughts = [];

    // Analyze the message content and generate social thoughts
    const lowerMessage = message.toLowerCase();

    if (
      lowerMessage.includes('hello') ||
      lowerMessage.includes('hi') ||
      lowerMessage.includes('hey')
    ) {
      thoughts.push({
        type: 'social',
        content: `${sender} seems to be greeting me. They appear friendly and want to interact.`,
        emotionalState: 'welcoming',
        confidence: 0.8,
      });
    } else if (
      lowerMessage.includes('help') ||
      lowerMessage.includes('please')
    ) {
      thoughts.push({
        type: 'social',
        content: `${sender} is asking for help. They seem to trust me and think I can assist them.`,
        emotionalState: 'helpful',
        confidence: 0.7,
      });
    } else if (lowerMessage.includes('thank')) {
      thoughts.push({
        type: 'social',
        content: `${sender} is expressing gratitude. This suggests they appreciate my assistance.`,
        emotionalState: 'appreciated',
        confidence: 0.9,
      });
    } else {
      thoughts.push({
        type: 'social',
        content: `${sender} said: "${message}". I should consider how to respond appropriately.`,
        emotionalState: 'thoughtful',
        confidence: 0.6,
      });
    }

    const result = {
      thoughts,
      count: thoughts.length,
      timestamp: Date.now(),
    };

    res.json(result);
  } catch (error) {
    console.error('Error processing social cognition:', error);
    res.status(500).json({ error: 'Failed to process social cognition' });
  }
});

// Get telemetry data
app.get('/telemetry', (req, res) => {
  try {
    const telemetry = {
      events: [
        {
          id: `cognition-${Date.now()}`,
          timestamp: Date.now(),
          source: 'cognition-system',
          type: 'cognition_state',
          data: {
            cognitiveLoad: calculateCognitiveLoad(),
            attentionLevel: calculateAttentionLevel(),
            creativityLevel: calculateCreativityLevel(),
            metrics: {
              activeProcesses: getActiveProcessCount(),
              memoryUsage: process.memoryUsage(),
              uptime: process.uptime(),
              cpuUsage: getSystemCpuUsage(),
              networkRequests: getNetworkRequestCount(),
            },
          },
        },
      ],
    };

    res.json(telemetry);
  } catch (error) {
    console.error('Error getting cognition telemetry:', error);
    res.status(500).json({ error: 'Failed to get telemetry' });
  }
});

// ============================================================================
// ReAct Endpoints
// ============================================================================

// POST /reason - Execute a single ReAct reasoning step
app.post('/reason', async (req, res) => {
  try {
    const {
      snapshot,
      inventory,
      goalStack,
      memorySummaries,
      lastToolResult,
      reflexionHints,
    } = req.body;

    // Validate required fields
    if (!snapshot || !inventory || !goalStack) {
      return res.status(400).json({
        error: 'Missing required fields: snapshot, inventory, goalStack',
      });
    }

    const context = {
      snapshot,
      inventory,
      goalStack,
      memorySummaries: memorySummaries || [],
      lastToolResult,
      reflexionHints,
    };

    const step = await reactArbiter.reason(context);

    res.json({
      success: true,
      step,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('ReAct reasoning failed:', error);
    res.status(500).json({
      error: 'ReAct reasoning failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Generate task-specific steps using LLM
 */
async function generateTaskSteps(task: any, context?: any): Promise<any[]> {
  try {
    // Use the ReAct Arbiter's new method for step generation
    const responseText = await reactArbiter.generateTaskSteps(task);

    // Parse the numbered list response
    const steps = parseNumberedListResponse(responseText, task);

    // If parsing failed, use intelligent fallback based on task type
    if (steps.length === 0) {
      return generateIntelligentFallbackSteps(task);
    }

    return steps;
  } catch (error) {
    console.warn('LLM step generation failed, using fallback:', error);
    return generateIntelligentFallbackSteps(task);
  }
}

/**
 * Parse numbered list response from LLM
 */
function parseNumberedListResponse(text: string, task: any): any[] {
  const steps: any[] = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Look for numbered list items
    const match = trimmedLine.match(/^(\d+)\.\s*(.+)$/);
    if (match) {
      const stepNumber = parseInt(match[1]);
      const stepContent = match[2].trim();

      // Estimate duration based on step content
      let estimatedDuration = 3000; // Default 3 seconds
      if (
        stepContent.toLowerCase().includes('move') ||
        stepContent.toLowerCase().includes('navigate')
      ) {
        estimatedDuration = 5000;
      } else if (
        stepContent.toLowerCase().includes('gather') ||
        stepContent.toLowerCase().includes('collect')
      ) {
        estimatedDuration = 4000;
      } else if (
        stepContent.toLowerCase().includes('craft') ||
        stepContent.toLowerCase().includes('build')
      ) {
        estimatedDuration = 6000;
      } else if (
        stepContent.toLowerCase().includes('analyze') ||
        stepContent.toLowerCase().includes('plan')
      ) {
        estimatedDuration = 2000;
      }

      steps.push({
        label: stepContent,
        estimatedDuration,
      });
    }
  }

  return steps;
}

/**
 * Generate intelligent fallback steps based on task type
 */
function generateIntelligentFallbackSteps(task: any): any[] {
  const taskType = task.type || 'general';
  const title = task.title.toLowerCase();

  switch (taskType) {
    case 'crafting':
      if (title.includes('pickaxe')) {
        return [
          {
            label: 'Check if crafting table is available',
            estimatedDuration: 2000,
          },
          { label: 'Place crafting table if needed', estimatedDuration: 3000 },
          {
            label: 'Gather required materials (sticks, planks)',
            estimatedDuration: 4000,
          },
          {
            label: 'Craft wooden pickaxe at crafting table',
            estimatedDuration: 5000,
          },
          {
            label: 'Verify pickaxe was created successfully',
            estimatedDuration: 2000,
          },
        ];
      } else if (title.includes('crafting table')) {
        return [
          {
            label: 'Gather oak logs from nearby trees',
            estimatedDuration: 4000,
          },
          { label: 'Convert logs to oak planks', estimatedDuration: 3000 },
          {
            label: 'Craft crafting table from planks',
            estimatedDuration: 3000,
          },
          {
            label: 'Place crafting table in suitable location',
            estimatedDuration: 3000,
          },
        ];
      }
      return [
        { label: 'Gather required materials', estimatedDuration: 4000 },
        { label: 'Set up crafting area', estimatedDuration: 3000 },
        { label: 'Craft the requested item', estimatedDuration: 5000 },
        { label: 'Verify crafting success', estimatedDuration: 2000 },
      ];

    case 'gathering':
      if (title.includes('wood') || title.includes('log')) {
        return [
          { label: 'Locate nearby trees', estimatedDuration: 3000 },
          { label: 'Move to tree location', estimatedDuration: 4000 },
          {
            label: 'Break tree blocks to collect logs',
            estimatedDuration: 5000,
          },
          { label: 'Collect dropped items', estimatedDuration: 2000 },
        ];
      }
      return [
        { label: 'Search for target resources', estimatedDuration: 3000 },
        { label: 'Navigate to resource location', estimatedDuration: 4000 },
        { label: 'Extract or collect resources', estimatedDuration: 5000 },
        { label: 'Verify collection success', estimatedDuration: 2000 },
      ];

    case 'mining':
      return [
        { label: 'Find suitable mining location', estimatedDuration: 3000 },
        { label: 'Ensure proper tools are available', estimatedDuration: 2000 },
        { label: 'Begin mining operation', estimatedDuration: 6000 },
        { label: 'Collect mined resources', estimatedDuration: 3000 },
      ];

    case 'building':
    case 'placement':
      return [
        { label: 'Select suitable building location', estimatedDuration: 3000 },
        {
          label: 'Gather required building materials',
          estimatedDuration: 4000,
        },
        { label: 'Place blocks in desired pattern', estimatedDuration: 5000 },
        { label: 'Verify structure completion', estimatedDuration: 2000 },
      ];

    case 'exploration':
      return [
        { label: 'Choose exploration direction', estimatedDuration: 2000 },
        { label: 'Navigate to new area', estimatedDuration: 5000 },
        { label: 'Survey surroundings for resources', estimatedDuration: 4000 },
        { label: 'Document findings', estimatedDuration: 2000 },
      ];

    default:
      return [
        { label: 'Analyze task requirements', estimatedDuration: 2000 },
        { label: 'Plan execution approach', estimatedDuration: 3000 },
        { label: 'Execute task', estimatedDuration: 5000 },
        { label: 'Verify completion', estimatedDuration: 2000 },
      ];
  }
}

// POST /generate-steps - Generate task steps from cognitive system
app.post('/generate-steps', async (req, res) => {
  try {
    const { task, context } = req.body;

    // Validate required fields
    if (!task || !task.title) {
      return res.status(400).json({
        error: 'Missing required fields: task.title',
      });
    }

    console.log('Generating dynamic steps for task:', task.title);

    // Use the new method from ReAct Arbiter to generate task-specific steps
    const steps = await generateTaskSteps(task, context);

    console.log('Generated dynamic steps:', steps);

    res.json({
      success: true,
      steps,
      reasoning: `Generated ${steps.length} steps for task: ${task.title}`,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Dynamic step generation failed:', error);
    res.status(500).json({
      error: 'Dynamic step generation failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// POST /reflect - Generate Reflexion-style verbal self-feedback
app.post('/reflect', async (req, res) => {
  try {
    const { episodeTrace, outcome, errors } = req.body;

    // Validate required fields
    if (!episodeTrace || !outcome) {
      return res.status(400).json({
        error: 'Missing required fields: episodeTrace, outcome',
      });
    }

    if (!['success', 'failure'].includes(outcome)) {
      return res.status(400).json({
        error: 'Outcome must be either "success" or "failure"',
      });
    }

    const reflection = await reactArbiter.reflect(
      episodeTrace,
      outcome,
      errors
    );

    res.json({
      success: true,
      reflection,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Reflection generation failed:', error);
    res.status(500).json({
      error: 'Reflection generation failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================================================
// Cognitive Load Calculation Methods
// ============================================================================

/**
 * Calculate current cognitive load based on system resources and activity
 */
function calculateCognitiveLoad(): number {
  const cpuLoad = getSystemCpuUsage();
  const memoryLoad = getMemoryLoad();
  const processLoad = getProcessLoad();
  const networkLoad = getNetworkLoad();

  // Weighted average of different load factors
  const cognitiveLoad =
    cpuLoad * 0.3 + // CPU usage 30%
    memoryLoad * 0.25 + // Memory usage 25%
    processLoad * 0.25 + // Active processes 25%
    networkLoad * 0.2; // Network activity 20%

  // Normalize to 0-1 range
  return Math.min(1.0, Math.max(0.0, cognitiveLoad));
}

/**
 * Calculate attention level based on system responsiveness
 */
function calculateAttentionLevel(): number {
  const uptime = process.uptime();
  const memoryUsage = process.memoryUsage();

  // High attention when system is fresh and not overloaded
  const attentionBase = Math.max(0, 1 - uptime / 3600); // Decreases over time
  const memoryAttention = Math.max(
    0,
    1 - memoryUsage.heapUsed / memoryUsage.heapTotal
  );

  return Math.min(1.0, Math.max(0.0, (attentionBase + memoryAttention) / 2));
}

/**
 * Calculate creativity level based on system capacity and rest periods
 */
function calculateCreativityLevel(): number {
  const uptime = process.uptime();
  const memoryUsage = process.memoryUsage();

  // Creativity is higher when system is rested and has available resources
  const restFactor = Math.max(0, 1 - Math.min(1, uptime / 1800)); // Higher after rest
  const capacityFactor = Math.max(
    0,
    1 - memoryUsage.heapUsed / memoryUsage.heapTotal
  );

  return Math.min(1.0, Math.max(0.0, (restFactor + capacityFactor) / 2));
}

/**
 * Get number of active processes
 */
function getActiveProcessCount(): number {
  // In a real implementation, this would track active cognitive processes
  // For now, return a simulated value based on system activity
  const baseProcesses = 3; // Base cognitive processes always running
  const uptime = process.uptime();
  const activityBonus = Math.floor(uptime / 300); // +1 process per 5 minutes of uptime

  return baseProcesses + Math.min(5, activityBonus); // Cap at 8 processes
}

/**
 * Get system CPU usage as percentage (0-1)
 */
function getSystemCpuUsage(): number {
  try {
    // Get current CPU usage
    const cpuUsage = process.cpuUsage();
    const totalTime = cpuUsage.user + cpuUsage.system;

    // Convert to percentage (simplified calculation)
    // In production, this would track over time intervals
    return Math.min(1.0, Math.max(0.0, totalTime / 100000)); // Normalize to 0-1
  } catch (error) {
    console.warn('Failed to get CPU usage:', error);
    return 0.5; // Default moderate load
  }
}

/**
 * Get memory load as percentage (0-1)
 */
function getMemoryLoad(): number {
  try {
    const memoryUsage = process.memoryUsage();
    const memoryLoad = memoryUsage.heapUsed / memoryUsage.heapTotal;

    return Math.min(1.0, Math.max(0.0, memoryLoad));
  } catch (error) {
    console.warn('Failed to get memory usage:', error);
    return 0.5; // Default moderate load
  }
}

/**
 * Get process load based on active operations
 */
function getProcessLoad(): number {
  try {
    // Simulate process load based on uptime and activity patterns
    const uptime = process.uptime();
    const timeOfDay = new Date().getHours();

    // Higher load during peak hours and after long uptime
    const uptimeLoad = Math.min(1.0, uptime / 3600); // Max after 1 hour
    const timeLoad = timeOfDay >= 9 && timeOfDay <= 17 ? 0.7 : 0.3; // Higher during business hours

    return (uptimeLoad + timeLoad) / 2;
  } catch (error) {
    console.warn('Failed to calculate process load:', error);
    return 0.5; // Default moderate load
  }
}

/**
 * Get network load based on recent activity
 */
function getNetworkLoad(): number {
  try {
    // Track recent network requests
    const recentRequests = networkRequestCount || 0;
    const timeWindow = 60; // Last minute

    // Normalize to 0-1 based on request rate
    return Math.min(1.0, Math.max(0.0, recentRequests / 100)); // Max 100 requests per minute
  } catch (error) {
    console.warn('Failed to calculate network load:', error);
    return 0.5; // Default moderate load
  }
}

/**
 * Get network request count (simulated)
 */
function getNetworkRequestCount(): number {
  // In a real implementation, this would track actual HTTP requests
  // For now, return a simulated value
  return networkRequestCount || 0;
}

// Endpoint to receive thoughts from planning system and forward to dashboard
app.post('/thought-generated', async (req: Request, res: Response) => {
  try {
    const { thought, event } = req.body;

    console.log(
      '🧠 Received thought from planning system:',
      thought.type,
      '-',
      thought.content.substring(0, 60)
    );

    // Forward the thought to the dashboard
    try {
      const dashboardResponse = await fetch(
        'http://localhost:3000/api/ws/cognitive-stream',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: thought.type,
            content: thought.content,
            attribution: thought.attribution,
            context: thought.context,
            metadata: thought.metadata,
            id: thought.id,
            timestamp: thought.timestamp,
            processed: thought.processed,
          }),
        }
      );

      if (dashboardResponse.ok) {
        console.log('✅ Thought forwarded to dashboard successfully');
        res.json({ success: true, message: 'Thought forwarded to dashboard' });
      } else {
        console.warn(
          '⚠️ Failed to forward thought to dashboard:',
          dashboardResponse.status
        );
        res
          .status(500)
          .json({ error: 'Failed to forward thought to dashboard' });
      }
    } catch (error) {
      console.error('❌ Error forwarding thought to dashboard:', error);
      res.status(500).json({ error: 'Failed to forward thought to dashboard' });
    }
  } catch (error) {
    console.error('❌ Error processing thought generation:', error);
    res.status(500).json({ error: 'Failed to process thought generation' });
  }
});

// Listen for thought generation events and forward them to dashboard
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

      // Forward to dashboard
      await fetch('http://localhost:3000/api/ws/cognitive-stream', {
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
      });
    } catch (error) {
      console.warn(
        '⚠️ Failed to forward generated thought to dashboard:',
        error
      );
    }
  }
);

// Start the server
app.listen(port, () => {
  const startupMessage = `🧠 Cognition service running on port ${port}`;

  // Log the server startup to cognitive stream
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
    `  📋 Get recent thoughts: http://localhost:${port}/api/cognitive-stream/recent`
  );
  console.log(
    `  ✅ Mark thoughts processed: http://localhost:${port}/api/cognitive-stream/:id/processed`
  );
  console.log(`🧠 Social memory endpoints:`);
  console.log(
    `  📋 Get remembered entities: http://localhost:${port}/social-memory/entities`
  );
  console.log(
    `  🔍 Search entities by fact: http://localhost:${port}/social-memory/search`
  );
  console.log(
    `  📊 Social memory stats: http://localhost:${port}/social-memory/stats`
  );
});

// ============================================================================
// Cognitive Stream Integration for Planning System
// ============================================================================

// Get recent thoughts for planning system
app.get('/api/cognitive-stream/recent', async (req, res) => {
  try {
    const { limit = 10, processed = false } = req.query;
    const limitNum = parseInt(limit as string, 10);

    // Get recent thoughts from the actual cognitive stream
    // Filter out processed thoughts if requested
    let recentThoughts = cognitiveThoughts.slice();

    // Clean up old processed thoughts to prevent memory buildup
    const now = Date.now();
    const cutoffTime = now - 24 * 60 * 60 * 1000; // 24 hours ago
    cognitiveThoughts = cognitiveThoughts.filter(
      (thought) => !thought.processed || thought.timestamp > cutoffTime
    );

    // Also get thoughts from enhanced thought generator (limit to recent ones)
    const generatedThoughts = enhancedThoughtGenerator.getThoughtHistory(5); // Only get the 5 most recent
    console.log(
      `📋 Enhanced thought generator has ${generatedThoughts.length} recent thoughts`
    );

    // Combine all thoughts
    recentThoughts = [...recentThoughts, ...generatedThoughts];

    if (processed === 'false') {
      recentThoughts = recentThoughts.filter((thought) => !thought.processed);
    }

    // Sort by timestamp (newest first) and limit results
    recentThoughts = recentThoughts
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limitNum);

    // Ensure we have the required fields for the planning system
    const formattedThoughts = recentThoughts.map((thought) => ({
      id: thought.id,
      type: thought.type || 'reflection',
      content: thought.content,
      attribution: thought.attribution || 'self',
      context: thought.context,
      metadata: thought.metadata,
      timestamp: thought.timestamp,
      processed: thought.processed || false,
    }));

    res.json({
      success: true,
      thoughts: formattedThoughts,
      count: formattedThoughts.length,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Error retrieving recent thoughts:', error);
    res.status(500).json({ error: 'Failed to retrieve recent thoughts' });
  }
});

// Mark thought as processed
app.post('/api/cognitive-stream/:thoughtId/processed', async (req, res) => {
  try {
    const { thoughtId } = req.params;
    const { processed } = req.body;

    console.log(`📝 Marking thought ${thoughtId} as processed: ${processed}`);

    // In a real implementation, you'd update the thought in the database
    // For now, just return success
    res.json({
      success: true,
      thoughtId,
      processed,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Error marking thought as processed:', error);
    res.status(500).json({ error: 'Failed to mark thought as processed' });
  }
});

// ============================================================================
// Social Memory Endpoints
// ============================================================================

// Get remembered entities
app.get('/social-memory/entities', async (req, res) => {
  try {
    const minStrength = parseFloat(req.query.minStrength as string) || 0.1;

    if (!socialMemoryManager) {
      return res.status(503).json({
        error: 'Social memory system not available',
        entities: [],
      });
    }

    const entities =
      await socialMemoryManager.getRememberedEntities(minStrength);

    res.json({
      success: true,
      entities,
      count: entities.length,
      minStrength,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Error retrieving remembered entities:', error);
    res.status(500).json({ error: 'Failed to retrieve remembered entities' });
  }
});

// Search entities by fact content
app.get('/social-memory/search', async (req, res) => {
  try {
    const { query, minStrength } = req.query;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        error: 'Query parameter is required',
      });
    }

    if (!socialMemoryManager) {
      return res.status(503).json({
        error: 'Social memory system not available',
        entities: [],
      });
    }

    const entities = await socialMemoryManager.searchByFact(query);
    const filteredEntities = minStrength
      ? entities.filter(
          (e: any) => e.memoryStrength >= parseFloat(minStrength as string)
        )
      : entities;

    res.json({
      success: true,
      query,
      entities: filteredEntities,
      count: filteredEntities.length,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Error searching entities by fact:', error);
    res.status(500).json({ error: 'Failed to search entities by fact' });
  }
});

// Get social memory statistics
app.get('/social-memory/stats', async (req, res) => {
  try {
    if (!socialMemoryManager) {
      return res.status(503).json({
        error: 'Social memory system not available',
        stats: null,
      });
    }

    const stats = await socialMemoryManager.getStats();

    res.json({
      success: true,
      stats,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Error retrieving social memory stats:', error);
    res.status(500).json({ error: 'Failed to retrieve social memory stats' });
  }
});

// Record a social fact manually
app.post('/social-memory/fact', async (req, res) => {
  try {
    const { entityId, factContent, category, confidence } = req.body;

    if (!entityId || !factContent || !category) {
      return res.status(400).json({
        error: 'Missing required fields: entityId, factContent, category',
      });
    }

    if (!socialMemoryManager) {
      return res.status(503).json({
        error: 'Social memory system not available',
      });
    }

    // Note: Social facts are automatically recorded through encounters
    // Manual fact recording not yet implemented
    console.warn('Manual social fact recording not implemented yet');

    res.json({
      success: true,
      message: 'Social fact recorded successfully',
      entityId,
      factContent,
      category,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Error recording social fact:', error);
    res.status(500).json({ error: 'Failed to record social fact' });
  }
});
