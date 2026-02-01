/**
 * Movement Leaves - Primitive movement operations for Mineflayer
 *
 * Implements movement-related leaves including pathfinding, following, and safe movement
 * with proper error handling, timeouts, and Mineflayer integration.
 *
 * @author @darianrosebrook
 */

import { Bot } from 'mineflayer';
import { pathfinder } from 'mineflayer-pathfinder';
// mineflayer-pathfinder doesn't expose goals/Movements as ESM named exports — use require
import { createRequire } from 'module';
const require_ = createRequire(import.meta.url);
const pfModule = require_('mineflayer-pathfinder');
const pathfinderGoals = pfModule.goals;
const Movements = pfModule.Movements;
import { Vec3 } from 'vec3';
import {
  LeafImpl,
  LeafContext,
  LeafResult,
  LeafSpec,
} from '@conscious-bot/core';

// Extend Bot type to include pathfinder
interface BotWithPathfinder extends Bot {
  pathfinder: any;
}

// Helper functions for consistent error handling
function ok(result: any, durationMs: number): LeafResult {
  return {
    status: 'success',
    result,
    metrics: { durationMs, retries: 0, timeouts: 0 },
  };
}

function fail(code: any, detail: string, durationMs = 0): LeafResult {
  return {
    status: 'failure',
    error: { code, retryable: code !== 'aborted', detail },
    metrics: { durationMs, retries: 0, timeouts: code === 'aborted' ? 1 : 0 },
  };
}

// ============================================================================
// Move To Leaf
// ============================================================================

/**
 * Move to a specific position or goal
 */
export class MoveToLeaf implements LeafImpl {
  spec: LeafSpec = {
    name: 'move_to',
    version: '1.0.0',
    description: 'Move to a target position or goal using pathfinding',
    inputSchema: {
      type: 'object',
      properties: {
        pos: {
          type: 'object',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            z: { type: 'number' },
          },
          required: ['x', 'y', 'z'],
        },
        goal: {
          type: 'string',
          enum: ['GoalBlock', 'GoalNear', 'GoalFollow'],
        },
        safe: {
          type: 'boolean',
          default: true,
        },
        timeout: {
          type: 'number',
          minimum: 1000,
          maximum: 300000,
          default: 30000,
        },
      },
      required: ['pos'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        distance: { type: 'number' },
        duration: { type: 'number' },
        pathLength: { type: 'number' },
      },
    },
    timeoutMs: 30000,
    retries: 2,
    permissions: ['movement'],
  };

  async run(ctx: LeafContext, args: any): Promise<LeafResult> {
    const t0 = ctx.now();
    const bot = ctx.bot as BotWithPathfinder;

    // Guard & parse
    const posArg = args?.pos;
    if (
      !posArg ||
      Number.isNaN(posArg.x) ||
      Number.isNaN(posArg.y) ||
      Number.isNaN(posArg.z)
    ) {
      return {
        status: 'failure',
        error: { code: 'unknown', retryable: false, detail: 'invalid pos' },
        metrics: { durationMs: ctx.now() - t0, retries: 0, timeouts: 0 },
      };
    }
    const target = new Vec3(posArg.x, posArg.y, posArg.z);
    const goalType: 'GoalBlock' | 'GoalNear' | 'GoalFollow' =
      args?.goal ?? 'GoalNear';
    const range = goalType === 'GoalBlock' ? 0 : (args?.range ?? 1);
    const timeoutMs = Math.min(Math.max(args?.timeout ?? 30000, 1000), 300000);

    // Ensure pathfinder plugin and movements are configured
    if (!bot.pathfinder) bot.loadPlugin(pathfinder);
    // Always set fresh Movements — the pathfinder may have stale or missing config
    const moves = new Movements(bot);
    moves.scafoldingBlocks = [];
    moves.canDig = false;
    bot.pathfinder.setMovements(moves);

    // Build goal using mineflayer-pathfinder's real goal classes
    let g: any;
    if (goalType === 'GoalBlock')
      g = new pathfinderGoals.GoalBlock(target.x, target.y, target.z);
    else g = new pathfinderGoals.GoalNear(target.x, target.y, target.z, range);

    try {
      // Start pathfinding (non-dynamic so goal_reached can fire)
      bot.pathfinder.setGoal(g, false);

      // Wait for goal_reached event OR position-based completion OR failure
      await new Promise<void>((resolve, reject) => {
        let done = false;
        const finish = (err?: Error) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          clearInterval(poller);
          clearInterval(stuckPoll);
          ctx.abortSignal?.removeEventListener('abort', ctxAbort as any);
          bot.removeListener('goal_reached' as any, onReached);
          bot.removeListener('path_update' as any, onUpdate);
          if (err) {
            try { bot.pathfinder?.stop(); } catch {}
          }
          if (err) reject(err); else resolve();
        };

        const timer = setTimeout(() => {
          finish(Object.assign(new Error('aborted'), { _execCode: 'aborted' }));
        }, timeoutMs);

        const ctxAbort = () => {
          finish(Object.assign(new Error('aborted'), { _execCode: 'aborted' }));
        };
        ctx.abortSignal?.addEventListener('abort', ctxAbort, { once: true });

        const onReached = () => finish();

        const onUpdate = (results: any) => {
          if (results?.status === 'noPath') {
            finish(Object.assign(new Error('noPath'), { _execCode: 'path.unreachable' }));
          }
        };

        // Position polling: check every 250ms if bot reached target
        const poller = setInterval(() => {
          const pos = bot.entity?.position;
          if (!pos) return;
          if (g.isEnd && g.isEnd(pos)) {
            finish();
          } else if (pos.distanceTo(target) <= Math.max(range, 1.5)) {
            finish();
          }
        }, 250);

        // Sliding-window stuck detection (backported from NavigationBridge.moveToStep)
        const STUCK_POLL_INTERVAL = 2000;
        const STUCK_WINDOW = 3;      // 3 samples = 6s window
        const STUCK_THRESHOLD = 0.5; // blocks
        const positionHistory: Vec3[] = [];

        const stuckPoll = setInterval(() => {
          const pos = bot.entity?.position;
          if (!pos) return;
          positionHistory.push(pos.clone());
          if (positionHistory.length > STUCK_WINDOW) positionHistory.shift();
          if (positionHistory.length === STUCK_WINDOW) {
            const moved = positionHistory[0].distanceTo(positionHistory[positionHistory.length - 1]);
            if (moved < STUCK_THRESHOLD) {
              finish(Object.assign(new Error('stuck'), { _execCode: 'path.stuck' }));
            }
          }
        }, STUCK_POLL_INTERVAL);

        bot.on('goal_reached' as any, onReached);
        bot.on('path_update' as any, onUpdate);
      });

      // Success
      const duration = ctx.now() - t0;
      const me = bot.entity?.position ?? new Vec3(0, 0, 0);
      const distance = me.distanceTo(target);
      ctx.emitMetric('move_to_duration_ms', duration);
      return {
        status: 'success',
        result: { success: true, distance, duration, pathLength: undefined },
        metrics: { durationMs: duration, retries: 0, timeouts: 0 },
      };
    } catch (e: any) {
      const code: any = e?._execCode ?? 'path.unreachable';
      const duration = ctx.now() - t0;
      try { bot.pathfinder?.stop(); } catch {}
      return {
        status: 'failure',
        error: {
          code,
          retryable: code !== 'aborted',
          detail: String(e?.message ?? e),
        },
        metrics: {
          durationMs: duration,
          retries: 0,
          timeouts: code === 'aborted' ? 1 : 0,
        },
      };
    }
  }
}

