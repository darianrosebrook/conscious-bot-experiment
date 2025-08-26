/**
 * Task Timeframe Management Tests - Comprehensive tests for bucket-based time management
 *
 * Tests for bucket selection, task execution, pause/resume functionality, and explainable decisions.
 *
 * @author @darianrosebrook
 */

import {
  TaskTimeframeManager,
  TimeBucket,
  BucketSelectionCriteria,
  DEFAULT_TIME_BUCKETS,
} from '../../../../core/src/mcp-capabilities/task-timeframe-management';

describe('Task Timeframe Management', () => {
  let manager: TaskTimeframeManager;

  beforeEach(() => {
    manager = new TaskTimeframeManager();
  });

  afterEach(() => {
    manager.clear();
  });

  describe('Bucket Selection', () => {
    it('should select tactical bucket for quick tasks', () => {
      const criteria: BucketSelectionCriteria = {
        estimatedDurationMs: 10000, // 10 seconds
        priority: 5,
        complexity: 1,
        resourceRequirements: ['movement'],
        dependencies: [],
      };

      const result = manager.selectBucket('quick-task', criteria);
      expect(result.bucket).toBe('tactical');
      expect(result.trace.reasoning.some((r) => r.includes('tactical'))).toBe(
        true
      );
    });

    it('should select expedition bucket for complex long tasks', () => {
      const criteria: BucketSelectionCriteria = {
        estimatedDurationMs: 7200000, // 2 hours
        priority: 1,
        complexity: 5,
        resourceRequirements: ['movement', 'craft', 'sense'],
        dependencies: ['resource-gathering', 'base-building'],
      };

      const result = manager.selectBucket('complex-task', criteria);
      expect(result.bucket).toBe('expedition');
      expect(result.trace.reasoning.some((r) => r.includes('expedition'))).toBe(
        true
      );
    });

    it('should respect required bucket constraint', () => {
      const criteria: BucketSelectionCriteria = {
        estimatedDurationMs: 10000,
        priority: 3,
        complexity: 2,
        resourceRequirements: ['movement'],
        dependencies: [],
        constraints: {
          requiredBucket: 'standard',
        },
      };

      const result = manager.selectBucket('constrained-task', criteria);
      expect(result.bucket).toBe('standard');
      expect(result.trace.reasoning).toContain(
        'Required bucket constraint: standard'
      );
    });

    it('should exclude specified buckets', () => {
      const criteria: BucketSelectionCriteria = {
        estimatedDurationMs: 300000, // 5 minutes
        priority: 3,
        complexity: 2,
        resourceRequirements: ['movement'],
        dependencies: [],
        constraints: {
          excludedBuckets: ['tactical', 'expedition'],
        },
      };

      const result = manager.selectBucket('excluded-task', criteria);
      expect(['short', 'standard', 'long']).toContain(result.bucket);
      expect(result.trace.reasoning).toContain(
        'Excluded buckets: tactical, expedition'
      );
    });

    it('should use fallback when no bucket meets duration requirements', () => {
      const criteria: BucketSelectionCriteria = {
        estimatedDurationMs: 100000000, // 100 hours (exceeds all buckets)
        priority: 3,
        complexity: 2,
        resourceRequirements: ['movement'],
        dependencies: [],
      };

      const result = manager.selectBucket('long-task', criteria);
      expect(result.bucket).toBe('expedition'); // Longest bucket as fallback
      expect(result.trace.reasoning).toContain(
        'Using fallback bucket: expedition'
      );
    });

    it('should store bucket selection traces', () => {
      const criteria: BucketSelectionCriteria = {
        estimatedDurationMs: 10000,
        priority: 3,
        complexity: 2,
        resourceRequirements: ['movement'],
        dependencies: [],
      };

      manager.selectBucket('traced-task', criteria);
      const traces = manager.getBucketTraces('traced-task');
      expect(traces).toHaveLength(1);
      expect(traces[0].selectedBucket).toBeDefined();
      expect(traces[0].reasoning.length).toBeGreaterThan(0);
    });
  });

  describe('Task Execution Management', () => {
    it('should start task in specified bucket', () => {
      const state = manager.startTask('test-task', 'short', { test: true });
      expect(state.taskId).toBe('test-task');
      expect(state.bucketName).toBe('short');
      expect(state.status).toBe('running');
      expect(state.metadata).toEqual({ test: true });
    });

    it('should update task state', () => {
      manager.startTask('test-task', 'short');
      manager.updateTask('test-task', { metadata: { updated: true } });

      const state = manager.getTaskState('test-task');
      expect(state?.metadata).toEqual({ updated: true });
    });

    it('should add checkpoints to task', () => {
      manager.startTask('test-task', 'short');
      manager.addCheckpoint(
        'test-task',
        { position: { x: 10, y: 64, z: 10 } },
        'Reached waypoint'
      );

      const state = manager.getTaskState('test-task');
      expect(state?.checkpoints).toHaveLength(1);
      expect(state?.checkpoints[0].description).toBe('Reached waypoint');
      expect(state?.checkpoints[0].data).toEqual({
        position: { x: 10, y: 64, z: 10 },
      });
    });

    it('should complete task successfully', () => {
      manager.startTask('test-task', 'short');
      manager.completeTask('test-task');

      const state = manager.getTaskState('test-task');
      expect(state).toBeUndefined(); // Task should be cleaned up
    });

    it('should fail task with error', () => {
      manager.startTask('test-task', 'short');
      manager.failTask('test-task', 'Movement timeout');

      const state = manager.getTaskState('test-task');
      expect(state?.status).toBe('failed');
      expect(state?.metadata?.error).toBe('Movement timeout');
    });
  });

  describe('Pause and Resume Functionality', () => {
    it('should pause task and create resume ticket', () => {
      manager.startTask('test-task', 'short');
      const ticket = manager.pauseTask('test-task', 'opt.resume_navigation');

      expect(ticket.taskId).toBe('test-task');
      expect(ticket.bucketName).toBe('short');
      expect(ticket.trailerOptionId).toBe('opt.resume_navigation');
      expect(ticket.id).toMatch(/test-task-\d+-[a-z0-9]+/);

      const state = manager.getTaskState('test-task');
      expect(state?.status).toBe('paused');
      expect(state?.resumeTicket).toBeDefined();
    });

    it('should resume task from ticket', () => {
      manager.startTask('test-task', 'short');
      const ticket = manager.pauseTask('test-task');

      const resumedState = manager.resumeTask(ticket.id);
      expect(resumedState.status).toBe('running');
      expect(resumedState.startTime).toBeGreaterThan(0);

      // Ticket should be removed
      const validTickets = manager.getValidResumeTickets();
      expect(validTickets.find((t) => t.id === ticket.id)).toBeUndefined();
    });

    it('should reject resume of expired ticket', () => {
      manager.startTask('test-task', 'short');
      const ticket = manager.pauseTask('test-task');

      // Manually expire the ticket
      const expiredTicket = { ...ticket, expiresAt: Date.now() - 1000 };
      manager['resumeTickets'].set(ticket.id, expiredTicket);

      expect(() => manager.resumeTask(ticket.id)).toThrow(
        'Resume ticket expired'
      );
    });

    it('should create bucket trailer when trailer option is provided', () => {
      manager.startTask('test-task', 'short');
      const ticket = manager.pauseTask('test-task', 'opt.resume_navigation');

      const trailer = manager.getBucketTrailer('test-task');
      expect(trailer).toBeDefined();
      expect(trailer?.trailerOptionId).toBe('opt.resume_navigation');
      expect(trailer?.resumeTicket.id).toBe(ticket.id);
    });
  });

  describe('Timeout Management', () => {
    it('should detect timeout for running tasks', () => {
      // Use a very short bucket for testing
      const shortBucketConfig = {
        ...DEFAULT_TIME_BUCKETS.tactical,
        maxDurationMs: 100, // 100ms for testing
      };

      const testManager = new TaskTimeframeManager({
        ...DEFAULT_TIME_BUCKETS,
        tactical: shortBucketConfig,
      });

      testManager.startTask('timeout-task', 'tactical');

      // Wait for timeout and check status
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          // Manually trigger timeout check
          testManager.updateTask('timeout-task', {});
          const state = testManager.getTaskState('timeout-task');
          expect(state?.status).toBe('timeout');
          resolve();
        }, 150); // Wait longer than the 100ms timeout
      });
    });

    it('should calculate remaining time correctly', () => {
      manager.startTask('test-task', 'tactical');

      const remaining = manager.getRemainingTime('test-task');
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(30000); // tactical bucket max
    });
  });

  describe('Query and Monitoring', () => {
    it('should get active tasks', () => {
      manager.startTask('task-1', 'tactical');
      manager.startTask('task-2', 'short');

      const activeTasks = manager.getActiveTasks();
      expect(activeTasks).toHaveLength(2);
      expect(activeTasks.map((t) => t.taskId)).toContain('task-1');
      expect(activeTasks.map((t) => t.taskId)).toContain('task-2');
    });

    it('should check task status', () => {
      manager.startTask('test-task', 'short');

      expect(manager.isTaskRunning('test-task')).toBe(true);
      expect(manager.isTaskPaused('test-task')).toBe(false);

      manager.pauseTask('test-task');
      expect(manager.isTaskRunning('test-task')).toBe(false);
      expect(manager.isTaskPaused('test-task')).toBe(true);
    });

    it('should get bucket statistics', () => {
      manager.startTask('task-1', 'tactical');
      manager.startTask('task-2', 'tactical');
      manager.startTask('task-3', 'short');

      // Complete and fail tasks but keep them in memory for statistics
      manager.updateTask('task-1', { status: 'completed' });
      manager.updateTask('task-2', { status: 'failed' });

      const stats = manager.getBucketStatistics();
      expect(stats.tactical.active).toBe(0);
      expect(stats.tactical.completed).toBe(1);
      expect(stats.tactical.failed).toBe(1);
      expect(stats.short.active).toBe(1);
    });

    it('should get valid resume tickets', () => {
      manager.startTask('task-1', 'short');
      manager.startTask('task-2', 'short');

      const ticket1 = manager.pauseTask('task-1');
      const ticket2 = manager.pauseTask('task-2');

      const validTickets = manager.getValidResumeTickets();
      expect(validTickets).toHaveLength(2);
      expect(validTickets.map((t) => t.id)).toContain(ticket1.id);
      expect(validTickets.map((t) => t.id)).toContain(ticket2.id);
    });
  });

  describe('Utility Functions', () => {
    it('should clean up expired tickets', () => {
      manager.startTask('test-task', 'short');
      const ticket = manager.pauseTask('test-task');

      // Manually expire the ticket
      const expiredTicket = { ...ticket, expiresAt: Date.now() - 1000 };
      manager['resumeTickets'].set(ticket.id, expiredTicket);

      const cleaned = manager.cleanupExpiredTickets();
      expect(cleaned).toBe(1);

      const validTickets = manager.getValidResumeTickets();
      expect(validTickets).toHaveLength(0);
    });

    it('should get bucket configuration', () => {
      const config = manager.getBucketConfig('tactical');
      expect(config.name).toBe('tactical');
      expect(config.maxDurationMs).toBe(30000);
      expect(config.priority).toBe(5);
    });

    it('should get all bucket configurations', () => {
      const configs = manager.getAllBucketConfigs();
      expect(configs.tactical).toBeDefined();
      expect(configs.short).toBeDefined();
      expect(configs.standard).toBeDefined();
      expect(configs.long).toBeDefined();
      expect(configs.expedition).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should throw error for unknown bucket', () => {
      expect(() =>
        manager.startTask('test-task', 'unknown' as TimeBucket)
      ).toThrow('Unknown bucket: unknown');
    });

    it('should throw error for non-existent task', () => {
      expect(() => manager.updateTask('non-existent', {})).toThrow(
        'Task not found: non-existent'
      );
      expect(() => manager.addCheckpoint('non-existent', {}, 'test')).toThrow(
        'Task not found: non-existent'
      );
      expect(() => manager.pauseTask('non-existent')).toThrow(
        'Task not found: non-existent'
      );
    });

    it('should throw error for invalid resume ticket', () => {
      expect(() => manager.resumeTask('non-existent-ticket')).toThrow(
        'Resume ticket not found: non-existent-ticket'
      );
    });

    it('should throw error for pausing non-running task', () => {
      manager.startTask('test-task', 'short');
      manager.updateTask('test-task', { status: 'completed' });

      expect(() => manager.pauseTask('test-task')).toThrow(
        'Cannot pause task in status: completed'
      );
    });

    it('should throw error for resuming non-paused task', () => {
      manager.startTask('test-task', 'short');
      const ticket = manager.pauseTask('test-task');
      manager.resumeTask(ticket.id);

      expect(() => manager.resumeTask(ticket.id)).toThrow(
        'Resume ticket not found'
      );
    });
  });
});
