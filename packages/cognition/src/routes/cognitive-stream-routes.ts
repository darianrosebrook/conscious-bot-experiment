/**
 * Cognitive stream routes: lifecycle events, thought acking, task review,
 * recent thoughts, mark processed, and SSE streaming.
 *
 * Supports eval isolation via evalRunId filtering (AC-ISO-01, AC-ISO-02, AC-ISO-03).
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

// ── Eval Metadata Interface ────────────────────────────────────────────
export interface EvalThoughtMetadata {
  eval?: {
    run_id: string;
    scenario_id: string;
  };
}

// Track connected SSE clients for broadcasting
const sseClients: Set<Response> = new Set();

// ── Retention Rules ──────────────────────────────────────────────────
// Prevents unbounded thought queue growth under high-frequency awareness
const THOUGHT_QUEUE_MAX_LENGTH = 500;  // Hard cap on queue size
const NON_ACTIONABLE_MAX_AGE_MS = 10 * 60 * 1000;  // 10 minutes for non-actionable
const ACTIONABLE_MAX_AGE_MS = 30 * 60 * 1000;  // 30 minutes for actionable unacked
const PROCESSED_MAX_AGE_MS = 24 * 60 * 60 * 1000;  // 24 hours for processed (dashboard history)

/**
 * Prune thought queue by age and cap.
 * Called lazily on read requests to avoid per-write overhead.
 *
 * Rules:
 * 1. Remove old non-actionable unacked thoughts (10 min)
 * 2. Remove old actionable unacked thoughts (30 min)
 * 3. Remove old processed thoughts (24 hours)
 * 4. If still over cap, drop oldest first
 */
function pruneThoughtQueue(thoughts: any[]): any[] {
  const now = Date.now();

  let pruned = thoughts.filter((t) => {
    // Keep processed thoughts for 24 hours (for dashboard history)
    if (t.processed) {
      return now - t.timestamp < PROCESSED_MAX_AGE_MS;
    }

    // Unprocessed: age depends on actionability
    const isActionable = t.convertEligible === true;
    const maxAge = isActionable ? ACTIONABLE_MAX_AGE_MS : NON_ACTIONABLE_MAX_AGE_MS;
    return now - t.timestamp < maxAge;
  });

  // If still over cap, drop oldest first
  if (pruned.length > THOUGHT_QUEUE_MAX_LENGTH) {
    pruned = pruned
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, THOUGHT_QUEUE_MAX_LENGTH);
  }

  return pruned;
}

/**
 * Broadcast a thought to all connected SSE clients
 */
export function broadcastThought(thought: any): void {
  const message = JSON.stringify({
    type: 'cognitive_thoughts',
    data: { thoughts: [thought] },
  });

  for (const client of sseClients) {
    try {
      client.write(`data: ${message}\n\n`);
    } catch (error) {
      // Client disconnected, will be cleaned up
      sseClients.delete(client);
    }
  }
}

