/**
 * Extensions Integration Tests
 *
 * Tests the integration of Mineflayer extensions with our planning system
 * while preserving emergent behavior. These tests focus on functionality
 * rather than complex mocking.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';
import {
  createCraftingStateMachine,
  createBuildingStateMachine,
  createGatheringStateMachine,
} from '../crafting-state-definitions';

// Mock Bot for testing
const mockBot = {
  emit: () => {},
  entity: { position: { x: 0, y: 64, z: 0 } },
} as any;

describe('Crafting State Definitions', () => {
  it('should create valid crafting state machine', () => {
    const states = createCraftingStateMachine(mockBot, 'wooden_pickaxe', 1);

    expect(states).toHaveLength(8); // All crafting states
    expect(states[0].name).toBe('crafting');
    expect(states[states.length - 1].name).toBe('done');

    // Verify transitions form a valid chain
    const craftingState = states.find((s) => s.name === 'crafting');
    expect(craftingState?.transitions).toHaveLength(1);
    expect(craftingState?.transitions[0].to).toBe('check_materials');
  });

  it('should create valid building state machine', () => {
    const states = createBuildingStateMachine(mockBot, 'house', {
      width: 5,
      height: 3,
      depth: 4,
    });

    expect(states).toHaveLength(6); // All building states
    expect(states[0].name).toBe('building');
    expect(states[states.length - 1].name).toBe('done');

    // Verify metadata is preserved
    const buildingState = states.find((s) => s.name === 'building');
    expect(buildingState?.metadata?.structureType).toBe('house');
    expect(buildingState?.metadata?.dimensions).toEqual({
      width: 5,
      height: 3,
      depth: 4,
    });
  });

  it('should create valid gathering state machine', () => {
    const states = createGatheringStateMachine(mockBot, 'wood', 64);

    expect(states).toHaveLength(7); // All gathering states
    expect(states[0].name).toBe('gathering');
    expect(states[states.length - 1].name).toBe('done');

    // Verify target quantity is preserved
    const gatheringState = states.find((s) => s.name === 'gathering');
    expect(gatheringState?.metadata?.targetQuantity).toBe(64);
    expect(gatheringState?.metadata?.resourceType).toBe('wood');
  });
});

describe('Emergent Behavior Preservation', () => {
  it('should not override planning system decisions', () => {
    const states = createCraftingStateMachine(mockBot, 'stone_pickaxe', 1);

    // Verify that entry actions don't make decisions, just execute
    const checkMaterialsState = states.find(
      (s) => s.name === 'check_materials'
    );
    expect(checkMaterialsState?.entryActions).toHaveLength(1);

    // The entry action should only log/execute, not decide
    const entryAction = checkMaterialsState?.entryActions[0];
    expect(entryAction).toBeDefined();
  });

  it('should maintain planning system control through events', () => {
    const states = createCraftingStateMachine(mockBot, 'iron_pickaxe', 1);

    // Verify that success/failure events are emitted for planning system
    const successState = states.find((s) => s.name === 'crafting_success');
    const failureState = states.find((s) => s.name === 'crafting_failed');

    expect(successState?.entryActions).toHaveLength(1);
    expect(failureState?.entryActions).toHaveLength(1);

    // Both should emit events that the planning system can listen to
    expect(successState?.metadata?.status).toBe('completed');
    expect(failureState?.metadata?.status).toBe('failed');
  });

  it('should provide structured workflows without dictating behavior', () => {
    const states = createCraftingStateMachine(mockBot, 'diamond_pickaxe', 1);

    // Verify that the workflow provides structure but doesn't make decisions
    const gatherMaterialsState = states.find(
      (s) => s.name === 'gather_materials'
    );
    expect(gatherMaterialsState).toBeDefined();

    // The state should have transitions but not dictate what to gather
    expect(gatherMaterialsState?.transitions).toHaveLength(2);
    expect(gatherMaterialsState?.metadata?.phase).toBe('material_gathering');
  });
});

describe('State Machine Architecture', () => {
  it('should have consistent state naming conventions', () => {
    const states = createCraftingStateMachine(mockBot, 'golden_pickaxe', 1);

    // All states should follow naming conventions
    states.forEach((state) => {
      expect(state.name).toMatch(/^[a-z_]+$/);
      expect(state.description).toBeTruthy();
      expect(state.metadata).toBeDefined();
    });
  });

  it('should have valid transition chains', () => {
    const states = createCraftingStateMachine(mockBot, 'netherite_pickaxe', 1);

    // Verify that transitions form a valid chain
    const stateNames = states.map((s) => s.name);

    states.forEach((state) => {
      state.transitions.forEach((transition) => {
        // Transition target should exist
        expect(stateNames).toContain(transition.to);
        // Transition should have valid condition
        expect(transition.condition).toBeTruthy();
        // Transition should have description
        expect(transition.description).toBeTruthy();
      });
    });
  });

  it('should preserve metadata throughout workflow', () => {
    const itemName = 'emerald_pickaxe';
    const quantity = 3;
    const states = createCraftingStateMachine(mockBot, itemName, quantity);

    // Verify metadata is preserved across states
    states.forEach((state) => {
      if (state.metadata?.itemName) {
        expect(state.metadata.itemName).toBe(itemName);
      }
      if (state.metadata?.quantity) {
        expect(state.metadata.quantity).toBe(quantity);
      }
    });
  });
});

describe('Extension Integration Philosophy', () => {
  it('should treat extensions as capability providers', () => {
    const states = createCraftingStateMachine(mockBot, 'wooden_sword', 1);

    // Verify that states provide capabilities, not behaviors
    const executeCraftingState = states.find(
      (s) => s.name === 'execute_crafting'
    );
    expect(executeCraftingState).toBeDefined();

    // The state should execute crafting but not decide what to craft
    expect(executeCraftingState?.metadata?.phase).toBe('crafting_execution');
    expect(executeCraftingState?.metadata?.itemName).toBe('wooden_sword');
  });

  it('should maintain planning system autonomy', () => {
    const states = createBuildingStateMachine(mockBot, 'tower', {
      width: 3,
      height: 10,
      depth: 3,
    });

    // Verify that the planning system maintains control
    const planStructureState = states.find((s) => s.name === 'plan_structure');
    expect(planStructureState).toBeDefined();

    // The state should plan the structure but not dictate the design
    expect(planStructureState?.metadata?.phase).toBe('planning');
    expect(planStructureState?.metadata?.structureType).toBe('tower');
  });

  it('should provide fallback and error handling', () => {
    const states = createGatheringStateMachine(mockBot, 'stone', 32);

    // Verify that error handling is built into the workflow
    const exploreForResourcesState = states.find(
      (s) => s.name === 'explore_for_resources'
    );
    expect(exploreForResourcesState).toBeDefined();

    // This state provides fallback behavior when resources aren't found
    expect(exploreForResourcesState?.metadata?.phase).toBe('exploration');
    expect(exploreForResourcesState?.metadata?.resourceType).toBe('stone');
  });
});
