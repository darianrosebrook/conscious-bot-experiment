/**
 * Crafting State Definitions - Pre-built states for common crafting workflows
 *
 * These state definitions provide structured workflows for crafting while
 * maintaining our planning system's control over decision-making. The bot
 * still decides what to craft, when to craft, and how to prioritize
 * crafting tasks.
 *
 * @author @darianrosebrook
 */

import { StateDefinition, StateTransition } from './state-machine-wrapper';
import { Bot } from 'mineflayer';

/**
 * Create a crafting state machine for a specific item
 * This maintains our planning system's control while providing structured execution
 */
export function createCraftingStateMachine(
  bot: Bot,
  itemName: string,
  quantity: number = 1
): StateDefinition[] {
  return [
    {
      name: 'crafting',
      description: `Craft ${quantity}x ${itemName}`,
      entryActions: [
        async () => {
          // Our planning system decides what to craft - this just executes it
          console.log(`[Crafting] Starting craft of ${quantity}x ${itemName}`);
        },
      ],
      exitActions: [],
      transitions: [
        {
          from: 'crafting',
          to: 'check_materials',
          condition: 'start',
          description: 'Begin material checking phase',
        },
      ],
      metadata: {
        itemName,
        quantity,
        type: 'crafting_workflow',
      },
    },
    {
      name: 'check_materials',
      description: 'Check if required materials are available',
      entryActions: [
        async () => {
          // Check inventory for required materials
          // This is a capability check, not a decision
          console.log(`[Crafting] Checking materials for ${itemName}`);
        },
      ],
      exitActions: [],
      transitions: [
        {
          from: 'check_materials',
          to: 'gather_materials',
          condition: 'materials_missing',
          description: 'Materials need to be gathered',
        },
        {
          from: 'check_materials',
          to: 'execute_crafting',
          condition: 'materials_ready',
          description: 'All materials available, proceed to crafting',
        },
      ],
      metadata: {
        phase: 'material_check',
        itemName,
      },
    },
    {
      name: 'gather_materials',
      description: 'Gather missing materials',
      entryActions: [
        async () => {
          // Our planning system decides what to gather - this just executes it
          console.log(`[Crafting] Gathering materials for ${itemName}`);
        },
      ],
      exitActions: [],
      transitions: [
        {
          from: 'gather_materials',
          to: 'check_materials',
          condition: 'gathering_complete',
          description: 'Return to material check',
        },
        {
          from: 'gather_materials',
          to: 'crafting_failed',
          condition: 'gathering_failed',
          description: 'Material gathering failed',
        },
      ],
      metadata: {
        phase: 'material_gathering',
        itemName,
      },
    },
    {
      name: 'execute_crafting',
      description: 'Execute the actual crafting process',
      entryActions: [
        async () => {
          // Execute crafting using our existing action translator
          // This maintains our planning system's control
          console.log(`[Crafting] Executing craft of ${quantity}x ${itemName}`);
        },
      ],
      exitActions: [],
      transitions: [
        {
          from: 'execute_crafting',
          to: 'verify_crafting',
          condition: 'crafting_complete',
          description: 'Crafting complete, verify result',
        },
        {
          from: 'execute_crafting',
          to: 'crafting_failed',
          condition: 'crafting_failed',
          description: 'Crafting process failed',
        },
      ],
      metadata: {
        phase: 'crafting_execution',
        itemName,
        quantity,
      },
    },
    {
      name: 'verify_crafting',
      description: 'Verify that crafting was successful',
      entryActions: [
        async () => {
          // Verify the crafted item is in inventory
          console.log(`[Crafting] Verifying craft result for ${itemName}`);
        },
      ],
      exitActions: [],
      transitions: [
        {
          from: 'verify_crafting',
          to: 'crafting_success',
          condition: 'verification_passed',
          description: 'Crafting verified successful',
        },
        {
          from: 'verify_crafting',
          to: 'crafting_failed',
          condition: 'verification_failed',
          description: 'Crafting verification failed',
        },
      ],
      metadata: {
        phase: 'verification',
        itemName,
      },
    },
    {
      name: 'crafting_success',
      description: 'Crafting completed successfully',
      entryActions: [
        async () => {
          console.log(
            `[Crafting] Successfully crafted ${quantity}x ${itemName}`
          );
          // Emit success event for our planning system
          (bot as any).emit('crafting_success', { itemName, quantity });
        },
      ],
      exitActions: [],
      transitions: [
        {
          from: 'crafting_success',
          to: 'done',
          condition: 'complete',
          description: 'Crafting workflow complete',
        },
      ],
      metadata: {
        phase: 'success',
        itemName,
        quantity,
        status: 'completed',
      },
    },
    {
      name: 'crafting_failed',
      description: 'Crafting failed',
      entryActions: [
        async () => {
          console.log(`[Crafting] Failed to craft ${itemName}`);
          // Emit failure event for our planning system
          (bot as any).emit('crafting_failed', {
            itemName,
            quantity,
            reason: 'workflow_failure',
          });
        },
      ],
      exitActions: [],
      transitions: [
        {
          from: 'crafting_failed',
          to: 'done',
          condition: 'complete',
          description: 'Crafting workflow failed',
        },
      ],
      metadata: {
        phase: 'failure',
        itemName,
        quantity,
        status: 'failed',
      },
    },
    {
      name: 'done',
      description: 'Crafting workflow complete',
      entryActions: [
        async () => {
          console.log(`[Crafting] Workflow complete for ${itemName}`);
        },
      ],
      exitActions: [],
      transitions: [],
      metadata: {
        phase: 'completion',
        itemName,
        status: 'workflow_complete',
      },
    },
  ];
}

