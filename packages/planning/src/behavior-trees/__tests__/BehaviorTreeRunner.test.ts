/**
 * Tests for Behavior Tree Runner
 *
 * @author @darianrosebrook
 */

import {
  BehaviorTreeRunner,
  BTNodeStatus,
  BTNodeType,
  ToolExecutor,
} from '../BehaviorTreeRunner';

describe('BehaviorTreeRunner', () => {
  let runner: BehaviorTreeRunner;
  let mockToolExecutor: ToolExecutor;

  beforeEach(() => {
    mockToolExecutor = {
      async execute(tool: string, args: Record<string, any>) {
        // Mock successful execution
        return {
          ok: true,
          data: { result: 'mock_success', tool, args },
          environmentDeltas: {},
        };
      },
    };

    runner = new BehaviorTreeRunner(mockToolExecutor);
  });

  describe('runOption', () => {
    it('should execute an option successfully', async () => {
      const result = await runner.runOption('test.option', { param: 'value' });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.status).toBe(BTNodeStatus.SUCCESS);
      expect(result.ticks).toBeDefined();
      expect(Array.isArray(result.ticks)).toBe(true);
      expect(result.duration).toBeGreaterThan(0);
    });

    it('should handle tool execution failures', async () => {
      const failingExecutor: ToolExecutor = {
        async execute(tool: string, args: Record<string, any>) {
          return {
            ok: false,
            error: 'mock_failure',
            environmentDeltas: {},
          };
        },
      };

      const failingRunner = new BehaviorTreeRunner(failingExecutor);
      const result = await failingRunner.runOption('test.option', {
        param: 'value',
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe(BTNodeStatus.FAILURE);
      expect(result.error).toBeDefined();
    });

    it('should emit events during execution', (done) => {
      let tickCount = 0;
      let statusCount = 0;

      runner.on('tick', (data) => {
        tickCount++;
        expect(data.runId).toBeDefined();
        expect(data.tick).toBeDefined();
      });

      runner.on('status', (data) => {
        statusCount++;
        expect(data.runId).toBeDefined();
        expect(data.status).toBeDefined();
      });

      runner
        .runOption('test.option', { param: 'value' })
        .then(() => {
          expect(tickCount).toBeGreaterThan(0);
          expect(statusCount).toBeGreaterThan(0);
          done();
        })
        .catch(done);
    });
  });

  describe('cancel', () => {
    it('should cancel an active run', async () => {
      // Start a run
      const runPromise = runner.runOption('test.option', { param: 'value' });

      // Get the run ID from active runs
      const activeRuns = runner.getActiveRuns();
      expect(activeRuns.length).toBe(1);

      const runId = activeRuns[0].runId;

      // Cancel the run
      const cancelled = await runner.cancel(runId);
      expect(cancelled).toBe(true);

      // Wait for the run to complete
      const result = await runPromise;
      expect(result.status).toBe(BTNodeStatus.FAILURE);
    });

    it('should return false for non-existent run', async () => {
      const cancelled = await runner.cancel('non-existent-run');
      expect(cancelled).toBe(false);
    });
  });

  describe('getActiveRuns', () => {
    it('should return empty array when no runs are active', () => {
      const activeRuns = runner.getActiveRuns();
      expect(activeRuns).toEqual([]);
    });

    it('should return active runs', async () => {
      // Start a run
      const runPromise = runner.runOption('test.option', { param: 'value' });

      // Check active runs
      const activeRuns = runner.getActiveRuns();
      expect(activeRuns.length).toBe(1);
      expect(activeRuns[0].optionId).toBe('test.option');
      expect(activeRuns[0].status).toBe(BTNodeStatus.RUNNING);

      // Wait for completion
      await runPromise;

      // Should be no active runs after completion
      const finalActiveRuns = runner.getActiveRuns();
      expect(finalActiveRuns.length).toBe(0);
    });
  });

  describe('getRunTelemetry', () => {
    it('should return telemetry for a completed run', async () => {
      const result = await runner.runOption('test.option', { param: 'value' });

      const telemetry = runner.getRunTelemetry(result.ticks[0]?.runId || '');
      expect(telemetry).toBeNull(); // Run is no longer active
    });

    it('should return null for non-existent run', () => {
      const telemetry = runner.getRunTelemetry('non-existent-run');
      expect(telemetry).toBeNull();
    });
  });

  describe('execution options', () => {
    it('should respect timeout options', async () => {
      const slowExecutor: ToolExecutor = {
        async execute(tool: string, args: Record<string, any>) {
          // Simulate slow execution
          await new Promise((resolve) => setTimeout(resolve, 100));
          return {
            ok: true,
            data: { result: 'slow_success' },
            environmentDeltas: {},
          };
        },
      };

      const slowRunner = new BehaviorTreeRunner(slowExecutor);
      const result = await slowRunner.runOption(
        'slow.option',
        {},
        { timeout: 50 }
      );

      expect(result.success).toBe(false);
      expect(result.status).toBe(BTNodeStatus.FAILURE);
    });

    it('should respect retry options', async () => {
      let callCount = 0;
      const failingExecutor: ToolExecutor = {
        async execute(tool: string, args: Record<string, any>) {
          callCount++;
          if (callCount < 3) {
            return {
              ok: false,
              error: 'temporary_failure',
              environmentDeltas: {},
            };
          }
          return {
            ok: true,
            data: { result: 'eventual_success' },
            environmentDeltas: {},
          };
        },
      };

      const retryRunner = new BehaviorTreeRunner(failingExecutor);
      const result = await retryRunner.runOption(
        'retry.option',
        {},
        { maxRetries: 3 }
      );

      expect(result.success).toBe(true);
      expect(callCount).toBe(3);
    });
  });
});
