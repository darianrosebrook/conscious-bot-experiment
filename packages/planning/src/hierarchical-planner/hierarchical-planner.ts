/**
 * Hierarchical Task Planner (HTN) - Implementation.
 *
 * Decomposes high-level goals into concrete executable plans.
 *
 * Author: @darianrosebrook
 */

import { Goal, Plan } from '../types';

export class HierarchicalPlanner {
  /**
   * Decompose a goal into a concrete plan with executable steps.
   */
  decompose(goal: Goal): Plan | undefined {
    if (!goal) return undefined;

    const now = Date.now();
    const steps = this.generateStepsForGoal(goal);

    return {
      id: `plan-${now}-${goal.id}`,
      goalId: goal.id,
      steps: steps,
      status: 0 as any,
      priority: goal.priority,
      estimatedDuration: this.calculateTotalDuration(steps),
      createdAt: now,
      updatedAt: now,
      successProbability: this.calculateSuccessProbability(steps),
    };
  }

  private generateStepsForGoal(goal: Goal): any[] {
    const goalDescription = goal.description.toLowerCase();

    // Minecraft-specific goal decomposition
    if (
      goalDescription.includes('gather') ||
      goalDescription.includes('wood')
    ) {
      return this.generateGatherWoodSteps();
    } else if (
      goalDescription.includes('craft') ||
      goalDescription.includes('pickaxe')
    ) {
      return this.generateCraftPickaxeSteps();
    } else if (
      goalDescription.includes('explore') ||
      goalDescription.includes('cave')
    ) {
      return this.generateExploreCaveSteps();
    } else if (
      goalDescription.includes('mine') ||
      goalDescription.includes('iron')
    ) {
      return this.generateMineIronSteps();
    } else if (
      goalDescription.includes('navigate') ||
      goalDescription.includes('move')
    ) {
      return this.generateNavigationSteps();
    } else if (
      goalDescription.includes('find') ||
      goalDescription.includes('resource')
    ) {
      return this.generateFindResourceSteps();
    }

    // Default exploration steps
    return this.generateDefaultExplorationSteps();
  }

  private generateGatherWoodSteps(): any[] {
    return [
      {
        id: `step-${Date.now()}-1`,
        name: 'Locate nearby trees',
        status: 'pending',
        priority: 0.9,
        estimatedDuration: 15000,
        action: {
          type: 'explore_area',
          parameters: { radius: 30, target_type: 'trees' },
        },
      },
      {
        id: `step-${Date.now()}-2`,
        name: 'Navigate to nearest tree',
        status: 'pending',
        priority: 0.8,
        estimatedDuration: 10000,
        action: {
          type: 'navigate',
          parameters: { target: 'nearest_tree', max_distance: 50 },
        },
      },
      {
        id: `step-${Date.now()}-3`,
        name: 'Break tree blocks',
        status: 'pending',
        priority: 1.0,
        estimatedDuration: 20000,
        action: {
          type: 'dig_block',
          parameters: { pos: 'tree_blocks', tool: 'hand' },
        },
      },
      {
        id: `step-${Date.now()}-4`,
        name: 'Collect dropped wood',
        status: 'pending',
        priority: 0.9,
        estimatedDuration: 5000,
        action: {
          type: 'pickup_item',
          parameters: { radius: 10, item_type: 'wood' },
        },
      },
    ];
  }

  private generateCraftPickaxeSteps(): any[] {
    return [
      {
        id: `step-${Date.now()}-1`,
        name: 'Ensure wood is available',
        status: 'pending',
        priority: 0.9,
        estimatedDuration: 5000,
        action: {
          type: 'check_inventory',
          parameters: { item_type: 'wood', min_count: 3 },
        },
      },
      {
        id: `step-${Date.now()}-2`,
        name: 'Craft wooden pickaxe',
        status: 'pending',
        priority: 1.0,
        estimatedDuration: 10000,
        action: {
          type: 'craft_item',
          parameters: { item: 'wooden_pickaxe', materials: 'auto' },
        },
      },
    ];
  }

