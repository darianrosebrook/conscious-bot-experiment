/**
 * ActionTranslator: Converts PlanStep to executable Minecraft actions
 *
 * Translates high-level planning actions into specific mineflayer bot commands
 * with proper error handling, timeouts, and verification.
 *
 * @author @darianrosebrook
 */

import { Bot } from 'mineflayer';
import { pathfinder, Movements, goals } from 'mineflayer-pathfinder';
import { Vec3 } from 'vec3';
import { PlanStep } from '@conscious-bot/planning';
import {
  MinecraftAction,
  ActionResult,
  BotConfig,
  NavigateAction,
  MineBlockAction,
  CraftAction,
  ConsumeFoodAction,
  PlaceBlockAction,
  FindShelterAction,
} from './types';

export class ActionTranslator {
  private bot: Bot;
  private config: BotConfig;
  private movements: Movements;

  constructor(bot: Bot, config: BotConfig) {
    this.bot = bot;
    this.config = config;

    // Initialize pathfinder only if bot is spawned
    if (bot.entity && bot.entity.position) {
      bot.loadPlugin(pathfinder);
      this.movements = new Movements(bot);
      this.movements.scafoldingBlocks = []; // Don't place blocks while pathfinding
      this.movements.canDig = false; // Don't break blocks while pathfinding initially
    } else {
      // Initialize with basic movements, will be updated when bot spawns
      this.movements = new Movements(bot);
      this.movements.scafoldingBlocks = [];
      this.movements.canDig = false;
    }
  }

