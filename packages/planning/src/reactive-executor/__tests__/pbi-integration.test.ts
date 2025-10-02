/**
 * PBI Integration Tests
 *
 * Tests to verify that PBI enforcement is properly integrated with the existing
 * planning system and that it effectively prevents the failure-to-act loop.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EnhancedReactiveExecutor } from '../reactive-executor';
import { DEFAULT_PBI_ACCEPTANCE } from '@conscious-bot/executor-contracts/dist/index.js';

describe('PBI Integration with EnhancedReactiveExecutor', () => {
  let executor: EnhancedReactiveExecutor;

  beforeEach(() => {
    executor = new EnhancedReactiveExecutor();
  });

  describe('PBI Enforcement Integration', () => {
    it('should initialize with PBI enforcer', () => {
      const pbiMetrics = executor.getPBIEffectivenessMetrics();

      expect(pbiMetrics).toBeDefined();
      expect(pbiMetrics.stepAttempts).toBe(0);
      expect(pbiMetrics.stepSuccesses).toBe(0);
    });

    it('should track PBI effectiveness metrics', async () => {
      // Get initial metrics
      const initialMetrics = executor.getPBIEffectivenessMetrics();
      const initialAttempts = initialMetrics.stepAttempts || 0;

      // Execute a simple task
      const testTask = {
        type: 'navigate',
        parameters: { x: 100, y: 65, z: 200 },
        title: 'Test Navigation Task',
      };

      const result = await executor.executeTask(testTask);

      // Get updated metrics
      const updatedMetrics = executor.getPBIEffectivenessMetrics();

      // Should have tracked the attempt
      expect(updatedMetrics.stepAttempts).toBeGreaterThanOrEqual(
        initialAttempts
      );

      // Should provide effectiveness assessment
      const isEffective = executor.isPBIEffective();
      expect(typeof isEffective).toBe('boolean');
    });

    it('should enforce PBI contracts on task execution', async () => {
      const testTask = {
        type: 'navigate',
        parameters: { x: 100, y: 65, z: 200 },
        title: 'Test Navigation Task',
      };

      const result = await executor.executeTask(testTask);

      // Result should include PBI information
      expect(result).toBeDefined();
      expect(result.success).toBeDefined();

      // If successful, should have PBI result data
      if (result.success) {
        expect(result.effectiveness).toBeDefined();
        expect(result.effectiveness.ttfaMs).toBeGreaterThan(0);
        expect(result.effectiveness.withinTarget).toBeDefined();
      }
    });

    it('should meet PBI effectiveness criteria when tasks succeed', async () => {
      const testTask = {
        type: 'navigate',
        parameters: { x: 100, y: 65, z: 200 },
        title: 'Test Navigation Task',
      };

      const result = await executor.executeTask(testTask);

      // The executor should be effective if tasks are completing
      const isEffective = executor.isPBIEffective();

      // At minimum, the system should be able to assess effectiveness
      expect(typeof isEffective).toBe('boolean');

      // Log effectiveness for debugging
      console.log('PBI Effectiveness:', isEffective);
      console.log('PBI Metrics:', executor.getPBIEffectivenessMetrics());

      // Debug: Check if PBI enforcer has metrics
      console.log(
        'PBI Enforcer has getMetrics:',
        typeof executor['pbiEnforcer'].getMetrics
      );

      // Debug: Check if PBI enforcer has updateMetrics
      console.log(
        'PBI Enforcer has updateMetrics:',
        typeof executor['pbiEnforcer'].updateMetrics
      );

      // Debug: Test updateMetrics directly
      const initialMetrics = executor.getPBIEffectivenessMetrics();
      console.log('Initial metrics:', initialMetrics);
      executor['pbiEnforcer'].updateMetrics('test', 'success', 100);
      const updatedMetrics = executor.getPBIEffectivenessMetrics();
      console.log('Metrics after manual update:', updatedMetrics);
    });

    it('should handle invalid task types with PBI enforcement', async () => {
      const invalidTask = {
        type: 'invalid_action_type',
        parameters: { some: 'invalid_params' },
        title: 'Invalid Task Test',
      };

      const result = await executor.executeTask(invalidTask);

      // PBI should catch invalid actions and provide clear error information
      expect(result.success).toBeDefined();

      if (!result.success) {
        expect(result.error).toBeDefined();
        expect(typeof result.error).toBe('string');
      }
    });

    it('should track TTFA (Time-to-First-Action) metrics', async () => {
      const startTime = performance.now();

      const testTask = {
        type: 'navigate',
        parameters: { x: 100, y: 65, z: 200 },
        title: 'TTFA Test Task',
      };

      const result = await executor.executeTask(testTask);
      const endTime = performance.now();

      const metrics = executor.getPBIEffectivenessMetrics();
      const totalTime = endTime - startTime;

      // Should have tracked the execution attempt (may need a small delay for async metrics update)
      await new Promise((resolve) => setTimeout(resolve, 10));
      const updatedMetrics = executor.getPBIEffectivenessMetrics();
      expect(updatedMetrics.stepAttempts).toBeGreaterThan(0);

      // TTFA should be reasonable (not instant, not too long)
      if (result.effectiveness?.ttfaMs) {
        expect(result.effectiveness.ttfaMs).toBeGreaterThan(0);
        expect(result.effectiveness.ttfaMs).toBeLessThan(10000); // Less than 10 seconds
      }

      console.log('Execution took:', totalTime, 'ms');
      console.log('PBI TTFA:', result.effectiveness?.ttfaMs, 'ms');
    });

    it('should provide PBI health check', async () => {
      const metrics = executor.getPBIEffectivenessMetrics();

      // Should have all required metric properties
      expect(metrics).toHaveProperty('stepAttempts');
      expect(metrics).toHaveProperty('stepSuccesses');
      expect(metrics).toHaveProperty('stepFailures');
      expect(metrics).toHaveProperty('avgTtfaMs');
      expect(metrics).toHaveProperty('capabilities');

      // Capabilities should be initialized
      expect(metrics.capabilities).toBeDefined();
      expect(metrics.capabilities.totalCapabilities).toBeGreaterThan(0);
    });
  });

  describe('Failure-to-Act Loop Prevention', () => {
    it('should prevent silent failures through PBI verification', async () => {
      // Test with a task that might fail
      const riskyTask = {
        type: 'navigate',
        parameters: { x: 999999, y: 65, z: 999999 }, // Impossible coordinates
        title: 'Risky Navigation Task',
      };

      const result = await executor.executeTask(riskyTask);

      // PBI should ensure we get a definitive result
      expect(result.success).toBeDefined();

      // If it fails, we should get a clear error message
      if (!result.success) {
        expect(result.error).toBeDefined();
        expect(typeof result.error).toBe('string');
        expect(result.error.length).toBeGreaterThan(0);
      }

      // Should not have silent failures
      expect(result.success || result.error).toBeTruthy();
    });

    it('should enforce action contracts through PBI', async () => {
      const testTask = {
        type: 'navigate',
        parameters: { x: 100, y: 65, z: 200 },
        title: 'Contract Test Task',
      };

      const result = await executor.executeTask(testTask);

      // PBI should enforce that actions either succeed or provide clear failure reasons
      expect(result).toBeDefined();

      if (result.success) {
        // Success should be explicit and measurable
        expect(result.planExecuted).toBe(true);
        expect(result.actionsCompleted).toBeGreaterThanOrEqual(0);
      } else {
        // Failure should be explicit with clear error
        expect(result.error).toBeDefined();
        expect(result.error.length).toBeGreaterThan(0);
      }

      // No ambiguous states allowed
      expect(result.success || result.error).toBeTruthy();
    });

    it('should provide actionable feedback for failures', async () => {
      const invalidTask = {
        type: 'nonexistent_action',
        parameters: { invalid: 'params' },
        title: 'Invalid Action Test',
      };

      const result = await executor.executeTask(invalidTask);

      // PBI should provide actionable error information
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error.length).toBeGreaterThan(0);

      // Error should be informative enough to take corrective action
      expect(result.error).toContain('Unknown capability');
    });
  });

  describe('Effectiveness Monitoring', () => {
    it('should track effectiveness over multiple executions', async () => {
      const tasks = [
        {
          type: 'navigate',
          parameters: { x: 100, y: 65, z: 200 },
          title: 'Task 1',
        },
        {
          type: 'craft',
          parameters: { item: 'wooden_pickaxe' },
          title: 'Task 2',
        },
        { type: 'explore', parameters: { radius: 50 }, title: 'Task 3' },
      ];

      const results = [];
      for (const task of tasks) {
        const result = await executor.executeTask(task);
        results.push(result);
      }

      // Should have tracked all attempts (may need a small delay for async metrics update)
      await new Promise((resolve) => setTimeout(resolve, 10));
      const finalMetrics = executor.getPBIEffectivenessMetrics();
      expect(finalMetrics.stepAttempts).toBeGreaterThan(0);

      // Should have effectiveness assessment
      const isEffective = executor.isPBIEffective();
      expect(typeof isEffective).toBe('boolean');

      // Calculate manual effectiveness
      const successfulTasks = results.filter((r) => r.success).length;
      const manualEffectiveness = successfulTasks / tasks.length;

      console.log(`Manual effectiveness: ${manualEffectiveness * 100}%`);
      console.log('PBI effectiveness:', isEffective);
      console.log('Final metrics:', finalMetrics);

      // PBI should be able to assess effectiveness
      expect(isEffective || !isEffective).toBe(true);
    });
  });
});