/**
 * Create a building state machine for constructing structures
 * This provides structured execution while maintaining planning control
 */
export function createBuildingStateMachine(
  bot: Bot,
  structureType: string,
  dimensions: { width: number; height: number; depth: number }
): StateDefinition[] {
  return [
    {
      name: 'building',
      description: `Build ${structureType} structure`,
      entryActions: [
        async () => {
          console.log(`[Building] Starting construction of ${structureType}`);
        },
      ],
      exitActions: [],
      transitions: [
        {
          from: 'building',
          to: 'plan_structure',
          condition: 'start',
          description: 'Begin structure planning',
        },
      ],
      metadata: {
        structureType,
        dimensions,
        type: 'building_workflow',
      },
    },
    {
      name: 'plan_structure',
      description: 'Plan the structure layout',
      entryActions: [
        async () => {
          // Our planning system decides the structure design
          console.log(`[Building] Planning ${structureType} layout`);
        },
      ],
      exitActions: [],
      transitions: [
        {
          from: 'plan_structure',
          to: 'gather_building_materials',
          condition: 'planning_complete',
          description: 'Structure planned, gather materials',
        },
      ],
      metadata: {
        phase: 'planning',
        structureType,
      },
    },
    {
      name: 'gather_building_materials',
      description: 'Gather materials for construction',
      entryActions: [
        async () => {
          console.log(`[Building] Gathering materials for ${structureType}`);
        },
      ],
      exitActions: [],
      transitions: [
        {
          from: 'gather_building_materials',
          to: 'execute_building',
          condition: 'materials_ready',
          description: 'Materials gathered, begin construction',
        },
      ],
      metadata: {
        phase: 'material_gathering',
        structureType,
      },
    },
    {
      name: 'execute_building',
      description: 'Execute the building construction',
      entryActions: [
        async () => {
          console.log(`[Building] Constructing ${structureType}`);
        },
      ],
      exitActions: [],
      transitions: [
        {
          from: 'execute_building',
          to: 'building_success',
          condition: 'construction_complete',
          description: 'Construction completed',
        },
      ],
      metadata: {
        phase: 'construction',
        structureType,
      },
    },
    {
      name: 'building_success',
      description: 'Building completed successfully',
      entryActions: [
        async () => {
          console.log(`[Building] Successfully built ${structureType}`);
          (bot as any).emit('building_success', { structureType, dimensions });
        },
      ],
      exitActions: [],
      transitions: [
        {
          from: 'building_success',
          to: 'done',
          condition: 'complete',
          description: 'Building workflow complete',
        },
      ],
      metadata: {
        phase: 'success',
        structureType,
        status: 'completed',
      },
    },
    {
      name: 'done',
      description: 'Building workflow complete',
      entryActions: [
        async () => {
          console.log(`[Building] Workflow complete for ${structureType}`);
        },
      ],
      exitActions: [],
      transitions: [],
      metadata: {
        phase: 'completion',
        structureType,
        status: 'workflow_complete',
      },
    },
  ];
}