  private generateExploreCaveSteps(): any[] {
    return [
      {
        id: `step-${Date.now()}-1`,
        name: 'Find cave entrance',
        status: 'pending',
        priority: 0.9,
        estimatedDuration: 20000,
        action: {
          type: 'explore_area',
          parameters: { radius: 50, target_type: 'cave_entrance' },
        },
      },
      {
        id: `step-${Date.now()}-2`,
        name: 'Navigate into cave',
        status: 'pending',
        priority: 0.8,
        estimatedDuration: 15000,
        action: {
          type: 'navigate',
          parameters: { target: 'cave_interior', safety_check: true },
        },
      },
      {
        id: `step-${Date.now()}-3`,
        name: 'Explore cave system',
        status: 'pending',
        priority: 1.0,
        estimatedDuration: 30000,
        action: {
          type: 'explore_environment',
          parameters: { duration: 30000, radius: 20 },
        },
      },
    ];
  }

  private generateMineIronSteps(): any[] {
    return [
      {
        id: `step-${Date.now()}-1`,
        name: 'Find iron ore deposits',
        status: 'pending',
        priority: 0.9,
        estimatedDuration: 25000,
        action: {
          type: 'explore_area',
          parameters: { radius: 40, target_type: 'iron_ore' },
        },
      },
      {
        id: `step-${Date.now()}-2`,
        name: 'Navigate to iron ore',
        status: 'pending',
        priority: 0.8,
        estimatedDuration: 15000,
        action: {
          type: 'navigate',
          parameters: { target: 'iron_ore_location', max_distance: 50 },
        },
      },
      {
        id: `step-${Date.now()}-3`,
        name: 'Mine iron ore blocks',
        status: 'pending',
        priority: 1.0,
        estimatedDuration: 20000,
        action: {
          type: 'dig_block',
          parameters: { pos: 'iron_ore_blocks', tool: 'pickaxe' },
        },
      },
    ];
  }

  private generateNavigationSteps(): any[] {
    return [
      {
        id: `step-${Date.now()}-1`,
        name: 'Calculate optimal path',
        status: 'pending',
        priority: 0.8,
        estimatedDuration: 5000,
        action: {
          type: 'pathfind',
          parameters: { target: 'auto_detect', optimize: true },
        },
      },
      {
        id: `step-${Date.now()}-2`,
        name: 'Execute navigation',
        status: 'pending',
        priority: 1.0,
        estimatedDuration: 20000,
        action: {
          type: 'navigate',
          parameters: { target: 'calculated_path', safety_check: true },
        },
      },
    ];
  }

  private generateFindResourceSteps(): any[] {
    return [
      {
        id: `step-${Date.now()}-1`,
        name: 'Scan environment for resources',
        status: 'pending',
        priority: 0.9,
        estimatedDuration: 15000,
        action: {
          type: 'explore_area',
          parameters: { radius: 30, target_type: 'any_resources' },
        },
      },
      {
        id: `step-${Date.now()}-2`,
        name: 'Navigate to resources',
        status: 'pending',
        priority: 0.8,
        estimatedDuration: 10000,
        action: {
          type: 'navigate',
          parameters: { target: 'resource_location', max_distance: 40 },
        },
      },
      {
        id: `step-${Date.now()}-3`,
        name: 'Collect resources',
        status: 'pending',
        priority: 1.0,
        estimatedDuration: 15000,
        action: {
          type: 'gather_resources',
          parameters: { resource_type: 'auto', radius: 5 },
        },
      },
    ];
  }

  private generateDefaultExplorationSteps(): any[] {
    return [
      {
        id: `step-${Date.now()}-1`,
        name: 'Explore current area',
        status: 'pending',
        priority: 0.7,
        estimatedDuration: 20000,
        action: {
          type: 'explore_environment',
          parameters: { duration: 20000, radius: 15 },
        },
      },
      {
        id: `step-${Date.now()}-2`,
        name: 'Scan for interesting features',
        status: 'pending',
        priority: 0.8,
        estimatedDuration: 10000,
        action: {
          type: 'explore_area',
          parameters: { radius: 25, target_type: 'any' },
        },
      },
    ];
  }

  private calculateTotalDuration(steps: any[]): number {
    return steps.reduce(
      (total, step) => total + (step.estimatedDuration || 0),
      0
    );
  }

  private calculateSuccessProbability(steps: any[]): number {
    if (steps.length === 0) return 0.5;

    // Simple heuristic: more steps = lower probability, but not too low
    const baseProbability = 0.8;
    const stepPenalty = Math.min(0.2, steps.length * 0.02);
    return Math.max(0.3, baseProbability - stepPenalty);
  }
}
