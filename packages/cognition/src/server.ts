/**
 * Cognition System HTTP Server
 *
 * Provides HTTP API endpoints for the cognition system.
 *
 * @author @darianrosebrook
 */

import express from 'express';
import cors from 'cors';

const app = express();
const port = process.env.PORT ? parseInt(process.env.PORT) : 3003;

// Middleware
app.use(cors());
app.use(express.json());

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

// Process cognitive task
app.post('/process', async (req, res) => {
  try {
    const { type, content, metadata } = req.body;

    console.log(`🧠 Processing ${type} request:`, { content, metadata });

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
      console.log(`💭 Intrusive thought received: "${content}"`);

      // If it's a goal-related thought, forward to planning system
      if (content.toLowerCase().includes('goal') || 
          content.toLowerCase().includes('task') ||
          content.toLowerCase().includes('craft') ||
          content.toLowerCase().includes('mine') ||
          content.toLowerCase().includes('build') ||
          content.toLowerCase().includes('explore') ||
          content.toLowerCase().includes('gather')) {
        
        try {
          const planningResponse = await fetch('http://localhost:3002/goal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: `Goal from intrusion`,
              description: content,
              priority: metadata?.strength || 0.7,
              urgency: 0.6,
              tasks: [{
                type: 'autonomous',
                description: content,
                priority: metadata?.strength || 0.7,
                urgency: 0.6,
                parameters: {},
              }],
            }),
          });

          if (planningResponse.ok) {
            const planningResult = await planningResponse.json();
            console.log(`🎯 Goal created from intrusive thought:`, planningResult);
            thought.goalCreated = true;
            thought.goalId = planningResult.goal?.id;
          }
        } catch (error) {
          console.error('Failed to create goal from intrusive thought:', error);
        }
      }

      // If it's a direct action command, forward to minecraft interface
      if (content.toLowerCase().includes('move') ||
          content.toLowerCase().includes('turn') ||
          content.toLowerCase().includes('jump') ||
          content.toLowerCase().includes('chat')) {
        
        try {
          const minecraftResponse = await fetch('http://localhost:3005/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'chat',
              parameters: {
                message: `Executing command: ${content}`,
              },
            }),
          });

          if (minecraftResponse.ok) {
            const minecraftResult = await minecraftResponse.json();
            console.log(`🎮 Action executed from intrusive thought:`, minecraftResult);
            thought.actionExecuted = true;
          }
        } catch (error) {
          console.error('Failed to execute action from intrusive thought:', error);
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

// Start server
app.listen(port, () => {
  console.log(`Cognition system server running on port ${port}`);
});
