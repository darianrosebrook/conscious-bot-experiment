/**
 * Social routes: social consideration, nearby entities, chat consideration,
 * departure communication, social cognition processing.
 */

import { Router } from 'express';
import type { EnhancedThoughtGenerator } from '../thought-generator';
import type { SocialAwarenessManager } from '../social-awareness-manager';
import type { CognitionMutableState } from '../cognition-state';

export interface SocialRouteDeps {
  state: CognitionMutableState;
  enhancedThoughtGenerator: EnhancedThoughtGenerator;
  socialAwarenessManager: SocialAwarenessManager;
  sendThoughtToCognitiveStream: (thought: any) => Promise<void>;
}

export function createSocialRoutes(deps: SocialRouteDeps): Router {
  const router = Router();

  // Process social consideration for nearby entities
  router.post('/consider-social', async (req, res) => {
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
      const thought = await deps.enhancedThoughtGenerator.generateSocialConsideration(
        entity,
        context
      );

      const thoughts = thought ? [thought] : [];

      // Store thoughts for external access
      thoughts.forEach((t) => {
        deps.state.cognitiveThoughts.push(t);
      });

      // Keep only the last 100 thoughts to prevent memory leaks
      if (deps.state.cognitiveThoughts.length > 100) {
        deps.state.cognitiveThoughts.splice(0, deps.state.cognitiveThoughts.length - 100);
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
  router.post('/process-nearby-entities', async (req, res) => {
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
      const results = await deps.socialAwarenessManager.processNearbyEntities(
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

        await deps.sendThoughtToCognitiveStream(considerationThought);
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
  router.post('/consider-chat', async (req, res) => {
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
      const result = await deps.socialAwarenessManager.processChatMessage(
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

        await deps.sendThoughtToCognitiveStream(chatConsiderationThought);
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
  router.post('/consider-departure', async (req, res) => {
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
      const result = await deps.socialAwarenessManager.generateDepartureCommunication(
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

        await deps.sendThoughtToCognitiveStream(departureThought);
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
  router.post('/process-social', async (req, res) => {
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
      const thoughts: any[] = [];

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

  return router;
}
