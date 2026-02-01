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
// Use simple goals implementation
class SimpleGoalNear {
  constructor(x: number, y: number, z: number, range: number = 1) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.range = range;
  }
  x: number;
  y: number;
  z: number;
  range: number;

  // Required Goal interface properties
  heuristic(node: any): number {
    return 0;
  }

  isEnd(endNode: any): boolean {
    return false;
  }

  hasChanged(): boolean {
    return false;
  }

  isValid(): boolean {
    return true;
  }
}

const simpleGoals = {
  GoalNear: SimpleGoalNear,
};

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
  // Torch placement tracking
  private lastTorchPositions: Map<string, Vec3> = new Map();
  private readonly maxTrackedTorches = 50;

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

      // Find a suitable placement position with its reference block
      const placement = await this.findTorchPlacementPosition(
        bot as BotWithPathfinder,
        targetPos
      );
      if (!placement) {
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

      const { torchPos: placementPos, refBlock, faceVec } = placement;

      // Equip torch in hand and place against the reference block
      await bot.equip(torchItem, 'hand');
      await bot.placeBlock(refBlock, faceVec);

      // Record torch placement for optimal spacing
      this.recordTorchPlacement(placementPos);

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
   * Get distance from last torch position
   */
  private getDistanceFromLastTorch(botPos: Vec3): number {
    // Find the closest torch position to current bot position
    let minDistance = Infinity;

    for (const torchPos of this.lastTorchPositions.values()) {
      const distance = Math.sqrt(
        Math.pow(botPos.x - torchPos.x, 2) +
          Math.pow(botPos.y - torchPos.y, 2) +
          Math.pow(botPos.z - torchPos.z, 2)
      );

      if (distance < minDistance) {
        minDistance = distance;
      }
    }

    return minDistance === Infinity ? 0 : Math.floor(minDistance);
  }

  /**
   * Record torch placement position
   */
  private recordTorchPlacement(position: Vec3): void {
    // Create a unique key for this position (rounded to nearest block)
    const key = `${Math.floor(position.x)},${Math.floor(position.y)},${Math.floor(position.z)}`;

    this.lastTorchPositions.set(key, position);

    // Keep only the most recent torch positions
    if (this.lastTorchPositions.size > this.maxTrackedTorches) {
      const keysToDelete = Array.from(this.lastTorchPositions.keys()).slice(
        0,
        this.lastTorchPositions.size - this.maxTrackedTorches
      );
      keysToDelete.forEach((key) => this.lastTorchPositions.delete(key));
    }
  }

  /**
   * Find a suitable position to place a torch, returning the air position,
   * the solid reference block, and the face vector for bot.placeBlock().
   */
  private async findTorchPlacementPosition(
    bot: BotWithPathfinder,
    targetPos: Vec3
  ): Promise<{ torchPos: Vec3; refBlock: any; faceVec: Vec3 } | null> {
    // Prefer placing on top of a block below (floor torch), then walls
    const placements: Array<{ refOffset: Vec3; faceVec: Vec3 }> = [
      { refOffset: new Vec3(0, -1, 0), faceVec: new Vec3(0, 1, 0) },  // floor
      { refOffset: new Vec3(1, 0, 0), faceVec: new Vec3(-1, 0, 0) },  // wall
      { refOffset: new Vec3(-1, 0, 0), faceVec: new Vec3(1, 0, 0) },
      { refOffset: new Vec3(0, 0, 1), faceVec: new Vec3(0, 0, -1) },
      { refOffset: new Vec3(0, 0, -1), faceVec: new Vec3(0, 0, 1) },
    ];

    // Try at targetPos first, then immediate neighbors
    const searchPositions = [
      targetPos,
      targetPos.offset(1, 0, 0),
      targetPos.offset(-1, 0, 0),
      targetPos.offset(0, 0, 1),
      targetPos.offset(0, 0, -1),
    ];

    for (const torchPos of searchPositions) {
      const airBlock = bot.blockAt(torchPos);
      if (!airBlock || airBlock.boundingBox !== 'empty') continue;

      for (const { refOffset, faceVec } of placements) {
        const refPos = torchPos.plus(refOffset);
        const refBlock = bot.blockAt(refPos);
        if (refBlock && refBlock.boundingBox === 'block') {
          return { torchPos, refBlock, faceVec };
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
          new simpleGoals.GoalNear(
            safePosition.x,
            safePosition.y,
            safePosition.z,
            1
          )
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
        const eyePos = origin.offset(0, bot.entity.height ?? 1.62, 0);
        const hasLineOfSight = (ctx as any).hasLineOfSight as
          | ((
              obs: { x: number; y: number; z: number },
              tgt: { x: number; y: number; z: number }
            ) => boolean)
          | undefined;
        // Expanding cube search: prefer blocks the bot can actually see (no digging through dirt/stone)
        outer: for (let r = 1; r <= 10; r++) {
          for (let dx = -r; dx <= r; dx++) {
            for (let dy = -r; dy <= r; dy++) {
              for (let dz = -r; dz <= r; dz++) {
                const p = origin.offset(dx, dy, dz);
                const b = bot.blockAt(p);
                if (b && b.name && b.name.includes(namePattern)) {
                  if (hasLineOfSight) {
                    const blockCenter = {
                      x: p.x + 0.5,
                      y: p.y + 0.5,
                      z: p.z + 0.5,
                    };
                    if (!hasLineOfSight(eyePos, blockCenter)) continue;
                  }
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

      // Do not dig blocks the bot cannot see (occluded by dirt, stone, etc.)
      const hasLineOfSight = (ctx as any).hasLineOfSight as
        | ((
            obs: { x: number; y: number; z: number },
            tgt: { x: number; y: number; z: number }
          ) => boolean)
        | undefined;
      if (hasLineOfSight) {
        const eyePos = bot.entity.position.offset(
          0,
          bot.entity.height ?? 1.62,
          0
        );
        const blockCenter = {
          x: targetPos.x + 0.5,
          y: targetPos.y + 0.5,
          z: targetPos.z + 0.5,
        };
        if (!hasLineOfSight(eyePos, blockCenter)) {
          return {
            status: 'failure',
            error: {
              code: 'world.invalidPosition',
              retryable: true,
              detail:
                'Block not visible (occluded); cannot dig through obstacles',
            },
            metrics: {
              durationMs: ctx.now() - startTime,
              retries: 0,
              timeouts: 0,
            },
          };
        }
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

      // Find a solid reference block adjacent to the target air position
      const faceOffsets: Array<{ offset: Vec3; face: Vec3 }> = [
        { offset: new Vec3(0, -1, 0), face: new Vec3(0, 1, 0) },  // below → place on top
        { offset: new Vec3(0, 1, 0), face: new Vec3(0, -1, 0) },  // above → place below
        { offset: new Vec3(1, 0, 0), face: new Vec3(-1, 0, 0) },
        { offset: new Vec3(-1, 0, 0), face: new Vec3(1, 0, 0) },
        { offset: new Vec3(0, 0, 1), face: new Vec3(0, 0, -1) },
        { offset: new Vec3(0, 0, -1), face: new Vec3(0, 0, 1) },
      ];

      let refBlock: any = null;
      let faceVec: Vec3 | null = null;
      for (const { offset, face } of faceOffsets) {
        const refPos = placementPos.plus(offset);
        const candidate = bot.blockAt(refPos);
        if (candidate && candidate.boundingBox === 'block') {
          refBlock = candidate;
          faceVec = face;
          break;
        }
      }

      if (!refBlock || !faceVec) {
        return {
          status: 'failure',
          error: {
            code: 'place.invalidFace',
            retryable: true,
            detail: 'No solid reference block adjacent to placement position',
          },
          metrics: {
            durationMs: ctx.now() - startTime,
            retries: 0,
            timeouts: 0,
          },
        };
      }

      // Equip the item in hand before placing
      await bot.equip(itemToPlace, 'hand');

      // Place the block against the reference block
      await bot.placeBlock(refBlock, faceVec);

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

// ============================================================================
// Sleep Leaf
// ============================================================================

const BED_TYPES = new Set([
  'white_bed', 'orange_bed', 'magenta_bed', 'light_blue_bed',
  'yellow_bed', 'lime_bed', 'pink_bed', 'gray_bed',
  'light_gray_bed', 'cyan_bed', 'purple_bed', 'blue_bed',
  'brown_bed', 'green_bed', 'red_bed', 'black_bed',
]);

/**
 * Sleep in a nearby bed. Places a bed from inventory if none found.
 * Checks if it's nighttime before attempting to sleep.
 */
export class SleepLeaf implements LeafImpl {
  spec: LeafSpec = {
    name: 'sleep',
    version: '1.0.0',
    description: 'Sleep in a bed to skip the night and set spawn point',
    inputSchema: {
      type: 'object',
      properties: {
        force: {
          type: 'boolean',
          description: 'Attempt to sleep even during daytime (will likely fail)',
          default: false,
        },
        searchRadius: {
          type: 'number',
          minimum: 1,
          maximum: 32,
          default: 16,
        },
        placeBed: {
          type: 'boolean',
          description: 'Place a bed from inventory if none found nearby',
          default: true,
        },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        slept: { type: 'boolean' },
        bedPosition: {
          type: 'object',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            z: { type: 'number' },
          },
        },
        placed: { type: 'boolean' },
        wakeTime: { type: 'number' },
      },
    },
    timeoutMs: 30000,
    retries: 1,
    permissions: ['movement', 'place'],
  };

  async run(ctx: LeafContext, args: any): Promise<LeafResult> {
    const t0 = ctx.now();
    const bot = ctx.bot;
    const force = args?.force ?? false;
    const searchRadius = Math.min(Math.max(args?.searchRadius ?? 16, 1), 32);
    const placeBed = args?.placeBed ?? true;

    try {
      // Check if it's nighttime (MC time 12542-23459 is night)
      const time = (bot as any).time?.timeOfDay ?? 0;
      const isNight = time >= 12542 && time <= 23459;

      if (!isNight && !force) {
        return {
          status: 'failure',
          error: {
            code: 'sleep.notNight',
            retryable: true,
            detail: `Cannot sleep during the day (time: ${time})`,
          },
          metrics: { durationMs: ctx.now() - t0, retries: 0, timeouts: 0 },
        };
      }

      // Search for a nearby bed
      let bedBlock: any = null;
      const origin = bot.entity.position;
      for (let r = 1; r <= searchRadius && !bedBlock; r++) {
        for (let dx = -r; dx <= r; dx++) {
          for (let dy = -3; dy <= 3; dy++) {
            for (let dz = -r; dz <= r; dz++) {
              const p = origin.offset(dx, dy, dz);
              const b = bot.blockAt(p);
              if (b && BED_TYPES.has(b.name)) {
                bedBlock = b;
                break;
              }
            }
            if (bedBlock) break;
          }
          if (bedBlock) break;
        }
      }

      let placed = false;

      // If no bed found, try to place one from inventory
      if (!bedBlock && placeBed) {
        const bedItem = bot.inventory.items().find(
          (item: any) => BED_TYPES.has(item.name) || item.name.endsWith('_bed')
        );

        if (bedItem) {
          // Find a placement spot: 2 air blocks in a row with solid below
          const yaw = bot.entity.yaw;
          const forward = new Vec3(-Math.sin(yaw), 0, Math.cos(yaw));
          const targetPos = origin.offset(
            Math.round(forward.x * 2),
            0,
            Math.round(forward.z * 2)
          );
          const targetBlock = bot.blockAt(targetPos);
          const belowBlock = bot.blockAt(targetPos.offset(0, -1, 0));

          if (targetBlock && targetBlock.name === 'air' && belowBlock && belowBlock.boundingBox === 'block') {
            // Find reference block for placement
            const faceOffsets: Array<{ offset: Vec3; face: Vec3 }> = [
              { offset: new Vec3(0, -1, 0), face: new Vec3(0, 1, 0) },
              { offset: new Vec3(1, 0, 0), face: new Vec3(-1, 0, 0) },
              { offset: new Vec3(-1, 0, 0), face: new Vec3(1, 0, 0) },
              { offset: new Vec3(0, 0, 1), face: new Vec3(0, 0, -1) },
              { offset: new Vec3(0, 0, -1), face: new Vec3(0, 0, 1) },
            ];

            for (const { offset, face } of faceOffsets) {
              const refPos = targetPos.plus(offset);
              const refBlock = bot.blockAt(refPos);
              if (refBlock && refBlock.boundingBox === 'block') {
                await bot.equip(bedItem, 'hand');
                await bot.placeBlock(refBlock, face);
                placed = true;
                break;
              }
            }

            if (placed) {
              // Re-check for the placed bed
              bedBlock = bot.blockAt(targetPos);
              if (!bedBlock || !BED_TYPES.has(bedBlock.name)) {
                bedBlock = null;
                placed = false;
              }
            }
          }
        }
      }

      if (!bedBlock) {
        return {
          status: 'failure',
          error: {
            code: 'world.invalidPosition',
            retryable: true,
            detail: 'No bed found nearby and unable to place one',
          },
          metrics: { durationMs: ctx.now() - t0, retries: 0, timeouts: 0 },
        };
      }

      // Sleep in the bed
      await (bot as any).sleep(bedBlock);

      // Wait until we wake up or timeout
      await new Promise<void>((resolve) => {
        const wakeHandler = () => resolve();
        (bot as any).once('wake', wakeHandler);
        // Safety timeout — MC night is ~7 minutes max
        setTimeout(() => {
          (bot as any).removeListener('wake', wakeHandler);
          resolve();
        }, 15000);
      });

      const bedPos = bedBlock.position;
      ctx.emitMetric('sleep_duration_ms', ctx.now() - t0);

      return {
        status: 'success',
        result: {
          success: true,
          slept: true,
          bedPosition: { x: bedPos.x, y: bedPos.y, z: bedPos.z },
          placed,
          wakeTime: (bot as any).time?.timeOfDay ?? 0,
        },
        metrics: { durationMs: ctx.now() - t0, retries: 0, timeouts: 0 },
      };
    } catch (e: any) {
      return {
        status: 'failure',
        error: {
          code: 'sleep.failed',
          retryable: true,
          detail: e?.message ?? String(e),
        },
        metrics: { durationMs: ctx.now() - t0, retries: 0, timeouts: 0 },
      };
    }
  }
}

// ============================================================================
// Collect Items Leaf
// ============================================================================

/**
 * Collect nearby dropped items by moving to them.
 */
export class CollectItemsLeaf implements LeafImpl {
  spec: LeafSpec = {
    name: 'collect_items',
    version: '1.0.0',
    description: 'Collect nearby dropped items by moving to them',
    inputSchema: {
      type: 'object',
      properties: {
        itemName: {
          type: 'string',
          description: 'Filter to only collect items with this name (optional)',
        },
        radius: {
          type: 'number',
          minimum: 1,
          maximum: 32,
          default: 16,
        },
        maxItems: {
          type: 'number',
          minimum: 1,
          maximum: 64,
          default: 10,
        },
        timeout: {
          type: 'number',
          minimum: 1000,
          maximum: 60000,
          default: 15000,
        },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        collected: { type: 'number' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              count: { type: 'number' },
            },
          },
        },
      },
    },
    timeoutMs: 30000,
    retries: 1,
    permissions: ['movement'],
  };

  async run(ctx: LeafContext, args: any): Promise<LeafResult> {
    const t0 = ctx.now();
    const bot = ctx.bot;
    const itemName = args?.itemName;
    const radius = Math.min(Math.max(args?.radius ?? 16, 1), 32);
    const maxItems = Math.min(Math.max(args?.maxItems ?? 10, 1), 64);
    const timeout = Math.min(Math.max(args?.timeout ?? 15000, 1000), 60000);

    try {
      const origin = bot.entity.position;
      const collected: Array<{ name: string; count: number }> = [];
      const deadline = t0 + timeout;

      // Find dropped item entities
      const itemEntities = Object.values(bot.entities)
        .filter((e: any) => {
          if (e.name !== 'item' && e.objectType !== 'Item') return false;
          if (!e.position) return false;
          const dist = e.position.distanceTo(origin);
          if (dist > radius) return false;
          if (itemName && e.metadata) {
            // Item entity metadata[8] contains the item stack info in newer versions
            const itemInfo = (e as any).getDroppedItem?.();
            if (itemInfo && !itemInfo.name.includes(itemName)) return false;
          }
          return true;
        })
        .sort((a: any, b: any) =>
          a.position.distanceTo(origin) - b.position.distanceTo(origin)
        );

      if (itemEntities.length === 0) {
        return {
          status: 'success',
          result: { success: true, collected: 0, items: [] },
          metrics: { durationMs: ctx.now() - t0, retries: 0, timeouts: 0 },
        };
      }

      // Move to each item to pick it up (auto-pickup on proximity)
      let count = 0;
      for (const entity of itemEntities) {
        if (count >= maxItems) break;
        if (ctx.now() > deadline) break;

        const itemInfo = (entity as any).getDroppedItem?.();
        const targetPos = (entity as any).position;

        // Walk toward the item — simple approach using bot.lookAt + forward
        const dist = targetPos.distanceTo(bot.entity.position);
        if (dist > 1.5) {
          await bot.lookAt(targetPos);
          (bot as any).setControlState('forward', true);

          // Wait until close enough or entity gone
          await new Promise<void>((resolve) => {
            const check = setInterval(() => {
              const ent = bot.entities[(entity as any).id];
              if (!ent || !ent.position) {
                clearInterval(check);
                resolve();
                return;
              }
              const d = ent.position.distanceTo(bot.entity.position);
              if (d < 1.0 || ctx.now() > deadline) {
                clearInterval(check);
                resolve();
              }
            }, 100);
          });

          (bot as any).setControlState('forward', false);
        }

        // Brief wait for pickup
        await new Promise((r) => setTimeout(r, 200));

        // Check if entity is gone (was picked up)
        const stillExists = bot.entities[(entity as any).id];
        if (!stillExists) {
          count++;
          collected.push({
            name: itemInfo?.name ?? 'unknown',
            count: itemInfo?.count ?? 1,
          });
        }
      }

      ctx.emitMetric('collect_items_count', count);

      return {
        status: 'success',
        result: { success: true, collected: count, items: collected },
        metrics: { durationMs: ctx.now() - t0, retries: 0, timeouts: 0 },
      };
    } catch (e: any) {
      return {
        status: 'failure',
        error: {
          code: 'collect.failed',
          retryable: true,
          detail: e?.message ?? String(e),
        },
        metrics: { durationMs: ctx.now() - t0, retries: 0, timeouts: 0 },
      };
    }
  }
}
