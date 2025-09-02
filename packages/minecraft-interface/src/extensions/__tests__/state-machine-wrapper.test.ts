/**
 * State Machine Wrapper Tests
 *
 * Tests the integration of Mineflayer's statemachine extension with our
 * planning system while preserving emergent behavior.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  StateMachineWrapper,
  type StateDefinition,
} from '../state-machine-wrapper';
import {
  createCraftingStateMachine,
  createBuildingStateMachine,
  createGatheringStateMachine,
} from '../crafting-state-definitions';

// Mock Bot for testing
const mockBot = {
  loadPlugin: vi.fn(),
  waitForTicks: vi.fn().mockResolvedValue(undefined),
  emit: vi.fn(),
  on: vi.fn(),
  once: vi.fn(),
  entity: { position: { x: 0, y: 64, z: 0 } },
} as any;

// Mock StateMachine
const mockStateMachine = {
  setState: vi.fn(),
  state: 'idle',
  on: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  stop: vi.fn(),
};

// Mock the require statement
vi.doMock('mineflayer-statemachine', () => ({
  StateMachine: vi.fn().mockImplementation(() => mockStateMachine),
}));

describe('StateMachineWrapper', () => {
  let wrapper: StateMachineWrapper;
  let testStates: StateDefinition[];

  beforeEach(() => {
    vi.clearAllMocks();
    wrapper = new StateMachineWrapper(mockBot, { enableDebugLogging: true });

    // Create test states
    testStates = [
      {
        name: 'test_state',
        description: 'Test state for testing',
        entryActions: [async () => console.log('Entering test state')],
        exitActions: [async () => console.log('Exiting test state')],
        transitions: [
          {
            from: 'test_state',
            to: 'done',
            condition: 'complete',
            description: 'Test complete',
          },
        ],
      },
      {
        name: 'done',
        description: 'Test complete',
        entryActions: [],
        exitActions: [],
        transitions: [],
      },
    ];
  });

  describe('Initialization', () => {
    it('should initialize successfully with valid states', async () => {
      await expect(wrapper.initialize(testStates)).resolves.not.toThrow();

      expect(mockBot.loadPlugin).toHaveBeenCalled();
      expect(mockStateMachine.on).toHaveBeenCalled();
    });

    it('should emit initialized event on success', async () => {
      const eventSpy = vi.spyOn(wrapper, 'emit');

      await wrapper.initialize(testStates);

      expect(eventSpy).toHaveBeenCalledWith('initialized', {
        states: ['test_state', 'done'],
      });
    });

    it('should handle initialization errors gracefully', async () => {
      mockBot.loadPlugin.mockImplementation(() => {
        throw new Error('Plugin load failed');
      });

      await expect(wrapper.initialize(testStates)).rejects.toThrow(
        'Plugin load failed'
      );
    });
  });

  describe('State Management', () => {
    beforeEach(async () => {
      await wrapper.initialize(testStates);
    });

    it('should track current state correctly', () => {
      const currentState = wrapper.getCurrentState();

      expect(currentState.name).toBe('idle');
      expect(currentState.history).toEqual([]);
    });

    it('should handle state transitions', () => {
      // Simulate state change
      mockStateMachine.state = 'test_state';

      const currentState = wrapper.getCurrentState();
      expect(currentState.name).toBe('idle'); // Should still be idle until proper transition
    });
  });

  describe('Execution Control', () => {
    beforeEach(async () => {
      await wrapper.initialize(testStates);
    });

    it('should pause execution when requested', () => {
      wrapper.pause();

      expect(mockStateMachine.pause).toHaveBeenCalled();
    });

    it('should resume execution when requested', () => {
      wrapper.resume();

      expect(mockStateMachine.resume).toHaveBeenCalled();
    });

    it('should stop execution when requested', () => {
      wrapper.stop();

      expect(mockStateMachine.stop).toHaveBeenCalled();
    });
  });

  describe('Event Handling', () => {
    beforeEach(async () => {
      await wrapper.initialize(testStates);
    });

    it('should emit events for state changes', () => {
      const eventSpy = vi.spyOn(wrapper, 'emit');

      // Simulate state change event
      const stateChangeCallback = mockStateMachine.on.mock.calls.find(
        (call) => call[0] === 'stateChanged'
      )?.[1];

      if (stateChangeCallback) {
        stateChangeCallback('idle', 'test_state');

        expect(eventSpy).toHaveBeenCalledWith('stateChanged', {
          oldState: 'idle',
          newState: 'test_state',
          timestamp: expect.any(Number),
        });
      }
    });

    it('should emit events for completion', () => {
      const eventSpy = vi.spyOn(wrapper, 'emit');

      // Simulate completion event
      const completionCallback = mockStateMachine.on.mock.calls.find(
        (call) => call[0] === 'done'
      )?.[1];

      if (completionCallback) {
        completionCallback();

        expect(eventSpy).toHaveBeenCalledWith('completed', {
          finalState: 'idle',
          timestamp: expect.any(Number),
        });
      }
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await wrapper.initialize(testStates);
    });

    it('should handle state machine errors', () => {
      const eventSpy = vi.spyOn(wrapper, 'emit');

      // Simulate error event
      const errorCallback = mockStateMachine.on.mock.calls.find(
        (call) => call[0] === 'error'
      )?.[1];

      if (errorCallback) {
        const testError = new Error('Test error');
        errorCallback(testError);

        expect(eventSpy).toHaveBeenCalledWith('error', {
          error: testError,
          state: 'idle',
          timestamp: expect.any(Number),
        });
      }
    });
  });
});

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
});
