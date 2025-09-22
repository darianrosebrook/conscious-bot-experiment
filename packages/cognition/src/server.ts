/**
 * Cognition System HTTP Server
 *
 * Provides HTTP API endpoints for the cognition system.
 *
 * @author @darianrosebrook
 */

import * as express from 'express';
import * as cors from 'cors';
import { ReActArbiter } from './react-arbiter/ReActArbiter';

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
  provider: 'ollama',
  model: 'qwen2.5:7b', // Optimal model from benchmark results
  maxTokens: 1000,
  temperature: 0.3,
  timeout: 30000,
  retries: 3,
});

// Import enhanced components
import { EnhancedThoughtGenerator } from './thought-generator';
import { IntrusiveThoughtProcessor } from './intrusive-thought-processor';

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
  planningEndpoint: 'http://localhost:3002',
  minecraftEndpoint: 'http://localhost:3005',
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
const cognitiveThoughts: any[] = [];

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
            cognitiveSystem:
              thought.context?.cognitiveSystem || 'enhanced-generator',
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
    }
  }, 60000); // 60 seconds

  console.log('✅ Enhanced thought generator started with 60-second intervals');
}

function stopThoughtGeneration() {
  if (thoughtGenerationInterval) {
    clearInterval(thoughtGenerationInterval);
    thoughtGenerationInterval = null;
    console.log('🛑 Enhanced thought generator stopped');
  }
}

// Set up event listeners for enhanced components
enhancedThoughtGenerator.on('thoughtGenerated', (thought) => {
  console.log('Enhanced thought generated:', thought.content);
  cognitiveThoughts.push(thought);

  // Send the thought to the cognitive stream
  sendThoughtToCognitiveStream(thought);
});

intrusiveThoughtProcessor.on(
  'thoughtProcessingStarted',
  ({ thought, timestamp }) => {
    console.log('Started processing intrusive thought:', thought);

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
    const thoughts = enhancedThoughtGenerator.getThoughtHistory(limit);

    res.json({
      thoughts: thoughts,
      count: thoughts.length,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Error getting cognitive thoughts:', error);
    res.status(500).json({ error: 'Failed to get cognitive thoughts' });
  }
});

// Process cognitive task
app.post('/process', async (req, res) => {
  try {
    const { type, content, metadata } = req.body;

    console.log(`Processing ${type} request:`, { content, metadata });

    if (type === 'intrusion') {
      // Use enhanced intrusive thought processor
      const result =
        await intrusiveThoughtProcessor.processIntrusiveThought(content);

      // Send the intrusive thought to the cognitive stream
      try {
        const cognitiveStreamResponse = await fetch(
          'http://localhost:3000/api/ws/cognitive-stream',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'intrusive',
              content: content,
              attribution: 'external',
              context: {
                emotionalState: metadata?.emotion || 'curious',
                confidence: metadata?.strength || 0.8,
              },
              metadata: {
                messageType: 'intrusion',
                intent: 'external_suggestion',
                tags: metadata?.tags || [],
                strength: metadata?.strength || 0.8,
                processed: result.accepted,
                taskId: result.taskId,
              },
            }),
          }
        );

        if (cognitiveStreamResponse.ok) {
          console.log('✅ Intrusive thought sent to cognitive stream');
        } else {
          console.error(
            '❌ Failed to send intrusive thought to cognitive stream'
          );
        }
      } catch (error) {
        console.error(
          '❌ Error sending intrusive thought to cognitive stream:',
          error
        );
      }

      res.json({
        processed: result.accepted,
        type: 'intrusion',
        response: result.response,
        taskId: result.taskId,
        task: result.task,
        timestamp: Date.now(),
      });
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

// Start the server
app.listen(port, () => {
  console.log(`🧠 Cognition service running on port ${port}`);
  console.log(`📊 Cognitive metrics endpoint: http://localhost:${port}/metrics`);
  console.log(`💭 Thought generation endpoint: http://localhost:${port}/generate-thoughts`);
  console.log(`🎯 ReAct arbiter endpoint: http://localhost:${port}/react-arbiter`);
  console.log(`🤝 Social cognition endpoint: http://localhost:${port}/social-cognition`);
});
