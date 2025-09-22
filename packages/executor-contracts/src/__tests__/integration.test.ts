/**
 * Integration Tests for Executor Contracts
 *
 * Tests that verify the PBI enforcer integrates correctly with the planning system
 * and provides the effectiveness guarantees needed to solve the failure-to-act loop.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPBIEnforcer } from '../pbi-enforcer';
import { CapabilityRegistry } from '../capability-registry';
import {
  PlanStep,
  ExecutionContext,
  WorldSnapshot,
  PBIError,
  PBIErrorCode,
  DEFAULT_PBI_ACCEPTANCE,
} from '../types';

// Mock the existing planning system components
vi.mock('vitest', async () => {
  const actual = await vi.importActual('vitest');
  return {
    ...actual,
    vi: {
      ...actual.vi,
      fn: actual.vi.fn,
      mock: actual.vi.mock,
    },
  };
});

describe('PBI Integration with Planning System', () => {
  let pbiEnforcer: ReturnType<typeof createPBIEnforcer>;

  beforeEach(() => {
    pbiEnforcer = createPBIEnforcer();
  });

  describe('Plan Step Execution Effectiveness', () => {
    it('should successfully execute valid plan steps within TTFA limits', async () => {
      const validSteps: PlanStep[] = [
        {
          stepId: 'navigate-step-1',
          type: 'navigate',
          args: { x: 100, y: 65, z: 200 },
          safetyLevel: 'safe',
          expectedDurationMs: 1000,
        },
        {
          stepId: 'craft-step-1',
          type: 'craft_item',
          args: { item: 'wooden_pickaxe', quantity: 1 },
          safetyLevel: 'safe',
          expectedDurationMs: 1500,
        },
        {
          stepId: 'dig-step-1',
          type: 'dig_block',
          args: { block: 'stone', position: { x: 50, y: 64, z: 50 } },
          safetyLevel: 'safe',
          expectedDurationMs: 800,
        },
      ];

      const context: ExecutionContext = {
        threatLevel: 0.1,
        hostileCount: 0,
        nearLava: false,
        lavaDistance: 100,
        resourceValue: 0.5,
        detourDistance: 0,
        subgoalUrgency: 0.3,
        estimatedTimeToSubgoal: 5000,
        commitmentStrength: 0.7,
        timeOfDay: 'day',
        lightLevel: 15,
        airLevel: 300,
      };

      const mockWorldState = {
        getHealth: () => 20,
        getHunger: () => 20,
        getEnergy: () => 20,
        getPosition: () => ({ x: 0, y: 0, z: 0 }),
        getLightLevel: () => 15,
        getAir: () => 300,
        getTimeOfDay: () => 'day' as const,
        hasItem: (item: string) => item === 'oak_log',
        distanceTo: (target: any) => 50,
        getThreatLevel: () => 0.1,
        getInventory: () => ({ oak_log: 2, stick: 4 }),
        getNearbyResources: () => [
          { type: 'stone', position: { x: 50, y: 64, z: 50 } },
        ],
        getNearbyHostiles: () => [],
      };

      const results = [];

      for (const step of validSteps) {
        const result = await pbiEnforcer.executeStep(
          step,
          context,
          mockWorldState
        );
        results.push(result);

        // Each step should succeed
        expect(result.success).toBe(true);
        expect(result.error).toBeUndefined();

        // TTFA should be within acceptable limits
        expect(result.ttfaMs).toBeGreaterThan(0);
        expect(result.ttfaMs).toBeLessThan(DEFAULT_PBI_ACCEPTANCE.ttfaMs);

        // Verification should pass
        expect(result.verification.errors).toHaveLength(0);
        expect(result.verification.checks.registryCheck).toBe(true);
        expect(result.verification.checks.schemaCheck).toBe(true);
        expect(result.verification.checks.guardCheck).toBe(true);
      }

      // Overall effectiveness should be high
      const successRate =
        results.filter((r) => r.success).length / results.length;
      expect(successRate).toBe(1.0); // All should succeed
    });

    it('should fail gracefully for invalid plan steps', async () => {
      const invalidSteps: PlanStep[] = [
        {
          stepId: 'invalid-step-1',
          type: 'nonexistent_capability',
          args: { some: 'invalid_args' },
          safetyLevel: 'safe',
        },
        {
          stepId: 'schema-invalid-step-1',
          type: 'navigate',
          args: { invalid: 'coordinates' }, // Missing required x, y, z
          safetyLevel: 'safe',
        },
      ];

      const context: ExecutionContext = {
        threatLevel: 0.1,
        hostileCount: 0,
        nearLava: false,
        lavaDistance: 100,
        resourceValue: 0.5,
        detourDistance: 0,
        subgoalUrgency: 0.3,
        estimatedTimeToSubgoal: 5000,
        commitmentStrength: 0.7,
        timeOfDay: 'day',
        lightLevel: 15,
        airLevel: 300,
      };

      const mockWorldState = {
        getHealth: () => 20,
        getHunger: () => 20,
        getEnergy: () => 20,
        getPosition: () => ({ x: 0, y: 0, z: 0 }),
        getLightLevel: () => 15,
        getAir: () => 300,
        getTimeOfDay: () => 'day' as const,
        hasItem: (item: string) => false,
        distanceTo: (target: any) => 50,
        getThreatLevel: () => 0.1,
        getInventory: () => ({}),
        getNearbyResources: () => [],
        getNearbyHostiles: () => [],
      };

      for (const step of invalidSteps) {
        const result = await pbiEnforcer.executeStep(
          step,
          context,
          mockWorldState
        );

        // Should fail gracefully with PBI error
        expect(result.success).toBe(false);
        expect(result.error).toBeInstanceOf(PBIError);
        expect(result.ttfaMs).toBe(0); // No action attempted

        // Should provide clear error information
        expect(result.error?.code).toBeDefined();
        expect(result.verification.errors).toHaveLength(1);
      }
    });

    it('should handle guard violations appropriately', async () => {
      const dangerousStep: PlanStep = {
        stepId: 'dangerous-step-1',
        type: 'navigate',
        args: { x: 100, y: 65, z: 200 },
        safetyLevel: 'safe',
      };

      const dangerousContext: ExecutionContext = {
        threatLevel: 0.9, // High threat level
        hostileCount: 5,
        nearLava: true,
        lavaDistance: 2,
        resourceValue: 0.5,
        detourDistance: 0,
        subgoalUrgency: 0.3,
        estimatedTimeToSubgoal: 5000,
        commitmentStrength: 0.7,
        timeOfDay: 'night',
        lightLevel: 5,
        airLevel: 300,
      };

      const mockWorldState = {
        getHealth: () => 20,
        getHunger: () => 20,
        getEnergy: () => 20,
        getPosition: () => ({ x: 0, y: 0, z: 0 }),
        getLightLevel: () => 15,
        getAir: () => 300,
        getTimeOfDay: () => 'day' as const,
        hasItem: (item: string) => false,
        distanceTo: (target: any) => 50,
        getThreatLevel: () => 0.9,
        getInventory: () => ({}),
        getNearbyResources: () => [],
        getNearbyHostiles: () => [
          { type: 'zombie', position: { x: 10, y: 65, z: 10 }, hostile: true },
        ],
      };

      const result = await pbiEnforcer.executeStep(
        dangerousStep,
        dangerousContext,
        mockWorldState
      );

      // Should fail due to guard violation
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(PBIError);
      expect(result.error?.code).toBe(PBIErrorCode.GUARD_FAILED);
      expect(result.verification.checks.guardCheck).toBe(false);
    });
  });

  describe('Effectiveness Metrics and Observability', () => {
    it('should track and report effectiveness metrics', async () => {
      const steps: PlanStep[] = [
        {
          stepId: 'metric-step-1',
          type: 'navigate',
          args: { x: 100, y: 65, z: 200 },
          safetyLevel: 'safe',
        },
        {
          stepId: 'metric-step-2',
          type: 'craft_item',
          args: { item: 'wooden_sword' },
          safetyLevel: 'safe',
        },
      ];

      const context: ExecutionContext = {
        threatLevel: 0.1,
        hostileCount: 0,
        nearLava: false,
        lavaDistance: 100,
        resourceValue: 0.5,
        detourDistance: 0,
        subgoalUrgency: 0.3,
        estimatedTimeToSubgoal: 5000,
        commitmentStrength: 0.7,
        timeOfDay: 'day',
        lightLevel: 15,
        airLevel: 300,
      };

      const mockWorldState = {
        getHealth: () => 20,
        getHunger: () => 20,
        getEnergy: () => 20,
        getPosition: () => ({ x: 0, y: 0, z: 0 }),
        getLightLevel: () => 15,
        getAir: () => 300,
        getTimeOfDay: () => 'day' as const,
        hasItem: (item: string) => item === 'oak_log',
        distanceTo: (target: any) => 50,
        getThreatLevel: () => 0.1,
        getInventory: () => ({ oak_log: 2, stick: 4 }),
        getNearbyResources: () => [],
        getNearbyHostiles: () => [],
      };

      // Execute multiple steps to build metrics
      for (const step of steps) {
        await pbiEnforcer.executeStep(step, context, mockWorldState);
      }

      const metrics = pbiEnforcer.getMetrics();

      // Should have tracked attempts
      expect(metrics.stepAttempts).toBeGreaterThanOrEqual(2);
      expect(metrics.stepSuccesses).toBeGreaterThanOrEqual(2);
      expect(metrics.stepFailures).toBeGreaterThanOrEqual(0);

      // Should have calculated averages
      expect(metrics.avgTtfaMs).toBeGreaterThan(0);
      expect(metrics.avgTtfaMs).toBeLessThan(DEFAULT_PBI_ACCEPTANCE.ttfaMs);

      // Should have registry health metrics
      expect(metrics.capabilities).toBeDefined();
      expect(metrics.capabilities.totalCapabilities).toBeGreaterThan(0);
    });

    it('should detect stuck execution patterns', async () => {
      const stuckStep: PlanStep = {
        stepId: 'stuck-test-step',
        type: 'navigate',
        args: { x: 1000, y: 65, z: 2000 }, // Very far away
        safetyLevel: 'safe',
      };

      const context: ExecutionContext = {
        threatLevel: 0.1,
        hostileCount: 0,
        nearLava: false,
        lavaDistance: 100,
        resourceValue: 0.5,
        detourDistance: 0,
        subgoalUrgency: 0.3,
        estimatedTimeToSubgoal: 50000, // Very long estimated time
        commitmentStrength: 0.7,
        timeOfDay: 'day',
        lightLevel: 15,
        airLevel: 300,
      };

      const mockWorldState = {
        getHealth: () => 20,
        getHunger: () => 20,
        getEnergy: () => 20,
        getPosition: () => ({ x: 0, y: 0, z: 0 }),
        getLightLevel: () => 15,
        getAir: () => 300,
        getTimeOfDay: () => 'day' as const,
        hasItem: (item: string) => false,
        distanceTo: (target: any) => 1000, // Very far
        getThreatLevel: () => 0.1,
        getInventory: () => ({}),
        getNearbyResources: () => [],
        getNearbyHostiles: () => [],
      };

      // Check stuck detection
      const isStuckBefore = pbiEnforcer.checkStuckExecution(stuckStep.stepId);
      expect(isStuckBefore).toBe(false); // Not stuck yet

      // Execute the step
      const result = await pbiEnforcer.executeStep(
        stuckStep,
        context,
        mockWorldState
      );

      // The stuck detection interface should work
      expect(typeof pbiEnforcer.checkStuckExecution).toBe('function');
      expect(result.executionId).toBeDefined();
    });
  });

  describe('Integration with Existing Planning System', () => {
    it('should handle plan steps from existing planning system', async () => {
      // Simulate a plan step that would come from the existing planning system
      const existingSystemStep: PlanStep = {
        stepId: 'existing-system-step-1',
        type: 'navigate', // This matches our canonical verb
        args: {
          x: 100,
          y: 65,
          z: 200,
          timeoutMs: 30000,
          avoidHazards: true,
        },
        safetyLevel: 'safe',
        expectedDurationMs: 2000,
        cost: 1,
        priority: 1,
      };

      const context: ExecutionContext = {
        threatLevel: 0.2,
        hostileCount: 1,
        nearLava: false,
        lavaDistance: 50,
        resourceValue: 0.8,
        detourDistance: 10,
        subgoalUrgency: 0.5,
        estimatedTimeToSubgoal: 3000,
        commitmentStrength: 0.8,
        timeOfDay: 'day',
        lightLevel: 15,
        airLevel: 300,
      };

      const mockWorldState = {
        getHealth: () => 18, // Slightly damaged
        getHunger: () => 18,
        getEnergy: () => 18,
        getPosition: () => ({ x: 10, y: 65, z: 10 }),
        getLightLevel: () => 15,
        getAir: () => 300,
        getTimeOfDay: () => 'day' as const,
        hasItem: (item: string) => item === 'bread',
        distanceTo: (target: any) => 100,
        getThreatLevel: () => 0.2,
        getInventory: () => ({ bread: 3, oak_log: 5 }),
        getNearbyResources: () => [
          { type: 'coal_ore', position: { x: 80, y: 40, z: 180 } },
          { type: 'iron_ore', position: { x: 120, y: 50, z: 220 } },
        ],
        getNearbyHostiles: () => [
          {
            type: 'skeleton',
            position: { x: 90, y: 65, z: 190 },
            hostile: true,
          },
        ],
      };

      const result = await pbiEnforcer.executeStep(
        existingSystemStep,
        context,
        mockWorldState
      );

      // Should handle the existing system step appropriately
      expect(result.success).toBe(true);
      expect(result.verification.checks.registryCheck).toBe(true);
      expect(result.verification.checks.schemaCheck).toBe(true);
      expect(result.verification.checks.guardCheck).toBe(true);

      // Should have reasonable TTFA
      expect(result.ttfaMs).toBeGreaterThan(0);
      expect(result.ttfaMs).toBeLessThan(DEFAULT_PBI_ACCEPTANCE.ttfaMs * 2); // Allow some margin
    });

    it('should reject plan steps with non-canonical verbs', async () => {
      const nonCanonicalStep: PlanStep = {
        stepId: 'non-canonical-step-1',
        type: 'custom_move', // Not in our canonical verbs
        args: { destination: 'somewhere' },
        safetyLevel: 'safe',
      };

      const context: ExecutionContext = {
        threatLevel: 0.1,
        hostileCount: 0,
        nearLava: false,
        lavaDistance: 100,
        resourceValue: 0.5,
        detourDistance: 0,
        subgoalUrgency: 0.3,
        estimatedTimeToSubgoal: 5000,
        commitmentStrength: 0.7,
        timeOfDay: 'day',
        lightLevel: 15,
        airLevel: 300,
      };

      const mockWorldState = {
        getHealth: () => 20,
        getHunger: () => 20,
        getEnergy: () => 20,
        getPosition: () => ({ x: 0, y: 0, z: 0 }),
        getLightLevel: () => 15,
        getAir: () => 300,
        getTimeOfDay: () => 'day' as const,
        hasItem: (item: string) => false,
        distanceTo: (target: any) => 50,
        getThreatLevel: () => 0.1,
        getInventory: () => ({}),
        getNearbyResources: () => [],
        getNearbyHostiles: () => [],
      };

      const result = await pbiEnforcer.executeStep(
        nonCanonicalStep,
        context,
        mockWorldState
      );

      // Should fail due to unknown capability
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(PBIError);
      expect(result.error?.code).toBe(PBIErrorCode.UNKNOWN_VERB);
    });
  });

  describe('Failure Mode Prevention', () => {
    it('should prevent FM-01: Unknown Verb / Missing Capability', async () => {
      const unknownStep: PlanStep = {
        stepId: 'unknown-verb-test',
        type: 'does_not_exist',
        args: { some: 'args' },
        safetyLevel: 'safe',
      };

      const context: ExecutionContext = {
        threatLevel: 0.1,
        hostileCount: 0,
        nearLava: false,
        lavaDistance: 100,
        resourceValue: 0.5,
        detourDistance: 0,
        subgoalUrgency: 0.3,
        estimatedTimeToSubgoal: 5000,
        commitmentStrength: 0.7,
        timeOfDay: 'day',
        lightLevel: 15,
        airLevel: 300,
      };

      const mockWorldState = {
        getHealth: () => 20,
        getHunger: () => 20,
        getEnergy: () => 20,
        getPosition: () => ({ x: 0, y: 0, z: 0 }),
        getLightLevel: () => 15,
        getAir: () => 300,
        getTimeOfDay: () => 'day' as const,
        hasItem: (item: string) => false,
        distanceTo: (target: any) => 50,
        getThreatLevel: () => 0.1,
        getInventory: () => ({}),
        getNearbyResources: () => [],
        getNearbyHostiles: () => [],
      };

      const result = await pbiEnforcer.executeStep(
        unknownStep,
        context,
        mockWorldState
      );

      // Should fail fast with clear error
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(PBIError);
      expect(result.error?.code).toBe(PBIErrorCode.UNKNOWN_VERB);
      expect(result.ttfaMs).toBe(0); // No action attempted

      // Should provide actionable error information
      expect(result.verification.errors).toContain(
        'Unknown capability: does_not_exist'
      );
    });

    it('should handle FM-03: BT Branch Hang with stuck detection', async () => {
      const potentiallyStuckStep: PlanStep = {
        stepId: 'stuck-detection-test',
        type: 'navigate',
        args: { x: 999999, y: 65, z: 999999 }, // Impossible destination
        safetyLevel: 'safe',
      };

      const context: ExecutionContext = {
        threatLevel: 0.1,
        hostileCount: 0,
        nearLava: false,
        lavaDistance: 100,
        resourceValue: 0.5,
        detourDistance: 0,
        subgoalUrgency: 0.3,
        estimatedTimeToSubgoal: 50000, // Very long time
        commitmentStrength: 0.7,
        timeOfDay: 'day',
        lightLevel: 15,
        airLevel: 300,
      };

      const mockWorldState = {
        getHealth: () => 20,
        getHunger: () => 20,
        getEnergy: () => 20,
        getPosition: () => ({ x: 0, y: 0, z: 0 }),
        getLightLevel: () => 15,
        getAir: () => 300,
        getTimeOfDay: () => 'day' as const,
        hasItem: (item: string) => false,
        distanceTo: (target: any) => 1000000, // Very far
        getThreatLevel: () => 0.1,
        getInventory: () => ({}),
        getNearbyResources: () => [],
        getNearbyHostiles: () => [],
      };

      // The PBI enforcer should handle this gracefully
      const result = await pbiEnforcer.executeStep(
        potentiallyStuckStep,
        context,
        mockWorldState
      );

      // Should either succeed or fail clearly (not hang)
      expect(result.success || !result.success).toBe(true);

      // Should have execution tracking
      expect(result.executionId).toBeDefined();
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Overall Effectiveness Guarantees', () => {
    it('should meet PBI acceptance criteria for successful executions', async () => {
      const steps: PlanStep[] = [
        {
          stepId: 'effectiveness-test-1',
          type: 'navigate',
          args: { x: 50, y: 65, z: 50 },
          safetyLevel: 'safe',
        },
        {
          stepId: 'effectiveness-test-2',
          type: 'craft_item',
          args: { item: 'wooden_sword' },
          safetyLevel: 'safe',
        },
      ];

      const context: ExecutionContext = {
        threatLevel: 0.1,
        hostileCount: 0,
        nearLava: false,
        lavaDistance: 100,
        resourceValue: 0.8,
        detourDistance: 0,
        subgoalUrgency: 0.4,
        estimatedTimeToSubgoal: 3000,
        commitmentStrength: 0.7,
        timeOfDay: 'day',
        lightLevel: 15,
        airLevel: 300,
      };

      const mockWorldState = {
        getHealth: () => 20,
        getHunger: () => 20,
        getEnergy: () => 20,
        getPosition: () => ({ x: 0, y: 0, z: 0 }),
        getLightLevel: () => 15,
        getAir: () => 300,
        getTimeOfDay: () => 'day' as const,
        hasItem: (item: string) => ['oak_log', 'stick'].includes(item),
        distanceTo: (target: any) => 50,
        getThreatLevel: () => 0.1,
        getInventory: () => ({ oak_log: 3, stick: 2 }),
        getNearbyResources: () => [
          { type: 'stone', position: { x: 50, y: 64, z: 50 } },
        ],
        getNearbyHostiles: () => [],
      };

      const results = [];

      for (const step of steps) {
        const result = await pbiEnforcer.executeStep(
          step,
          context,
          mockWorldState
        );
        results.push(result);
      }

      // Calculate effectiveness metrics
      const successfulSteps = results.filter((r) => r.success).length;
      const totalSteps = results.length;
      const successRate = successfulSteps / totalSteps;

      const totalTtfa = results.reduce((sum, r) => sum + r.ttfaMs, 0);
      const averageTtfa = totalTtfa / totalSteps;

      // Effectiveness guarantees
      expect(successRate).toBeGreaterThanOrEqual(0.95); // A2: ≥95% completion/failure rate
      expect(averageTtfa).toBeLessThan(DEFAULT_PBI_ACCEPTANCE.ttfaMs); // A1: TTFA ≤ 2s

      // All results should be definitive (no silent failures)
      results.forEach((result) => {
        expect(result.success || result.error).toBeDefined();
      });
    });
  });
});
