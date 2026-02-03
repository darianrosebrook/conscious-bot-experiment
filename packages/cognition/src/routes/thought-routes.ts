/**
 * Thought routes: get thoughts, post external thoughts, generate thoughts.
 */

import { Router } from 'express';
import type { EnhancedThoughtGenerator } from '../thought-generator';
import type { CognitionMutableState } from '../cognition-state';

export interface ThoughtRouteDeps {
  state: CognitionMutableState;
  enhancedThoughtGenerator: EnhancedThoughtGenerator;
  sendThoughtToCognitiveStream: (thought: any) => Promise<void>;
}

export function createThoughtRoutes(deps: ThoughtRouteDeps): Router {
  const router = Router();

  // Get cognitive thoughts
  router.get('/thoughts', (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const since = parseInt(req.query.since as string) || 0;

      // Get thoughts from both sources
      const generatedThoughts = deps.enhancedThoughtGenerator.getThoughtHistory(1000);
      const allThoughts = [...deps.state.cognitiveThoughts, ...generatedThoughts];

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
  router.post('/thoughts', (req, res) => {
    try {
      const { type, content, attribution, context, metadata, id, timestamp } =
        req.body;

      if (!type || !content) {
        return res.status(400).json({
          error: 'Missing required fields: type and content are required',
        });
      }

      // Create a cognitive thought object
      const thought: Record<string, any> = {
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

      // Dev-only: allow injecting convertEligible for live verification of
      // strict-mode gating (C2/C3 tests). Not exposed in production to prevent
      // external callers from bypassing eligibility checks.
      //
      // LF-2 NOTE: This is a deliberate test bypass, NOT a violation of the
      // single choke point. Production code paths cannot set convertEligible
      // to true except through deriveEligibility() in reasoning-surface.
      if (
        process.env.NODE_ENV !== 'production' &&
        req.body.convertEligible !== undefined
      ) {
        thought.convertEligible = req.body.convertEligible;
      }

      // Store the thought
      deps.state.cognitiveThoughts.push(thought);

      // Send to cognitive stream if available
      deps.sendThoughtToCognitiveStream(thought);

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

  // Generate authentic thoughts using enhanced thought generator
  router.post('/generate-thoughts', async (req, res) => {
    try {
      const { situation, context, thoughtTypes } = req.body;

      console.log(`Generating thoughts for situation:`, {
        situation,
        thoughtTypes,
      });

      // Use enhanced thought generator
      const thought = await deps.enhancedThoughtGenerator.generateThought({
        currentState: context.currentState,
        currentTasks: context.currentState?.currentTasks || [],
        recentEvents: context.recentEvents || [],
        emotionalState: context.emotional || 'neutral',
        memoryContext: context.memoryContext,
      });

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

  return router;
}
