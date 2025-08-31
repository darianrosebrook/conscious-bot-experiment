/**
 * Cognition System HTTP Server
 *
 * Provides HTTP API endpoints for the cognition system.
 *
 * @author @darianrosebrook
 */

import express from 'express';
import cors from 'cors';
import { ReActArbiter } from './react-arbiter/ReActArbiter';

const app = express();
const port = process.env.PORT ? parseInt(process.env.PORT) : 3003;

// Middleware
app.use(cors());
app.use(express.json());

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
import { EnhancedThoughtGenerator } from './enhanced-thought-generator';
import { IntrusiveThoughtProcessor } from './enhanced-intrusive-thought-processor';

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
          optimizationCount: 0, // TODO: Add optimization tracking
        },
        conversationManager: {
          activeConversations: 0, // TODO: Add conversation tracking
          totalConversations: 0,
        },
        creativeSolver: {
          active: cognitionSystem.cognitiveCore.creativeSolver.isActive(),
          solutionsGenerated: 0, // TODO: Add solution tracking
        },
      },
      constitutionalFilter: {
        rulesCount: cognitionSystem.constitutionalFilter.getRulesCount(),
        violationsBlocked: 0, // TODO: Add violation tracking
      },
      intrusionInterface: {
        active: cognitionSystem.intrusionInterface.isActive(),
        intrusionsHandled: 0, // TODO: Add intrusion tracking
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
            cognitiveLoad: 0.5, // TODO: Implement actual cognitive load calculation
            attentionLevel: 0.7,
            creativityLevel: 0.3,
            metrics: {
              activeProcesses: 0,
              memoryUsage: process.memoryUsage(),
              uptime: process.uptime(),
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

    // Use ReAct Arbiter to generate dynamic steps based on the bot's reasoning
    const stepGenerationResult = await reactArbiter.reason({
      snapshot: {
        stateId: 'step-generation',
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
        stateId: 'step-generation-inventory',
        items: [],
        armor: [],
        tools: [],
      },
      goalStack: [
        {
          id: 'step-generation-goal',
          type: 'planning',
          description: `Generate detailed steps for: ${task.title}`,
          priority: 0.9,
          utility: 0.9,
          source: 'drive',
        },
      ],
      memorySummaries: [],
      lastToolResult: {
        ok: true,
        data: { task, context, request: 'generate-steps' },
      },
    });

    // Parse the ReAct response to extract steps
    const thoughts = stepGenerationResult.thoughts || '';
    const steps = parseStepsFromReActResponse(thoughts, task);

    // If ReAct didn't generate meaningful steps, use a minimal fallback
    if (steps.length === 0) {
      steps.push(
        { label: 'Analyze task requirements', estimatedDuration: 2000 },
        { label: 'Plan execution approach', estimatedDuration: 3000 },
        { label: 'Execute task', estimatedDuration: 5000 },
        { label: 'Verify completion', estimatedDuration: 2000 }
      );
    }

    console.log('Generated dynamic steps:', steps);

    res.json({
      success: true,
      steps,
      reasoning: thoughts,
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

/**
 * Parse steps from ReAct response using LLM reasoning
 */
function parseStepsFromReActResponse(thoughts: string, task: any): any[] {
  if (!thoughts || thoughts.length < 50) {
    return [];
  }

  const steps: any[] = [];
  const lines = thoughts.split('\n');
  let currentStep = null;
  let stepNumber = 1;

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Look for step indicators in the reasoning
    if (
      trimmedLine.toLowerCase().includes('step') ||
      trimmedLine.toLowerCase().includes('first') ||
      trimmedLine.toLowerCase().includes('next') ||
      trimmedLine.toLowerCase().includes('then') ||
      trimmedLine.toLowerCase().includes('finally') ||
      trimmedLine.match(/^\d+\./) ||
      trimmedLine.match(/^[a-z]\./)
    ) {
      // Extract step content
      let stepContent = trimmedLine
        .replace(/^\d+\.\s*/, '')
        .replace(/^[a-z]\.\s*/, '')
        .replace(/^step\s*\d*:?\s*/i, '')
        .replace(/^first,?\s*/i, '')
        .replace(/^next,?\s*/i, '')
        .replace(/^then,?\s*/i, '')
        .replace(/^finally,?\s*/i, '');

      // Clean up the step content
      stepContent = stepContent
        .replace(/^I\s+would\s+/i, '')
        .replace(/^I\s+should\s+/i, '')
        .replace(/^I\s+need\s+to\s+/i, '')
        .replace(/^I\s+will\s+/i, '')
        .replace(/^I\s+can\s+/i, '')
        .replace(/^The\s+bot\s+should\s+/i, '')
        .replace(/^The\s+bot\s+needs\s+to\s+/i, '')
        .replace(/^The\s+bot\s+will\s+/i, '');

      // Capitalize first letter
      stepContent = stepContent.charAt(0).toUpperCase() + stepContent.slice(1);

      // Estimate duration based on step content
      let estimatedDuration = 3000; // Default 3 seconds
      if (
        stepContent.toLowerCase().includes('move') ||
        stepContent.toLowerCase().includes('navigate')
      ) {
        estimatedDuration = 5000; // Movement takes longer
      } else if (
        stepContent.toLowerCase().includes('gather') ||
        stepContent.toLowerCase().includes('collect')
      ) {
        estimatedDuration = 4000; // Gathering takes time
      } else if (
        stepContent.toLowerCase().includes('craft') ||
        stepContent.toLowerCase().includes('build')
      ) {
        estimatedDuration = 6000; // Crafting takes longer
      } else if (
        stepContent.toLowerCase().includes('analyze') ||
        stepContent.toLowerCase().includes('plan')
      ) {
        estimatedDuration = 2000; // Planning is faster
      }

      // Only add meaningful steps
      if (stepContent.length > 10 && stepContent.length < 100) {
        steps.push({
          label: stepContent,
          estimatedDuration,
        });
        stepNumber++;
      }
    }
  }

  // Limit to reasonable number of steps
  return steps.slice(0, 6);
}

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

// Start server
app.listen(port, () => {
  console.log(`Cognition system server running on port ${port}`);

  // Start thought generation automatically
  setTimeout(() => {
    startThoughtGeneration();
  }, 2000); // Start after 2 seconds to ensure everything is initialized
});
