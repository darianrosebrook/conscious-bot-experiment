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
} from './types';

export class ActionTranslator {
  private bot: Bot;
  private config: BotConfig;
  private movements: Movements;

  constructor(bot: Bot, config: BotConfig) {
    this.bot = bot;
    this.config = config;

    // Initialize pathfinder
    bot.loadPlugin(pathfinder);
    this.movements = new Movements(bot);
    this.movements.scafoldingBlocks = []; // Don't place blocks while pathfinding
    this.movements.canDig = false; // Don't break blocks while pathfinding initially
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

    // Map common planning actions to Minecraft actions
    switch (actionType) {
      case 'navigate':
      case 'move':
      case 'go_to':
        return this.createNavigateAction(params);

      case 'mine':
      case 'break':
      case 'dig':
      case 'mine_block':
        return this.createMineAction(params);

      case 'craft':
      case 'make':
      case 'craft_item':
        return this.createCraftAction(params);

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
      target = new Vec3(
        params.x,
        params.y || this.bot.entity.position.y,
        params.z
      );
    } else {
      // Default to nearby exploration
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
