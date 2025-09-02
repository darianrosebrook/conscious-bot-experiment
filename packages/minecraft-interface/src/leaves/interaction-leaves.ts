/**
 * Interaction Leaves - Primitive interaction operations for Mineflayer
 *
 * Implements interaction-related leaves including block placement, digging, and safety actions
 * with proper error handling, timeouts, and Mineflayer integration.
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
import { pathfinder } from 'mineflayer-pathfinder';
// Use require for goals since ES Module import doesn't work
const { goals } = require('mineflayer-pathfinder');

// Extend Bot type to include pathfinder
interface BotWithPathfinder extends Bot {
  pathfinder: any;
}

// ============================================================================
// Place Torch If Needed Leaf
// ============================================================================

/**
 * Place a torch if light level is below threshold
 */
export class PlaceTorchIfNeededLeaf implements LeafImpl {
  spec: LeafSpec = {
    name: 'place_torch_if_needed',
    version: '1.0.0',
    description: 'Place a torch if light level is below threshold',
    inputSchema: {
      type: 'object',
      properties: {
        interval: {
          type: 'number',
          minimum: 1,
          maximum: 20,
          default: 6,
        },
        lightThreshold: {
          type: 'number',
          minimum: 0,
          maximum: 15,
          default: 8,
        },
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
        torchPlaced: { type: 'boolean' },
        lightLevel: { type: 'number' },
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
    timeoutMs: 10000,
    retries: 1,
    permissions: ['place'],
  };

  async run(ctx: LeafContext, args: any): Promise<LeafResult> {
    const startTime = ctx.now();
    const { interval = 6, lightThreshold = 8, position } = args;

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

      // Determine target position
      const targetPos = position
        ? new Vec3(position.x, position.y, position.z)
        : botPos;

      // Check current light level
      const currentLightLevel = (bot.world as any).getLight?.(targetPos) || 15;

      // Check if we need to place a torch based on interval
      const shouldPlaceByInterval = this.shouldPlaceByInterval(
        botPos,
        interval
      );
      const shouldPlaceByLight = currentLightLevel < lightThreshold;

      if (!shouldPlaceByInterval && !shouldPlaceByLight) {
        return {
          status: 'success',
          result: {
            success: true,
            torchPlaced: false,
            lightLevel: currentLightLevel,
            position: {
              x: targetPos.x,
              y: targetPos.y,
              z: targetPos.z,
            },
          },
          metrics: {
            durationMs: ctx.now() - startTime,
            retries: 0,
            timeouts: 0,
          },
        };
      }

      // Check if we have torches
      const torchItem = bot.inventory
        .items()
        .find((item: any) => item.name === 'torch');
      if (!torchItem) {
        return {
          status: 'failure',
          error: {
            code: 'inventory.missingItem',
            retryable: false,
            detail: 'No torches available',
          },
          metrics: {
            durationMs: ctx.now() - startTime,
            retries: 0,
            timeouts: 0,
          },
        };
      }

      // Find a suitable placement position
      const placementPos = await this.findTorchPlacementPosition(
        bot as BotWithPathfinder,
        targetPos
      );
      if (!placementPos) {
        return {
          status: 'failure',
          error: {
            code: 'place.invalidFace',
            retryable: false,
            detail: 'No suitable torch placement position found',
          },
          metrics: {
            durationMs: ctx.now() - startTime,
            retries: 0,
            timeouts: 0,
          },
        };
      }

      // Place the torch
      await bot.placeBlock(placementPos as any, torchItem as any);

      // Verify placement
      const placedBlock = bot.blockAt(placementPos);
      const torchPlaced = placedBlock && placedBlock.name === 'torch';

      const endTime = ctx.now();
      const duration = endTime - startTime;

      // Emit metrics
      ctx.emitMetric('place_torch_duration', duration);
      ctx.emitMetric('place_torch_placed', torchPlaced ? 1 : 0);
      ctx.emitMetric('place_torch_light_before', currentLightLevel);

      return {
        status: 'success',
        result: {
          success: true,
          torchPlaced,
          lightLevel: currentLightLevel,
          position: {
            x: placementPos.x,
            y: placementPos.y,
            z: placementPos.z,
          },
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
          code: 'place.invalidFace',
          retryable: false,
          detail:
            error instanceof Error
              ? error.message
              : 'Unknown torch placement error',
        },
        metrics: {
          durationMs: duration,
          retries: 0,
          timeouts: 0,
        },
      };
    }
  }

  /**
   * Check if we should place a torch based on interval
   */
  private shouldPlaceByInterval(botPos: Vec3, interval: number): boolean {
    // Simple interval check - place every N blocks
    // This is a simplified version; in practice, you'd track the last torch position
    const distanceFromLastTorch = this.getDistanceFromLastTorch(botPos);
    return distanceFromLastTorch >= interval;
  }

  /**
   * Get distance from last torch (simplified implementation)
   */
  private getDistanceFromLastTorch(botPos: Vec3): number {
    // TODO: Implement proper tracking of last torch position
    // For now, return a random value to simulate interval checking
    return Math.floor(Math.random() * 10) + 1;
  }

  /**
   * Find a suitable position to place a torch
   */
  private async findTorchPlacementPosition(
    bot: BotWithPathfinder,
    targetPos: Vec3
  ): Promise<Vec3 | null> {
    // Try to place on a wall or block near the target position
    const directions = [
      new Vec3(1, 0, 0),
      new Vec3(-1, 0, 0),
      new Vec3(0, 0, 1),
      new Vec3(0, 0, -1),
      new Vec3(0, 1, 0),
      new Vec3(0, -1, 0),
    ];

    for (const direction of directions) {
      const testPos = targetPos.plus(direction);
      const block = bot.blockAt(testPos);

      if (block && block.boundingBox === 'block') {
        // Check if we can place a torch on this block
        const torchPos = testPos.plus(direction);
        const torchBlock = bot.blockAt(torchPos);

        if (torchBlock && torchBlock.boundingBox === 'empty') {
          return torchPos;
        }
      }
    }

    return null;
  }
}

// ============================================================================
// Retreat and Block Leaf
// ============================================================================

/**
 * Retreat to a safe position and block the entrance
 */
export class RetreatAndBlockLeaf implements LeafImpl {
  spec: LeafSpec = {
    name: 'retreat_and_block',
    version: '1.0.0',
    description: 'Retreat to a safe position and block the entrance',
    inputSchema: {
      type: 'object',
      properties: {
        retreatDistance: {
          type: 'number',
          minimum: 1,
          maximum: 10,
          default: 3,
        },
        blockType: {
          type: 'string',
          default: 'cobblestone',
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
        retreated: { type: 'boolean' },
        blocked: { type: 'boolean' },
        safePosition: {
          type: 'object',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            z: { type: 'number' },
          },
        },
      },
    },
    timeoutMs: 15000,
    retries: 1,
    permissions: ['movement', 'place'],
  };

