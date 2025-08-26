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

// Import enhanced components
import { EnhancedThoughtGenerator } from './enhanced-thought-generator';
import { IntrusiveThoughtProcessor } from './enhanced-intrusive-thought-processor';

// Initialize enhanced thought generator
const enhancedThoughtGenerator = new EnhancedThoughtGenerator({
  thoughtInterval: 30000, // 30 seconds between thoughts
  maxThoughtsPerCycle: 3,
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

// Set up event listeners for enhanced components
enhancedThoughtGenerator.on('thoughtGenerated', (thought) => {
  console.log('Enhanced thought generated:', thought.content);
  cognitiveThoughts.push(thought);
});

intrusiveThoughtProcessor.on('taskCreated', ({ thought, task, action }) => {
  console.log('Task created from intrusive thought:', {
    thought,
    task,
    action,
  });
});

intrusiveThoughtProcessor.on('planningSystemUpdated', ({ task, result }) => {
  console.log('Planning system updated with task:', { task, result });
});

intrusiveThoughtProcessor.on('processingError', ({ thought, error }) => {
  console.error('Error processing intrusive thought:', { thought, error });
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