  /**
   * Main translation function: PlanStep → MinecraftAction → Execution
   */
  async executePlanStep(step: PlanStep): Promise<ActionResult> {
    const startTime = Date.now();

    try {
      // Translate plan step to minecraft action
      const action = this.translatePlanStepToAction(step);

      // Execute the action
      const result = await this.executeAction(action);

      return {
        success: result.success,
        action,
        startTime,
        endTime: Date.now(),
        data: result.data,
        error: result.error,
      };
    } catch (error) {
      return {
        success: false,
        action: { type: 'wait', parameters: {} }, // fallback action
        startTime,
        endTime: Date.now(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Translate planning step to Minecraft action
   */
  private translatePlanStepToAction(step: PlanStep): MinecraftAction {
    const actionType = step.action.type.toLowerCase();
    const params = step.action.parameters ?? {};

    console.log(`Translating action type: ${actionType} with params:`, params);

    // Map common planning actions to Minecraft actions
    switch (actionType) {
      case 'navigate':
      case 'move':
      case 'go_to':
        return this.createNavigateAction(params);

      case 'move_forward':
        console.log('Creating move_forward action');
        return {
          type: 'move_forward',
          parameters: {
            distance: params.distance || 1,
          },
          timeout: this.config.actionTimeout,
        };

      case 'move_backward':
        return {
          type: 'move_backward',
          parameters: {
            distance: params.distance || 1,
          },
          timeout: this.config.actionTimeout,
        };

      case 'strafe_left':
        return {
          type: 'strafe_left',
          parameters: {
            distance: params.distance || 1,
          },
          timeout: this.config.actionTimeout,
        };

      case 'strafe_right':
        return {
          type: 'strafe_right',
          parameters: {
            distance: params.distance || 1,
          },
          timeout: this.config.actionTimeout,
        };

      case 'consume_food':
        console.log('Creating consume_food action');
        return {
          type: 'consume_food',
          parameters: {
            food_type: params.food_type || 'any',
            amount: params.amount || 1,
          },
          timeout: this.config.actionTimeout,
        };

      case 'place_block':
        console.log('Creating place_block action');
        return {
          type: 'place_block',
          parameters: {
            block_type: params.block_type || 'torch',
            count: params.count || 1,
            placement: params.placement || 'around_player',
          },
          timeout: this.config.actionTimeout,
        };

      case 'find_shelter':
        console.log('Creating find_shelter action');
        return {
          type: 'find_shelter',
          parameters: {
            shelter_type: params.shelter_type || 'cave_or_house',
            light_sources: params.light_sources || true,
            search_radius: params.search_radius || 10,
          },
          timeout: this.config.actionTimeout,
        };

      case 'flee':
        console.log('Creating flee action (converted to move_forward)');
        return {
          type: 'move_forward',
          parameters: {
            distance: params.distance || 10,
          },
          timeout: this.config.actionTimeout,
        };

      case 'mine_block':
        return this.createMineBlockAction(params);

      case 'craft_item':
        return this.createCraftAction(params);

      case 'mine':
      case 'break':
      case 'dig':
        return this.createMineAction(params);

      case 'pickup':
      case 'collect':
      case 'gather':
        return this.createPickupAction(params);

      case 'look':
      case 'look_at':
        return this.createLookAction(params);

      case 'wait':
      case 'pause':
        return this.createWaitAction(params);

      default:
        console.log(
          `Unknown action type: ${actionType}, inferring from description`
        );
        // Try to infer action from step description
        return this.inferActionFromDescription(step);
    }
  }

  /**
   * Create navigation action
   */
  private createNavigateAction(params: any): NavigateAction {
    let target: Vec3;

    if (params.target) {
      if (Array.isArray(params.target)) {
        target = new Vec3(params.target[0], params.target[1], params.target[2]);
      } else if (params.target.x !== undefined) {
        target = new Vec3(params.target.x, params.target.y, params.target.z);
      } else {
        target = params.target;
      }
    } else if (params.x !== undefined) {
      // Ensure bot is spawned before accessing position
      if (!this.bot.entity || !this.bot.entity.position) {
        throw new Error('Bot not fully spawned - cannot access position');
      }
      target = new Vec3(
        params.x,
        params.y || this.bot.entity.position.y,
        params.z
      );
    } else {
      // Default to nearby exploration
      if (!this.bot.entity || !this.bot.entity.position) {
        throw new Error('Bot not fully spawned - cannot access position');
      }
      const pos = this.bot.entity.position;
      target = pos.offset(Math.random() * 20 - 10, 0, Math.random() * 20 - 10);
    }

    return {
      type: 'navigate',
      parameters: {
        target,
        range: params.range || 1,
        sprint: params.sprint || false,
      },
      timeout: this.config.pathfindingTimeout,
    };
  }

  /**
   * Create mining action
   */
  private createMineAction(params: any): MineBlockAction {
    let position: Vec3;

    if (params.position) {
      if (Array.isArray(params.position)) {
        position = new Vec3(
          params.position[0],
          params.position[1],
          params.position[2]
        );
      } else if (params.position.x !== undefined) {
        position = new Vec3(
          params.position.x,
          params.position.y,
          params.position.z
        );
      } else {
        position = params.position;
      }
    } else if (params.blockType) {
      // Find nearest block of specified type
      position = this.findNearestBlock(params.blockType);
    } else {
      throw new Error('Mining action requires position or blockType parameter');
    }

    return {
      type: 'mine_block',
      parameters: {
        position,
        blockType: params.blockType,
        tool: params.tool,
      },
      timeout: this.config.actionTimeout,
    };
  }

  /**
   * Create crafting action
   */
  private createCraftAction(params: any): CraftAction {
    return {
      type: 'craft_item',
      parameters: {
        item: params.item || params.recipe || params.output,
        count: params.count || 1,
        useCraftingTable: params.useCraftingTable || false,
      },
      timeout: this.config.actionTimeout,
    };
  }

  /**
   * Create pickup action
   */
  private createPickupAction(params: any): MinecraftAction {
    return {
      type: 'pickup_item',
      parameters: {
        item: params.item,
        maxDistance: params.maxDistance || 5,
      },
      timeout: this.config.actionTimeout,
    };
  }

  /**
   * Create look action
   */
  private createLookAction(params: any): MinecraftAction {
    let target: Vec3;

    if (params.target) {
      target = Array.isArray(params.target)
        ? new Vec3(params.target[0], params.target[1], params.target[2])
        : params.target;
    } else {
      target = new Vec3(params.x, params.y, params.z);
    }

    return {
      type: 'look_at',
      parameters: { target },
      timeout: 1000,
    };
  }

  /**
   * Create wait action
   */
  private createWaitAction(params: any): MinecraftAction {
    return {
      type: 'wait',
      parameters: {
        duration: params.duration || params.time || 1000,
      },
      timeout: (params.duration || params.time || 1000) + 500,
    };
  }

  /**
   * Infer action from step description using keywords
   */
  private inferActionFromDescription(step: PlanStep): MinecraftAction {
    const description =
      step.action.type.toLowerCase() +
      ' ' +
      (step.action.parameters?.description || '').toLowerCase();

    if (
      description.includes('navigate') ||
      description.includes('move') ||
      description.includes('go')
    ) {
      return this.createNavigateAction(step.action.parameters ?? {});
    }

    if (
      description.includes('mine') ||
      description.includes('break') ||
      description.includes('dig')
    ) {
      return this.createMineAction(step.action.parameters ?? {});
    }

    if (description.includes('craft') || description.includes('make')) {
      return this.createCraftAction(step.action.parameters ?? {});
    }

    // Default to wait if we can't determine the action
    return this.createWaitAction({ duration: 2000 });
  }

  /**
   * Execute a Minecraft action
   */
  private async executeAction(
    action: MinecraftAction
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const timeout = action.timeout || this.config.actionTimeout;

    try {
      switch (action.type) {
        case 'navigate':
          return await this.executeNavigate(action as NavigateAction, timeout);

        case 'move_forward':
        case 'move_backward':
        case 'strafe_left':
        case 'strafe_right':
          return await this.executeDirectMovement(action, timeout);

        case 'consume_food':
          return await this.executeConsumeFood(
            action as ConsumeFoodAction,
            timeout
          );

        case 'place_block':
          return await this.executePlaceBlock(
            action as PlaceBlockAction,
            timeout
          );

        case 'find_shelter':
          return await this.executeFindShelter(
            action as FindShelterAction,
            timeout
          );

        case 'mine_block':
          return await this.executeMineBlock(
            action as MineBlockAction,
            timeout
          );

        case 'craft_item':
          return await this.executeCraft(action as CraftAction, timeout);

        case 'pickup_item':
          return await this.executePickup(action, timeout);

        case 'look_at':
          return await this.executeLookAt(action, timeout);

        case 'wait':
          return await this.executeWait(action, timeout);

        default:
          return {
            success: false,
            error: `Unknown action type: ${action.type}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Execute direct movement using control states
   */
  private async executeDirectMovement(
    action: MinecraftAction,
    timeout: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const { distance = 1 } = action.parameters;
    const controlState = action.type
      .replace('move_', '')
      .replace('strafe_', '');

    return new Promise((resolve) => {
      let distanceMoved = 0;
      const startPosition = this.bot.entity.position.clone();

      // Start movement
      this.bot.setControlState(controlState as any, true);

      // Stop movement after distance * 1000ms (1 second per block)
      setTimeout(() => {
        this.bot.setControlState(controlState as any, false);
        const endPosition = this.bot.entity.position;
        distanceMoved = startPosition.distanceTo(endPosition);

        resolve({
          success: true,
          data: {
            distanceMoved,
            startPosition: {
              x: startPosition.x,
              y: startPosition.y,
              z: startPosition.z,
            },
            endPosition: {
              x: endPosition.x,
              y: endPosition.y,
              z: endPosition.z,
            },
          },
        });
      }, distance * 1000);
    });
  }

  /**
   * Execute food consumption to restore health
   */
  private async executeConsumeFood(
    action: ConsumeFoodAction,
    timeout: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { food_type = 'any', amount = 1 } = action.parameters;

      // Find food in inventory
      const foodItems = this.bot.inventory
        .items()
        .filter(
          (item) =>
            item.name.includes('apple') ||
            item.name.includes('bread') ||
            item.name.includes('cooked') ||
            item.name.includes('beef') ||
            item.name.includes('chicken') ||
            item.name.includes('porkchop') ||
            item.name.includes('mutton') ||
            item.name.includes('rabbit') ||
            item.name.includes('fish') ||
            item.name.includes('potato') ||
            item.name.includes('carrot')
        );

      if (foodItems.length === 0) {
        return {
          success: false,
          error: 'No food available in inventory',
        };
      }

      // Consume the first available food item
      const foodItem = foodItems[0];
      await this.bot.consume(foodItem);

      return {
        success: true,
        data: {
          foodConsumed: foodItem.name,
          healthBefore: this.bot.health,
          foodBefore: this.bot.food,
        },
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error consuming food',
      };
    }
  }

  /**
   * Execute block placement (e.g., placing torches for light)
   */
  private async executePlaceBlock(
    action: PlaceBlockAction,
    timeout: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const {
        block_type = 'torch',
        count = 1,
        placement = 'around_player',
      } = action.parameters;

      // Find the block in inventory
      const blockItem = this.bot.inventory
        .items()
        .find(
          (item) => item.name === block_type || item.name.includes(block_type)
        );

      if (!blockItem) {
        return {
          success: false,
          error: `No ${block_type} available in inventory`,
        };
      }

      let blocksPlaced = 0;
      const botPosition = this.bot.entity.position;

      if (placement === 'around_player') {
        // Place blocks around the player in a circle
        const radius = 2;
        for (let i = 0; i < count && i < 8; i++) {
          const angle = (i / 8) * 2 * Math.PI;
          const x = botPosition.x + Math.cos(angle) * radius;
          const z = botPosition.z + Math.sin(angle) * radius;
          const y = botPosition.y;

          try {
            const targetPosition = new Vec3(x, y, z);
            await this.bot.placeBlock(targetPosition, blockItem);
            blocksPlaced++;
          } catch (error) {
            // Continue trying other positions
            continue;
          }
        }
      }

      return {
        success: blocksPlaced > 0,
        data: {
          blocksPlaced,
          blockType: block_type,
          placement: placement,
        },
        error: blocksPlaced === 0 ? 'Could not place any blocks' : undefined,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error placing block',
      };
    }
  }

  /**
   * Execute shelter finding/building
   */
  private async executeFindShelter(
    action: FindShelterAction,
    timeout: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const {
        shelter_type = 'cave_or_house',
        light_sources = true,
        search_radius = 10,
      } = action.parameters;

      const botPosition = this.bot.entity.position;
      let shelterFound = false;
      let shelterPosition = null;

      // Look for nearby caves or existing structures
      const nearbyBlocks = this.bot.findBlocks({
        matching: [0], // Air blocks (caves)
        maxDistance: search_radius,
        count: 10,
      });

      if (nearbyBlocks.length > 0) {
        // Find the closest suitable shelter position
        for (const blockPos of nearbyBlocks) {
          const position = new Vec3(blockPos.x, blockPos.y, blockPos.z);

          // Check if this position is suitable for shelter
          const isSuitable = await this.checkShelterSuitability(position);

          if (isSuitable) {
            shelterPosition = position;
            shelterFound = true;
            break;
          }
        }
      }

      if (shelterFound && shelterPosition) {
        // Move to the shelter
        await this.bot.pathfinder.goto(
          new goals.GoalBlock(
            shelterPosition.x,
            shelterPosition.y,
            shelterPosition.z
          )
        );

        // Place light sources if requested
        if (light_sources) {
          const torchItem = this.bot.inventory
            .items()
            .find(
              (item) => item.name === 'torch' || item.name.includes('torch')
            );

          if (torchItem) {
            try {
              await this.bot.placeBlock(shelterPosition, torchItem);
            } catch (error) {
              // Continue even if torch placement fails
            }
          }
        }

        return {
          success: true,
          data: {
            shelterFound: true,
            shelterPosition: {
              x: shelterPosition.x,
              y: shelterPosition.y,
              z: shelterPosition.z,
            },
            shelterType: shelter_type,
            lightSourcesPlaced: light_sources,
          },
        };
      } else {
        // No suitable shelter found, try to build a simple one
        return await this.buildSimpleShelter(botPosition, light_sources);
      }
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error finding shelter',
      };
    }
  }

  /**
   * Check if a position is suitable for shelter
   */
  private async checkShelterSuitability(position: Vec3): Promise<boolean> {
    try {
      // Check if there's enough space (at least 2x2x2)
      const blocks = [
        position,
        position.offset(1, 0, 0),
        position.offset(0, 0, 1),
        position.offset(1, 0, 1),
        position.offset(0, 1, 0),
        position.offset(1, 1, 0),
        position.offset(0, 1, 1),
        position.offset(1, 1, 1),
      ];

      for (const blockPos of blocks) {
        const block = this.bot.blockAt(blockPos);
        if (block && block.name !== 'air') {
          return false; // Not enough space
        }
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Build a simple shelter when no natural shelter is found
   */
  private async buildSimpleShelter(
    position: Vec3,
    lightSources: boolean
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      // Look for building materials
      const buildingBlocks = this.bot.inventory
        .items()
        .filter(
          (item) =>
            item.name.includes('stone') ||
            item.name.includes('dirt') ||
            item.name.includes('wood') ||
            item.name.includes('cobblestone')
        );

      if (buildingBlocks.length === 0) {
        return {
          success: false,
          error: 'No building materials available',
        };
      }

      const blockItem = buildingBlocks[0];
      let blocksPlaced = 0;

      // Build a simple 2x2x2 shelter
      const shelterPositions = [
        position.offset(0, 0, 0),
        position.offset(1, 0, 0),
        position.offset(0, 0, 1),
        position.offset(1, 0, 1),
        position.offset(0, 1, 0),
        position.offset(1, 1, 0),
        position.offset(0, 1, 1),
        position.offset(1, 1, 1),
      ];

      for (const blockPos of shelterPositions) {
        try {
          await this.bot.placeBlock(blockPos, blockItem);
          blocksPlaced++;
        } catch (error) {
          // Continue building even if some blocks fail
          continue;
        }
      }

      return {
        success: blocksPlaced > 0,
        data: {
          shelterBuilt: true,
          blocksPlaced,
          shelterType: 'simple_2x2x2',
        },
        error: blocksPlaced === 0 ? 'Could not build shelter' : undefined,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error building shelter',
      };
    }
  }

  /**
   * Execute navigation action
   */
  private async executeNavigate(
    action: NavigateAction,
    timeout: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const { target, range, sprint } = action.parameters;

    return new Promise((resolve) => {
      const goal = new goals.GoalNear(target.x, target.y, target.z, range || 1);

      this.bot.pathfinder.setMovements(this.movements);
      this.bot.pathfinder.setGoal(goal);

      if (sprint) {
        this.bot.setControlState('sprint', true);
      }

      const timeoutId = setTimeout(() => {
        this.bot.pathfinder.setGoal(null);
        this.bot.setControlState('sprint', false);
        resolve({
          success: false,
          error: 'Navigation timeout',
          data: {
            targetReached: false,
            finalPosition: this.bot.entity.position.clone(),
            distanceRemaining: this.bot.entity.position.distanceTo(target),
          },
        });
      }, timeout);

      this.bot.once('goal_reached', () => {
        clearTimeout(timeoutId);
        this.bot.setControlState('sprint', false);
        resolve({
          success: true,
          data: {
            targetReached: true,
            finalPosition: this.bot.entity.position.clone(),
            distanceRemaining: this.bot.entity.position.distanceTo(target),
          },
        });
      });

      (this.bot as any).once('path_error', (error: any) => {
        clearTimeout(timeoutId);
        this.bot.setControlState('sprint', false);
        resolve({
          success: false,
          error: `Pathfinding error: ${error}`,
          data: {
            targetReached: false,
            finalPosition: this.bot.entity.position.clone(),
            distanceRemaining: this.bot.entity.position.distanceTo(target),
          },
        });
      });
    });
  }

  /**
   * Execute mining action
   */
  private async executeMineBlock(
    action: MineBlockAction,
    timeout: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const { position, blockType, tool } = action.parameters;

    const block = this.bot.blockAt(position);
    if (!block || block.name === 'air') {
      return {
        success: false,
        error: 'No block at specified position',
      };
    }

    if (blockType && block.name !== blockType) {
      return {
        success: false,
        error: `Expected ${blockType}, found ${block.name}`,
      };
    }

    // Equip appropriate tool if specified
    if (tool) {
      const toolItem = this.bot.inventory
        .items()
        .find((item) => item.name.includes(tool));
      if (toolItem) {
        await this.bot.equip(toolItem, 'hand');
      }
    }

    try {
      await this.bot.dig(block);
      return {
        success: true,
        data: {
          blockType: block.name,
          position: position.clone(),
          toolUsed: this.bot.heldItem?.name,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Execute crafting action (2x2 only for now)
   */
  private async executeCraft(
    action: CraftAction,
    timeout: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const { item, count } = action.parameters;

    try {
      // Find recipe for the item
      const recipe = this.bot.recipesFor(
        (this.bot as any).mcData.itemsByName[item]?.id,
        null,
        1,
        null
      )[0];
      if (!recipe) {
        return {
          success: false,
          error: `No recipe found for ${item}`,
        };
      }

      // Check if we have the required ingredients
      const canCraft = (this.bot as any).canCraft(recipe, count);
      if (!canCraft) {
        return {
          success: false,
          error: `Insufficient materials to craft ${count}x ${item}`,
        };
      }

      // Craft the item
      await this.bot.craft(recipe, count, undefined);

      return {
        success: true,
        data: {
          item,
          count,
          recipe: recipe.result,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Execute pickup action
   */
  private async executePickup(
    action: MinecraftAction,
    timeout: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const { item, maxDistance } = action.parameters;

    // Find nearby items
    const droppedItems = Object.values(this.bot.entities).filter(
      (entity) =>
        entity.name === 'item' &&
        (!item ||
          (entity.metadata?.[8] as any)?.itemId ===
            (this.bot as any).mcData.itemsByName[item]?.id) &&
        entity.position.distanceTo(this.bot.entity.position) <= maxDistance
    );

    if (droppedItems.length === 0) {
      return {
        success: false,
        error: `No ${item || 'items'} found within ${maxDistance} blocks`,
      };
    }

    // Move to and collect the nearest item
    const nearestItem = droppedItems.sort(
      (a, b) =>
        a.position.distanceTo(this.bot.entity.position) -
        b.position.distanceTo(this.bot.entity.position)
    )[0];

    try {
      const goal = new goals.GoalNear(
        nearestItem.position.x,
        nearestItem.position.y,
        nearestItem.position.z,
        1
      );
      this.bot.pathfinder.setGoal(goal);

      await new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(
          () => reject(new Error('Pickup timeout')),
          timeout
        );

        this.bot.once('goal_reached', () => {
          clearTimeout(timeoutId);
          resolve();
        });

        (this.bot as any).once('path_error', (error: any) => {
          clearTimeout(timeoutId);
          reject(error);
        });
      });

      return {
        success: true,
        data: {
          itemId: nearestItem.id,
          position: nearestItem.position.clone(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Execute look at action
   */
  private async executeLookAt(
    action: MinecraftAction,
    timeout: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const { target } = action.parameters;

    try {
      await this.bot.lookAt(target);
      return {
        success: true,
        data: {
          target: target.clone(),
          yaw: this.bot.entity.yaw,
          pitch: this.bot.entity.pitch,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Execute wait action
   */
  private async executeWait(
    action: MinecraftAction,
    timeout: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const { duration } = action.parameters;

    await new Promise((resolve) => setTimeout(resolve, duration));

    return {
      success: true,
      data: { duration },
    };
  }

  // ==================== Helper Methods ====================

  /**
   * Find nearest block of specified type
   */
  private findNearestBlock(blockType: string): Vec3 {
    const bot = this.bot;

    // Ensure bot is spawned before accessing position
    if (!bot.entity || !bot.entity.position) {
      throw new Error('Bot not fully spawned - cannot access position');
    }

    const pos = bot.entity.position;

    for (let radius = 1; radius <= 10; radius++) {
      for (let x = -radius; x <= radius; x++) {
        for (let y = -radius; y <= radius; y++) {
          for (let z = -radius; z <= radius; z++) {
            const checkPos = pos.offset(x, y, z);
            const block = bot.blockAt(checkPos);
            if (block && block.name.includes(blockType)) {
              return checkPos;
            }
          }
        }
      }
    }

    throw new Error(`No ${blockType} found within 10 blocks`);
  }

  /**
   * Update pathfinding settings
   */
  updateMovements(): void {
    this.movements = new Movements(this.bot);
    this.movements.scafoldingBlocks = [];
    this.movements.canDig = false;
  }
}