  async run(ctx: LeafContext, args: any): Promise<LeafResult> {
    const startTime = ctx.now();
    const {
      retreatDistance = 3,
      blockType = 'cobblestone',
      checkLight = true,
    } = args;

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

      // Find a safe retreat position
      const safePosition = await this.findSafeRetreatPosition(
        bot as BotWithPathfinder,
        botPos,
        retreatDistance,
        checkLight
      );
      if (!safePosition) {
        return {
          status: 'failure',
          error: {
            code: 'path.stuck',
            retryable: true,
            detail: 'No safe retreat position found',
          },
          metrics: {
            durationMs: ctx.now() - startTime,
            retries: 0,
            timeouts: 0,
          },
        };
      }

      // Move to safe position
      let retreated = false;
      try {
        const botWithPathfinder = bot as BotWithPathfinder;
        if (!botWithPathfinder.pathfinder) {
          botWithPathfinder.loadPlugin(pathfinder);
        }
        await botWithPathfinder.pathfinder.goto(
          new goals.GoalNear(safePosition.x, safePosition.y, safePosition.z, 1)
        );
        retreated = true;
      } catch (error) {
        // Movement failed, but we'll still try to block
        console.log('Retreat movement failed:', error);
      }

      // Block the entrance
      let blocked = false;
      try {
        const blockItem = bot.inventory
          .items()
          .find((item: any) => item.name === blockType);
        if (blockItem) {
          const entrancePos = this.findEntrancePosition(
            bot as BotWithPathfinder,
            botPos,
            safePosition
          );
          if (entrancePos) {
            await bot.placeBlock(entrancePos as any, blockItem as any);
            blocked = true;
          }
        }
      } catch (error) {
        console.log('Blocking failed:', error);
      }

      const endTime = ctx.now();
      const duration = endTime - startTime;

      // Emit metrics
      ctx.emitMetric('retreat_and_block_duration', duration);
      ctx.emitMetric('retreat_and_block_retreated', retreated ? 1 : 0);
      ctx.emitMetric('retreat_and_block_blocked', blocked ? 1 : 0);

      return {
        status: 'success',
        result: {
          success: true,
          retreated,
          blocked,
          safePosition: {
            x: safePosition.x,
            y: safePosition.y,
            z: safePosition.z,
          },
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
          code: 'movement.timeout',
          retryable: true,
          detail:
            error instanceof Error
              ? error.message
              : 'Unknown retreat and block error',
        },
        metrics: {
          durationMs: duration,
          retries: 0,
          timeouts: 0,
        },
      };
    }
  }

