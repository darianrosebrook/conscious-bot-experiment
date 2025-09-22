/**
 * Minecraft Executor
 *
 * Connects the planning system to actual Minecraft bot actions.
 * Executes plan steps by calling the Minecraft interface API.
 *
 * @author @darianrosebrook
 */

import { Plan, PlanStep, ActionType } from '../types';

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
        type: this.mapActionTypeToLeaf(step.action.type),
        parameters: step.action.parameters || {},
      };
    }

    // Try to infer action from step name
    const stepName = (step as any).name?.toLowerCase() || '';

    // Container interaction actions
    if (
      stepName.includes('container') ||
      stepName.includes('chest') ||
      stepName.includes('storage')
    ) {
      if (stepName.includes('organize')) {
        return {
          type: 'manage_inventory',
          parameters: { action: 'sort' },
        };
      } else if (stepName.includes('open')) {
        return {
          type: 'open_container',
          parameters: { position: 'nearest' },
        };
      } else {
        return {
          type: 'interact_with_block',
          parameters: { interactionType: 'use' },
        };
      }
    }

    // Farming actions
    if (
      stepName.includes('farm') ||
      stepName.includes('crop') ||
      stepName.includes('agriculture')
    ) {
      if (stepName.includes('till') || stepName.includes('prepare')) {
        return {
          type: 'till_soil',
          parameters: { radius: 16 },
        };
      } else if (stepName.includes('plant') || stepName.includes('seed')) {
        return {
          type: 'plant_crop',
          parameters: { cropType: 'wheat', radius: 16 },
        };
      } else if (stepName.includes('harvest') || stepName.includes('collect')) {
        return {
          type: 'harvest_crop',
          parameters: { radius: 16 },
        };
      } else {
        return {
          type: 'manage_farm',
          parameters: { action: 'maintain', maxOperations: 10 },
        };
      }
    }

    // Combat actions
    if (
      stepName.includes('combat') ||
      stepName.includes('fight') ||
      stepName.includes('attack')
    ) {
      if (stepName.includes('defend') || stepName.includes('protect')) {
        return {
          type: 'retreat_from_threat',
          parameters: { retreatDistance: 10 },
        };
      } else if (stepName.includes('equip')) {
        return {
          type: 'equip_weapon',
          parameters: { preferredType: 'sword' },
        };
      } else {
        return {
          type: 'attack_entity',
          parameters: { radius: 16 },
        };
      }
    }

    // World interaction actions
    if (
      stepName.includes('redstone') ||
      stepName.includes('mechanism') ||
      stepName.includes('automation')
    ) {
      if (stepName.includes('piston')) {
        return {
          type: 'operate_piston',
          parameters: { action: 'toggle', radius: 10 },
        };
      } else {
        return {
          type: 'control_redstone',
          parameters: { action: 'toggle', radius: 10 },
        };
      }
    }

    if (
      stepName.includes('build') ||
      stepName.includes('construct') ||
      stepName.includes('structure')
    ) {
      return {
        type: 'build_structure',
        parameters: {
          structureType: 'house',
          dimensions: { width: 5, height: 3, depth: 5 },
          material: 'cobblestone',
        },
      };
    }

    if (
      stepName.includes('environment') ||
      stepName.includes('weather') ||
      stepName.includes('time')
    ) {
      return {
        type: 'control_environment',
        parameters: { action: 'set_day' },
      };
    }

    if (
      stepName.includes('interact') ||
      stepName.includes('use') ||
      stepName.includes('activate')
    ) {
      return {
        type: 'interact_with_block',
        parameters: { interactionType: 'use' },
      };
    }

    // Legacy action mappings
    if (stepName.includes('navigate') || stepName.includes('move')) {
      return {
        type: 'move_to',
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
        parameters: { radius: 10 },
      };
    } else if (stepName.includes('explore') || stepName.includes('scan')) {
      return {
        type: 'sense_environment',
        parameters: { duration: 10000, radius: 20 },
      };
    } else if (stepName.includes('craft')) {
      return {
        type: 'craft_recipe',
        parameters: { item: 'auto_detect', materials: 'auto_collect' },
      };
    } else if (stepName.includes('place')) {
      return {
        type: 'place_block',
        parameters: { block_type: 'auto_select', position: 'optimal_location' },
      };
    }

    // Default action for unknown steps
    return {
      type: 'sense_environment',
      parameters: { duration: 5000, radius: 10 },
    };
  }

  /**
   * Map ActionType to leaf name
   */
  private mapActionTypeToLeaf(actionType: string): string {
    const actionMapping: Record<string, string> = {
      [ActionType.MOVEMENT]: 'move_to',
      [ActionType.INTERACTION]: 'interact_with_block',
      [ActionType.CRAFTING]: 'craft_recipe',
      [ActionType.COMBAT]: 'attack_entity',
      [ActionType.SOCIAL]: 'chat',
      [ActionType.EXPLORATION]: 'sense_environment',
      // New primitive operation mappings
      [ActionType.CONTAINER_INTERACTION]: 'interact_with_block',
      [ActionType.FARMING]: 'manage_farm',
      [ActionType.WORLD_INTERACTION]: 'interact_with_block',
      [ActionType.REDSTONE_CONTROL]: 'control_redstone',
      [ActionType.STRUCTURE_BUILDING]: 'build_structure',
      [ActionType.ENVIRONMENT_CONTROL]: 'control_environment',
      [ActionType.INVENTORY_MANAGEMENT]: 'manage_inventory',
      [ActionType.AGRICULTURE]: 'manage_farm',
      [ActionType.MECHANISM_OPERATION]: 'operate_piston',
    };

    return actionMapping[actionType] || 'sense_environment';
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

      const result = (await response.json()) as any;
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
        const health = (await response.json()) as any;
        return health.status === 'connected';
      }
      return false;
    } catch (error) {
      return false;
    }
  }
}