/**
 * Create a resource gathering state machine
 * This provides structured gathering while maintaining planning control
 */
export function createGatheringStateMachine(
  bot: Bot,
  resourceType: string,
  targetQuantity: number
): StateDefinition[] {
  return [
    {
      name: 'gathering',
      description: `Gather ${targetQuantity}x ${resourceType}`,
      entryActions: [
        async () => {
          console.log(
            `[Gathering] Starting to gather ${targetQuantity}x ${resourceType}`
          );
        },
      ],
      exitActions: [],
      transitions: [
        {
          from: 'gathering',
          to: 'locate_resources',
          condition: 'start',
          description: 'Begin resource location',
        },
      ],
      metadata: {
        resourceType,
        targetQuantity,
        type: 'gathering_workflow',
      },
    },
    {
      name: 'locate_resources',
      description: 'Locate available resources',
      entryActions: [
        async () => {
          console.log(`[Gathering] Locating ${resourceType} resources`);
        },
      ],
      exitActions: [],
      transitions: [
        {
          from: 'locate_resources',
          to: 'collect_resources',
          condition: 'resources_found',
          description: 'Resources located, begin collection',
        },
        {
          from: 'locate_resources',
          to: 'explore_for_resources',
          condition: 'no_resources_found',
          description: 'No resources found, explore further',
        },
      ],
      metadata: {
        phase: 'location',
        resourceType,
      },
    },
    {
      name: 'explore_for_resources',
      description: 'Explore to find resources',
      entryActions: [
        async () => {
          console.log(`[Gathering] Exploring to find ${resourceType}`);
        },
      ],
      exitActions: [],
      transitions: [
        {
          from: 'explore_for_resources',
          to: 'locate_resources',
          condition: 'exploration_complete',
          description: 'Exploration complete, check for resources',
        },
      ],
      metadata: {
        phase: 'exploration',
        resourceType,
      },
    },
    {
      name: 'collect_resources',
      description: 'Collect the located resources',
      entryActions: [
        async () => {
          console.log(`[Gathering] Collecting ${resourceType}`);
        },
      ],
      exitActions: [],
      transitions: [
        {
          from: 'collect_resources',
          to: 'verify_quantity',
          condition: 'collection_complete',
          description: 'Collection complete, verify quantity',
        },
      ],
      metadata: {
        phase: 'collection',
        resourceType,
      },
    },
    {
      name: 'verify_quantity',
      description: 'Verify collected quantity meets target',
      entryActions: [
        async () => {
          console.log(
            `[Gathering] Verifying collected quantity of ${resourceType}`
          );
        },
      ],
      exitActions: [],
      transitions: [
        {
          from: 'verify_quantity',
          to: 'gathering_success',
          condition: 'quantity_sufficient',
          description: 'Target quantity reached',
        },
        {
          from: 'verify_quantity',
          to: 'locate_resources',
          condition: 'quantity_insufficient',
          description: 'Need more resources, continue gathering',
        },
      ],
      metadata: {
        phase: 'verification',
        resourceType,
        targetQuantity,
      },
    },
    {
      name: 'gathering_success',
      description: 'Gathering completed successfully',
      entryActions: [
        async () => {
          console.log(
            `[Gathering] Successfully gathered ${targetQuantity}x ${resourceType}`
          );
          (bot as any).emit('gathering_success', {
            resourceType,
            quantity: targetQuantity,
          });
        },
      ],
      exitActions: [],
      transitions: [
        {
          from: 'gathering_success',
          to: 'done',
          condition: 'complete',
          description: 'Gathering workflow complete',
        },
      ],
      metadata: {
        phase: 'success',
        resourceType,
        quantity: targetQuantity,
        status: 'completed',
      },
    },
    {
      name: 'done',
      description: 'Gathering workflow complete',
      entryActions: [
        async () => {
          console.log(`[Gathering] Workflow complete for ${resourceType}`);
        },
      ],
      exitActions: [],
      transitions: [],
      metadata: {
        phase: 'completion',
        resourceType,
        status: 'workflow_complete',
      },
    },
  ];
}
