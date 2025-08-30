/**
 * Minecraft Executor
 *
 * Connects the planning system to actual Minecraft bot actions.
 * Executes plan steps by calling the Minecraft interface API.
 *
 * @author @darianrosebrook
 */

import { Plan, PlanStep } from '../types';

export interface MinecraftAction {
  type: string;
  parameters: Record<string, any>;
}

export interface ExecutionResult {
  success: boolean;
  stepId: string;
  action: MinecraftAction;
  data?: any;
  error?: string;
  duration: number;
}

export class MinecraftExecutor {
  private minecraftInterfaceUrl: string;

  constructor(minecraftInterfaceUrl: string = 'http://localhost:3005') {
    this.minecraftInterfaceUrl = minecraftInterfaceUrl;
  }

  /**
   * Execute a plan by executing each step
   */
  async executePlan(plan: Plan): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];

    for (const step of plan.steps) {
      try {
        const result = await this.executeStep(step);
        results.push(result);

        // If step failed, we might want to stop or retry
        if (!result.success) {
          console.warn(`Step ${step.id} failed:`, result.error);
          // Continue with next step for now
        }

        // Small delay between steps
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Error executing step ${step.id}:`, error);
        results.push({
          success: false,
          stepId: step.id,
          action: { type: 'unknown', parameters: {} },
          error: error instanceof Error ? error.message : 'Unknown error',
          duration: 0,
        });
      }
    }

    return results;
  }

  /**
   * Execute a single plan step
   */
  async executeStep(step: PlanStep): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      // Extract action from step
      const action = this.extractActionFromStep(step);

      if (!action) {
        return {
          success: false,
          stepId: step.id,
          action: { type: 'unknown', parameters: {} },
          error: 'No action found in step',
          duration: Date.now() - startTime,
        };
      }

      // Execute the action via Minecraft interface
      const result = await this.executeMinecraftAction(action);

      return {
        success: result.success,
        stepId: step.id,
        action,
        data: result.data,
        error: result.error,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        stepId: step.id,
        action: { type: 'unknown', parameters: {} },
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Extract action from plan step
   */
  private extractActionFromStep(step: PlanStep): MinecraftAction | null {
    // Check if step has an action property
    if (step.action && step.action.type) {
      return {
        type: step.action.type,
        parameters: step.action.parameters || {},
      };
    }

    // Try to infer action from step name
    const stepName = (step as any).name?.toLowerCase() || '';

    if (stepName.includes('navigate') || stepName.includes('move')) {
      return {
        type: 'navigate',
        parameters: { target: 'auto_detect', max_distance: 50 },
      };
    } else if (
      stepName.includes('dig') ||
      stepName.includes('mine') ||
      stepName.includes('break')
    ) {
      return {
        type: 'dig_block',
        parameters: { pos: 'nearest_valuable', tool: 'auto_select' },
      };
    } else if (
      stepName.includes('collect') ||
      stepName.includes('gather') ||
      stepName.includes('pickup')
    ) {
      return {
        type: 'pickup_item',
        parameters: { radius: 3 },
      };
    } else if (stepName.includes('explore') || stepName.includes('scan')) {
      return {
        type: 'explore_environment',
        parameters: { duration: 10000, radius: 20 },
      };
    } else if (stepName.includes('craft')) {
      return {
        type: 'craft_item',
        parameters: { item: 'auto_detect', materials: 'auto_collect' },
      };
    } else if (stepName.includes('place') || stepName.includes('build')) {
      return {
        type: 'place_block',
        parameters: { block_type: 'auto_select', position: 'optimal_location' },
      };
    }

    // Default action for unknown steps
    return {
      type: 'explore_environment',
      parameters: { duration: 5000, radius: 10 },
    };
  }

  /**
   * Execute action via Minecraft interface API
   */
  private async executeMinecraftAction(
    action: MinecraftAction
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const response = await fetch(`${this.minecraftInterfaceUrl}/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: action.type,
          parameters: action.parameters,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `HTTP ${response.status}: ${errorText}`,
        };
      }

      const result = await response.json() as any;
      return {
        success: result.success,
        data: result.result,
        error: result.error,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  /**
   * Check if Minecraft interface is available
   */
  async checkConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.minecraftInterfaceUrl}/health`);
      if (response.ok) {
        const health = await response.json() as any;
        return health.status === 'connected';
      }
      return false;
    } catch (error) {
      return false;
    }
  }
}
