/**
 * Movement Leaves Unit Tests
 *
 * Tests for the improved movement leaves with proper Mineflayer integration,
 * event lifecycle management, abort handling, and error taxonomy.
 *
 * @author @darianrosebrook
 */

import {
  MoveToLeaf,
  StepForwardSafelyLeaf,
  FollowEntityLeaf,
} from '../leaves/movement-leaves';
import {
  LeafContext,
  LeafResult,
} from '../../../core/src/mcp-capabilities/leaf-contracts';
import { Bot } from 'mineflayer';
import { Vec3 } from 'vec3';

// Mock mineflayer pathfinder
vi.mock('mineflayer-pathfinder', () => ({
  pathfinder: vi.fn(),
  goals: {
    GoalBlock: vi.fn(),
    GoalNear: vi.fn(),
    GoalFollow: vi.fn(),
  },
}));

// Mock mineflayer bot
const createMockBot = () =>
  ({
    entity: {
      position: new Vec3(0, 64, 0),
      yaw: 0,
    },
    entities: {
      123: {
        id: 123,
        position: new Vec3(5, 64, 5),
        type: 'player',
      },
    },
    pathfinder: {
      setGoal: vi.fn(),
      stop: vi.fn(),
      setMovements: vi.fn(),
    },
    blockAt: vi.fn(() => ({
      boundingBox: 'empty',
      position: new Vec3(0, 64, 0),
    })),
    world: {
      getLight: vi.fn(() => 15),
    },
    on: vi.fn(),
    removeListener: vi.fn(),
    loadPlugin: vi.fn(),
  }) as any;

// Mock leaf context
const createMockContext = (bot: any): LeafContext => {
  const controller = new AbortController();

  return {
    bot,
    abortSignal: controller.signal,
    now: () => performance.now(),
    snapshot: vi.fn().mockResolvedValue({
      position: { x: 0, y: 64, z: 0 },
      biome: 'plains',
      time: 1000,
      lightLevel: 15,
      nearbyHostiles: [],
      weather: 'clear',
      inventory: { items: [] },
      toolDurability: {},
      waypoints: [],
    }),
    inventory: vi.fn().mockResolvedValue({ items: [] }),
    emitMetric: vi.fn(),
    emitError: vi.fn(),
  };
};

describe('MoveToLeaf', () => {
  let moveLeaf: MoveToLeaf;
  let mockBot: Bot;
  let mockContext: LeafContext;

  beforeEach(() => {
    moveLeaf = new MoveToLeaf();
    mockBot = createMockBot() as any;
    mockContext = createMockContext(mockBot);
  });

  describe('spec', () => {
    it('should have correct specification', () => {
      expect(moveLeaf.spec.name).toBe('move_to');
      expect(moveLeaf.spec.version).toBe('1.0.0');
      expect(moveLeaf.spec.permissions).toContain('movement');
      expect(moveLeaf.spec.timeoutMs).toBe(30000);
    });

    it('should have proper input schema', () => {
      const schema = moveLeaf.spec.inputSchema;
      expect(schema.properties?.pos).toBeDefined();
      expect(schema.properties?.goal).toBeDefined();
      expect(schema.properties?.timeout).toBeDefined();
      expect(schema.required).toContain('pos');
    });
  });

  describe('run', () => {
    it('should handle invalid position arguments', async () => {
      const result = await moveLeaf.run(mockContext, {
        pos: { x: NaN, y: 64, z: 0 },
      });

      expect(result.status).toBe('failure');
      expect(result.error?.code).toBe('unknown');
      expect(result.error?.retryable).toBe(false);
      expect(result.error?.detail).toContain('invalid pos');
    });

    it('should handle missing position', async () => {
      const result = await moveLeaf.run(mockContext, {});

      expect(result.status).toBe('failure');
      expect(result.error?.code).toBe('unknown');
      expect(result.error?.retryable).toBe(false);
      expect(result.error?.detail).toContain('invalid pos');
    });

    it('should handle pathfinder noPath error', async () => {
      // Mock pathfinder to emit noPath
      const mockPathfinder = mockBot.pathfinder as any;
      mockPathfinder.setGoal.mockImplementation(() => {
        // Simulate pathfinder emitting noPath immediately
        const onPathUpdate = (mockBot.on as vi.Mock).mock.calls.find(
          (call: any) => call[0] === 'path_update'
        )?.[1];
        if (onPathUpdate) {
          onPathUpdate({ status: 'noPath' });
        }
      });

      const result = await moveLeaf.run(mockContext, {
        pos: { x: 100, y: 64, z: 100 },
        timeout: 1000,
      });

      expect(result.status).toBe('failure');
      expect(result.error?.code).toBe('path.unreachable');
      expect(result.error?.retryable).toBe(true);
    });

    it('should handle pathfinder reset error', async () => {
      // Mock pathfinder to emit path_reset
      const mockPathfinder = mockBot.pathfinder as any;
      mockPathfinder.setGoal.mockImplementation(() => {
        const onPathReset = (mockBot.on as vi.Mock).mock.calls.find(
          (call: any) => call[0] === 'path_reset'
        )?.[1];
        if (onPathReset) {
          onPathReset();
        }
      });

      const result = await moveLeaf.run(mockContext, {
        pos: { x: 10, y: 64, z: 10 },
        timeout: 1000,
      });

      expect(result.status).toBe('failure');
      expect(result.error?.code).toBe('path.stuck');
      expect(result.error?.retryable).toBe(true);
    });

    it('should handle aborted operations', async () => {
      const controller = new AbortController();
      const contextWithAbort = {
        ...mockContext,
        abortSignal: controller.signal,
      };

      // Start the operation and abort it
      const promise = moveLeaf.run(contextWithAbort, {
        pos: { x: 10, y: 64, z: 10 },
        timeout: 5000,
      });

      controller.abort();

      const result = await promise;
      expect(result.status).toBe('failure');
      expect(result.error?.code).toBe('aborted');
      expect(result.error?.retryable).toBe(false);
    });

    it('should emit metrics on success', async () => {
      // Mock successful goal reached
      const mockPathfinder = mockBot.pathfinder as any;
      mockPathfinder.setGoal.mockImplementation(() => {
        setTimeout(() => {
          const onGoalReached = (mockBot.on as vi.Mock).mock.calls.find(
            (call: any) => call[0] === 'goal_reached'
          )?.[1];
          if (onGoalReached) {
            onGoalReached();
          }
        }, 10);
      });

      await moveLeaf.run(mockContext, {
        pos: { x: 5, y: 64, z: 5 },
        timeout: 1000,
      });

      expect(mockContext.emitMetric).toHaveBeenCalledWith(
        'move_to_duration_ms',
        expect.any(Number)
      );
      expect(mockContext.emitMetric).toHaveBeenCalledWith(
        'move_to_replans',
        expect.any(Number)
      );
    });
  });
});