// ============================================================================
// Step Forward Safely Leaf
// ============================================================================

/**
 * Step forward safely with collision detection
 */
export class StepForwardSafelyLeaf implements LeafImpl {
  spec: LeafSpec = {
    name: 'step_forward_safely',
    version: '1.0.0',
    description: 'Step forward one block safely with collision detection',
    inputSchema: {
      type: 'object',
      properties: {
        distance: {
          type: 'number',
          minimum: 0.1,
          maximum: 2.0,
          default: 1.0,
        },
        checkLight: {
          type: 'boolean',
          default: true,
        },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        newPosition: {
          type: 'object',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            z: { type: 'number' },
          },
        },
        lightLevel: { type: 'number' },
      },
    },
    timeoutMs: 5000,
    retries: 1,
    permissions: ['movement'],
  };

  async run(ctx: LeafContext, args: any): Promise<LeafResult> {
    const bot = ctx.bot as BotWithPathfinder;
    const t0 = ctx.now();
    const dist = Math.min(Math.max(args?.distance ?? 1.0, 0.1), 2.0);
    const checkLight: boolean = args?.checkLight ?? true;

    if (!bot.entity?.position) {
      return fail('unknown', 'no position');
    }

    const yaw = bot.entity.yaw;
    const target = new Vec3(
      bot.entity.position.x - Math.sin(yaw) * dist,
      bot.entity.position.y,
      bot.entity.position.z + Math.cos(yaw) * dist
    );

    // Block coords
    const bTarget = target.floored();
    const block = bot.blockAt(bTarget);
    const head = bot.blockAt(bTarget.offset(0, 1, 0));
    const floor = bot.blockAt(bTarget.offset(0, -1, 0));

    // Collisions
    if (block && block.boundingBox === 'block')
      return fail('path.stuck', 'blocked');
    if (head && head.boundingBox === 'block')
      return fail('path.stuck', 'no headroom');
    if (!floor || floor.boundingBox === 'empty')
      return fail('path.stuck', 'no floor');

    // Lighting (optional guard)
    if (checkLight) {
      const ll = (bot.world as any).getLight?.(bTarget) ?? 15;
      if (ll < 8) return fail('path.stuck', `light too low: ${ll}`); // use a specific code if you add 'path.unsafe'
    }

    // Move a short step using GoalNear with small radius
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), this.spec.timeoutMs);
    const done = bot.pathfinder?.setGoal(
      new pathfinderGoals.GoalNear(bTarget.x, bTarget.y, bTarget.z, 0.5),
      true
    );

    try {
      await new Promise<void>((resolve, reject) => {
        const tick = () => {
          if (ac.signal.aborted) return reject(new Error('aborted'));
          const here = bot.entity!.position.floored();
          if (here.equals(bTarget)) return resolve();
          setTimeout(tick, 50);
        };
        tick();
      });
      const dur = ctx.now() - t0;
      const newPos = bot.entity!.position;
      return ok(
        {
          success: true,
          newPosition: { x: newPos.x, y: newPos.y, z: newPos.z },
          lightLevel: (bot.world as any).getLight?.(newPos.floored()) ?? 15,
        },
        dur
      );
    } catch (e: any) {
      try {
        bot.pathfinder?.stop();
      } catch {}
      return fail(
        ac.signal.aborted ? 'aborted' : 'path.stuck',
        String(e?.message ?? e),
        ctx.now() - t0
      );
    } finally {
      clearTimeout(to);
    }
  }
}

