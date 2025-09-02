/**
 * Sensing Leaves - Primitive sensing operations for Mineflayer
 *
 * Implements sensing-related leaves including hostile detection, chat, and waiting
 * with proper error handling, timeouts, and Mineflayer integration.
 * Enhanced with skill composition capabilities for Voyager-inspired autonomous learning.
 *
 * @author @darianrosebrook
 */

import { Bot } from 'mineflayer';
import { Vec3 } from 'vec3';
import {
  LeafImpl,
  LeafContext,
  LeafResult,
  LeafSpec,
} from '@conscious-bot/core';

// ============================================================================
// Enhanced Leaf Spec with Composition Support
// ============================================================================

/**
 * Extended leaf spec that supports skill composition
 */
export interface ComposableLeafSpec extends LeafSpec {
  composition: {
    inputTypes: string[]; // What this leaf needs from environment/other skills
    outputTypes: string[]; // What this leaf produces for other skills
    combinableWith: string[]; // Other leaf types this can combine with
    complexity: number; // Difficulty level (1-10)
    prerequisites: string[]; // Required conditions or skills
    sideEffects: string[]; // Environmental changes this leaf causes
  };
}

// ============================================================================
// Sense Hostiles Leaf
// ============================================================================

/**
 * Sense hostile entities within a specified radius
 */
export class SenseHostilesLeaf implements LeafImpl {
  spec: ComposableLeafSpec = {
    name: 'sense_hostiles',
    version: '1.0.0',
    description: 'Detect hostile entities within a specified radius',
    inputSchema: {
      type: 'object',
      properties: {
        radius: {
          type: 'number',
          minimum: 1,
          maximum: 50,
          default: 10,
        },
        includePassive: {
          type: 'boolean',
          default: false,
        },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        hostiles: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              type: { type: 'string' },
              position: {
                type: 'object',
                properties: {
                  x: { type: 'number' },
                  y: { type: 'number' },
                  z: { type: 'number' },
                },
              },
              distance: { type: 'number' },
              health: { type: 'number' },
            },
          },
        },
        count: { type: 'number' },
        nearestDistance: { type: 'number' },
      },
    },
    timeoutMs: 2000,
    retries: 0,
    permissions: ['sense'],
    composition: {
      inputTypes: ['world_state', 'bot_position', 'entity_data'],
      outputTypes: ['threat_assessment', 'entity_locations', 'safety_status'],
      combinableWith: ['movement_leaves', 'combat_leaves', 'navigation_leaves'],
      complexity: 3,
      prerequisites: ['bot_spawned', 'world_loaded'],
      sideEffects: ['none'],
    },
  };

  async run(ctx: LeafContext, args: any): Promise<LeafResult> {
    const startTime = ctx.now();
    const { radius = 10, includePassive = false } = args;

    try {
      const bot = ctx.bot;
      const botPos = bot.entity?.position;

      if (!botPos) {
        return {
          status: 'failure',
          error: {
            code: 'world.invalidPosition',
            retryable: false,
            detail: 'Bot position not available',
          },
          metrics: {
            durationMs: ctx.now() - startTime,
            retries: 0,
            timeouts: 0,
          },
        };
      }

      // Define hostile entity types
      const hostileTypes = [
        'zombie',
        'skeleton',
        'spider',
        'creeper',
        'enderman',
        'witch',
        'slime',
        'magma_cube',
        'ghast',
        'blaze',
        'silverfish',
        'endermite',
        'guardian',
        'elder_guardian',
        'shulker',
        'vex',
        'vindicator',
        'pillager',
        'ravager',
        'hoglin',
        'zoglin',
        'piglin_brute',
      ];

      const passiveTypes = [
        'pig',
        'cow',
        'sheep',
        'chicken',
        'rabbit',
        'horse',
        'donkey',
        'mule',
        'llama',
        'cat',
        'dog',
        'fox',
        'panda',
        'turtle',
        'dolphin',
        'squid',
        'fish',
        'bat',
        'bee',
        'strider',
      ];

      const targetTypes = includePassive
        ? [...hostileTypes, ...passiveTypes]
        : hostileTypes;

      // Find entities within radius
      const hostiles: any[] = [];
      let nearestDistance = Infinity;

      for (const entity of Object.values(bot.entities)) {
        const typedEntity = entity as any;
        if (!typedEntity.position || !typedEntity.type) continue;

        const distance = botPos.distanceTo(typedEntity.position);

        if (distance <= radius && targetTypes.includes(typedEntity.type)) {
          const hostileInfo = {
            id: typedEntity.id,
            type: typedEntity.type,
            position: {
              x: typedEntity.position.x,
              y: typedEntity.position.y,
              z: typedEntity.position.z,
            },
            distance,
            health: typedEntity.health || 0,
          };

          hostiles.push(hostileInfo);

          if (distance < nearestDistance) {
            nearestDistance = distance;
          }
        }
      }

      // Sort by distance
      hostiles.sort((a, b) => a.distance - b.distance);

      const endTime = ctx.now();
      const duration = endTime - startTime;

      // Emit metrics
      ctx.emitMetric('sense_hostiles_duration', duration);
      ctx.emitMetric('sense_hostiles_count', hostiles.length);
      ctx.emitMetric(
        'sense_hostiles_nearest',
        nearestDistance === Infinity ? 0 : nearestDistance
      );

      return {
        status: 'success',
        result: {
          success: true,
          hostiles,
          count: hostiles.length,
          nearestDistance: nearestDistance === Infinity ? -1 : nearestDistance,
        },
        metrics: {
          durationMs: duration,
          retries: 0,
          timeouts: 0,
        },
      };
    } catch (error) {
      const endTime = ctx.now();
      const duration = endTime - startTime;

      return {
        status: 'failure',
        error: {
          code: 'sense.apiError',
          retryable: false,
          detail: error instanceof Error ? error.message : 'Unknown error',
        },
        metrics: {
          durationMs: duration,
          retries: 0,
          timeouts: 0,
        },
      };
    }
  }
}

