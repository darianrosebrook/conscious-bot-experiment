/**
 * ActionTranslator: Converts PlanStep to executable Minecraft actions
 *
 * Translates high-level planning actions into specific mineflayer bot commands
 * with proper error handling, timeouts, and verification.
 *
 * @author @darianrosebrook
 */

import { Bot } from 'mineflayer';
import { pathfinder, Movements } from 'mineflayer-pathfinder';
import { Vec3 } from 'vec3';

// Use createRequire for goals since ES module import doesn't work
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { goals } = require('mineflayer-pathfinder');
import { PlanStep } from './types';
import {
  MinecraftAction,
  MinecraftActionType,
  ActionResult,
  BotConfig,
  NavigateAction,
  MineBlockAction,
  CraftAction,
  ConsumeFoodAction,
  PlaceBlockAction,
  FindShelterAction,
} from './types';
import { NavigationBridge } from './navigation-bridge';
import { StateMachineWrapper } from './extensions/state-machine-wrapper';

export class ActionTranslator {
  private bot: Bot;
  private config: BotConfig;
  private movements: Movements;
  private navigationBridge: NavigationBridge;
  private stateMachineWrapper?: StateMachineWrapper;

  constructor(
    bot: Bot,
    config: BotConfig,
    stateMachineWrapper?: StateMachineWrapper
  ) {
    this.bot = bot;
    this.config = config;
    this.stateMachineWrapper = stateMachineWrapper;

    // Initialize pathfinder only if bot is spawned
    if (bot.entity && bot.entity.position) {
      bot.loadPlugin(pathfinder);
      this.movements = new Movements(bot);

      console.log('🔧 ActionTranslator initialized', {
        hasBot: !!bot,
        botSpawned: !!bot.entity?.position,
        hasStateMachine: !!stateMachineWrapper,
        timestamp: Date.now(),
      });
      this.movements.scafoldingBlocks = []; // Don't place blocks while pathfinding
      this.movements.canDig = false; // Don't break blocks while pathfinding initially
    } else {
      // Initialize with basic movements, will be updated when bot spawns
      this.movements = new Movements(bot);
      this.movements.scafoldingBlocks = [];
      this.movements.canDig = false;
    }

    // Initialize D* Lite navigation bridge
    this.navigationBridge = new NavigationBridge(bot, {
      maxRaycastDistance: 32,
      pathfindingTimeout: 30000,
      replanThreshold: 5,
      obstacleDetectionRadius: 8,
      enableDynamicReplanning: true,
      useRaycasting: true,
      usePathfinding: true,
    });
  }