describe('StepForwardSafelyLeaf', () => {
  let stepLeaf: StepForwardSafelyLeaf;
  let mockBot: Bot;
  let mockContext: LeafContext;

  beforeEach(() => {
    stepLeaf = new StepForwardSafelyLeaf();
    mockBot = createMockBot() as any;
    mockContext = createMockContext(mockBot);
  });

  describe('spec', () => {
    it('should have correct specification', () => {
      expect(stepLeaf.spec.name).toBe('step_forward_safely');
      expect(stepLeaf.spec.version).toBe('1.0.0');
      expect(stepLeaf.spec.permissions).toContain('movement');
      expect(stepLeaf.spec.timeoutMs).toBe(5000);
    });
  });

  describe('run', () => {
    it('should handle missing bot position', async () => {
      (mockBot as any).entity = null;

      const result = await stepLeaf.run(mockContext, {});

      expect(result.status).toBe('failure');
      expect(result.error?.code).toBe('unknown');
      expect(result.error?.detail).toContain('no position');
    });

    it('should handle blocked target position', async () => {
      (mockBot.blockAt as vi.Mock).mockReturnValue({
        boundingBox: 'block',
        position: new Vec3(0, 64, 0),
      });

      const result = await stepLeaf.run(mockContext, {});

      expect(result.status).toBe('failure');
      expect(result.error?.code).toBe('path.stuck');
      expect(result.error?.detail).toContain('blocked');
    });

    it('should handle no headroom', async () => {
      (mockBot.blockAt as vi.Mock)
        .mockReturnValueOnce({ boundingBox: 'empty' }) // target
        .mockReturnValueOnce({ boundingBox: 'block' }) // head
        .mockReturnValueOnce({ boundingBox: 'block' }); // floor

      const result = await stepLeaf.run(mockContext, {});

      expect(result.status).toBe('failure');
      expect(result.error?.code).toBe('path.stuck');
      expect(result.error?.detail).toContain('no headroom');
    });

    it('should handle no floor', async () => {
      (mockBot.blockAt as vi.Mock)
        .mockReturnValueOnce({ boundingBox: 'empty' }) // target
        .mockReturnValueOnce({ boundingBox: 'empty' }) // head
        .mockReturnValueOnce({ boundingBox: 'empty' }); // floor

      const result = await stepLeaf.run(mockContext, {});

      expect(result.status).toBe('failure');
      expect(result.error?.code).toBe('path.stuck');
      expect(result.error?.detail).toContain('no floor');
    });

    it('should handle low light level', async () => {
      // Mock blockAt to return safe blocks but low light
      (mockBot.blockAt as vi.Mock)
        .mockReturnValueOnce({ boundingBox: 'empty' }) // target
        .mockReturnValueOnce({ boundingBox: 'empty' }) // head
        .mockReturnValueOnce({ boundingBox: 'block' }); // floor

      ((mockBot.world as any).getLight as vi.Mock).mockReturnValue(5);

      const result = await stepLeaf.run(mockContext, { checkLight: true });

      expect(result.status).toBe('failure');
      expect(result.error?.code).toBe('path.stuck');
      expect(result.error?.detail).toContain('light too low');
    });

    it('should successfully step forward', async () => {
      // Mock blockAt to return safe blocks
      (mockBot.blockAt as vi.Mock)
        .mockReturnValueOnce({ boundingBox: 'empty' }) // target
        .mockReturnValueOnce({ boundingBox: 'empty' }) // head
        .mockReturnValueOnce({ boundingBox: 'block' }); // floor

      // Mock successful movement - simulate immediate success
      const mockPathfinder = mockBot.pathfinder as any;
      mockPathfinder.setGoal.mockImplementation(() => {
        // Immediately set the position to simulate success
        (mockBot.entity as any).position = new Vec3(-1, 64, 0);
      });

      const result = await stepLeaf.run(mockContext, {});

      expect(result.status).toBe('success');
      expect((result.result as any)?.success).toBe(true);
      expect((result.result as any)?.newPosition).toBeDefined();
      expect((result.result as any)?.lightLevel).toBe(15);
    });
  });
});

