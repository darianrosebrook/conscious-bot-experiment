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
// Use require for goals since ES Module import doesn't work
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { goals } = require('mineflayer-pathfinder');
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
    const dynamic = true; // allow continuous replans
    const timeoutMs = Math.min(Math.max(args?.timeout ?? 30000, 1000), 300000);

    // Ensure pathfinder plugin
    if (!bot.pathfinder) bot.loadPlugin(pathfinder);

    // Optional: apply Movements profile for "safe" nav if you carry mcData
    // if (args?.safe) {
    //   const moves = new Movements(bot, mcData);
    //   moves.allow1by1 = false;
    //   bot.pathfinder.setMovements(moves);
    // }

    // Build goal
    let g: any;
    if (goalType === 'GoalBlock')
      g = new goals.GoalBlock(target.x, target.y, target.z);
    else g = new goals.GoalNear(target.x, target.y, target.z, 1);

    // Local abort controller that aggregates ctx.abortSignal + timeout
    const ac = new AbortController();
    const timeoutId = setTimeout(() => ac.abort(), timeoutMs);
    const onCtxAbort = () =>
      ac.abort(new DOMException('aborted', 'AbortError'));
    ctx.abortSignal?.addEventListener('abort', onCtxAbort, { once: true });

    // Lifecycle flags & counters
    let resolved = false;
    let replanCount = 0;

    const cleanup = () => {
      try {
        bot.removeListener('goal_reached' as any, onGoalReached);
      } catch {}
      try {
        bot.removeListener('path_update' as any, onPathUpdate);
      } catch {}
      try {
        bot.removeListener('path_reset' as any, onPathReset);
      } catch {}
      clearTimeout(timeoutId);
      ctx.abortSignal?.removeEventListener('abort', onCtxAbort as any);
    };

    const onGoalReached = () => {
      if (resolved) return;
      resolved = true;
      cleanup();
    };

    const onPathUpdate = (results: any) => {
      // results.status: 'noPath'|'partial'|'complete' etc. — depends on lib version
      if (results?.status === 'noPath' && !resolved) {
        resolved = true;
        cleanup();
        // reject by throwing; caught in outer try/catch
        throw Object.assign(new Error('noPath'), {
          _execCode: 'path.unreachable',
        });
      }
      replanCount++;
    };

    const onPathReset = () => {
      if (!resolved) {
        resolved = true;
        cleanup();
        throw Object.assign(new Error('path_reset'), {
          _execCode: 'path.stuck',
        });
      }
    };

    try {
      bot.on('goal_reached' as any, onGoalReached);
      bot.on('path_update' as any, onPathUpdate);
      bot.on('path_reset' as any, onPathReset);

      // Kick movement
      bot.pathfinder.setGoal(g, dynamic);

      // Wait until either we hit goal or we abort/timeout
      await new Promise<void>((resolve, reject) => {
        const check = () => {
          if (resolved) return resolve();
          if (ac.signal.aborted)
            return reject(
              Object.assign(new Error('aborted'), { _execCode: 'aborted' })
            );
          setTimeout(check, 50);
        };
        check();
      });

      // Success
      const duration = ctx.now() - t0;
      const me = bot.entity?.position ?? new Vec3(0, 0, 0);
      const distance = me.distanceTo(target);
      ctx.emitMetric('move_to_duration_ms', duration);
      ctx.emitMetric('move_to_replans', replanCount);
      return {
        status: 'success',
        result: { success: true, distance, duration, pathLength: undefined },
        metrics: {
          durationMs: duration,
          retries: 0,
          timeouts: ac.signal.aborted ? 1 : 0,
        },
      };
    } catch (e: any) {
      // Map errors
      let code: any =
        e?._execCode ?? (ac.signal.aborted ? 'aborted' : 'path.unreachable');
      const duration = ctx.now() - t0;
      try {
        bot.pathfinder?.stop();
      } catch {}
      cleanup();
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
    } finally {
      cleanup();
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
      new goals.GoalNear(bTarget.x, bTarget.y, bTarget.z, 0.5),
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
      bot.pathfinder.setGoal(new goals.GoalFollow(entity, range), true);

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