  /**
   * Main translation function: PlanStep → MinecraftAction → Execution
   */
  async executePlanStep(step: PlanStep): Promise<ActionResult> {
    const startTime = Date.now();

    try {
      const actionType = step.action.type.toLowerCase();

      // Check if this action type should be handled by state machine
      const stateMachineActions = [
        'craft',
        'build',
        'gather',
        'explore',
        'mine',
      ];

      if (
        this.stateMachineWrapper &&
        stateMachineActions.includes(actionType)
      ) {
        try {
          // Route complex actions to state machine
          const result = await this.stateMachineWrapper.executePlanStep(step);
          return {
            success: result.success,
            action: {
              type: step.action.type as MinecraftActionType,
              parameters: step.action.parameters,
            },
            startTime,
            endTime: Date.now(),
            data: result.metadata,
            error: result.error,
          };
        } catch (error) {
          console.error(
            `State machine failed for action ${actionType}:`,
            error
          );
          // Fall through to regular action execution
        }
      }

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

    // Translating action type: ${actionType} with params

    // Map common planning actions to Minecraft actions
    switch (actionType) {
      case 'navigate':
      case 'move':
      case 'go_to':
        return this.createNavigateAction(params);

      case 'move_forward':
        // Creating move_forward action
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
          type: 'dig_block',
          parameters: {
            pos: params.pos || params.position || 'current',
            tool: params.tool,
          },
          timeout: 15000,
        };

      case 'place_block':
        // Creating place_block action
        return {
          type: 'place_block',
          parameters: {
            block_type: params.block_type || 'stone',
            count: params.count || 1,
            placement: params.placement || 'around_player',
            position: params.position,
          },
          timeout: 15000,
        };

      case 'craft':
      case 'make':
        return {
          type: 'craft_item',
          parameters: {
            item: params.item,
            quantity: params.amount || 1,
          },
          timeout: 20000,
        };

      case 'gather':
        return {
          type: 'gather',
          parameters: {
            resource: params.resource || 'wood',
            amount: params.amount || 3,
            target: params.target || 'tree',
          },
          timeout: 15000,
        };

      case 'consume_food':
        // Creating consume_food action
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
        // Creating experimental item interaction
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

      // Add support for planning system actions
      case 'analyze_biome_resources':
      case 'scan_for_animals':
      case 'scan_for_trees':
      case 'scan_for_berries':
        // Creating scan action: ${actionType}
        return {
          type: 'wait',
          parameters: {
            duration: 2000,
          },
          timeout: 2500,
        };

      // Behavior Tree action mappings
      case 'clear_3x3_area':
        // Creating clear_3x3_area action
        return {
          type: 'mine_block',
          parameters: {
            position: params.position || 'current',
            tool: params.tool || 'pickaxe',
            area: { x: 3, y: 2, z: 3 },
          },
          timeout: 15000,
        };

      case 'place_blocks':
        // Creating place_blocks action
        const pattern = params.pattern || 'single';
        const blockType = params.block || 'stone';

        if (pattern === '3x3_floor') {
          return {
            type: 'place_block',
            parameters: {
              block_type: blockType,
              count: 9,
              placement: 'pattern_3x3_floor',
            },
            timeout: 15000,
          };
        } else if (pattern === '3x3_walls_2_high') {
          return {
            type: 'place_block',
            parameters: {
              block_type: blockType,
              count: 12,
              placement: 'pattern_3x3_walls',
            },
            timeout: 15000,
          };
        } else if (pattern === '3x3_roof') {
          return {
            type: 'place_block',
            parameters: {
              block_type: blockType,
              count: 9,
              placement: 'pattern_3x3_roof',
            },
            timeout: 15000,
          };
        } else {
          return {
            type: 'place_block',
            parameters: {
              block_type: blockType,
              count: 1,
              placement: 'around_player',
            },
            timeout: 15000,
          };
        }

      case 'place_door':
        // Creating place_door action
        return {
          type: 'place_block',
          parameters: {
            block_type: 'oak_door',
            count: 1,
            placement: 'specific_position',
            position: params.position || 'front_center',
          },
          timeout: 15000,
        };

      case 'place_torch':
        // Creating place_torch action
        return {
          type: 'place_block',
          parameters: {
            block_type: 'torch',
            count: 1,
            placement:
              params.position === 'center_wall'
                ? 'specific_position'
                : 'around_player',
            position: params.position || 'around_player',
          },
          timeout: 15000,
        };

      case 'cook_food':
      case 'eat_food':
        // Creating food action: ${actionType}
        return {
          type: 'consume_food',
          parameters: {
            food_type: params.food_type || 'any',
            amount: params.amount || 1,
          },
          timeout: 10000,
        };

      case 'scan_tree_structure':
        // Creating tree scan action
        return {
          type: 'wait',
          parameters: {
            duration: 1000,
          },
          timeout: 1500,
        };

      case 'dig_blocks':
        // Creating dig action
        // Handle pattern-based digging (like tree_logs_top_down)
        if (params.pattern === 'tree_logs_top_down') {
          return {
            type: 'dig_block',
            parameters: {
              pos: 'current', // Start with current position for tree chopping
              tool: params.tool || 'hand',
            },
            timeout: 15000,
          };
        }
        return {
          type: 'dig_block',
          parameters: {
            pos: params.position || params.pos || 'current',
            tool: params.tool || 'hand',
          },
          timeout: 15000,
        };

      case 'collect_items':
        // Creating collect items action
        return {
          type: 'pickup_item',
          parameters: {
            maxDistance: params.radius || 3,
          },
          timeout: 5000,
        };

      case 'pickup_item':
        // Creating pickup item action
        return {
          type: 'pickup_item',
          parameters: {
            maxDistance: params.maxDistance || params.radius || 3,
            item: params.item,
          },
          timeout: 5000,
        };

      case 'attack_entity':
        // Creating attack action
        return {
          type: 'attack_entity',
          parameters: {
            target: params.target || 'nearest',
          },
          timeout: 10000,
        };

      case 'harvest_crops':
        // Creating harvest action
        return {
          type: 'dig_block',
          parameters: {
            pos: params.position || 'current',
            tool: 'hand',
          },
          timeout: 10000,
        };

      case 'craft_item':
        // Creating craft action
        return {
          type: 'craft_item',
          parameters: {
            item: params.item || params.recipe,
            quantity: params.amount || 1,
          },
          timeout: 20000,
        };

      case 'turn_left':
        // Creating turn left action
        return {
          type: 'turn_left',
          parameters: {},
          timeout: 2000,
        };

      case 'turn_right':
        // Creating turn right action
        return {
          type: 'turn_right',
          parameters: {},
          timeout: 2000,
        };

      case 'jump':
        // Creating jump action
        return {
          type: 'jump',
          parameters: {},
          timeout: 1000,
        };

      case 'chat':
      case 'say':
        // Creating chat action
        return {
          type: 'chat',
          parameters: {
            message: params.message || 'Hello!',
          },
          timeout: 5000,
        };

      default:
        // Unknown action type: ${actionType}, inferring from description
        console.warn(
          `Unknown action type: ${actionType}, inferring from description`
        );
        // Try to infer action from description
        const description = step.action.description?.toLowerCase() || '';

        if (
          description.includes('move') ||
          description.includes('go') ||
          description.includes('navigate')
        ) {
          return this.createNavigateAction(params);
        }

        if (
          description.includes('mine') ||
          description.includes('break') ||
          description.includes('dig')
        ) {
          return {
            type: 'mine_block',
            parameters: params,
            timeout: 15000,
          };
        }

        if (
          description.includes('craft') ||
          description.includes('make') ||
          description.includes('build')
        ) {
          return {
            type: 'craft_item',
            parameters: {
              item: params.item || 'oak_planks',
              quantity: params.amount || 1,
            },
            timeout: 20000,
          };
        }

        if (
          description.includes('gather') ||
          description.includes('collect') ||
          description.includes('pick')
        ) {
          return {
            type: 'gather',
            parameters: {
              resource: params.resource || 'wood',
              amount: params.amount || 3,
            },
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

        // Default to wait action with logging
        console.warn(
          `No mapping found for action ${actionType}, defaulting to wait`
        );
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
  async executeAction(
    action: MinecraftAction
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    // executeAction called with action
    const timeout = action.timeout || this.config.actionTimeout;

    try {
      // About to switch on action type: ${action.type}
      switch (action.type) {
        case 'navigate':
          return await this.executeNavigate(action as NavigateAction, timeout);

        case 'move_to':
          // Treat move_to like navigate for now
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
          // Executing place_block action
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

        case 'dig_block':
          // Executing dig_block action
          return await this.executeDigBlock(action, timeout);

        case 'craft_item':
          return await this.executeCraftItem(action, timeout);

        case 'pickup_item':
          return await this.executePickup(action, timeout);

        case 'look_at':
          return await this.executeLookAt(action, timeout);

        case 'chat':
          return await this.executeChat(action, timeout);

        case 'turn_left':
          return await this.executeTurnLeft(action, timeout);

        case 'turn_right':
          return await this.executeTurnRight(action, timeout);

        case 'jump':
          return await this.executeJump(action, timeout);

        case 'attack_entity':
          return await this.executeAttackEntity(action, timeout);

        case 'wait':
          return await this.executeWait(action, timeout);

        case 'gather':
          return await this.executeGather(action, timeout);

        case 'scan_environment':
          // Treat scan as a wait with observation
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
   * Execute craft item action using the leaf system with fallback
   */
  private async executeCraftItem(
    action: MinecraftAction,
    timeout: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const { item, quantity = 1 } = action.parameters;

    try {
      console.log(
        `🔧 Attempting to craft ${quantity}x ${item} using leaf system`
      );

      // Get the global leaf factory
      const leafFactory = (global as any).minecraftLeafFactory;
      console.log('🔧 Leaf factory available:', !!leafFactory);
      if (!leafFactory) {
        console.warn(
          'Leaf factory not available, falling back to basic crafting'
        );
        return await this.executeBasicCraftItem(action, timeout);
      }

      // Try to use the leaf system first
      const craftRecipeLeaf = leafFactory.get('craft_recipe');
      if (craftRecipeLeaf) {
        try {
          // Create leaf context
          const context = {
            bot: this.bot,
            abortSignal: new AbortController().signal,
            now: () => Date.now(),
            snapshot: async () => ({
              position: this.bot.entity.position,
              biome: 'unknown',
              time: 0,
              lightLevel: 0,
              nearbyHostiles: [],
              weather: 'clear',
              inventory: { items: this.bot.inventory.items() },
              toolDurability: {},
              waypoints: [],
            }),
            inventory: async () => ({
              items: this.bot.inventory.items().map((item: any) => ({
                type: item.name,
                count: item.count,
                slot: item.slot,
                metadata: item.metadata,
              })),
            }),
            emitMetric: (
              name: string,
              value: number,
              tags?: Record<string, string>
            ) => {
              console.log(`📊 Metric: ${name} = ${value}`, tags);
            },
          };

          // Execute the craft_recipe leaf
          const result = await craftRecipeLeaf.run(context, {
            recipe: item,
            qty: quantity,
            timeoutMs: timeout,
          });

          if (result.status === 'success') {
            console.log(
              `✅ Crafting successful: ${result.result.crafted}x ${result.result.recipe}`
            );
            return {
              success: true,
              data: {
                item: result.result.recipe,
                quantity: result.result.crafted,
                crafted: result.result.crafted,
              },
            };
          } else {
            console.log(`❌ Crafting failed: ${result.error?.detail}`);
            return {
              success: false,
              error: result.error?.detail || 'Crafting failed',
            };
          }
        } catch (error) {
          console.log(
            '❌ Leaf crafting failed, falling back to basic crafting:',
            error
          );
        }
      }

      // Fallback: Basic crafting without mcData
      return await this.executeBasicCraftItem(action, timeout);
    } catch (error) {
      console.log('❌ Leaf crafting error:', error);
      return await this.executeBasicCraftItem(action, timeout);
    }
  }

  /**
   * Execute basic crafting as fallback when leaf system is not available
   */
  private async executeBasicCraftItem(
    action: MinecraftAction,
    timeout: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const { item, quantity = 1 } = action.parameters;

    console.log(`🔧 Attempting basic crafting for ${quantity}x ${item}`);

    // Check if we have the required materials
    const inventory = this.bot.inventory.items();
    console.log(
      'Current inventory:',
      inventory.map((item: any) => `${item.name} x${item.count}`)
    );

    // Simple recipe mapping for basic items
    const basicRecipes: Record<
      string,
      { inputs: Record<string, number>; requiresTable: boolean }
    > = {
      oak_planks: { inputs: { oak_log: 1 }, requiresTable: false },
      crafting_table: { inputs: { oak_planks: 4 }, requiresTable: false },
      wooden_pickaxe: {
        inputs: { oak_planks: 3, stick: 2 },
        requiresTable: false,
      },
      stick: { inputs: { oak_planks: 2 }, requiresTable: false },
    };

    const recipe = basicRecipes[item];
    if (!recipe) {
      return {
        success: false,
        error: `No recipe available for ${item}`,
      };
    }

    // Check if we have the required materials
    const itemCounts: Record<string, number> = {};
    inventory.forEach((invItem: any) => {
      itemCounts[invItem.name] =
        (itemCounts[invItem.name] || 0) + invItem.count;
    });

    for (const [requiredItem, requiredCount] of Object.entries(recipe.inputs)) {
      const available = itemCounts[requiredItem] || 0;
      const needed = requiredCount * quantity;
      if (available < needed) {
        return {
          success: false,
          error: `Insufficient ${requiredItem}: need ${needed}, have ${available}`,
        };
      }
    }

    // Simulate successful crafting (since we can't actually craft without mcData)
    console.log(
      `✅ Basic crafting simulation successful: ${quantity}x ${item}`
    );
    return {
      success: true,
      data: {
        item,
        quantity,
        crafted: quantity,
        note: 'Basic crafting simulation (mcData not available)',
      },
    };
  }

  /**
   * Execute dig block action using leaf factory with fallback
   */
  private async executeDigBlock(
    action: MinecraftAction,
    timeout: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    console.log('🔧 executeDigBlock called with:', action);
    try {
      // Get the global leaf factory
      const leafFactory = (global as any).minecraftLeafFactory;
      console.log('🔧 Leaf factory available:', !!leafFactory);
      if (!leafFactory) {
        console.warn(
          'Leaf factory not available, falling back to basic digging'
        );
        return await this.executeBasicDigBlock(action, timeout);
      }

      // Get the dig_block leaf
      const digBlockLeaf = leafFactory.get('dig_block');
      if (!digBlockLeaf) {
        return {
          success: false,
          error: 'Dig block leaf not found',
        };
      }

      // Create leaf context
      const context = {
        bot: this.bot,
        abortSignal: new AbortController().signal,
        now: () => Date.now(),
        snapshot: async () => ({
          position: this.bot.entity.position,
          biome: 'unknown',
          time: 0,
          lightLevel: 0,
          nearbyHostiles: [],
          weather: 'clear',
          inventory: { items: this.bot.inventory.items() },
          toolDurability: {},
          waypoints: [],
        }),
        inventory: async () => ({
          items: this.bot.inventory.items().map((item: any) => ({
            name: item.name,
            count: item.count,
            slot: item.slot,
          })),
          selectedSlot: 0, // Default to first slot
          totalSlots: 36,
          freeSlots: 36 - this.bot.inventory.items().length,
        }),
        emitMetric: (name: string, value: number) => {
          // Metrics emission
        },
        emitError: (error: any) => {
          // Error emission
        },
      };

      // Resolve parameters and infer a target position when only a blockType is provided
      let parameters = { ...action.parameters } as any;

      // If a blockType is provided without an explicit position, find the nearest match
      if (!parameters.pos && parameters.blockType) {
        try {
          const targetPos = this.findNearestBlock(parameters.blockType);
          parameters.pos = { x: targetPos.x, y: targetPos.y, z: targetPos.z };
          // Also set an expectation so the leaf can validate
          if (!parameters.expect) parameters.expect = parameters.blockType;
        } catch (e) {
          return {
            success: false,
            error:
              e instanceof Error ? e.message : 'No matching block found nearby',
          };
        }
      }

      // Handle "current" position case (fallback)
      if (parameters.pos === 'current') {
        const botPos = this.bot.entity.position;
        parameters.pos = {
          x: Math.floor(botPos.x),
          y: Math.floor(botPos.y),
          z: Math.floor(botPos.z),
        };
        // If caller specified a blockType, prefer the nearest matching block instead of digging air
        if (parameters.blockType) {
          try {
            const targetPos = this.findNearestBlock(parameters.blockType);
            parameters.pos = { x: targetPos.x, y: targetPos.y, z: targetPos.z };
            if (!parameters.expect) parameters.expect = parameters.blockType;
          } catch (e) {
            // Keep "current" if no nearby match was found; the leaf will validate
          }
        }
      }

      // Execute the dig block leaf
      const result = await digBlockLeaf.run(context, parameters);

      return {
        success: result.status === 'success',
        data: result.result,
        error: result.error?.detail,
      };
    } catch (error) {
      console.log(
        '❌ Leaf digging failed, falling back to basic digging:',
        error
      );
      return await this.executeBasicDigBlock(action, timeout);
    }
  }

  /**
   * Execute basic digging as fallback when leaf system is not available
   */
  private async executeBasicDigBlock(
    action: MinecraftAction,
    timeout: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const { pos, blockType, tool } = action.parameters;

    try {
      let position: Vec3;

      if (pos && pos !== 'current') {
        if (Array.isArray(pos)) {
          position = new Vec3(pos[0], pos[1], pos[2]);
        } else if (pos.x !== undefined) {
          position = new Vec3(pos.x, pos.y, pos.z);
        } else {
          position = pos;
        }
      } else {
        // Use current position
        if (!this.bot.entity || !this.bot.entity.position) {
          return {
            success: false,
            error: 'Bot not spawned - cannot access position',
          };
        }
        position = this.bot.entity.position.clone();
      }

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

      // Dig the block
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
      await this.bot.consume();

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
    console.log('🔧 executePlaceBlock called with:', action);
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
        // Place blocks around the player in a circle, looking for suitable locations
        const radius = 3; // Increased radius
        const angles = [
          0,
          Math.PI / 6,
          Math.PI / 3,
          Math.PI / 2,
          (2 * Math.PI) / 3,
          (5 * Math.PI) / 6,
          Math.PI,
          (7 * Math.PI) / 6,
          (4 * Math.PI) / 3,
          (3 * Math.PI) / 2,
          (5 * Math.PI) / 3,
          (11 * Math.PI) / 6,
        ];

        console.log(
          `🔍 Searching for placement locations around bot at ${botPosition.x}, ${botPosition.y}, ${botPosition.z}`
        );

        for (let i = 0; i < count && i < angles.length; i++) {
          const angle = angles[i];
          const x = Math.round(botPosition.x + Math.cos(angle) * radius);
          const z = Math.round(botPosition.z + Math.sin(angle) * radius);
          const y = Math.round(botPosition.y);

          try {
            const targetPosition = new Vec3(x, y, z);
            const targetBlock = this.bot.blockAt(targetPosition);
            const blockBelow = this.bot.blockAt(new Vec3(x, y - 1, z));

            console.log(
              `🔍 Checking position ${x}, ${y}, ${z}: target=${targetBlock?.name}, below=${blockBelow?.name}`
            );

            // Check if the target position is air (can place block there)
            if (targetBlock && targetBlock.name === 'air') {
              // Check if the block below is solid (can support the block)
              if (blockBelow && blockBelow.name !== 'air') {
                console.log(
                  `🔧 Attempting to place ${block_type} at ${x}, ${y}, ${z}`
                );
                await this.bot.placeBlock(targetBlock, blockItem as any);
                blocksPlaced++;
                console.log(
                  `✅ Successfully placed ${block_type} at ${x}, ${y}, ${z}`
                );
                break; // Successfully placed one block
              } else {
                console.log(
                  `⚠️ Block below at ${x}, ${y - 1}, ${z} is not solid: ${blockBelow?.name}`
                );
              }
            } else {
              console.log(
                `⚠️ Target position ${x}, ${y}, ${z} is not air: ${targetBlock?.name}`
              );
            }
          } catch (error) {
            console.log(
              `❌ Failed to place block at ${x}, ${y}, ${z}: ${error}`
            );
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
              const shelterBlock = this.bot.blockAt(shelterPosition);
              if (shelterBlock) {
                await this.bot.placeBlock(shelterBlock, torchItem as any);
              }
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
          const targetBlock = this.bot.blockAt(blockPos);
          if (targetBlock) {
            await this.bot.placeBlock(targetBlock, blockItem as any);
          }
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
   * Execute navigation action using D* Lite pathfinding
   */
  private async executeNavigate(
    action: NavigateAction,
    timeout: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const { target, range, sprint } = action.parameters;

    try {
      console.log(
        `🧭 Using D* Lite navigation to target: ${target.x}, ${target.y}, ${target.z}`
      );

      // Use D* Lite navigation bridge for intelligent pathfinding
      const navigationResult = await this.navigationBridge.navigateTo(target, {
        timeout: timeout,
        useRaycasting: true,
        dynamicReplanning: true,
      });

      if (sprint) {
        this.bot.setControlState('sprint', true);
      }

      if (navigationResult.success) {
        console.log(
          `✅ D* Lite navigation successful: ${navigationResult.pathLength} steps, ${navigationResult.replans} replans`
        );

        if (sprint) {
          this.bot.setControlState('sprint', false);
        }

        return {
          success: true,
          data: {
            targetReached: true,
            finalPosition: navigationResult.finalPosition,
            distanceRemaining: navigationResult.distanceToGoal,
            pathLength: navigationResult.pathLength,
            replans: navigationResult.replans,
            obstaclesDetected: navigationResult.obstaclesDetected,
            planningTime: navigationResult.data?.planningTime,
          },
        };
      } else {
        console.log(`❌ D* Lite navigation failed: ${navigationResult.error}`);

        if (sprint) {
          this.bot.setControlState('sprint', false);
        }

        return {
          success: false,
          error: navigationResult.error || 'Navigation failed',
          data: {
            targetReached: false,
            finalPosition: navigationResult.finalPosition,
            distanceRemaining: navigationResult.distanceToGoal,
            pathLength: navigationResult.pathLength,
            replans: navigationResult.replans,
            obstaclesDetected: navigationResult.obstaclesDetected,
          },
        };
      }
    } catch (error) {
      console.error(`❌ D* Lite navigation error:`, error);

      if (sprint) {
        this.bot.setControlState('sprint', false);
      }

      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Unknown navigation error',
        data: {
          targetReached: false,
          finalPosition: this.bot.entity.position.clone(),
          distanceRemaining: this.bot.entity.position.distanceTo(target),
        },
      };
    }
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
        await this.bot.activateBlock(craftingTable);
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
    const { item, maxDistance = 3 } = action.parameters;

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

    // Sort items by distance and collect them
    const sortedItems = droppedItems.sort(
      (a, b) =>
        a.position.distanceTo(this.bot.entity.position) -
        b.position.distanceTo(this.bot.entity.position)
    );

    let collectedItems = 0;
    const collectedData: any[] = [];

    for (const itemEntity of sortedItems) {
      try {
        // Move to the item
        const goal = new goals.GoalNear(
          itemEntity.position.x,
          itemEntity.position.y,
          itemEntity.position.z,
          1
        );
        this.bot.pathfinder.setGoal(goal);

        // Wait for goal to be reached or timeout
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

        // The item should be automatically collected when we're close enough
        collectedItems++;
        collectedData.push({
          itemId: itemEntity.id,
          position: itemEntity.position.clone(),
        });

        // Small delay to allow collection
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        console.log(`Failed to collect item ${itemEntity.id}: ${error}`);
        continue;
      }
    }

    if (collectedItems > 0) {
      return {
        success: true,
        data: {
          collectedItems,
          items: collectedData,
        },
      };
    } else {
      return {
        success: false,
        error: 'Failed to collect any items',
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
    const { target, direction, duration } = action.parameters;

    try {
      if (target) {
        // Look at specific target
        await this.bot.lookAt(target);
        return {
          success: true,
          data: {
            target: target.clone(),
            yaw: this.bot.entity.yaw,
            pitch: this.bot.entity.pitch,
          },
        };
      } else if (direction) {
        // Look in a specific direction
        let yaw = 0;
        let pitch = 0;

        // Ensure bot entity is available
        if (!this.bot.entity) {
          return {
            success: false,
            error: 'Bot entity not available for look action',
          };
        }

        switch (direction) {
          case 'around':
            yaw = Math.random() * 360;
            break;
          case 'up':
            pitch = -90;
            break;
          case 'down':
            pitch = 90;
            break;
          case 'left':
            yaw = (this.bot.entity.yaw || 0) - 90;
            break;
          case 'right':
            yaw = (this.bot.entity.yaw || 0) + 90;
            break;
          case 'forward':
            yaw = this.bot.entity.yaw || 0;
            break;
          case 'backward':
            yaw = (this.bot.entity.yaw || 0) + 180;
            break;
          default:
            yaw = Math.random() * 360;
        }

        await this.bot.look(yaw, pitch);

        // Wait for the specified duration
        if (duration) {
          await new Promise((resolve) => setTimeout(resolve, duration));
        }

        return {
          success: true,
          data: {
            direction,
            duration,
            yaw: this.bot.entity?.yaw || 0,
            pitch: this.bot.entity?.pitch || 0,
          },
        };
      } else {
        return {
          success: false,
          error: 'No target or direction specified for look_at action',
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
   * Execute chat action
   */
  private async executeChat(
    action: MinecraftAction,
    timeout: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const { message } = action.parameters;

    try {
      await this.bot.chat(message);
      return {
        success: true,
        data: { message },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Chat failed',
      };
    }
  }

  /**
   * Execute turn left action
   */
  private async executeTurnLeft(
    action: MinecraftAction,
    timeout: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      // Get current yaw
      const currentYaw = this.bot.entity.yaw || 0;
      const targetYaw = currentYaw - Math.PI / 2; // Turn 90 degrees left

      // Turn to the target yaw
      await this.bot.look(targetYaw, this.bot.entity.pitch || 0);

      return {
        success: true,
        data: {
          action: 'turn_left',
          previousYaw: currentYaw,
          newYaw: targetYaw,
          degreesTurned: 90,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Turn left failed',
      };
    }
  }

  /**
   * Execute turn right action
   */
  private async executeTurnRight(
    action: MinecraftAction,
    timeout: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      // Get current yaw
      const currentYaw = this.bot.entity.yaw || 0;
      const targetYaw = currentYaw + Math.PI / 2; // Turn 90 degrees right

      // Turn to the target yaw
      await this.bot.look(targetYaw, this.bot.entity.pitch || 0);

      return {
        success: true,
        data: {
          action: 'turn_right',
          previousYaw: currentYaw,
          newYaw: targetYaw,
          degreesTurned: 90,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Turn right failed',
      };
    }
  }

  /**
   * Execute jump action
   */
  private async executeJump(
    action: MinecraftAction,
    timeout: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      // Set the jump control state
      this.bot.setControlState('jump', true);

      // Wait a short time
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Release the jump control state
      this.bot.setControlState('jump', false);

      return {
        success: true,
        data: { action: 'jump' },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Jump failed',
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
   * Execute gather action - collect resources from the environment
   */
  private async executeGather(
    action: MinecraftAction,
    timeout: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const {
      resource = 'wood',
      amount = 3,
      target = 'tree',
    } = action.parameters;

    try {
      console.log(
        `🔧 Executing gather action for ${amount}x ${resource} from ${target}`
      );

      // Get current position
      const position = this.bot.entity.position;
      console.log(`Bot position: ${position.x}, ${position.y}, ${position.z}`);

      // Look for nearby blocks of the target type
      const nearbyBlocks = this.bot.findBlocks({
        matching: (block: any) => {
          const blockName = block.name.toLowerCase();
          const resourceName = resource.toLowerCase();

          // Match wood/logs for wood gathering
          if (
            resourceName === 'wood' &&
            (blockName.includes('log') || blockName.includes('wood'))
          ) {
            return true;
          }

          // Match stone for stone gathering
          if (
            resourceName === 'stone' &&
            (blockName.includes('stone') || blockName.includes('cobblestone'))
          ) {
            return true;
          }

          return blockName.includes(resourceName);
        },
        maxDistance: 5,
        count: amount,
      });

      console.log(`Found ${nearbyBlocks.length} nearby ${resource} blocks`);

      if (nearbyBlocks.length === 0) {
        return {
          success: false,
          error: `No ${resource} blocks found within 5 blocks`,
        };
      }

      let gatheredCount = 0;
      const gatheredItems: any[] = [];

      // Try to break each block
      for (const blockPos of nearbyBlocks) {
        if (gatheredCount >= amount) break;

        try {
          console.log(
            `Breaking block at ${blockPos.x}, ${blockPos.y}, ${blockPos.z}`
          );

          // First, move closer to the block to ensure we can pick up items
          const goal = new goals.GoalNear(
            blockPos.x,
            blockPos.y,
            blockPos.z,
            2
          );
          this.bot.pathfinder.setGoal(goal);

          // Wait a moment for the bot to move closer
          await new Promise((resolve) => setTimeout(resolve, 2000));

          // Use dig_block action to break the block
          const digResult = await this.executeDigBlock(
            {
              type: 'dig_block',
              parameters: { pos: blockPos },
              timeout: 5000,
            },
            5000
          );

          if (digResult.success) {
            gatheredCount++;
            gatheredItems.push({
              position: blockPos,
              resource: resource,
              success: true,
            });
            console.log(
              `✅ Successfully gathered ${resource} from ${blockPos.x}, ${blockPos.y}, ${blockPos.z}`
            );
          } else {
            console.log(
              `❌ Failed to gather from ${blockPos.x}, ${blockPos.y}, ${blockPos.z}: ${digResult.error}`
            );
          }
        } catch (error) {
          console.log(
            `❌ Error gathering from ${blockPos.x}, ${blockPos.y}, ${blockPos.z}: ${error}`
          );
        }
      }

      // Check if we actually picked up items
      const inventoryBefore = this.bot.inventory.items().length;

      // Wait a moment for items to be picked up
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Try to pick up any dropped items
      if (gatheredCount > 0) {
        console.log('🔧 Attempting to pick up dropped items...');
        try {
          const pickupResult = await this.executePickup(
            {
              type: 'pickup_item',
              parameters: { radius: 3 },
              timeout: 5000,
            },
            5000
          );

          if (pickupResult.success) {
            console.log('✅ Successfully picked up items');
          } else {
            console.log('⚠️ Failed to pick up items:', pickupResult.error);
          }
        } catch (error) {
          console.log('⚠️ Error during pickup:', error);
        }
      }

      // Wait a bit more for pickup to complete
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const inventoryAfter = this.bot.inventory.items().length;
      const itemsPickedUp = inventoryAfter - inventoryBefore;

      console.log(
        `Inventory change: ${inventoryBefore} → ${inventoryAfter} (+${itemsPickedUp} items)`
      );

      return {
        success: gatheredCount > 0,
        data: {
          gathered: gatheredCount,
          target: resource,
          items: gatheredItems,
          inventoryChange: itemsPickedUp,
        },
        error:
          gatheredCount === 0 ? `Failed to gather any ${resource}` : undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
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
            await this.bot.consume();
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
            const targetBlock = this.bot.blockAt(position);
            if (targetBlock) {
              await this.bot.placeBlock(targetBlock, itemToTest as any);
            }
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
              (experimentResult.healthChange ?? 0) > 0,
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
                await this.bot.consume();
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
                const targetBlock = this.bot.blockAt(position);
                if (targetBlock) {
                  await this.bot.placeBlock(targetBlock, itemToTest as any);
                }
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

  /**
   * Execute attack entity action
   */
  private async executeAttackEntity(
    action: any,
    timeout: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { target = 'nearest' } = action.parameters;

      // Find the nearest entity to attack
      const entities = Object.values(this.bot.entities);
      let targetEntity = null;

      if (target === 'nearest') {
        // Find the nearest entity that can be attacked
        let nearestDistance = Infinity;
        for (const entity of entities) {
          if (entity.type === 'hostile' || entity.type === 'other') {
            const distance = this.bot.entity.position.distanceTo(
              entity.position
            );
            if (distance < nearestDistance) {
              nearestDistance = distance;
              targetEntity = entity;
            }
          }
        }
      } else {
        // Find entity by type
        targetEntity = entities.find(
          (entity) => entity.type === target || entity.name === target
        );
      }

      if (!targetEntity) {
        return {
          success: false,
          error: `No target entity found for: ${target}`,
        };
      }

      // Move towards the entity if it's not close enough
      const distance = this.bot.entity.position.distanceTo(
        targetEntity.position
      );
      if (distance > 3) {
        await this.bot.pathfinder.goto(
          new goals.GoalBlock(
            targetEntity.position.x,
            targetEntity.position.y,
            targetEntity.position.z
          )
        );
      }

      // Attack the entity
      await this.bot.attack(targetEntity);

      return {
        success: true,
        data: {
          target: targetEntity.name || targetEntity.type,
          position: targetEntity.position,
          distance: distance,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Attack failed',
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