export function createCognitiveStreamRoutes(deps: CognitiveStreamRouteDeps): Router {
  const router = Router();

  // ── GET /api/cognitive-stream ──
  // SSE endpoint for real-time thought streaming
  router.get('/api/cognitive-stream', (req: Request, res: Response) => {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    // Add client to the set
    sseClients.add(res);
    // SSE connection events suppressed - routine client polling

    // Send initial batch of recent thoughts
    const recentThoughts = deps.state.cognitiveThoughts.slice(-20);
    const generatedThoughts = deps.enhancedThoughtGenerator.getThoughtHistory(10);
    const allThoughts = [...recentThoughts, ...generatedThoughts]
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
      .slice(-20);

    const initMessage = JSON.stringify({
      type: 'cognitive_stream_init',
      data: {
        thoughts: allThoughts.map((t) => ({
          id: t.id,
          type: t.type || 'reflection',
          content: t.content,
          displayContent: t.displayContent || t.content,
          attribution: t.attribution || 'self',
          timestamp: t.timestamp,
          metadata: t.metadata,
        })),
      },
    });
    res.write(`data: ${initMessage}\n\n`);

    // Send keepalive every 30 seconds
    const keepaliveInterval = setInterval(() => {
      try {
        res.write(`: keepalive\n\n`);
      } catch {
        clearInterval(keepaliveInterval);
        sseClients.delete(res);
      }
    }, 30000);

    // Clean up on disconnect
    req.on('close', () => {
      clearInterval(keepaliveInterval);
      sseClients.delete(res);
      // SSE disconnection events suppressed - routine client polling
    });
  });

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
  // Marks thoughts as processed by planning.
  // Planning MUST call this for EVERY evaluated thought (converted OR skipped).
  // This is the ONLY way thoughts transition to processed=true.
  //
  // Supports eval isolation (LF-3, AC-ISO-03):
  // - If evalRunId is provided, verifies thought metadata matches before acking
  // - Emits eval_ack_mismatch event if metadata doesn't match
  router.post('/api/cognitive-stream/ack', async (req, res) => {
    try {
      const { thoughtIds, evalRunId } = req.body as {
        thoughtIds: string[];
        evalRunId?: string;
      };

      if (!Array.isArray(thoughtIds) || thoughtIds.length === 0) {
        return res.status(400).json({ error: 'thoughtIds array required' });
      }

      const ackedIds = new Set(thoughtIds);
      let ackedCount = 0;
      let mismatchCount = 0;
      const mismatches: Array<{ thoughtId: string; expected: string; actual: string | null }> = [];
      const now = Date.now();

      // Mark matching thoughts as processed with provenance
      for (const thought of deps.state.cognitiveThoughts) {
        if (ackedIds.has(thought.id) && !thought.processed) {
          // If evalRunId is provided, verify metadata match (LF-3, AC-ISO-03)
          if (evalRunId) {
            const evalMeta = (thought as any).metadata?.eval as EvalThoughtMetadata['eval'] | undefined;
            const actualRunId = evalMeta?.run_id ?? null;

            if (actualRunId !== evalRunId) {
              // Mismatch: thought doesn't belong to this eval run
              mismatchCount++;
              mismatches.push({
                thoughtId: thought.id,
                expected: evalRunId,
                actual: actualRunId,
              });
              console.warn(
                `[CognitiveStream] Ack mismatch: thought ${thought.id} has run_id=${actualRunId}, expected=${evalRunId}`
              );
              continue; // Skip acking this thought
            }
          }

          thought.processed = true;
          (thought as any).processedAt = now;
          (thought as any).processedBy = evalRunId ? `eval:${evalRunId}` : 'planning';
          ackedCount++;
        }
      }

      console.log(
        `[CognitiveStream] Acked ${ackedCount}/${thoughtIds.length} thoughts` +
        (mismatchCount > 0 ? ` (${mismatchCount} mismatches)` : '')
      );

      res.json({
        success: true,
        ackedCount,
        requestedCount: thoughtIds.length,
        mismatchCount,
        mismatches: mismatches.length > 0 ? mismatches : undefined,
      });
    } catch (error) {
      console.error('Error acking thoughts:', error);
      res.status(500).json({ error: 'Failed to ack thoughts' });
    }
  });

  // ── GET /api/cognitive-stream/actionable ──
  // Returns ONLY thoughts that are:
  // - Not yet processed
  // - Marked convertEligible === true (OPT-IN, not opt-out!)
  // - Within the last 5 minutes
  // - Optionally filtered by evalRunId (AC-ISO-02)
  //
  // This prevents percept spam from crowding out actionable intents.
  // Thoughts without convertEligible field are NOT returned (explicit opt-in).
  router.get('/api/cognitive-stream/actionable', async (req, res) => {
    try {
      const limitNum = parseInt(String(req.query.limit ?? '10'), 10);
      const evalRunId = req.query.evalRunId as string | undefined;
      const maxAgeMs = 5 * 60 * 1000; // 5 minutes
      const now = Date.now();

      // Apply retention rules on read to prevent unbounded growth
      deps.state.cognitiveThoughts = pruneThoughtQueue(deps.state.cognitiveThoughts);

      // IMPORTANT: Only pull from the main thought queue, not generator history.
      // This ensures a single ack/retention model for planning.
      const allThoughts = deps.state.cognitiveThoughts;

      // Filter: unprocessed, EXPLICITLY actionable (convertEligible === true), recent
      // Plus optional evalRunId filter (AC-ISO-02)
      const actionable = allThoughts.filter((thought) => {
        if (thought.processed) return false;
        // OPT-IN: only convertEligible === true passes (not undefined, not missing)
        if ((thought as any).convertEligible !== true) return false;
        if (now - thought.timestamp > maxAgeMs) return false;

        // Eval isolation filter (AC-ISO-02)
        if (evalRunId) {
          const evalMeta = (thought as any).metadata?.eval as EvalThoughtMetadata['eval'] | undefined;
          if (evalMeta?.run_id !== evalRunId) return false;
        }

        return true;
      });

      // Sort by timestamp (newest first) and limit
      const result = actionable
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limitNum);

      // Format for planning system
      const formattedThoughts = result.map((thought) => ({
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

      // Verbose logging suppressed - routine endpoint polling
      // Debug: [CognitiveStream] /actionable: returned=${result.length} queue_size=${allThoughts.length} filtered_out=${allThoughts.length - actionable.length}

      res.json({
        success: true,
        thoughts: formattedThoughts,
        count: formattedThoughts.length,
        timestamp: now,
        evalRunId: evalRunId || undefined,
      });
    } catch (error) {
      console.error('Error retrieving actionable thoughts:', error);
      res.status(500).json({ error: 'Failed to retrieve actionable thoughts' });
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

  // Endpoint to receive thoughts from planning system and broadcast via SSE
  router.post('/thought-generated', async (req: Request, res: Response) => {
    try {
      const { thought } = req.body;

      console.log(
        '🧠 Received thought from planning system:',
        thought.type,
        '-',
        thought.content.substring(0, 60)
      );

      // Add to local state for persistence
      deps.state.cognitiveThoughts.push({
        ...thought,
        timestamp: thought.timestamp || Date.now(),
      });

      // Broadcast to all connected SSE clients
      broadcastThought({
        id: thought.id,
        type: thought.type || 'reflection',
        content: thought.content,
        displayContent: thought.displayContent || thought.content,
        attribution: thought.attribution || 'self',
        timestamp: thought.timestamp || Date.now(),
        metadata: thought.metadata,
      });

      console.log(`✅ Thought broadcast to ${sseClients.size} SSE clients`);
      res.json({ success: true, message: 'Thought broadcast via SSE', clients: sseClients.size });
    } catch (error) {
      console.error('❌ Error processing thought generation:', error);
      res.status(500).json({ error: 'Failed to process thought generation' });
    }
  });

  // POST endpoint for dashboard to send intrusive thoughts
  router.post('/api/cognitive-stream', async (req: Request, res: Response) => {
    try {
      const thought = req.body;

      // Generate unique ID if not provided
      const thoughtWithId = {
        ...thought,
        id: thought.id || `thought-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: thought.timestamp || Date.now(),
      };

      // Add to local state
      deps.state.cognitiveThoughts.push(thoughtWithId);

      // Broadcast to all SSE clients
      broadcastThought({
        id: thoughtWithId.id,
        type: thoughtWithId.type || 'intrusive',
        content: thoughtWithId.content,
        displayContent: thoughtWithId.content,
        attribution: thoughtWithId.attribution || 'intrusive',
        timestamp: thoughtWithId.timestamp,
        metadata: thoughtWithId.metadata,
      });

      // Intrusive thought broadcast (verbose logging suppressed)
      res.json({ success: true, thoughtId: thoughtWithId.id });
    } catch (error) {
      console.error('[CognitiveStream] Error processing intrusive thought:', error);
      res.status(500).json({ error: 'Failed to process intrusive thought' });
    }
  });

  // Get recent thoughts for planning system
  // Supports eval isolation via evalRunId filter (AC-ISO-02)
  router.get('/api/cognitive-stream/recent', async (req, res) => {
    try {
      // CRITICAL FIX: Express query params are ALWAYS strings.
      // The old code used `processed = false` (boolean default) but compared
      // with `=== 'false'` (string), so the filter NEVER ran.
      const limitParam = req.query.limit;
      const processedParam = req.query.processed;
      const evalRunId = req.query.evalRunId as string | undefined;

      const limitNum = parseInt(String(limitParam ?? '10'), 10);
      // Default to 'false' (string) — only unprocessed thoughts by default
      const processedFilter = String(processedParam ?? 'false');

      const now = Date.now();

      // Apply retention rules on read to prevent unbounded growth
      // (replaces simple 24-hour cutoff with three-tier age limits + hard cap)
      deps.state.cognitiveThoughts = pruneThoughtQueue(deps.state.cognitiveThoughts);

      // 1. Combine all thought sources
      let recentThoughts = deps.state.cognitiveThoughts.slice();

      // Also get thoughts from enhanced thought generator (limit to recent ones)
      const generatedThoughts = deps.enhancedThoughtGenerator.getThoughtHistory(5);
      // Verbose logging suppressed - routine endpoint polling

      recentThoughts = [...recentThoughts, ...generatedThoughts];

      // 2. Filter by processed status BEFORE sorting/slicing (fixes order of operations)
      if (processedFilter === 'false') {
        recentThoughts = recentThoughts.filter((thought) => !thought.processed);
      }
      // processedFilter === 'true' returns all thoughts (including processed)
      // This allows dashboard to fetch full history

      // 3. Eval isolation filter (AC-ISO-02)
      if (evalRunId) {
        recentThoughts = recentThoughts.filter((thought) => {
          const evalMeta = (thought as any).metadata?.eval as EvalThoughtMetadata['eval'] | undefined;
          return evalMeta?.run_id === evalRunId;
        });
      }

      // 4. Sort by timestamp (newest first) and limit results
      recentThoughts = recentThoughts
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limitNum);

      // Verbose logging suppressed - routine endpoint polling
      // Debug: [CognitiveStream] /recent: filter=${processedFilter} returned=${recentThoughts.length} queue_size=${deps.state.cognitiveThoughts.length}

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
        evalRunId: evalRunId || undefined,
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