// ============================================================================
// Follow Entity Leaf
// ============================================================================

/**
 * Follow an entity with specified range
 */
export class FollowEntityLeaf implements LeafImpl {
  spec: LeafSpec = {
    name: 'follow_entity',
    version: '1.0.0',
    description: 'Follow an entity with specified range',
    inputSchema: {
      type: 'object',
      properties: {
        entityId: {
          type: 'number',
          description: 'ID of entity to follow',
        },
        range: {
          type: 'number',
          minimum: 1,
          maximum: 20,
          default: 3,
        },
        timeout: {
          type: 'number',
          minimum: 1000,
          maximum: 60000,
          default: 30000,
        },
      },
      required: ['entityId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        entityFound: { type: 'boolean' },
        distance: { type: 'number' },
      },
    },
    timeoutMs: 30000,
    retries: 1,
    permissions: ['movement'],
  };

  async run(ctx: LeafContext, args: any): Promise<LeafResult> {
    const t0 = ctx.now();
    const bot = ctx.bot as BotWithPathfinder;
    const id = args?.entityId;
    const range = Math.min(Math.max(args?.range ?? 3, 1), 20);
    const timeoutMs = Math.min(Math.max(args?.timeout ?? 30000, 1000), 60000);

    if (typeof id !== 'number') {
      return {
        status: 'failure',
        error: {
          code: 'unknown',
          retryable: false,
          detail: 'invalid entityId',
        },
        metrics: { durationMs: ctx.now() - t0, retries: 0, timeouts: 0 },
      };
    }

    const entity = bot.entities?.[id];
    if (!entity) {
      return {
        status: 'failure',
        error: {
          code: 'path.unreachable',
          retryable: false,
          detail: `entity ${id} not found`,
        },
        metrics: { durationMs: ctx.now() - t0, retries: 0, timeouts: 0 },
      };
    }

    if (!bot.pathfinder) bot.loadPlugin(pathfinder);

    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), timeoutMs);
    const onCtxAbort = () =>
      ac.abort(new DOMException('aborted', 'AbortError'));
    ctx.abortSignal?.addEventListener('abort', onCtxAbort, { once: true });

    try {
      bot.pathfinder.setGoal(new pathfinderGoals.GoalFollow(entity, range), true);

      await new Promise<void>((resolve, reject) => {
        const tick = () => {
          if (ac.signal.aborted)
            return reject(
              Object.assign(new Error('aborted'), { _execCode: 'aborted' })
            );
          const e = bot.entities?.[id];
          if (!e)
            return reject(
              Object.assign(new Error('entity disappeared'), {
                _execCode: 'path.unreachable',
              })
            );
          const d = bot.entity!.position.distanceTo(e.position);
          if (d <= range) return resolve();
          setTimeout(tick, 50);
        };
        tick();
      });

      const duration = ctx.now() - t0;
      const d = bot.entity!.position.distanceTo(bot.entities![id].position);
      ctx.emitMetric('follow_entity_duration_ms', duration);
      ctx.emitMetric('follow_entity_final_distance', d);
      return {
        status: 'success',
        result: { success: true, entityFound: true, distance: d },
        metrics: { durationMs: duration, retries: 0, timeouts: 0 },
      };
    } catch (e: any) {
      const duration = ctx.now() - t0;
      try {
        bot.pathfinder?.stop();
      } catch {}
      return {
        status: 'failure',
        error: {
          code:
            e?._execCode ??
            (ac.signal.aborted ? 'aborted' : 'path.unreachable'),
          retryable: e?._execCode !== 'aborted',
          detail: String(e?.message ?? e),
        },
        metrics: {
          durationMs: duration,
          retries: 0,
          timeouts: ac.signal.aborted ? 1 : 0,
        },
      };
    } finally {
      clearTimeout(to);
      ctx.abortSignal?.removeEventListener('abort', onCtxAbort as any);
    }
  }
}