  /**
   * Find a safe position to retreat to
   */
  private async findSafeRetreatPosition(
    bot: Bot,
    currentPos: Vec3,
    distance: number,
    checkLight: boolean
  ): Promise<Vec3 | null> {
    // Look for a position behind the bot (opposite to facing direction)
    const yaw = bot.entity?.yaw || 0;
    const retreatDirection = new Vec3(Math.sin(yaw), 0, -Math.cos(yaw));

    // Try positions at increasing distances
    for (let d = 1; d <= distance; d++) {
      const testPos = currentPos.plus(retreatDirection.scaled(d));

      // Check if position is safe
      if (this.isPositionSafe(bot, testPos, checkLight)) {
        return testPos;
      }
    }

    return null;
  }

  /**
   * Check if a position is safe
   */
  private isPositionSafe(bot: Bot, pos: Vec3, checkLight: boolean): boolean {
    // Check if position is accessible
    const block = bot.blockAt(pos);
    const aboveBlock = bot.blockAt(pos.offset(0, 1, 0));
    const belowBlock = bot.blockAt(pos.offset(0, -1, 0));

    if (block && block.boundingBox === 'block') return false;
    if (aboveBlock && aboveBlock.boundingBox === 'block') return false;
    if (!belowBlock || belowBlock.boundingBox === 'empty') return false;

    // Check light level if requested
    if (checkLight) {
      const lightLevel = (bot.world as any).getLight?.(pos) || 15;
      if (lightLevel < 8) return false;
    }

    return true;
  }

  /**
   * Find the entrance position to block
   */
  private findEntrancePosition(
    bot: BotWithPathfinder,
    originalPos: Vec3,
    safePos: Vec3
  ): Vec3 | null {
    // Find a position between original and safe position
    const direction = safePos.minus(originalPos).normalize();
    const entrancePos = originalPos.plus(direction.scaled(1));

    // Check if we can place a block here
    const block = bot.blockAt(entrancePos);
    if (block && block.boundingBox === 'empty') {
      return entrancePos;
    }

    return null;
  }
}

// ============================================================================
// Dig Block Leaf
// ============================================================================

/**
 * Dig a block at specified position
 */
