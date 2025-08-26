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
  model: 'llama3.2',
  maxTokens: 1000,
  temperature: 0.3,
  timeout: 30000,
  retries: 3,
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

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    system: 'cognition',
    timestamp: Date.now(),
    version: '0.1.0',
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
    // Return recent thoughts (last 50)
    const recentThoughts = cognitiveThoughts.slice(-50).map((thought) => ({
      ...thought,
      id:
        thought.id ||
        `thought-${thought.timestamp}-${Math.random().toString(36).substr(2, 9)}`,
    }));

    res.json({
      thoughts: recentThoughts,
      count: recentThoughts.length,
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
      // Handle intrusive thought
      const thought = {
        id: `intrusion-${Date.now()}`,
        content: content,
        metadata: metadata || {},
        timestamp: Date.now(),
        processed: true,
      };

      // Log the intrusive thought
      console.log(`Intrusive thought received: "${content}"`);

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
              attribution: 'intrusive',
              context: {
                emotionalState: metadata?.emotion || 'curious',
                confidence: metadata?.strength || 0.8,
              },
              metadata: {
                messageType: 'intrusion',
                intent: 'external_suggestion',
                tags: metadata?.tags || [],
                strength: metadata?.strength || 0.8,
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

      // If it's a goal-related thought, forward to planning system
      if (
        content.toLowerCase().includes('goal') ||
        content.toLowerCase().includes('task') ||
        content.toLowerCase().includes('craft') ||
        content.toLowerCase().includes('mine') ||
        content.toLowerCase().includes('build') ||
        content.toLowerCase().includes('explore') ||
        content.toLowerCase().includes('gather')
      ) {
        try {
          const planningResponse = await fetch('http://localhost:3002/goal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: `Goal from intrusion`,
              description: content,
              priority: metadata?.strength || 0.7,
              urgency: 0.6,
              tasks: [
                {
                  type: 'autonomous',
                  description: content,
                  priority: metadata?.strength || 0.7,
                  urgency: 0.6,
                  parameters: {},
                },
              ],
            }),
          });

          if (planningResponse.ok) {
            const planningResult = (await planningResponse.json()) as any;
            console.log(`Goal created from intrusive thought:`, planningResult);
            (thought as any).goalCreated = true;
            (thought as any).goalId = planningResult.goal?.id;
          }
        } catch (error) {
          console.error('Failed to create goal from intrusive thought:', error);
        }
      }

      // If it's a direct action command, forward to minecraft interface
      if (
        content.toLowerCase().includes('move') ||
        content.toLowerCase().includes('turn') ||
        content.toLowerCase().includes('jump') ||
        content.toLowerCase().includes('chat')
      ) {
        try {
          const minecraftResponse = await fetch(
            'http://localhost:3005/action',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'chat',
                parameters: {
                  message: `Executing command: ${content}`,
                },
              }),
            }
          );

          if (minecraftResponse.ok) {
            const minecraftResult = await minecraftResponse.json();
            console.log(
              `Action executed from intrusive thought:`,
              minecraftResult
            );
            (thought as any).actionExecuted = true;
          }
        } catch (error) {
          console.error(
            'Failed to execute action from intrusive thought:',
            error
          );
        }
      }

      const result = {
        processed: true,
        type: 'intrusion',
        thought,
        timestamp: Date.now(),
      };

      res.json(result);
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

