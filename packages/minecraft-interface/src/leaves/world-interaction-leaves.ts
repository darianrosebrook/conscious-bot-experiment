/**
 * World Interaction Leaves - Advanced world manipulation operations for Mineflayer
 *
 * Implements advanced world interaction capabilities including redstone mechanisms,
 * multi-block construction, environmental control, and complex automation setup
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

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a block is a redstone component
 */
function isRedstoneComponent(blockName: string): boolean {
  const redstoneBlocks = [
    'redstone_wire',
    'redstone_torch',
    'redstone_lamp',
    'lever',
    'stone_button',
    'wooden_button',
    'stone_pressure_plate',
    'wooden_pressure_plate',
    'light_weighted_pressure_plate',
    'heavy_weighted_pressure_plate',
    'iron_door',
    'wooden_door',
    'iron_trapdoor',
    'trapdoor',
    'dispenser',
    'dropper',
    'hopper',
    'piston',
    'sticky_piston',
    'observer',
    'repeater',
    'comparator',
    'daylight_detector',
    'redstone_block',
  ];
  return redstoneBlocks.includes(blockName);
}

/**
 * Check if a block is a door or trapdoor
 */
function isDoor(blockName: string): boolean {
  return blockName.includes('door') || blockName === 'trapdoor';
}

/**
 * Check if a block is interactable (buttons, levers, pressure plates)
 */
function isInteractable(blockName: string): boolean {
  return (
    blockName.includes('button') ||
    blockName.includes('lever') ||
    blockName.includes('pressure_plate')
  );
}

/**
 * Check if a block is a container that can be opened
 */
function isContainer(blockName: string): boolean {
  const containers = [
    'chest',
    'trapped_chest',
    'furnace',
    'blast_furnace',
    'smoker',
    'dispenser',
    'dropper',
    'hopper',
    'barrel',
    'shulker_box',
  ];
  return containers.includes(blockName);
}

/**
 * Check if a block is a piston
 */
function isPiston(blockName: string): boolean {
  return blockName === 'piston' || blockName === 'sticky_piston';
}

/**
 * Get the direction a piston is facing
 */
function getPistonDirection(block: any): Vec3 {
  if (!block) return new Vec3(0, 0, 0);

  // Piston facing direction is stored in metadata
  const facing = block.metadata & 0x7;
  const directions = [
    new Vec3(0, 0, -1), // North (0)
    new Vec3(0, 0, 1), // South (1)
    new Vec3(-1, 0, 0), // West (2)
    new Vec3(1, 0, 0), // East (3)
    new Vec3(0, -1, 0), // Down (4)
    new Vec3(0, 1, 0), // Up (5)
  ];

  return directions[facing] || new Vec3(0, 0, 0);
}

/**
 * Find the nearest redstone component within radius
 */
function findNearestRedstoneComponent(bot: Bot, radius: number): Vec3 | null {
  if (!bot.entity?.position) return null;

  const pos = bot.entity.position;
  let nearestComponent: Vec3 | null = null;
  let nearestDistance = radius;

  for (let x = pos.x - radius; x <= pos.x + radius; x++) {
    for (let y = pos.y - 4; y <= pos.y + 4; y++) {
      for (let z = pos.z - radius; z <= pos.z + radius; z++) {
        const checkPos = new Vec3(x, y, z);
        const block = bot.blockAt(checkPos);

        if (block && isRedstoneComponent(block.name)) {
          const distance = pos.distanceTo(checkPos);
          if (distance < nearestDistance) {
            nearestComponent = checkPos;
            nearestDistance = distance;
          }
        }
      }
    }
  }

  return nearestComponent;
}

/**
 * Check if a block can be powered by redstone
 */
function canBePowered(blockName: string): boolean {
  const powerableBlocks = [
    'redstone_lamp',
    'piston',
    'sticky_piston',
    'dispenser',
    'dropper',
    'hopper',
    'iron_door',
    'iron_trapdoor',
    'note_block',
    'tnt',
  ];
  return powerableBlocks.includes(blockName);
}

// ============================================================================
// World Interaction Leaves
// ============================================================================