export class DigBlockLeaf implements LeafImpl {
  spec: LeafSpec = {
    name: 'dig_block',
    version: '1.0.0',
    description: 'Dig a block at specified position',
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
        blockType: {
          type: 'string',
          description:
            'If provided without pos, the leaf will target the nearest matching block',
        },
        expect: {
          type: 'string',
          description: 'Expected block type',
        },
        tool: {
          type: 'string',
          description: 'Tool to use for digging',
        },
      },
      required: [],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        blockType: { type: 'string' },
        position: {
          type: 'object',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            z: { type: 'number' },
          },
        },
        toolUsed: { type: 'string' },
        itemsCollected: { type: 'number' },
      },
    },
    timeoutMs: 10000,
    retries: 2,
    permissions: ['dig'],
  };

  async run(ctx: LeafContext, args: any): Promise<LeafResult> {
    const startTime = ctx.now();
    const { pos, expect, tool, blockType } = args || {};

    try {
      const bot = ctx.bot;

      let resolvedPos: Vec3 | null = null;

      // Resolve position: either explicit pos, or nearest block for provided blockType/expect
      if (
        pos &&
        typeof pos.x === 'number' &&
        typeof pos.y === 'number' &&
        typeof pos.z === 'number'
      ) {
        resolvedPos = new Vec3(pos.x, pos.y, pos.z);
      } else if (blockType || expect) {
        const namePattern = String(blockType || expect);
        const origin = bot.entity.position.clone();
        // Simple expanding cube search up to 10 blocks
        outer: for (let r = 1; r <= 10; r++) {
          for (let dx = -r; dx <= r; dx++) {
            for (let dy = -r; dy <= r; dy++) {
              for (let dz = -r; dz <= r; dz++) {
                const p = origin.offset(dx, dy, dz);
                const b = bot.blockAt(p);
                if (b && b.name && b.name.includes(namePattern)) {
                  resolvedPos = p;
                  break outer;
                }
              }
            }
          }
        }

        if (!resolvedPos) {
          return {
            status: 'failure',
            error: {
              code: 'world.invalidPosition',
              retryable: true,
              detail: `No ${namePattern} found nearby`,
            },
            metrics: {
              durationMs: ctx.now() - startTime,
              retries: 0,
              timeouts: 0,
            },
          };
        }
      } else {
        return {
          status: 'failure',
          error: {
            code: 'world.invalidPosition',
            retryable: false,
            detail: 'Missing pos or blockType',
          },
          metrics: {
            durationMs: ctx.now() - startTime,
            retries: 0,
            timeouts: 0,
          },
        };
      }

      const targetPos = resolvedPos;
      const block = bot.blockAt(targetPos);

      if (!block || block.name === 'air') {
        return {
          status: 'failure',
          error: {
            code: 'world.invalidPosition',
            retryable: false,
            detail: 'No block at specified position',
          },
          metrics: {
            durationMs: ctx.now() - startTime,
            retries: 0,
            timeouts: 0,
          },
        };
      }

      // Check expected block type
      if (expect && block.name !== expect) {
        return {
          status: 'failure',
          error: {
            code: 'world.invalidPosition',
            retryable: false,
            detail: `Expected ${expect}, found ${block.name}`,
          },
          metrics: {
            durationMs: ctx.now() - startTime,
            retries: 0,
            timeouts: 0,
          },
        };
      }

      // Equip appropriate tool if specified
      let toolUsed = 'hand';
      if (tool) {
        const toolItem = bot.inventory
          .items()
          .find((item: any) => item.name.includes(tool));
        if (toolItem) {
          await bot.equip(toolItem, 'hand');
          toolUsed = toolItem.name;
        }
      }

      // Dig the block
      await bot.dig(block);

      // Wait for the block to break and collect items
      // Mineflayer automatically collects items when digging, but we should wait for completion
      const startInventory = bot.inventory.items().length;

      // Wait a bit for items to be collected
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Check if items were collected
      const endInventory = bot.inventory.items().length;
      const itemsCollected = endInventory - startInventory;

      const endTime = ctx.now();
      const duration = endTime - startTime;

      // Emit metrics
      ctx.emitMetric('dig_block_duration', duration);
      ctx.emitMetric('dig_block_type_hash', block.name.length); // Use hash of name instead of string
      ctx.emitMetric('items_collected', itemsCollected);

      return {
        status: 'success',
        result: {
          success: true,
          blockType: block.name,
          position: {
            x: targetPos.x,
            y: targetPos.y,
            z: targetPos.z,
          },
          toolUsed,
          itemsCollected,
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
          code: 'dig.timeout',
          retryable: true,
          detail:
            error instanceof Error ? error.message : 'Unknown digging error',
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
// Place Block Leaf
// ============================================================================

/**
 * Place a block at specified position
 */
export class PlaceBlockLeaf implements LeafImpl {
  spec: LeafSpec = {
    name: 'place_block',
    version: '1.0.0',
    description: 'Place a block at specified position',
    inputSchema: {
      type: 'object',
      properties: {
        item: {
          type: 'string',
          description: 'Item to place',
        },
        against: {
          type: 'object',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            z: { type: 'number' },
          },
          description: 'Position to place against',
        },
        pos: {
          type: 'object',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            z: { type: 'number' },
          },
          description: 'Exact position to place',
        },
      },
      required: ['item'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        blockPlaced: { type: 'string' },
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
    timeoutMs: 8000,
    retries: 1,
    permissions: ['place'],
  };

  async run(ctx: LeafContext, args: any): Promise<LeafResult> {
    const startTime = ctx.now();
    const { item, against, pos } = args;

    try {
      const bot = ctx.bot;

      // Validate input
      if (!item || typeof item !== 'string') {
        return {
          status: 'failure',
          error: {
            code: 'world.invalidPosition',
            retryable: false,
            detail: 'Invalid item provided',
          },
          metrics: {
            durationMs: ctx.now() - startTime,
            retries: 0,
            timeouts: 0,
          },
        };
      }

      // Find the item in inventory
      const itemToPlace = bot.inventory
        .items()
        .find((invItem: any) => invItem.name === item);
      if (!itemToPlace) {
        return {
          status: 'failure',
          error: {
            code: 'world.invalidPosition',
            retryable: false,
            detail: `Item ${item} not found in inventory`,
          },
          metrics: {
            durationMs: ctx.now() - startTime,
            retries: 0,
            timeouts: 0,
          },
        };
      }

      // Determine placement position
      let placementPos: Vec3 | null = null;
      if (pos) {
        placementPos = new Vec3(pos.x, pos.y, pos.z);
      } else if (against) {
        const againstPos = new Vec3(against.x, against.y, against.z);
        placementPos = againstPos.offset(1, 0, 0);
      } else {
        // Auto-select a nearby valid placement position: choose the block at feet level in front if empty with solid below
        const origin = bot.entity.position.clone();
        const candidates = [
          origin.offset(1, 0, 0),
          origin.offset(-1, 0, 0),
          origin.offset(0, 0, 1),
          origin.offset(0, 0, -1),
          origin.offset(1, 0, 1),
          origin.offset(-1, 0, -1),
        ];
        for (const c of candidates) {
          const here = bot.blockAt(c);
          const below = bot.blockAt(c.offset(0, -1, 0));
          if (
            here &&
            here.name === 'air' &&
            below &&
            below.boundingBox === 'block'
          ) {
            placementPos = c;
            break;
          }
        }
        if (!placementPos) {
          return {
            status: 'failure',
            error: {
              code: 'place.invalidFace',
              retryable: true,
              detail: 'No suitable placement position nearby',
            },
            metrics: {
              durationMs: ctx.now() - startTime,
              retries: 0,
              timeouts: 0,
            },
          };
        }
      }

      // Place the block
      await bot.placeBlock(placementPos as any, itemToPlace as any);

      // Verify placement
      const placedBlock = bot.blockAt(placementPos);
      const blockPlaced = placedBlock && placedBlock.name === item;

      const endTime = ctx.now();
      const duration = endTime - startTime;

      // Emit metrics
      ctx.emitMetric('place_block_duration', duration);
      ctx.emitMetric('place_block_success', blockPlaced ? 1 : 0);

      return {
        status: 'success',
        result: {
          success: true,
          blockPlaced: blockPlaced ? item : 'unknown',
          position: {
            x: placementPos.x,
            y: placementPos.y,
            z: placementPos.z,
          },
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
          code: 'place.invalidFace',
          retryable: false,
          detail:
            error instanceof Error
              ? error.message
              : 'Unknown block placement error',
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
// Consume Food Leaf
// ============================================================================

/**
 * Consume food from inventory to restore hunger
 */
export class ConsumeFoodLeaf implements LeafImpl {
  spec: LeafSpec = {
    name: 'consume_food',
    version: '1.0.0',
    description: 'Consume food from inventory to restore hunger',
    inputSchema: {
      type: 'object',
      properties: {
        food_type: {
          type: 'string',
          default: 'any',
          description: 'Type of food to consume (any, bread, meat, etc.)',
        },
        amount: {
          type: 'number',
          minimum: 1,
          maximum: 64,
          default: 1,
          description: 'Amount of food to consume',
        },
        until_saturation: {
          type: 'string',
          default: 'target_level',
          description: 'Consume until reaching target saturation level',
        },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        foodConsumed: { type: 'string' },
        hungerRestored: { type: 'number' },
        saturationRestored: { type: 'number' },
      },
    },
    timeoutMs: 10000,
    retries: 2,
    permissions: ['container.read'],
  };

  async run(ctx: LeafContext, args: any): Promise<LeafResult> {
    const startTime = ctx.now();
    const {
      food_type = 'any',
      amount = 1,
      until_saturation = 'target_level',
    } = args;

    try {
      const bot = ctx.bot;

      // Get current hunger and saturation
      const currentHunger = bot.food || 20;
      const currentSaturation = bot.foodSaturation || 5;

      // Find food items in inventory
      const foodItems = bot.inventory
        .items()
        .filter((item: any) => {
          if (food_type === 'any') {
            return this.isFoodItem(item.name);
          }
          return item.name === food_type || item.name.includes(food_type);
        })
        .sort((a: any, b: any) => b.count - a.count); // Prefer items with more quantity

      if (foodItems.length === 0) {
        return {
          status: 'failure',
          error: {
            code: 'inventory.missingItem',
            retryable: false,
            detail: `No food available in inventory`,
          },
          metrics: {
            durationMs: ctx.now() - startTime,
            retries: 0,
            timeouts: 0,
          },
        };
      }

      // Consume food items
      let foodConsumed = 0;
      let hungerRestored = 0;
      let saturationRestored = 0;
      const consumedItems: string[] = [];

      for (const foodItem of foodItems) {
        if (foodConsumed >= amount) break;

        try {
          // Equip the food item
          await bot.equip(foodItem, 'hand');

          // Consume the food
          await bot.consume();

          foodConsumed++;
          consumedItems.push(foodItem.name);

          // Wait a moment for the consumption to register
          await new Promise((resolve) => setTimeout(resolve, 500));

          // Check if we've reached target saturation
          if (until_saturation === 'target_level' && bot.food >= 20) {
            break;
          }
        } catch (error) {
          console.log(`Failed to consume ${foodItem.name}:`, error);
          continue;
        }
      }

      // Calculate restoration
      const newHunger = bot.food || 20;
      const newSaturation = bot.foodSaturation || 5;
      hungerRestored = newHunger - currentHunger;
      saturationRestored = newSaturation - currentSaturation;

      const endTime = ctx.now();
      const duration = endTime - startTime;

      // Emit metrics
      ctx.emitMetric('consume_food_duration', duration);
      ctx.emitMetric('consume_food_items', foodConsumed);
      ctx.emitMetric('consume_food_hunger_restored', hungerRestored);
      ctx.emitMetric('consume_food_saturation_restored', saturationRestored);

      return {
        status: 'success',
        result: {
          success: true,
          foodConsumed: consumedItems.join(', '),
          hungerRestored,
          saturationRestored,
          itemsConsumed: foodConsumed,
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
          code: 'inventory.missingItem',
          retryable: true,
          detail:
            error instanceof Error ? error.message : 'Unknown consume error',
        },
        metrics: {
          durationMs: duration,
          retries: 0,
          timeouts: 0,
        },
      };
    }
  }

  /**
   * Check if an item is considered food
   */
  private isFoodItem(itemName: string): boolean {
    const foodItems = [
      'bread',
      'cooked_beef',
      'cooked_chicken',
      'cooked_porkchop',
      'cooked_rabbit',
      'cooked_mutton',
      'cooked_cod',
      'cooked_salmon',
      'baked_potato',
      'carrot',
      'apple',
      'golden_apple',
      'enchanted_golden_apple',
      'melon_slice',
      'sweet_berries',
      'glow_berries',
      'chorus_fruit',
      'dried_kelp',
      'beetroot',
      'potato',
      'pumpkin_pie',
      'cookie',
      'cake',
      'mushroom_stew',
      'beetroot_soup',
      'rabbit_stew',
      'suspicious_stew',
      'honey_bottle',
      'milk_bucket',
    ];

    return foodItems.some((food) => itemName.includes(food));
  }
}
