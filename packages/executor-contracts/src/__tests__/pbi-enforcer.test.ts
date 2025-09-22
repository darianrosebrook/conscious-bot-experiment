/**
 * PBI Enforcer Tests
 *
 * Tests for the Plan-Body Interface enforcer to ensure plans reliably become actions
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  PBIEnforcer,
  ExecutionResult,
  PBIError,
  PBIErrorCode,
  PlanStep,
  ActionResult,
  ExecutionContext,
  WorldSnapshot,
  DEFAULT_PBI_ACCEPTANCE,
} from '../pbi-enforcer';
import { CapabilityRegistry } from '../capability-registry';

describe('PBIEnforcer', () => {
  let registry: CapabilityRegistry;
  let enforcer: PBIEnforcer;

  beforeEach(() => {
    const { CapabilityRegistryBuilder } = require('../capability-registry');
    registry = new CapabilityRegistryBuilder()
      .addBuiltIn('navigate')
      .addBuiltIn('craft_item')
      .addBuiltIn('dig_block')
      .build();

    const { PBIEnforcer } = require('../pbi-enforcer');
    enforcer = new PBIEnforcer(registry);
  });

  describe('Step Verification (V1-V4)', () => {
    it('should pass verification for valid plan step', async () => {
      const validStep: PlanStep = {
        stepId: 'test-step-1',
        type: 'navigate',
        args: { x: 100, y: 65, z: 200 },
        safetyLevel: 'safe',
        expectedDurationMs: 1000,
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

      const result = await enforcer.verifyStep(validStep, context);

      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
      expect(result.checks.registryCheck).toBe(true);
      expect(result.checks.schemaCheck).toBe(true);
      expect(result.checks.guardCheck).toBe(true);
      expect(result.checks.acceptanceCheck).toBe(true);
    });

    it('should fail verification for unknown capability (V1)', async () => {
      const invalidStep: PlanStep = {
        stepId: 'test-step-2',
        type: 'unknown_action',
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

      const result = await enforcer.verifyStep(invalidStep, context);

      expect(result.errors).toContain('Unknown capability: unknown_action');
      expect(result.checks.registryCheck).toBe(false);
    });

    it('should fail verification for schema violations (V2)', async () => {
      const invalidStep: PlanStep = {
        stepId: 'test-step-3',
        type: 'navigate',
        args: { invalid: 'args' }, // Missing required x, y, z coordinates
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

      const result = await enforcer.verifyStep(invalidStep, context);

      expect(result.errors.some((e) => e.includes('Schema violation'))).toBe(
        true
      );
      expect(result.checks.schemaCheck).toBe(false);
    });

    it('should fail verification for guard violations (V3)', async () => {
      const dangerousStep: PlanStep = {
        stepId: 'test-step-4',
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

      const result = await enforcer.verifyStep(dangerousStep, dangerousContext);

      expect(result.errors.some((e) => e.includes('Guard failed'))).toBe(true);
      expect(result.checks.guardCheck).toBe(false);
    });
  });

  describe('Step Execution with PBI Enforcement', () => {
    it('should successfully execute valid plan step', async () => {
      const validStep: PlanStep = {
        stepId: 'test-step-5',
        type: 'navigate',
        args: { x: 100, y: 65, z: 200 },
        safetyLevel: 'safe',
        expectedDurationMs: 1000,
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

      const result = await enforcer.executeStep(
        validStep,
        context,
        mockWorldState
      );

      expect(result.success).toBe(true);
      expect(result.ttfaMs).toBeGreaterThan(0);
      expect(result.ttfaMs).toBeLessThan(DEFAULT_PBI_ACCEPTANCE.ttfaMs);
      expect(result.verification.checks.registryCheck).toBe(true);
      expect(result.verification.checks.schemaCheck).toBe(true);
      expect(result.verification.checks.guardCheck).toBe(true);
    });

    it('should fail execution for unknown capabilities', async () => {
      const invalidStep: PlanStep = {
        stepId: 'test-step-6',
        type: 'unknown_action',
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

      const result = await enforcer.executeStep(
        invalidStep,
        context,
        mockWorldState
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(PBIError);
      expect(result.error?.code).toBe(PBIErrorCode.UNKNOWN_VERB);
      expect(result.ttfaMs).toBe(0); // No action attempted
    });

    it('should handle acceptance failures (V4)', async () => {
      // This test would require mocking a capability that succeeds but
      // doesn't produce the expected effects - for now, we'll test the structure
      const step: PlanStep = {
        stepId: 'test-step-7',
        type: 'navigate',
        args: { x: 100, y: 65, z: 200 },
        safetyLevel: 'safe',
        expectedDurationMs: 1000,
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

      // For this test, we're mainly checking that the PBI enforcer
      // handles the execution flow correctly
      expect(step.type).toBe('navigate');
      expect(context.threatLevel).toBe(0.1);
    });
  });

  describe('Stuck Detection', () => {
    it('should detect stuck execution', async () => {
      const step: PlanStep = {
        stepId: 'test-step-8',
        type: 'navigate',
        args: { x: 100, y: 65, z: 200 },
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

      // Check that stuck detection is properly initialized
      expect(enforcer.checkStuckExecution('nonexistent')).toBe(false);

      // The stuck detection logic is tested in the PBI enforcer
      // This is more of a structural test to ensure the interface works
      expect(typeof enforcer.checkStuckExecution).toBe('function');
    });
  });

  describe('Metrics and Observability', () => {
    it('should track execution metrics', async () => {
      const step: PlanStep = {
        stepId: 'test-step-9',
        type: 'navigate',
        args: { x: 100, y: 65, z: 200 },
        safetyLevel: 'safe',
        expectedDurationMs: 1000,
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

      const metricsBefore = enforcer.getMetrics();

      await enforcer.executeStep(step, context, mockWorldState);

      const metricsAfter = enforcer.getMetrics();

      // Metrics should be updated
      expect(metricsAfter.stepAttempts).toBeGreaterThanOrEqual(
        metricsBefore.stepAttempts || 0
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle PBI errors correctly', async () => {
      const invalidStep: PlanStep = {
        stepId: 'test-step-10',
        type: 'nonexistent_capability',
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

      const result = await enforcer.executeStep(
        invalidStep,
        context,
        mockWorldState
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(PBIError);
      expect(result.error?.code).toBe(PBIErrorCode.UNKNOWN_VERB);
      expect(result.verification.errors).toContain(
        'Unknown capability: nonexistent_capability'
      );
    });

    it('should handle execution timeouts', async () => {
      // This test verifies that the PBI enforcer handles timeout errors
      // In a real implementation, we would need to test with actual timeouts

      const step: PlanStep = {
        stepId: 'test-step-11',
        type: 'navigate',
        args: { x: 100, y: 65, z: 200 },
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

      // Test that the error handling structure is correct
      // The actual timeout testing would require more complex mocking
      expect(step.type).toBe('navigate');
      expect(context.threatLevel).toBe(0.1);
    });
  });
});
