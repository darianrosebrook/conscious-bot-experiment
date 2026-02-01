/**
 * Farming Leaves - Primitive farming and agriculture operations for Mineflayer
 *
 * Implements farming-related leaves including soil tilling, crop planting,
 * harvesting, and farm management with proper error handling, timeouts,
 * and Mineflayer integration.
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
// Helper Functions
// ============================================================================

/**
 * Check if a block is a crop that can be harvested
 */
function isHarvestableCrop(blockName: string): boolean {
  const harvestableCrops = [
    'wheat',
    'carrots',
    'potatoes',
    'beetroots',
    'nether_wart',
  ];
  return harvestableCrops.includes(blockName);
}

/**
 * Check if a block is farmland/soil that can be tilled
 */
function isTillableSoil(blockName: string): boolean {
  const tillableBlocks = [
    'grass_block',
    'dirt',
    'coarse_dirt',
    'podzol',
    'mycelium',
  ];
  return tillableBlocks.includes(blockName);
}

/**
 * Check if a block is already tilled farmland
 */
function isFarmland(blockName: string): boolean {
  return blockName === 'farmland';
}

/**
 * Get the age property of a crop block
 */
function getCropAge(block: any): number {
  if (!block || !block.metadata) return 0;

  // Different crops have different age ranges
  switch (block.name) {
    case 'wheat':
      return block.metadata & 0x7; // Wheat uses bits 0-2 (0-7)
    case 'carrots':
    case 'potatoes':
      return block.metadata & 0x7; // Carrots/potatoes use bits 0-2 (0-7)
    case 'beetroots':
      return block.metadata & 0x3; // Beetroots use bits 0-1 (0-3)
    case 'nether_wart':
      return block.metadata & 0x3; // Nether wart uses bits 0-1 (0-3)
    default:
      return 0;
  }
}

/**
 * Check if a crop is fully grown and ready to harvest
 */
function isCropReady(block: any): boolean {
  if (!block || !isHarvestableCrop(block.name)) return false;

  const age = getCropAge(block);
  const maxAgeMap: Record<string, number> = {
    wheat: 7,
    carrots: 7,
    potatoes: 7,
    beetroots: 3,
    nether_wart: 3,
  };
  const maxAge = maxAgeMap[block.name as string] || 0;

  return age >= maxAge;
}

/**
 * Find the nearest crop within radius
 */
function findNearestCrop(bot: Bot, radius: number): Vec3 | null {
  if (!bot.entity?.position) return null;

  const pos = bot.entity.position;
  let nearestCrop: Vec3 | null = null;
  let nearestDistance = radius;

  // Search in a radius around the bot
  for (let x = pos.x - radius; x <= pos.x + radius; x++) {
    for (let y = pos.y - 4; y <= pos.y + 4; y++) {
      for (let z = pos.z - radius; z <= pos.z + radius; z++) {
        const checkPos = new Vec3(x, y, z);
        const block = bot.blockAt(checkPos);

        if (block && isHarvestableCrop(block.name)) {
          const distance = pos.distanceTo(checkPos);
          if (distance < nearestDistance) {
            nearestCrop = checkPos;
            nearestDistance = distance;
          }
        }
      }
    }
  }

  return nearestCrop;
}

/**
 * Find the nearest tillable soil within radius
 */
function findNearestTillableSoil(bot: Bot, radius: number): Vec3 | null {
  if (!bot.entity?.position) return null;

  const pos = bot.entity.position;
  let nearestSoil: Vec3 | null = null;
  let nearestDistance = radius;

  // Search in a radius around the bot
  for (let x = pos.x - radius; x <= pos.x + radius; x++) {
    for (let y = pos.y - 4; y <= pos.y + 4; y++) {
      for (let z = pos.z - radius; z <= pos.z + radius; z++) {
        const checkPos = new Vec3(x, y, z);
        const block = bot.blockAt(checkPos);

        if (block && isTillableSoil(block.name) && !isFarmland(block.name)) {
          const distance = pos.distanceTo(checkPos);
          if (distance < nearestDistance) {
            nearestSoil = checkPos;
            nearestDistance = distance;
          }
        }
      }
    }
  }

  return nearestSoil;
}

// ============================================================================
// Farming Leaves
// ============================================================================

/**
 * TillSoilLeaf - Tills soil to prepare for planting
 */
