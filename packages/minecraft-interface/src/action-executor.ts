/**
 * Action Executor for Hybrid Arbiter Integration
 *
 * Bridges high-level goals from the HybridHRMArbiter with the existing
 * leaf-based action system for concrete Minecraft execution.
 *
 * @author @darianrosebrook
 */

import { Bot } from 'mineflayer';
import { LeafFactory } from '@conscious-bot/core';
import { BotAdapter } from './bot-adapter';
import { createLeafContext } from '@conscious-bot/core';

export interface ActionPlan {
  type: string;
  target?: string;
  item?: string;
  direction?: string;
  priority: 'high' | 'medium' | 'low';
  parameters?: Record<string, any>;
}

export interface ExecutionResult {
  success: boolean;
  error?: string;
  durationMs: number;
  actionsExecuted: string[];
}

/**
 * Executes action plans by converting them to leaf operations
 */
export class ActionExecutor {
  private leafFactory: LeafFactory;
  private botAdapter: BotAdapter;

  constructor(leafFactory: LeafFactory, botAdapter: BotAdapter) {
    this.leafFactory = leafFactory;
    this.botAdapter = botAdapter;
  }

  /**
   * Execute an action plan
   */
  async executeActionPlan(actionPlan: ActionPlan[]): Promise<ExecutionResult> {
    const startTime = Date.now();
    const actionsExecuted: string[] = [];
    const bot = this.botAdapter.getBot();

    if (!bot) {
      return {
        success: false,
        error: 'No bot available for execution',
        durationMs: Date.now() - startTime,
        actionsExecuted: [],
      };
    }

    try {
      for (const action of actionPlan) {
        console.log(`🔄 Executing action: ${action.type} (${action.priority})`);

        const result = await this.executeAction(action, bot);
        if (result.success) {
          actionsExecuted.push(action.type);
          console.log(`✅ Action completed: ${action.type}`);
        } else {
          console.warn(`⚠️ Action failed: ${action.type} - ${result.error}`);
          // Continue with next action unless it's high priority
          if (action.priority === 'high') {
            return {
              success: false,
              error: `High priority action failed: ${action.type} - ${result.error}`,
              durationMs: Date.now() - startTime,
              actionsExecuted,
            };
          }
        }

        // Small delay between actions
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      return {
        success: true,
        durationMs: Date.now() - startTime,
        actionsExecuted,
      };
    } catch (error) {
      return {
        success: false,
        error: `Execution error: ${error}`,
        durationMs: Date.now() - startTime,
        actionsExecuted,
      };
    }
  }

  /**
   * Execute a single action
   */
  private async executeAction(
    action: ActionPlan,
    bot: Bot
  ): Promise<{ success: boolean; error?: string }> {
    const context = createLeafContext(bot as any);

    try {
      switch (action.type) {
        case 'move':
          return await this.executeMoveAction(action, context);

        case 'consume':
          return await this.executeConsumeAction(action, context);

        case 'craft':
          return await this.executeCraftAction(action, context);

        case 'explore':
          return await this.executeExploreAction(action, context);

        case 'sense':
          return await this.executeSenseAction(action, context);

        case 'wait':
          return await this.executeWaitAction(action, context);

        default:
          return {
            success: false,
            error: `Unknown action type: ${action.type}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        error: `Action execution error: ${error}`,
      };
    }
  }

  /**
   * Execute movement action
   */
  private async executeMoveAction(
    action: ActionPlan,
    context: any
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (action.target === 'home_base') {
        // Move to home base (hardcoded position for demo)
        const homePosition = { x: 100, y: 64, z: 100 };
        const moveLeaf = this.leafFactory.get('move_to');
        if (!moveLeaf) {
          return { success: false, error: 'move_to leaf not available' };
        }

        const result = await moveLeaf.run(context, {
          target: homePosition,
          timeout: 30000,
        });

        return { success: !result.error };
      } else if (action.target === 'nearest_village') {
        // Find and move to nearest village (simplified)
        const moveLeaf = this.leafFactory.get('move_to');
        if (!moveLeaf) {
          return { success: false, error: 'move_to leaf not available' };
        }

        // For demo, move to a random position
        const randomPosition = {
          x: 100 + Math.random() * 200 - 100,
          y: 64,
          z: 100 + Math.random() * 200 - 100,
        };

        const result = await moveLeaf.run(context, {
          target: randomPosition,
          timeout: 30000,
        });

        return { success: !result.error };
      } else {
        return { success: false, error: `Unknown move target: ${action.target}` };
      }
    } catch (error) {
      return { success: false, error: `Move action error: ${error}` };
    }
  }

  /**
   * Execute consume action
   */
  private async executeConsumeAction(
    action: ActionPlan,
    context: any
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // For demo, just wait a bit to simulate eating
      const waitLeaf = this.leafFactory.get('wait');
      if (!waitLeaf) {
        return { success: false, error: 'wait leaf not available' };
      }

      const result = await waitLeaf.run(context, {
        duration: 2000, // 2 seconds to "eat"
      });

      return { success: !result.error };
    } catch (error) {
      return { success: false, error: `Consume action error: ${error}` };
    }
  }

  /**
   * Execute craft action
   */
  private async executeCraftAction(
    action: ActionPlan,
    context: any
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // For demo, just wait to simulate crafting
      const waitLeaf = this.leafFactory.get('wait');
      if (!waitLeaf) {
        return { success: false, error: 'wait leaf not available' };
      }

      const result = await waitLeaf.run(context, {
        duration: 5000, // 5 seconds to "craft"
      });

      return { success: !result.error };
    } catch (error) {
      return { success: false, error: `Craft action error: ${error}` };
    }
  }

  /**
   * Execute explore action
   */
  private async executeExploreAction(
    action: ActionPlan,
    context: any
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const moveLeaf = this.leafFactory.get('move_to');
      if (!moveLeaf) {
        return { success: false, error: 'move_to leaf not available' };
      }

      // Move in a random direction
      const randomPosition = {
        x: 100 + Math.random() * 100 - 50,
        y: 64,
        z: 100 + Math.random() * 100 - 50,
      };

      const result = await moveLeaf.run(context, {
        target: randomPosition,
        timeout: 30000,
      });

      return { success: !result.error };
    } catch (error) {
      return { success: false, error: `Explore action error: ${error}` };
    }
  }

  /**
   * Execute sense action
   */
  private async executeSenseAction(
    action: ActionPlan,
    context: any
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const senseLeaf = this.leafFactory.get('sense_hostiles');
      if (!senseLeaf) {
        return { success: false, error: 'sense_hostiles leaf not available' };
      }

      const result = await senseLeaf.run(context, {
        radius: 32,
      });

      return { success: !result.error };
    } catch (error) {
      return { success: false, error: `Sense action error: ${error}` };
    }
  }

  /**
   * Execute wait action
   */
  private async executeWaitAction(
    action: ActionPlan,
    context: any
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const waitLeaf = this.leafFactory.get('wait');
      if (!waitLeaf) {
        return { success: false, error: 'wait leaf not available' };
      }

      const duration = action.parameters?.duration || 1000;
      const result = await waitLeaf.run(context, { duration });

      return { success: !result.error };
    } catch (error) {
      return { success: false, error: `Wait action error: ${error}` };
    }
  }
}
