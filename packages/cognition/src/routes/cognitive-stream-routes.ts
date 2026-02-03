/**
 * Cognitive stream routes: lifecycle events, thought acking, task review,
 * recent thoughts, mark processed.
 */

import { Router, Request, Response } from 'express';
import { resilientFetch } from '@conscious-bot/core';
import {
  eventDrivenThoughtGenerator,
  ContextualThought,
} from '../event-driven-thought-generator';
import type { EnhancedThoughtGenerator } from '../thought-generator';
import type { CognitionMutableState } from '../cognition-state';

export interface CognitiveStreamRouteDeps {
  state: CognitionMutableState;
  enhancedThoughtGenerator: EnhancedThoughtGenerator;
}

export function createCognitiveStreamRoutes(deps: CognitiveStreamRouteDeps): Router {
  const router = Router();

  // ── POST /api/cognitive-stream/events ──
  // Accepts BotLifecycleEvent and generates a thought via the event-driven generator
  router.post('/api/cognitive-stream/events', async (req, res) => {
    try {
      const event = req.body; // { type, timestamp, data }
      if (!event.type || !event.timestamp) {
        return res.status(400).json({ error: 'Missing type or timestamp' });
      }
      const thought =
        await eventDrivenThoughtGenerator.generateThoughtForEvent(event);
      res.json({
        success: true,
        thoughtGenerated: !!thought,
        thoughtId: thought?.id || null,
      });
    } catch (error) {
      console.error('Error processing lifecycle event:', error);
      res.status(500).json({ error: 'Failed to process event' });
    }
  });

  // ── POST /api/cognitive-stream/ack ──
  // Marks thoughts as processed in cognition's own store
  router.post('/api/cognitive-stream/ack', async (req, res) => {
    try {
      const { thoughtIds } = req.body; // string[]
      if (!Array.isArray(thoughtIds)) {
        return res.status(400).json({ error: 'thoughtIds must be an array' });
      }
      const idSet = new Set(thoughtIds);
      let acked = 0;
      for (const thought of deps.state.cognitiveThoughts) {
        if (idSet.has(thought.id) && !thought.processed) {
          thought.processed = true;
          acked++;
        }
      }
      res.json({ success: true, ackedCount: acked });
    } catch (error) {
      res.status(500).json({ error: 'Failed to ack thoughts' });
    }
  });

  // ── POST /api/task-review ──
  router.post('/api/task-review', (req, res) => {
    try {
      const { reason } = req.body ?? {};
      const reviewReason =
        typeof reason === 'string' && reason.length > 0
          ? reason.slice(0, 200)
          : 'lifecycle event';
      deps.enhancedThoughtGenerator.requestTaskReview(reviewReason);
      res.json({ success: true, reason: reviewReason });
    } catch (error) {
      console.error('[Cognition] Failed to request task review:', error);
      res.status(500).json({ error: 'Failed to request task review' });
    }
  });

  // Endpoint to receive thoughts from planning system and forward to dashboard
  router.post('/thought-generated', async (req: Request, res: Response) => {
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
        const dashboardUrl =
          process.env.DASHBOARD_ENDPOINT || 'http://localhost:3000';
        const dashboardResponse = await resilientFetch(
          `${dashboardUrl}/api/ws/cognitive-stream`,
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

        if (dashboardResponse?.ok) {
          console.log('✅ Thought forwarded to dashboard successfully');
          res.json({ success: true, message: 'Thought forwarded to dashboard' });
        } else {
          console.warn(
            '⚠️ Failed to forward thought to dashboard:',
            dashboardResponse?.status ?? 'unavailable'
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

  // Get recent thoughts for planning system
  router.get('/api/cognitive-stream/recent', async (req, res) => {
    try {
      const { limit = 10, processed = false } = req.query;
      const limitNum = parseInt(limit as string, 10);

      let recentThoughts = deps.state.cognitiveThoughts.slice();

      // Clean up old processed thoughts to prevent memory buildup
      const now = Date.now();
      const cutoffTime = now - 24 * 60 * 60 * 1000; // 24 hours ago
      deps.state.cognitiveThoughts = deps.state.cognitiveThoughts.filter(
        (thought) => !thought.processed || thought.timestamp > cutoffTime
      );

      // Also get thoughts from enhanced thought generator (limit to recent ones)
      const generatedThoughts = deps.enhancedThoughtGenerator.getThoughtHistory(5);
      console.log(
        `Enhanced thought generator has ${generatedThoughts.length} recent thoughts`
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
        convertEligible: (thought as any).convertEligible,
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
  router.post('/api/cognitive-stream/:thoughtId/processed', async (req, res) => {
    try {
      const { thoughtId } = req.params;
      const { processed } = req.body;

      console.log(`📝 Marking thought ${thoughtId} as processed: ${processed}`);

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

  return router;
}