export class TillSoilLeaf implements LeafImpl {
  spec: LeafSpec = {
    name: 'till_soil',
    version: '1.0.0',
    description: 'Tills soil to prepare farmland for crop planting',
    permissions: ['movement', 'dig', 'place'],
    timeoutMs: 30000,
    retries: 3,
    inputSchema: {
      type: 'object',
      properties: {
        position: {
          type: 'object',
          description:
            'Position to till soil at (optional, will find nearest if not specified)',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            z: { type: 'number' },
          },
        },
        radius: {
          type: 'number',
          description: 'Search radius for tillable soil',
          default: 16,
        },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        position: { type: 'object' },
        toolUsed: { type: 'string' },
        soilTilled: { type: 'boolean' },
      },
    },
  };

  async run(ctx: LeafContext, args: any = {}): Promise<LeafResult> {
    const startTime = ctx.now();
    const { position, radius = 16 } = args;

    try {
      const bot = ctx.bot;
      let targetPos: Vec3;
      let block: any;

      // Find target position
      if (position) {
        targetPos = new Vec3(position.x, position.y, position.z);
        block = bot.blockAt(targetPos);

        if (!block || !isTillableSoil(block.name)) {
          return {
            status: 'failure',
            error: {
              code: 'world.invalidPosition',
              retryable: false,
              detail: `No tillable soil found at ${position.x}, ${position.y}, ${position.z}`,
            },
            metrics: {
              durationMs: ctx.now() - startTime,
              retries: 0,
              timeouts: 0,
            },
          };
        }
      } else {
        // Search for nearest tillable soil
        const foundPos = findNearestTillableSoil(bot, radius);
        if (!foundPos) {
          return {
            status: 'failure',
            error: {
              code: 'world.invalidPosition',
              retryable: true,
              detail: `No tillable soil found within ${radius} blocks`,
            },
            metrics: {
              durationMs: ctx.now() - startTime,
              retries: 0,
              timeouts: 0,
            },
          };
        }
        targetPos = foundPos;
        block = bot.blockAt(targetPos);
      }

      // Check if bot has a hoe
      const hoe = bot.inventory
        .items()
        .find((item) => item.name.includes('hoe') && item.name !== 'hoe');

      if (!hoe) {
        return {
          status: 'failure',
          error: {
            code: 'inventory.missingItem',
            retryable: true,
            detail: 'No hoe found in inventory for tilling soil',
          },
          metrics: {
            durationMs: ctx.now() - startTime,
            retries: 0,
            timeouts: 0,
          },
        };
      }

      // Equip the hoe
      await bot.equip(hoe, 'hand');

      // Till the soil by right-clicking (activating) the block with hoe equipped
      await bot.activateBlock(block);

      return {
        status: 'success',
        result: {
          success: true,
          position: { x: targetPos.x, y: targetPos.y, z: targetPos.z },
          toolUsed: hoe.name,
          soilTilled: true,
        },
        metrics: {
          durationMs: ctx.now() - startTime,
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
            error instanceof Error ? error.message : 'Unknown farming error',
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

/**
 * PlantCropLeaf - Plants seeds/crops in tilled farmland
 */
export class PlantCropLeaf implements LeafImpl {
  spec: LeafSpec = {
    name: 'plant_crop',
    version: '1.0.0',
    description: 'Plants crops or seeds in tilled farmland',
    permissions: ['movement', 'container.read', 'container.write'],
    timeoutMs: 20000,
    retries: 3,
    inputSchema: {
      type: 'object',
      properties: {
        position: {
          type: 'object',
          description:
            'Position to plant at (optional, will find nearest farmland if not specified)',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            z: { type: 'number' },
          },
        },
        cropType: {
          type: 'string',
          description:
            'Type of crop to plant (wheat, carrots, potatoes, beetroots)',
          default: 'wheat',
        },
        radius: {
          type: 'number',
          description: 'Search radius for farmland',
          default: 16,
        },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        position: { type: 'object' },
        cropType: { type: 'string' },
        seedsUsed: { type: 'number' },
      },
    },
  };

  async run(ctx: LeafContext, args: any = {}): Promise<LeafResult> {
    const startTime = ctx.now();
    const { position, cropType = 'wheat', radius = 16 } = args;

    try {
      const bot = ctx.bot;
      let targetPos: Vec3;
      let block: any;

      // Find target position
      if (position) {
        targetPos = new Vec3(position.x, position.y, position.z);
        block = bot.blockAt(targetPos);

        if (!block || !isFarmland(block.name)) {
          return {
            status: 'failure',
            error: {
              code: 'world.invalidPosition',
              retryable: false,
              detail: `No farmland found at ${position.x}, ${position.y}, ${position.z}`,
            },
            metrics: {
              durationMs: ctx.now() - startTime,
              retries: 0,
              timeouts: 0,
            },
          };
        }
      } else {
        // Search for nearest farmland
        const pos = bot.entity?.position;
        if (!pos) {
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

        let nearestFarmland: Vec3 | null = null;
        let nearestDistance = radius;

        for (let x = pos.x - radius; x <= pos.x + radius; x++) {
          for (let y = pos.y - 4; y <= pos.y + 4; y++) {
            for (let z = pos.z - radius; z <= pos.z + radius; z++) {
              const checkPos = new Vec3(x, y, z);
              const checkBlock = bot.blockAt(checkPos);

              if (checkBlock && isFarmland(checkBlock.name)) {
                const distance = pos.distanceTo(checkPos);
                if (distance < nearestDistance) {
                  nearestFarmland = checkPos;
                  nearestDistance = distance;
                }
              }
            }
          }
        }

        if (!nearestFarmland) {
          return {
            status: 'failure',
            error: {
              code: 'world.invalidPosition',
              retryable: true,
              detail: `No farmland found within ${radius} blocks`,
            },
            metrics: {
              durationMs: ctx.now() - startTime,
              retries: 0,
              timeouts: 0,
            },
          };
        }

        targetPos = nearestFarmland;
        block = bot.blockAt(targetPos);
      }

      // Check if farmland is empty (no crop already planted)
      const cropAbove = bot.blockAt(
        new Vec3(targetPos.x, targetPos.y + 1, targetPos.z)
      );
      if (cropAbove && isHarvestableCrop(cropAbove.name)) {
        return {
          status: 'failure',
          error: {
            code: 'world.invalidPosition',
            retryable: false,
            detail: 'Farmland already has a crop planted',
          },
          metrics: {
            durationMs: ctx.now() - startTime,
            retries: 0,
            timeouts: 0,
          },
        };
      }

      // Find seeds in inventory
      const seedNames = {
        wheat: 'wheat_seeds',
        carrots: 'carrot',
        potatoes: 'potato',
        beetroots: 'beetroot_seeds',
      };

      const seedName =
        seedNames[cropType as keyof typeof seedNames] || 'wheat_seeds';
      const seeds = bot.inventory
        .items()
        .find((item) => item.name === seedName);

      if (!seeds || seeds.count < 1) {
        return {
          status: 'failure',
          error: {
            code: 'inventory.missingItem',
            retryable: true,
            detail: `No ${seedName} found in inventory`,
          },
          metrics: {
            durationMs: ctx.now() - startTime,
            retries: 0,
            timeouts: 0,
          },
        };
      }

      // Plant the crop
      await bot.placeBlock(block, new Vec3(0, 1, 0));

      return {
        status: 'success',
        result: {
          success: true,
          position: { x: targetPos.x, y: targetPos.y, z: targetPos.z },
          cropType,
          seedsUsed: 1,
        },
        metrics: {
          durationMs: ctx.now() - startTime,
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
          code: 'place.timeout',
          retryable: true,
          detail:
            error instanceof Error ? error.message : 'Unknown farming error',
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

/**
 * HarvestCropLeaf - Harvests mature crops
 */
export class HarvestCropLeaf implements LeafImpl {
  spec: LeafSpec = {
    name: 'harvest_crop',
    version: '1.0.0',
    description: 'Harvests mature crops from farmland',
    permissions: ['movement', 'dig'],
    timeoutMs: 30000,
    retries: 3,
    inputSchema: {
      type: 'object',
      properties: {
        position: {
          type: 'object',
          description:
            'Position to harvest at (optional, will find nearest mature crop if not specified)',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            z: { type: 'number' },
          },
        },
        radius: {
          type: 'number',
          description: 'Search radius for mature crops',
          default: 16,
        },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        position: { type: 'object' },
        cropType: { type: 'string' },
        itemsHarvested: { type: 'array' },
        totalItems: { type: 'number' },
      },
    },
  };

  async run(ctx: LeafContext, args: any = {}): Promise<LeafResult> {
    const startTime = ctx.now();
    const { position, radius = 16 } = args;

    try {
      const bot = ctx.bot;
      let targetPos: Vec3;
      let cropBlock: any;

      // Find target crop
      if (position) {
        targetPos = new Vec3(position.x, position.y, position.z);
        cropBlock = bot.blockAt(targetPos);

        if (
          !cropBlock ||
          !isHarvestableCrop(cropBlock.name) ||
          !isCropReady(cropBlock)
        ) {
          return {
            status: 'failure',
            error: {
              code: 'world.invalidPosition',
              retryable: false,
              detail: `No mature crop found at ${position.x}, ${position.y}, ${position.z}`,
            },
            metrics: {
              durationMs: ctx.now() - startTime,
              retries: 0,
              timeouts: 0,
            },
          };
        }
      } else {
        // Search for nearest mature crop
        const foundPos = findNearestCrop(bot, radius);
        if (!foundPos) {
          return {
            status: 'failure',
            error: {
              code: 'world.invalidPosition',
              retryable: true,
              detail: `No mature crops found within ${radius} blocks`,
            },
            metrics: {
              durationMs: ctx.now() - startTime,
              retries: 0,
              timeouts: 0,
            },
          };
        }
        targetPos = foundPos;
        cropBlock = bot.blockAt(targetPos);
      }

      if (!cropBlock || !isCropReady(cropBlock)) {
        return {
          status: 'failure',
          error: {
            code: 'world.invalidPosition',
            retryable: false,
            detail: 'Crop is not ready for harvesting',
          },
          metrics: {
            durationMs: ctx.now() - startTime,
            retries: 0,
            timeouts: 0,
          },
        };
      }

      // Harvest the crop
      await bot.dig(cropBlock);

      // Check what items were harvested
      const itemsHarvested = [];
      const previousInventory = bot.inventory.items();

      // Wait a moment for inventory to update
      await new Promise((resolve) => setTimeout(resolve, 100));

      const currentInventory = bot.inventory.items();
      const newItems = currentInventory.filter(
        (item) =>
          !previousInventory.some(
            (prevItem) =>
              prevItem.name === item.name && prevItem.slot === item.slot
          )
      );

      for (const item of newItems) {
        itemsHarvested.push({
          name: item.name,
          count: item.count,
          slot: item.slot,
        });
      }

      return {
        status: 'success',
        result: {
          success: true,
          position: { x: targetPos.x, y: targetPos.y, z: targetPos.z },
          cropType: cropBlock.name,
          itemsHarvested,
          totalItems: itemsHarvested.reduce((sum, item) => sum + item.count, 0),
        },
        metrics: {
          durationMs: ctx.now() - startTime,
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
            error instanceof Error ? error.message : 'Unknown farming error',
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

/**
 * ManageFarmLeaf - Manages overall farm operations
 */
export class ManageFarmLeaf implements LeafImpl {
  spec: LeafSpec = {
    name: 'manage_farm',
    version: '1.0.0',
    description:
      'Manages farm operations including planting, harvesting, and maintenance',
    permissions: [
      'movement',
      'dig',
      'place',
      'container.read',
      'container.write',
    ],
    timeoutMs: 120000, // 2 minutes for complex farm operations
    retries: 3,
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description:
            'Farm action to perform (till, plant, harvest, maintain)',
          enum: ['till', 'plant', 'harvest', 'maintain'],
          default: 'maintain',
        },
        cropType: {
          type: 'string',
          description: 'Type of crop to plant (for plant action)',
          default: 'wheat',
        },
        radius: {
          type: 'number',
          description: 'Radius to search for farm activities',
          default: 32,
        },
        maxOperations: {
          type: 'number',
          description: 'Maximum number of operations to perform',
          default: 10,
        },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        action: { type: 'string' },
        operationsCompleted: { type: 'number' },
        details: { type: 'object' },
      },
    },
  };

  async run(ctx: LeafContext, args: any = {}): Promise<LeafResult> {
    const startTime = ctx.now();
    const {
      action = 'maintain',
      cropType = 'wheat',
      radius = 32,
      maxOperations = 10,
    } = args;

    try {
      const bot = ctx.bot;
      let operationsCompleted = 0;
      const details: any = {
        tilled: 0,
        planted: 0,
        harvested: 0,
        itemsCollected: [],
      };

      switch (action) {
        case 'till':
          // Till soil operations
          for (let i = 0; i < maxOperations; i++) {
            const soilPos = findNearestTillableSoil(bot, radius);
            if (!soilPos) break;

            const tillResult = await this.tillSingleSoil(ctx, soilPos);
            if (tillResult.status === 'success') {
              operationsCompleted++;
              details.tilled++;
            } else {
              break; // Stop if tilling fails
            }
          }
          break;

        case 'plant':
          // Plant crop operations
          for (let i = 0; i < maxOperations; i++) {
            const farmPos = await this.findEmptyFarmland(bot, radius);
            if (!farmPos) break;

            const plantResult = await this.plantSingleCrop(
              ctx,
              farmPos,
              cropType
            );
            if (plantResult.status === 'success') {
              operationsCompleted++;
              details.planted++;
            } else {
              break; // Stop if planting fails
            }
          }
          break;

        case 'harvest':
          // Harvest crop operations
          for (let i = 0; i < maxOperations; i++) {
            const cropPos = findNearestCrop(bot, radius);
            if (!cropPos) break;

            const cropBlock = bot.blockAt(cropPos);
            if (!cropBlock || !isCropReady(cropBlock)) break;

            const harvestResult = await this.harvestSingleCrop(ctx, cropPos);
            if (harvestResult.status === 'success' && harvestResult.result) {
              operationsCompleted++;
              details.harvested++;
              const result = harvestResult.result as any;
              if (result.itemsHarvested) {
                details.itemsCollected.push(...result.itemsHarvested);
              }
            } else {
              break; // Stop if harvesting fails
            }
          }
          break;

        case 'maintain':
          // Perform all maintenance operations
          let continueOperations = true;

          while (continueOperations && operationsCompleted < maxOperations) {
            // First priority: harvest mature crops
            const cropPos = findNearestCrop(bot, radius);
            if (cropPos) {
              const cropBlock = bot.blockAt(cropPos);
              if (cropBlock && isCropReady(cropBlock)) {
                const harvestResult = await this.harvestSingleCrop(
                  ctx,
                  cropPos
                );
                if (
                  harvestResult.status === 'success' &&
                  harvestResult.result
                ) {
                  operationsCompleted++;
                  details.harvested++;
                  const result = harvestResult.result as any;
                  if (result.itemsHarvested) {
                    details.itemsCollected.push(...result.itemsHarvested);
                  }
                  continue;
                }
              }
            }

            // Second priority: plant in empty farmland
            const farmPos = await this.findEmptyFarmland(bot, radius);
            if (farmPos) {
              const plantResult = await this.plantSingleCrop(
                ctx,
                farmPos,
                cropType
              );
              if (plantResult.status === 'success') {
                operationsCompleted++;
                details.planted++;
                continue;
              }
            }

            // Third priority: till new soil
            const soilPos = findNearestTillableSoil(bot, radius);
            if (soilPos) {
              const tillResult = await this.tillSingleSoil(ctx, soilPos);
              if (tillResult.status === 'success') {
                operationsCompleted++;
                details.tilled++;
                continue;
              }
            }

            // No more operations available
            continueOperations = false;
          }
          break;

        default:
          return {
            status: 'failure',
            error: {
              code: 'world.invalidPosition',
              retryable: false,
              detail: `Unknown farm action: ${action}`,
            },
            metrics: {
              durationMs: ctx.now() - startTime,
              retries: 0,
              timeouts: 0,
            },
          };
      }

      return {
        status: 'success',
        result: {
          success: true,
          action,
          operationsCompleted,
          details,
        },
        metrics: {
          durationMs: ctx.now() - startTime,
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
            error instanceof Error ? error.message : 'Unknown farming error',
        },
        metrics: {
          durationMs: duration,
          retries: 0,
          timeouts: 0,
        },
      };
    }
  }

  private async tillSingleSoil(
    ctx: LeafContext,
    position: Vec3
  ): Promise<LeafResult> {
    const tillLeaf = new TillSoilLeaf();
    return tillLeaf.run(ctx, { position });
  }

  private async plantSingleCrop(
    ctx: LeafContext,
    position: Vec3,
    cropType: string
  ): Promise<LeafResult> {
    const plantLeaf = new PlantCropLeaf();
    return plantLeaf.run(ctx, { position, cropType });
  }

  private async harvestSingleCrop(
    ctx: LeafContext,
    position: Vec3
  ): Promise<LeafResult> {
    const harvestLeaf = new HarvestCropLeaf();
    return harvestLeaf.run(ctx, { position });
  }

  private async findEmptyFarmland(
    bot: Bot,
    radius: number
  ): Promise<Vec3 | null> {
    const pos = bot.entity?.position;
    if (!pos) return null;

    let nearestFarmland: Vec3 | null = null;
    let nearestDistance = radius;

    for (let x = pos.x - radius; x <= pos.x + radius; x++) {
      for (let y = pos.y - 4; y <= pos.y + 4; y++) {
        for (let z = pos.z - radius; z <= pos.z + radius; z++) {
          const checkPos = new Vec3(x, y, z);
          const block = bot.blockAt(checkPos);

          if (block && isFarmland(block.name)) {
            // Check if farmland is empty (no crop planted)
            const cropAbove = bot.blockAt(
              new Vec3(checkPos.x, checkPos.y + 1, checkPos.z)
            );
            if (!cropAbove || !isHarvestableCrop(cropAbove.name)) {
              const distance = pos.distanceTo(checkPos);
              if (distance < nearestDistance) {
                nearestFarmland = checkPos;
                nearestDistance = distance;
              }
            }
          }
        }
      }
    }

    return nearestFarmland;
  }
}