// ============================================================================
// Chat Leaf
// ============================================================================

/**
 * Send a chat message
 */
export class ChatLeaf implements LeafImpl {
  spec: ComposableLeafSpec = {
    name: 'chat',
    version: '1.0.0',
    description: 'Send a chat message',
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          minLength: 1,
          maxLength: 256,
        },
        target: {
          type: 'string',
          description: 'Target player (optional)',
        },
      },
      required: ['message'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        messageSent: { type: 'string' },
        timestamp: { type: 'number' },
      },
    },
    timeoutMs: 1000,
    retries: 0,
    permissions: ['chat'],
    composition: {
      inputTypes: ['message_content', 'target_player', 'chat_permission'],
      outputTypes: ['communication_result', 'social_interaction'],
      combinableWith: ['sensing_leaves', 'interaction_leaves'],
      complexity: 1,
      prerequisites: ['chat_enabled', 'bot_authenticated'],
      sideEffects: ['chat_message_sent'],
    },
  };

  async run(ctx: LeafContext, args: any): Promise<LeafResult> {
    const startTime = ctx.now();
    const { message, target } = args;

    try {
      const bot = ctx.bot;

      // Validate message
      if (!message || typeof message !== 'string' || message.length === 0) {
        return {
          status: 'failure',
          error: {
            code: 'unknown',
            retryable: false,
            detail: 'Invalid message provided',
          },
          metrics: {
            durationMs: ctx.now() - startTime,
            retries: 0,
            timeouts: 0,
          },
        };
      }

      // Format message with target if specified
      const formattedMessage = target ? `/msg ${target} ${message}` : message;

      // Send the message
      await bot.chat(formattedMessage);

      const endTime = ctx.now();
      const duration = endTime - startTime;

      // Emit metrics
      ctx.emitMetric('chat_duration', duration);
      ctx.emitMetric('chat_message_length', message.length);

      return {
        status: 'success',
        result: {
          success: true,
          messageSent: formattedMessage,
          timestamp: endTime,
        },
        metrics: {
          durationMs: duration,
          retries: 0,
          timeouts: 0,
        },
      };
    } catch (error) {
      const endTime = ctx.now();
      const duration = endTime - startTime;

      return {
        status: 'failure',
        error: {
          code: 'unknown',
          retryable: false,
          detail: error instanceof Error ? error.message : 'Unknown chat error',
        },
        metrics: {
          durationMs: duration,
          retries: 0,
          timeouts: 0,
        },
      };
    }
  }
}

// ============================================================================
// Wait Leaf
// ============================================================================

/**
 * Wait for a specified duration
 */
export class WaitLeaf implements LeafImpl {
  spec: ComposableLeafSpec = {
    name: 'wait',
    version: '1.0.0',
    description: 'Wait for a specified duration (abortable)',
    inputSchema: {
      type: 'object',
      properties: {
        ms: {
          type: 'number',
          minimum: 1,
          maximum: 300000, // 5 minutes max
          default: 1000,
        },
        checkAbort: {
          type: 'boolean',
          default: true,
        },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        waitedMs: { type: 'number' },
        aborted: { type: 'number' },
      },
    },
    timeoutMs: 300000, // 5 minutes
    retries: 0,
    permissions: ['sense'],
    composition: {
      inputTypes: ['time_duration', 'abort_signal'],
      outputTypes: ['time_elapsed', 'abort_status'],
      combinableWith: ['all_leaf_types'],
      complexity: 1,
      prerequisites: ['time_system_available'],
      sideEffects: ['none'],
    },
  };