// Generate authentic thoughts using internal dialogue system
app.post('/generate-thoughts', async (req, res) => {
  try {
    const { situation, context, thoughtTypes } = req.body;

    console.log(`Generating thoughts for situation:`, {
      situation,
      thoughtTypes,
    });

    // Mock internal dialogue system for now
    // In a real implementation, this would use the actual InternalDialogue class
    const thoughts = [];

    // Generate thoughts based on the situation and context
    if (thoughtTypes.includes('reflection')) {
      const currentTasks = context.currentState?.currentTasks || [];
      const currentGoals = context.currentGoals || [];
      const inventory = context.currentState?.inventory || [];

      if (inventory.length === 0) {
        thoughts.push({
          type: 'reflection',
          content: `My inventory is completely empty. I need to gather wood first to craft basic tools, then I can mine stone and other resources.`,
          emotionalState: 'determined',
          confidence: 0.8,
        });
      } else if (inventory.some((item: any) => item.name?.includes('wood'))) {
        thoughts.push({
          type: 'reflection',
          content: `I have some wood now. I should craft wooden planks and then make a wooden pickaxe so I can mine stone and other valuable resources.`,
          emotionalState: 'focused',
          confidence: 0.7,
        });
      } else if (inventory.some((item: any) => item.name?.includes('stone'))) {
        thoughts.push({
          type: 'reflection',
          content: `I have stone now. I should look for a good location to build a shelter, or explore for more valuable resources like iron ore.`,
          emotionalState: 'optimistic',
          confidence: 0.6,
        });
      } else {
        thoughts.push({
          type: 'reflection',
          content: `I'm making progress with my resources. I should continue gathering materials and start thinking about building a proper shelter for safety.`,
          emotionalState: 'satisfied',
          confidence: 0.5,
        });
      }
    }

    if (thoughtTypes.includes('observation')) {
      const health = context.currentState?.health || 100;
      const isNight =
        context.currentState?.timeOfDay > 13000 ||
        context.currentState?.timeOfDay < 1000;

      if (health < 50) {
        thoughts.push({
          type: 'observation',
          content: `My health is getting low (${health}%). I need to find food or a safe place to rest before I get into more danger.`,
          emotionalState: 'concerned',
          confidence: 0.9,
        });
      } else if (isNight) {
        thoughts.push({
          type: 'observation',
          content: `It's night time now. I should find shelter quickly or place some light sources to avoid hostile mobs.`,
          emotionalState: 'alert',
          confidence: 0.8,
        });
      } else {
        thoughts.push({
          type: 'observation',
          content: `The environment looks safe for now. I can focus on gathering resources and building up my capabilities.`,
          emotionalState: 'calm',
          confidence: 0.6,
        });
      }
    }

    if (thoughtTypes.includes('planning')) {
      const currentTasks = context.currentState?.currentTasks || [];
      const currentGoals = context.currentGoals || [];
      const inventory = context.currentState?.inventory || [];

      if (currentTasks.length > 0) {
        const task = currentTasks[0];
        thoughts.push({
          type: 'planning',
          content: `I'm currently working on: "${task.description}". I should focus on completing this task efficiently and then move on to the next priority.`,
          emotionalState: 'determined',
          confidence: 0.7,
        });
      } else if (inventory.length === 0) {
        thoughts.push({
          type: 'planning',
          content: `I need to gather wood from nearby trees first. Then I can craft basic tools and start mining stone for building materials.`,
          emotionalState: 'focused',
          confidence: 0.8,
        });
      } else if (
        inventory.some((item: any) => item.name?.includes('wood')) &&
        !inventory.some((item: any) => item.name?.includes('pickaxe'))
      ) {
        thoughts.push({
          type: 'planning',
          content: `I have wood now. My next priority should be crafting a wooden pickaxe so I can mine stone and other valuable resources.`,
          emotionalState: 'determined',
          confidence: 0.7,
        });
      } else if (
        inventory.some((item: any) => item.name?.includes('pickaxe'))
      ) {
        thoughts.push({
          type: 'planning',
          content: `I have a pickaxe now. I should mine stone and cobblestone to build a shelter, and look for iron ore for better tools.`,
          emotionalState: 'excited',
          confidence: 0.6,
        });
      } else {
        thoughts.push({
          type: 'planning',
          content: `I should explore the area to find new resources, or work on building a shelter to protect myself from the elements.`,
          emotionalState: 'contemplative',
          confidence: 0.5,
        });
      }
    }

    // Store thoughts for external access
    thoughts.forEach((thought) => {
      cognitiveThoughts.push({
        ...thought,
        id: `thought-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
      });
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

    // Mock social cognition system for now
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
});
