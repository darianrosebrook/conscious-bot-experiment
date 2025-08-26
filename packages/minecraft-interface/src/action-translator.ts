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
            distance: params.distance || 5,
          },
          timeout: 10000,
        };

      case 'mine_block':
      case 'break_block':
        return {
          type: 'mine_block',
          parameters: {
            position: params.position,
            tool: params.tool,
          },
          timeout: 15000,
        };

      case 'craft':
      case 'make':
        return {
          type: 'craft',
          parameters: {
            item: params.item,
            amount: params.amount || 1,
          },
          timeout: 20000,
        };

      case 'consume_food':
        console.log('Creating consume_food action');
        return {
          type: 'consume_food',
          parameters: {
            food_type: params.food_type || 'any',
            amount: params.amount || 1,
          },
          timeout: 10000,
        };

      case 'experiment_with_item':
      case 'try_item':
        console.log('Creating experimental item interaction');
        return {
          type: 'experiment_with_item',
          parameters: {
            item_type: params.item_type || 'unknown',
            action: params.action || 'consume', // consume, place, craft, etc.
          },
          timeout: 15000,
        };

      case 'explore_item_properties':
        return {
          type: 'explore_item_properties',
          parameters: {
            item_type: params.item_type,
            properties_to_test: params.properties_to_test || [
              'edible',
              'placeable',
              'craftable',
            ],
          },
          timeout: 20000,
        };

      case 'chat':
      case 'say':
        console.log('Creating chat action');
        return {
          type: 'chat',
          parameters: {
            message: params.message || 'Hello!',
          },
          timeout: 5000,
        };

      default:
        console.log(
          `Unknown action type: ${actionType}, inferring from description`
        );
        // Try to infer action from description
        const description = step.action.description?.toLowerCase() || '';

        if (description.includes('move') || description.includes('go')) {
          return this.createNavigateAction(params);
        }

        if (description.includes('mine') || description.includes('break')) {
          return {
            type: 'mine_block',
            parameters: params,
            timeout: 15000,
          };
        }

        if (
          description.includes('eat') ||
          description.includes('consume') ||
          description.includes('food')
        ) {
          return {
            type: 'consume_food',
            parameters: params,
            timeout: 10000,
          };
        }

        if (
          description.includes('try') ||
          description.includes('experiment') ||
          description.includes('test')
        ) {
          return {
            type: 'experiment_with_item',
            parameters: params,
            timeout: 15000,
          };
        }

        // Default to wait action
        return {
          type: 'wait',
          parameters: {
            duration: 2000,
          },
          timeout: 2500,
        };
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
            action.timeout || this.config.actionTimeout
          );

        case 'experiment_with_item':
          return await this.executeExperimentWithItem(
            action,
            action.timeout || this.config.actionTimeout
          );

        case 'explore_item_properties':
          return await this.executeExploreItemProperties(
            action,
            action.timeout || this.config.actionTimeout
          );

        case 'place_block':
          return await this.executePlaceBlock(
            action as PlaceBlockAction,
            action.timeout || this.config.actionTimeout
          );

        case 'find_shelter':
          return await this.executeFindShelter(
            action as FindShelterAction,
            action.timeout || this.config.actionTimeout
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

      // Find food in inventory - use discovery-based approach
      const foodItems = this.bot.inventory.items().filter((item) => {
        const itemName = item.name.toLowerCase();

        // Discovery-based food detection:
        // 1. Items that have been successfully consumed before (would be stored in memory)
        // 2. Items that look potentially edible based on name patterns
        // 3. Items that other entities have been observed consuming

        // For now, use basic heuristics that could be learned:
        const potentiallyEdible =
          itemName.includes('apple') ||
          itemName.includes('bread') ||
          itemName.includes('cooked') ||
          itemName.includes('food') ||
          itemName.includes('meal') ||
          itemName.includes('beef') ||
          itemName.includes('chicken') ||
          itemName.includes('pork') ||
          itemName.includes('fish') ||
          itemName.includes('potato') ||
          itemName.includes('carrot');

        // In a true discovery system, this would check:
        // - Memory of successful consumption attempts
        // - Observed effects on health/hunger
        // - Learning from other entities
        // - Trial and error results

        return potentiallyEdible;
      });

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
   * Execute crafting action (supports both 2x2 and 3x3 crafting)
   */
  private async executeCraft(
    action: CraftAction,
    timeout: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const { item, count, useCraftingTable } = action.parameters;

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

      // Handle 3x3 crafting with crafting table
      if (useCraftingTable) {
        // Find nearby crafting table
        const craftingTable = this.bot.findBlock({
          matching: (this.bot as any).mcData.blocksByName.crafting_table.id,
          maxDistance: 3,
        });

        if (!craftingTable) {
          return {
            success: false,
            error: 'No crafting table found within range',
          };
        }

        // Move to crafting table
        await this.bot.pathfinder.goto(
          new goals.GoalNear(
            craftingTable.position.x,
            craftingTable.position.y,
            craftingTable.position.z,
            2
          )
        );

        // Use the crafting table
        await this.bot.useBlock(craftingTable);
      }

      // Craft the item
      await this.bot.craft(recipe, count, undefined);

      return {
        success: true,
        data: {
          item,
          count,
          recipe: recipe.result,
          usedCraftingTable: useCraftingTable || false,
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

  /**
   * Execute experimental item interaction to discover properties
   */
  private async executeExperimentWithItem(
    action: any,
    timeout: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { item_type = 'any', action: experimentAction = 'consume' } =
        action.parameters;

      // Find items to experiment with
      const items = this.bot.inventory.items();
      let targetItems = items;

      if (item_type !== 'any') {
        targetItems = items.filter((item) =>
          item.name.toLowerCase().includes(item_type.toLowerCase())
        );
      }

      if (targetItems.length === 0) {
        return {
          success: false,
          error: `No items found for experimentation with type: ${item_type}`,
        };
      }

      // Choose an item to experiment with
      const itemToTest = targetItems[0];
      const healthBefore = this.bot.health;
      const foodBefore = this.bot.food;

      let experimentResult = null;

      // Try different interactions based on the experiment action
      switch (experimentAction) {
        case 'consume':
          try {
            await this.bot.consume(itemToTest);
            experimentResult = {
              action: 'consume',
              success: true,
              healthChange: this.bot.health - healthBefore,
              foodChange: this.bot.food - foodBefore,
            };
          } catch (error) {
            experimentResult = {
              action: 'consume',
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            };
          }
          break;

        case 'place':
          try {
            const position = this.bot.entity.position.offset(0, 0, 1);
            await this.bot.placeBlock(position, itemToTest);
            experimentResult = {
              action: 'place',
              success: true,
              position: position,
            };
          } catch (error) {
            experimentResult = {
              action: 'place',
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            };
          }
          break;

        default:
          return {
            success: false,
            error: `Unknown experiment action: ${experimentAction}`,
          };
      }

      return {
        success: true,
        data: {
          itemTested: itemToTest.name,
          experimentAction,
          result: experimentResult,
          discovery: {
            itemType: itemToTest.name,
            isEdible:
              experimentAction === 'consume' &&
              experimentResult.success &&
              experimentResult.healthChange > 0,
            isPlaceable:
              experimentAction === 'place' && experimentResult.success,
            healthEffect: experimentResult.healthChange || 0,
            foodEffect: experimentResult.foodChange || 0,
          },
        },
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error during experimentation',
      };
    }
  }

  /**
   * Execute comprehensive item property exploration
   */
  private async executeExploreItemProperties(
    action: any,
    timeout: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { item_type, properties_to_test = ['edible', 'placeable'] } =
        action.parameters;

      const items = this.bot.inventory.items();
      const targetItems = items.filter((item) =>
        item.name.toLowerCase().includes(item_type.toLowerCase())
      );

      if (targetItems.length === 0) {
        return {
          success: false,
          error: `No items found for property exploration: ${item_type}`,
        };
      }

      const itemToTest = targetItems[0];
      const healthBefore = this.bot.health;
      const foodBefore = this.bot.food;
      const discoveries = [];

      // Test each property
      for (const property of properties_to_test) {
        try {
          switch (property) {
            case 'edible':
              try {
                await this.bot.consume(itemToTest);
                discoveries.push({
                  property: 'edible',
                  result: true,
                  healthEffect: this.bot.health - healthBefore,
                  foodEffect: this.bot.food - foodBefore,
                });
              } catch (error) {
                discoveries.push({
                  property: 'edible',
                  result: false,
                  error:
                    error instanceof Error ? error.message : 'Cannot consume',
                });
              }
              break;

            case 'placeable':
              try {
                const position = this.bot.entity.position.offset(0, 0, 1);
                await this.bot.placeBlock(position, itemToTest);
                discoveries.push({
                  property: 'placeable',
                  result: true,
                  position: position,
                });
              } catch (error) {
                discoveries.push({
                  property: 'placeable',
                  result: false,
                  error:
                    error instanceof Error ? error.message : 'Cannot place',
                });
              }
              break;

            default:
              discoveries.push({
                property,
                result: false,
                error: 'Property test not implemented',
              });
          }
        } catch (error) {
          discoveries.push({
            property,
            result: false,
            error: error instanceof Error ? error.message : 'Test failed',
          });
        }
      }

      return {
        success: true,
        data: {
          itemExplored: itemToTest.name,
          propertiesTested: properties_to_test,
          discoveries,
          summary: {
            isEdible:
              discoveries.find((d) => d.property === 'edible')?.result || false,
            isPlaceable:
              discoveries.find((d) => d.property === 'placeable')?.result ||
              false,
            healthEffect:
              discoveries.find((d) => d.property === 'edible')?.healthEffect ||
              0,
            foodEffect:
              discoveries.find((d) => d.property === 'edible')?.foodEffect || 0,
          },
        },
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error during property exploration',
      };
    }
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