  async run(ctx: LeafContext, args: any): Promise<LeafResult> {
    const startTime = ctx.now();
    const { ms = 1000, checkAbort = true } = args;

    try {
      // Validate wait time
      if (ms <= 0 || ms > 300000) {
        return {
          status: 'failure',
          error: {
            code: 'unknown',
            retryable: false,
            detail: 'Invalid wait time (must be between 1ms and 300000ms)',
          },
          metrics: {
            durationMs: ctx.now() - startTime,
            retries: 0,
            timeouts: 0,
          },
        };
      }

      let aborted = false;

      if (checkAbort) {
        // Wait with abort signal support
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            resolve();
          }, ms);

          // Check for abort signal
          const checkAbortSignal = () => {
            if (ctx.abortSignal.aborted) {
              clearTimeout(timeout);
              aborted = true;
              resolve();
            } else {
              setTimeout(checkAbortSignal, 100); // Check every 100ms
            }
          };

          checkAbortSignal();
        });
      } else {
        // Simple wait without abort checking
        await new Promise((resolve) => setTimeout(resolve, ms));
      }

      const endTime = ctx.now();
      const duration = endTime - startTime;
      const actualWaitTime = Math.min(duration, ms);

      // Emit metrics
      ctx.emitMetric('wait_duration', actualWaitTime);
      ctx.emitMetric('wait_aborted', aborted ? 1 : 0);

      return {
        status: 'success',
        result: {
          success: true,
          waitedMs: actualWaitTime,
          aborted,
        },
        metrics: {
          durationMs: actualWaitTime,
          retries: 0,
          timeouts: 0,
        },
      };
    } catch (error) {
      const endTime = ctx.now();
      const duration = endTime - startTime;

      return {
        status: 'failure',
        error: {
          code: 'unknown',
          retryable: false,
          detail: error instanceof Error ? error.message : 'Unknown wait error',
        },
        metrics: {
          durationMs: duration,
          retries: 0,
          timeouts: 0,
        },
      };
    }
  }

  cancel(): void {
    // Wait leaf is inherently abortable through the abort signal
    // No additional cancellation logic needed
  }
}

// ============================================================================
// Get Light Level Leaf
// ============================================================================

/**
 * Get light level at current or specified position
 */
export class GetLightLevelLeaf implements LeafImpl {
  spec: ComposableLeafSpec = {
    name: 'get_light_level',
    version: '1.0.0',
    description: 'Get light level at current or specified position',
    inputSchema: {
      type: 'object',
      properties: {
        position: {
          type: 'object',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            z: { type: 'number' },
          },
        },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        lightLevel: { type: 'number' },
        position: {
          type: 'object',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            z: { type: 'number' },
          },
        },
        isSafe: { type: 'boolean' },
      },
    },
    timeoutMs: 1000,
    retries: 0,
    permissions: ['sense'],
    composition: {
      inputTypes: ['position_data', 'world_lighting'],
      outputTypes: ['light_level', 'safety_assessment', 'position_info'],
      combinableWith: ['movement_leaves', 'navigation_leaves', 'safety_leaves'],
      complexity: 2,
      prerequisites: ['world_loaded', 'lighting_system_available'],
      sideEffects: ['none'],
    },
  };

  async run(ctx: LeafContext, args: any): Promise<LeafResult> {
    const startTime = ctx.now();
    const { position } = args;

    try {
      const bot = ctx.bot;

      // Use provided position or bot's current position
      const targetPos = position
        ? new Vec3(position.x, position.y, position.z)
        : bot.entity?.position || new Vec3(0, 64, 0);

      // Get light level
      const lightLevel = (bot.world as any).getLight?.(targetPos) || 15;
      const isSafe = lightLevel >= 8; // Light level 8+ is considered safe

      const endTime = ctx.now();
      const duration = endTime - startTime;

      // Emit metrics
      ctx.emitMetric('get_light_level_duration', duration);
      ctx.emitMetric('get_light_level_value', lightLevel);
      ctx.emitMetric('get_light_level_safe', isSafe ? 1 : 0);

      return {
        status: 'success',
        result: {
          success: true,
          lightLevel,
          position: {
            x: targetPos.x,
            y: targetPos.y,
            z: targetPos.z,
          },
          isSafe,
        },
        metrics: {
          durationMs: duration,
          retries: 0,
          timeouts: 0,
        },
      };
    } catch (error) {
      const endTime = ctx.now();
      const duration = endTime - startTime;

      return {
        status: 'failure',
        error: {
          code: 'sense.apiError',
          retryable: false,
          detail:
            error instanceof Error
              ? error.message
              : 'Unknown light level error',
        },
        metrics: {
          durationMs: duration,
          retries: 0,
          timeouts: 0,
        },
      };
    }
  }
}