describe('FollowEntityLeaf', () => {
  let followLeaf: FollowEntityLeaf;
  let mockBot: Bot;
  let mockContext: LeafContext;

  beforeEach(() => {
    followLeaf = new FollowEntityLeaf();
    mockBot = createMockBot() as any;
    mockContext = createMockContext(mockBot);
  });

  describe('spec', () => {
    it('should have correct specification', () => {
      expect(followLeaf.spec.name).toBe('follow_entity');
      expect(followLeaf.spec.version).toBe('1.0.0');
      expect(followLeaf.spec.permissions).toContain('movement');
      expect(followLeaf.spec.timeoutMs).toBe(30000);
    });
  });

  describe('run', () => {
    it('should handle invalid entityId', async () => {
      const result = await followLeaf.run(mockContext, {
        entityId: 'invalid',
      });

      expect(result.status).toBe('failure');
      expect(result.error?.code).toBe('unknown');
      expect(result.error?.retryable).toBe(false);
      expect(result.error?.detail).toContain('invalid entityId');
    });

    it('should handle missing entity', async () => {
      const result = await followLeaf.run(mockContext, {
        entityId: 999,
      });

      expect(result.status).toBe('failure');
      expect(result.error?.code).toBe('path.unreachable');
      expect(result.error?.retryable).toBe(false);
      expect(result.error?.detail).toContain('entity 999 not found');
    });

    it('should handle entity disappearing', async () => {
      // Mock entity to disappear during follow
      const mockPathfinder = mockBot.pathfinder as any;
      mockPathfinder.setGoal.mockImplementation(() => {
        // Immediately remove entity to simulate disappearance
        delete (mockBot as any).entities[123];
      });

      const result = await followLeaf.run(mockContext, {
        entityId: 123,
        timeout: 1000,
      });

      expect(result.status).toBe('failure');
      expect(result.error?.code).toBe('path.unreachable');
      expect(result.error?.retryable).toBe(true); // The implementation returns true for path.unreachable
      expect(result.error?.detail).toContain('entity disappeared');
    });

    it('should handle aborted operations', async () => {
      const controller = new AbortController();
      const contextWithAbort = {
        ...mockContext,
        abortSignal: controller.signal,
      };

      // Start the operation and abort it
      const promise = followLeaf.run(contextWithAbort, {
        entityId: 123,
        timeout: 5000,
      });

      controller.abort();

      const result = await promise;
      expect(result.status).toBe('failure');
      expect(result.error?.code).toBe('aborted');
      expect(result.error?.retryable).toBe(false);
    });

    it('should successfully follow entity', async () => {
      // Mock successful following
      const mockPathfinder = mockBot.pathfinder as any;
      mockPathfinder.setGoal.mockImplementation(() => {
        // Simulate reaching follow range
        setTimeout(() => {
          (mockBot.entity as any).position = new Vec3(4, 64, 4);
        }, 10);
      });

      const result = await followLeaf.run(mockContext, {
        entityId: 123,
        range: 3,
        timeout: 1000,
      });

      expect(result.status).toBe('success');
      expect((result.result as any)?.success).toBe(true);
      expect((result.result as any)?.entityFound).toBe(true);
      expect((result.result as any)?.distance).toBeDefined();
    });

    it('should emit metrics on success', async () => {
      // Mock successful following
      const mockPathfinder = mockBot.pathfinder as any;
      mockPathfinder.setGoal.mockImplementation(() => {
        setTimeout(() => {
          (mockBot.entity as any).position = new Vec3(4, 64, 4);
        }, 10);
      });

      await followLeaf.run(mockContext, {
        entityId: 123,
        range: 3,
        timeout: 1000,
      });

      expect(mockContext.emitMetric).toHaveBeenCalledWith(
        'follow_entity_duration_ms',
        expect.any(Number)
      );
      expect(mockContext.emitMetric).toHaveBeenCalledWith(
        'follow_entity_final_distance',
        expect.any(Number)
      );
    });
  });
});