/**
 * InteractWithBlockLeaf - Interacts with interactive blocks (buttons, levers, doors)
 */
export class InteractWithBlockLeaf implements LeafImpl {
  spec: LeafSpec = {
    name: 'interact_with_block',
    version: '1.0.0',
    description:
      'Interacts with interactive blocks like buttons, levers, doors, and containers',
    permissions: ['movement'],
    timeoutMs: 10000,
    retries: 3,
    inputSchema: {
      type: 'object',
      properties: {
        position: {
          type: 'object',
          description:
            'Position of the block to interact with (optional, will find nearest if not specified)',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            z: { type: 'number' },
          },
        },
        interactionType: {
          type: 'string',
          description: 'Type of interaction (click, use, open, close)',
          enum: ['click', 'use', 'open', 'close'],
          default: 'use',
        },
        radius: {
          type: 'number',
          description: 'Search radius for interactive blocks',
          default: 16,
        },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        position: { type: 'object' },
        blockType: { type: 'string' },
        interactionType: { type: 'string' },
        newState: { type: 'string' },
      },
    },
  };

  async run(ctx: LeafContext, args: any = {}): Promise<LeafResult> {
    const startTime = ctx.now();
    const { position, interactionType = 'use', radius = 16 } = args;

    try {
      const bot = ctx.bot;
      let targetPos: Vec3;
      let block: any;

      // Find target block
      if (position) {
        targetPos = new Vec3(position.x, position.y, position.z);
        block = bot.blockAt(targetPos);

        if (!block) {
          return {
            status: 'failure',
            error: {
              code: 'world.invalidPosition',
              retryable: false,
              detail: `No block found at ${position.x}, ${position.y}, ${position.z}`,
            },
            metrics: {
              durationMs: ctx.now() - startTime,
              retries: 0,
              timeouts: 0,
            },
          };
        }
      } else {
        // Search for nearest interactive block
        const foundPos = findNearestRedstoneComponent(bot, radius);
        if (!foundPos) {
          return {
            status: 'failure',
            error: {
              code: 'world.invalidPosition',
              retryable: true,
              detail: `No interactive blocks found within ${radius} blocks`,
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

      if (!block) {
        return {
          status: 'failure',
          error: {
            code: 'world.invalidPosition',
            retryable: false,
            detail: 'Block became unavailable during interaction',
          },
          metrics: {
            durationMs: ctx.now() - startTime,
            retries: 0,
            timeouts: 0,
          },
        };
      }

      // Check if block is interactable
      if (
        !isInteractable(block.name) &&
        !isDoor(block.name) &&
        !isContainer(block.name)
      ) {
        return {
          status: 'failure',
          error: {
            code: 'world.invalidPosition',
            retryable: false,
            detail: `${block.name} is not an interactive block`,
          },
          metrics: {
            durationMs: ctx.now() - startTime,
            retries: 0,
            timeouts: 0,
          },
        };
      }

      // Perform interaction
      let newState = 'unknown';

      try {
        if (isContainer(block.name)) {
          // For containers, we use the container interaction system
          const container = await bot.openContainer(block as any);
          await container.close();
          newState = 'closed';
        } else if (isDoor(block.name)) {
          // For doors, activate to toggle state
          await bot.activateBlock(block);
          newState = 'toggled';
        } else {
          // For buttons, levers, pressure plates
          await bot.activateBlock(block);
          newState = 'activated';
        }

        return {
          status: 'success',
          result: {
            success: true,
            position: { x: targetPos.x, y: targetPos.y, z: targetPos.z },
            blockType: block.name,
            interactionType,
            newState,
          },
          metrics: {
            durationMs: ctx.now() - startTime,
            retries: 0,
            timeouts: 0,
          },
        };
      } catch (error) {
        return {
          status: 'failure',
          error: {
            code: 'world.invalidPosition',
            retryable: true,
            detail: `Failed to interact with ${block.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
          metrics: {
            durationMs: ctx.now() - startTime,
            retries: 0,
            timeouts: 0,
          },
        };
      }
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
              : 'Unknown world interaction error',
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
 * OperatePistonLeaf - Controls piston operations (extend/retract)
 */
export class OperatePistonLeaf implements LeafImpl {
  spec: LeafSpec = {
    name: 'operate_piston',
    version: '1.0.0',
    description: 'Operates pistons to extend or retract them',
    permissions: ['movement'],
    timeoutMs: 15000,
    retries: 3,
    inputSchema: {
      type: 'object',
      properties: {
        position: {
          type: 'object',
          description: 'Position of the piston to operate',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            z: { type: 'number' },
          },
        },
        action: {
          type: 'string',
          description: 'Action to perform on the piston',
          enum: ['extend', 'retract', 'toggle'],
          default: 'toggle',
        },
        powerSource: {
          type: 'object',
          description:
            'Position of redstone power source (lever, button, etc.)',
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
        position: { type: 'object' },
        pistonType: { type: 'string' },
        action: { type: 'string' },
        newState: { type: 'string' },
        affectedBlocks: { type: 'number' },
      },
    },
  };

  async run(ctx: LeafContext, args: any = {}): Promise<LeafResult> {
    const startTime = ctx.now();
    const { position, action = 'toggle', powerSource } = args;

    try {
      const bot = ctx.bot;

      if (!position) {
        return {
          status: 'failure',
          error: {
            code: 'world.invalidPosition',
            retryable: false,
            detail: 'Piston position is required',
          },
          metrics: {
            durationMs: ctx.now() - startTime,
            retries: 0,
            timeouts: 0,
          },
        };
      }

      const pistonPos = new Vec3(position.x, position.y, position.z);
      const pistonBlock = bot.blockAt(pistonPos);

      if (!pistonBlock || !isPiston(pistonBlock.name)) {
        return {
          status: 'failure',
          error: {
            code: 'world.invalidPosition',
            retryable: false,
            detail: `No piston found at ${position.x}, ${position.y}, ${position.z}`,
          },
          metrics: {
            durationMs: ctx.now() - startTime,
            retries: 0,
            timeouts: 0,
          },
        };
      }

      // Check if piston is already in desired state
      const isExtended = (pistonBlock.metadata & 0x8) !== 0; // Bit 3 indicates extended state
      const shouldExtend =
        action === 'extend' || (action === 'toggle' && !isExtended);
      const shouldRetract =
        action === 'retract' || (action === 'toggle' && isExtended);

      if ((shouldExtend && isExtended) || (shouldRetract && !isExtended)) {
        return {
          status: 'success',
          result: {
            success: true,
            position: { x: pistonPos.x, y: pistonPos.y, z: pistonPos.z },
            pistonType: pistonBlock.name,
            action,
            newState: isExtended ? 'extended' : 'retracted',
            affectedBlocks: 0, // Already in desired state
          },
          metrics: {
            durationMs: ctx.now() - startTime,
            retries: 0,
            timeouts: 0,
          },
        };
      }

      // Power the piston using redstone power source
      if (powerSource) {
        const powerPos = new Vec3(powerSource.x, powerSource.y, powerSource.z);
        const powerBlock = bot.blockAt(powerPos);

        if (powerBlock && isInteractable(powerBlock.name)) {
          // Activate the power source
          await bot.activateBlock(powerBlock);

          // Wait for piston to respond
          await new Promise((resolve) => setTimeout(resolve, 500));

          // Check new piston state
          const updatedPistonBlock = bot.blockAt(pistonPos);
          const finalState =
            updatedPistonBlock && (updatedPistonBlock.metadata & 0x8) !== 0;

          return {
            status: 'success',
            result: {
              success: true,
              position: { x: pistonPos.x, y: pistonPos.y, z: pistonPos.z },
              pistonType: updatedPistonBlock?.name || pistonBlock.name,
              action,
              newState: finalState ? 'extended' : 'retracted',
              affectedBlocks: 1,
            },
            metrics: {
              durationMs: ctx.now() - startTime,
              retries: 0,
              timeouts: 0,
            },
          };
        } else {
          return {
            status: 'failure',
            error: {
              code: 'world.invalidPosition',
              retryable: false,
              detail: `Invalid power source at ${powerSource.x}, ${powerSource.y}, ${powerSource.z}`,
            },
            metrics: {
              durationMs: ctx.now() - startTime,
              retries: 0,
              timeouts: 0,
            },
          };
        }
      } else {
        // Try to find nearby redstone power source
        const nearbyPowerSource = findNearestRedstoneComponent(bot, 5);
        if (nearbyPowerSource) {
          const powerBlock = bot.blockAt(nearbyPowerSource);
          if (powerBlock && isInteractable(powerBlock.name)) {
            await bot.activateBlock(powerBlock);

            await new Promise((resolve) => setTimeout(resolve, 500));

            const updatedPistonBlock = bot.blockAt(pistonPos);
            const finalState =
              updatedPistonBlock && (updatedPistonBlock.metadata & 0x8) !== 0;

            return {
              status: 'success',
              result: {
                success: true,
                position: { x: pistonPos.x, y: pistonPos.y, z: pistonPos.z },
                pistonType: updatedPistonBlock?.name || pistonBlock.name,
                action,
                newState: finalState ? 'extended' : 'retracted',
                affectedBlocks: 1,
              },
              metrics: {
                durationMs: ctx.now() - startTime,
                retries: 0,
                timeouts: 0,
              },
            };
          }
        }
      }

      return {
        status: 'failure',
        error: {
          code: 'world.invalidPosition',
          retryable: true,
          detail: 'No suitable redstone power source found for piston',
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
          code: 'movement.timeout',
          retryable: true,
          detail:
            error instanceof Error
              ? error.message
              : 'Unknown piston operation error',
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
 * ControlRedstoneLeaf - Controls redstone systems and mechanisms
 */
export class ControlRedstoneLeaf implements LeafImpl {
  spec: LeafSpec = {
    name: 'control_redstone',
    version: '1.0.0',
    description:
      'Controls redstone systems including power management and mechanism operation',
    permissions: ['movement'],
    timeoutMs: 20000,
    retries: 3,
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'Redstone action to perform',
          enum: ['power_on', 'power_off', 'toggle', 'pulse'],
          default: 'toggle',
        },
        targetPosition: {
          type: 'object',
          description: 'Position of the target device (lamp, door, etc.)',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            z: { type: 'number' },
          },
        },
        powerSource: {
          type: 'object',
          description:
            'Position of redstone power source (optional, will search nearby)',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            z: { type: 'number' },
          },
        },
        radius: {
          type: 'number',
          description: 'Search radius for redstone components',
          default: 10,
        },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        action: { type: 'string' },
        targetPosition: { type: 'object' },
        targetDevice: { type: 'string' },
        powerSource: { type: 'object' },
        newState: { type: 'string' },
        affectedDevices: { type: 'number' },
      },
    },
  };

  async run(ctx: LeafContext, args: any = {}): Promise<LeafResult> {
    const startTime = ctx.now();
    const {
      action = 'toggle',
      targetPosition,
      powerSource,
      radius = 10,
    } = args;

    try {
      const bot = ctx.bot;

      if (!targetPosition) {
        return {
          status: 'failure',
          error: {
            code: 'world.invalidPosition',
            retryable: false,
            detail: 'Target position is required for redstone control',
          },
          metrics: {
            durationMs: ctx.now() - startTime,
            retries: 0,
            timeouts: 0,
          },
        };
      }

      const targetPos = new Vec3(
        targetPosition.x,
        targetPosition.y,
        targetPosition.z
      );
      const targetBlock = bot.blockAt(targetPos);

      if (!targetBlock || !canBePowered(targetBlock.name)) {
        return {
          status: 'failure',
          error: {
            code: 'world.invalidPosition',
            retryable: false,
            detail: `${targetBlock?.name || 'Unknown block'} at ${targetPosition.x}, ${targetPosition.y}, ${targetPosition.z} cannot be powered by redstone`,
          },
          metrics: {
            durationMs: ctx.now() - startTime,
            retries: 0,
            timeouts: 0,
          },
        };
      }

      // Determine power source to use
      let powerPos: Vec3 | null = null;

      if (powerSource) {
        powerPos = new Vec3(powerSource.x, powerSource.y, powerSource.z);
      } else {
        // Search for nearby redstone power source
        powerPos = findNearestRedstoneComponent(bot, radius);
      }

      if (!powerPos) {
        return {
          status: 'failure',
          error: {
            code: 'world.invalidPosition',
            retryable: true,
            detail: `No redstone power source found within ${radius} blocks of target`,
          },
          metrics: {
            durationMs: ctx.now() - startTime,
            retries: 0,
            timeouts: 0,
          },
        };
      }

      const powerBlock = bot.blockAt(powerPos);
      if (!powerBlock || !isInteractable(powerBlock.name)) {
        return {
          status: 'failure',
          error: {
            code: 'world.invalidPosition',
            retryable: true,
            detail: `Power source at ${powerPos.x}, ${powerPos.y}, ${powerPos.z} is not interactable`,
          },
          metrics: {
            durationMs: ctx.now() - startTime,
            retries: 0,
            timeouts: 0,
          },
        };
      }

      // Get initial state of target device
      const initialPowered = targetBlock.metadata > 0; // Most redstone devices use metadata for power state

      // Perform the redstone operation
      switch (action) {
        case 'power_on':
          if (!initialPowered) {
            await bot.activateBlock(powerBlock);
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          break;

        case 'power_off':
          if (initialPowered) {
            await bot.activateBlock(powerBlock);
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          break;

        case 'pulse':
          // Quick on-off pulse
          await bot.activateBlock(powerBlock);
          await new Promise((resolve) => setTimeout(resolve, 100));
          await bot.activateBlock(powerBlock);
          await new Promise((resolve) => setTimeout(resolve, 100));
          break;

        case 'toggle':
        default:
          await bot.activateBlock(powerBlock);
          await new Promise((resolve) => setTimeout(resolve, 100));
          break;
      }

      // Check final state
      const finalTargetBlock = bot.blockAt(targetPos);
      const finalPowered = finalTargetBlock && finalTargetBlock.metadata > 0;

      return {
        status: 'success',
        result: {
          success: true,
          action,
          targetPosition: { x: targetPos.x, y: targetPos.y, z: targetPos.z },
          targetDevice: targetBlock.name,
          powerSource: { x: powerPos.x, y: powerPos.y, z: powerPos.z },
          newState: finalPowered ? 'powered' : 'unpowered',
          affectedDevices: 1,
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
          code: 'movement.timeout',
          retryable: true,
          detail:
            error instanceof Error
              ? error.message
              : 'Unknown redstone control error',
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
 * BuildStructureLeaf - Constructs multi-block structures
 */
export class BuildStructureLeaf implements LeafImpl {
  spec: LeafSpec = {
    name: 'build_structure',
    version: '1.0.0',
    description: 'Constructs multi-block structures using available materials',
    permissions: [
      'movement',
      'dig',
      'place',
      'container.read',
      'container.write',
    ],
    timeoutMs: 300000, // 5 minutes for complex structures
    retries: 5,
    inputSchema: {
      type: 'object',
      properties: {
        structureType: {
          type: 'string',
          description: 'Type of structure to build',
          enum: ['house', 'tower', 'wall', 'platform', 'stairs', 'custom'],
          default: 'house',
        },
        position: {
          type: 'object',
          description: 'Base position for structure construction',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            z: { type: 'number' },
          },
        },
        dimensions: {
          type: 'object',
          description: 'Structure dimensions (width, height, depth)',
          properties: {
            width: { type: 'number', default: 5 },
            height: { type: 'number', default: 3 },
            depth: { type: 'number', default: 5 },
          },
        },
        material: {
          type: 'string',
          description: 'Primary building material',
          default: 'cobblestone',
        },
        autoGather: {
          type: 'boolean',
          description: 'Automatically gather required materials',
          default: true,
        },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        structureType: { type: 'string' },
        position: { type: 'object' },
        dimensions: { type: 'object' },
        material: { type: 'string' },
        blocksPlaced: { type: 'number' },
        timeElapsed: { type: 'number' },
        completionPercentage: { type: 'number' },
      },
    },
  };

  async run(ctx: LeafContext, args: any = {}): Promise<LeafResult> {
    const startTime = ctx.now();
    const {
      structureType = 'house',
      position,
      dimensions = { width: 5, height: 3, depth: 5 },
      material = 'cobblestone',
      autoGather = true,
    } = args;

    try {
      const bot = ctx.bot;

      if (!position) {
        return {
          status: 'failure',
          error: {
            code: 'world.invalidPosition',
            retryable: false,
            detail: 'Structure base position is required',
          },
          metrics: {
            durationMs: ctx.now() - startTime,
            retries: 0,
            timeouts: 0,
          },
        };
      }

      const basePos = new Vec3(position.x, position.y, position.z);

      // Calculate total blocks needed
      const totalBlocks = this.calculateBlocksNeeded(structureType, dimensions);

      // Check material availability
      const availableMaterial = this.checkMaterialAvailability(
        bot,
        material,
        totalBlocks
      );

      if (!availableMaterial.hasEnough && !autoGather) {
        return {
          status: 'failure',
          error: {
            code: 'inventory.missingItem',
            retryable: true,
            detail: `Insufficient ${material} for ${structureType}. Need ${totalBlocks}, have ${availableMaterial.count}`,
          },
          metrics: {
            durationMs: ctx.now() - startTime,
            retries: 0,
            timeouts: 0,
          },
        };
      }

      // Gather materials if needed and enabled
      if (!availableMaterial.hasEnough && autoGather) {
        // This would trigger farming/mining operations - simplified for now
        return {
          status: 'failure',
          error: {
            code: 'world.insufficientMaterials',
            retryable: true,
            detail:
              'Auto-gathering materials not yet implemented - manual material collection required',
          },
          metrics: {
            durationMs: ctx.now() - startTime,
            retries: 0,
            timeouts: 0,
          },
        };
      }

      // Build the structure based on type
      let blocksPlaced = 0;
      const buildStart = ctx.now();

      switch (structureType) {
        case 'house':
          blocksPlaced = await this.buildHouseStructure(
            ctx,
            basePos,
            dimensions,
            material
          );
          break;

        case 'tower':
          blocksPlaced = await this.buildTowerStructure(
            ctx,
            basePos,
            dimensions,
            material
          );
          break;

        case 'wall':
          blocksPlaced = await this.buildWallStructure(
            ctx,
            basePos,
            dimensions,
            material
          );
          break;

        case 'platform':
          blocksPlaced = await this.buildPlatformStructure(
            ctx,
            basePos,
            dimensions,
            material
          );
          break;

        default:
          return {
            status: 'failure',
            error: {
              code: 'world.invalidPosition',
              retryable: false,
              detail: `Unknown structure type: ${structureType}`,
            },
            metrics: {
              durationMs: ctx.now() - startTime,
              retries: 0,
              timeouts: 0,
            },
          };
      }

      const buildTime = ctx.now() - buildStart;
      const completionPercentage =
        totalBlocks > 0 ? (blocksPlaced / totalBlocks) * 100 : 100;

      return {
        status: 'success',
        result: {
          success: true,
          structureType,
          position: { x: basePos.x, y: basePos.y, z: basePos.z },
          dimensions,
          material,
          blocksPlaced,
          timeElapsed: buildTime,
          completionPercentage: Math.round(completionPercentage),
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
            error instanceof Error
              ? error.message
              : 'Unknown structure building error',
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
   * Place a block at the given air position by finding an adjacent solid
   * reference block and calling bot.placeBlock(refBlock, faceVec).
   * Returns true if placed, false if no valid reference found.
   */
  private async placeBlockAtPos(
    bot: Bot,
    blockPos: Vec3,
    material: string
  ): Promise<boolean> {
    const materialItem = bot.inventory
      .items()
      .find((item: any) => item.name === material);
    if (!materialItem) return false;

    const faceOffsets: Array<{ offset: Vec3; face: Vec3 }> = [
      { offset: new Vec3(0, -1, 0), face: new Vec3(0, 1, 0) },
      { offset: new Vec3(0, 1, 0), face: new Vec3(0, -1, 0) },
      { offset: new Vec3(1, 0, 0), face: new Vec3(-1, 0, 0) },
      { offset: new Vec3(-1, 0, 0), face: new Vec3(1, 0, 0) },
      { offset: new Vec3(0, 0, 1), face: new Vec3(0, 0, -1) },
      { offset: new Vec3(0, 0, -1), face: new Vec3(0, 0, 1) },
    ];

    for (const { offset, face } of faceOffsets) {
      const refPos = blockPos.plus(offset);
      const refBlock = bot.blockAt(refPos);
      if (refBlock && refBlock.boundingBox === 'block') {
        await bot.equip(materialItem, 'hand');
        await bot.placeBlock(refBlock, face);
        return true;
      }
    }
    return false;
  }

  private calculateBlocksNeeded(
    structureType: string,
    dimensions: any
  ): number {
    switch (structureType) {
      case 'house':
        return dimensions.width * dimensions.depth * dimensions.height; // Basic filled structure
      case 'tower':
        return Math.PI * Math.pow(dimensions.width / 2, 2) * dimensions.height; // Circular tower
      case 'wall':
        return dimensions.width * dimensions.height; // Simple wall
      case 'platform':
        return dimensions.width * dimensions.depth; // Flat platform
      default:
        return 0;
    }
  }

  private checkMaterialAvailability(
    bot: Bot,
    material: string,
    needed: number
  ): { hasEnough: boolean; count: number } {
    const materialItems = bot.inventory
      .items()
      .filter((item) => item.name === material);
    const count = materialItems.reduce((sum, item) => sum + item.count, 0);
    return { hasEnough: count >= needed, count };
  }

  private async buildHouseStructure(
    ctx: LeafContext,
    basePos: Vec3,
    dimensions: any,
    material: string
  ): Promise<number> {
    const bot = ctx.bot;
    let blocksPlaced = 0;

    // Build walls and floor (simplified)
    for (let x = 0; x < dimensions.width; x++) {
      for (let z = 0; z < dimensions.depth; z++) {
        for (let y = 0; y < dimensions.height; y++) {
          const blockPos = basePos.offset(x, y, z);
          const block = bot.blockAt(blockPos);

          // Only place if air or replaceable
          if (
            !block ||
            block.name === 'air' ||
            block.name.includes('tall_grass')
          ) {
            if (await this.placeBlockAtPos(bot, blockPos, material)) {
              blocksPlaced++;
            }
          }
        }
      }
    }

    return blocksPlaced;
  }

  private async buildTowerStructure(
    ctx: LeafContext,
    basePos: Vec3,
    dimensions: any,
    material: string
  ): Promise<number> {
    const bot = ctx.bot;
    let blocksPlaced = 0;

    // Build circular tower (simplified)
    const radius = Math.floor(dimensions.width / 2);
    for (let y = 0; y < dimensions.height; y++) {
      for (let x = -radius; x <= radius; x++) {
        for (let z = -radius; z <= radius; z++) {
          if (x * x + z * z <= radius * radius) {
            const blockPos = basePos.offset(x, y, z);
            const block = bot.blockAt(blockPos);

            if (!block || block.name === 'air') {
              if (await this.placeBlockAtPos(bot, blockPos, material)) {
                blocksPlaced++;
              }
            }
          }
        }
      }
    }

    return blocksPlaced;
  }

  private async buildWallStructure(
    ctx: LeafContext,
    basePos: Vec3,
    dimensions: any,
    material: string
  ): Promise<number> {
    const bot = ctx.bot;
    let blocksPlaced = 0;

    // Build wall
    for (let x = 0; x < dimensions.width; x++) {
      for (let y = 0; y < dimensions.height; y++) {
        const blockPos = basePos.offset(x, y, 0);
        const block = bot.blockAt(blockPos);

        if (!block || block.name === 'air') {
          if (await this.placeBlockAtPos(bot, blockPos, material)) {
            blocksPlaced++;
          }
        }
      }
    }

    return blocksPlaced;
  }

  private async buildPlatformStructure(
    ctx: LeafContext,
    basePos: Vec3,
    dimensions: any,
    material: string
  ): Promise<number> {
    const bot = ctx.bot;
    let blocksPlaced = 0;

    // Build flat platform
    for (let x = 0; x < dimensions.width; x++) {
      for (let z = 0; z < dimensions.depth; z++) {
        const blockPos = basePos.offset(x, 0, z);
        const block = bot.blockAt(blockPos);

        if (!block || block.name === 'air') {
          if (await this.placeBlockAtPos(bot, blockPos, material)) {
            blocksPlaced++;
          }
        }
      }
    }

    return blocksPlaced;
  }
}

/**
 * EnvironmentalControlLeaf - Controls environmental factors
 */
export class EnvironmentalControlLeaf implements LeafImpl {
  spec: LeafSpec = {
    name: 'control_environment',
    version: '1.0.0',
    description: 'Controls environmental factors like weather and time',
    permissions: ['movement', 'chat'],
    timeoutMs: 10000,
    retries: 2,
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'Environmental action to perform',
          enum: [
            'set_time',
            'set_weather',
            'toggle_rain',
            'set_day',
            'set_night',
          ],
          default: 'set_day',
        },
        time: {
          type: 'number',
          description: 'Time of day (0-24000)',
          minimum: 0,
          maximum: 24000,
        },
        weather: {
          type: 'string',
          description: 'Weather type',
          enum: ['clear', 'rain', 'thunder'],
        },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        action: { type: 'string' },
        previousState: { type: 'object' },
        newState: { type: 'object' },
        environmentChanged: { type: 'boolean' },
      },
    },
  };

  async run(ctx: LeafContext, args: any = {}): Promise<LeafResult> {
    const startTime = ctx.now();
    const { action = 'set_day', time, weather } = args;

    try {
      const bot = ctx.bot;

      // Get current environmental state
      const currentTime = bot.time.timeOfDay;
      const isRaining = bot.isRaining;
      const isThundering = bot.isRaining && (bot as any).thunderTime > 0;

      const previousState = {
        time: currentTime,
        weather: isThundering ? 'thunder' : isRaining ? 'rain' : 'clear',
        dayTime: currentTime < 13000,
        nightTime: currentTime >= 13000,
      };

      let environmentChanged = false;
      let newState = { ...previousState };

      switch (action) {
        case 'set_time':
          if (time !== undefined && time !== currentTime) {
            // Use Minecraft command to set time
            await bot.chat(`/time set ${time}`);
            newState.time = time;
            newState.dayTime = time < 13000;
            newState.nightTime = time >= 13000;
            environmentChanged = true;
          }
          break;

        case 'set_weather':
          if (weather && weather !== previousState.weather) {
            const weatherCommand = weather === 'clear' ? 'clear' : 'rain';
            await bot.chat(`/weather ${weatherCommand}`);
            newState.weather = weather;
            environmentChanged = true;
          }
          break;

        case 'toggle_rain':
          const newWeather = isRaining ? 'clear' : 'rain';
          await bot.chat(`/weather ${newWeather}`);
          newState.weather = newWeather;
          environmentChanged = true;
          break;

        case 'set_day':
          if (!previousState.dayTime) {
            await bot.chat('/time set day');
            newState.time = 1000;
            newState.dayTime = true;
            newState.nightTime = false;
            environmentChanged = true;
          }
          break;

        case 'set_night':
          if (!previousState.nightTime) {
            await bot.chat('/time set night');
            newState.time = 13000;
            newState.dayTime = false;
            newState.nightTime = true;
            environmentChanged = true;
          }
          break;
      }

      // Wait a moment for changes to take effect
      await new Promise((resolve) => setTimeout(resolve, 500));

      return {
        status: 'success',
        result: {
          success: true,
          action,
          previousState,
          newState,
          environmentChanged,
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
          code: 'movement.timeout',
          retryable: true,
          detail:
            error instanceof Error
              ? error.message
              : 'Unknown environmental control error',
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
