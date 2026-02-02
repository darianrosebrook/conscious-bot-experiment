import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EnhancedThoughtGenerator } from '../thought-generator';
import type { ThoughtContext, CognitiveThought } from '../thought-generator';

/**
 * Tests for drive-tick engine: safety gates, drive selection,
 * timer enforcement, idempotency, and goal shape.
 *
 * @author @darianrosebrook
 */

// Mock LLM to prevent real API calls
vi.mock('../cognitive-core/llm-interface', () => ({
  LLMInterface: vi.fn().mockImplementation(() => ({
    generateInternalThought: vi.fn().mockResolvedValue({
      text: 'Fallback thought.',
      confidence: 0.5,
      model: 'test',
      metadata: {},
    }),
    preloadModel: vi.fn(),
    unloadModel: vi.fn(),
    close: vi.fn(),
  })),
}));

vi.mock('../interoception-store', () => ({
  getInteroState: () => ({
    stress: 10,
    stressAxes: { danger: 0, hunger: 0, fatigue: 0 },
  }),
}));

vi.mock('../stress-axis-computer', () => ({
  buildStressContext: () => null,
}));

vi.mock('../audit/thought-action-audit-logger', () => ({
  auditLogger: { log: vi.fn() },
}));

function makeContext(overrides: Partial<ThoughtContext['currentState']> = {}, tasks: ThoughtContext['currentTasks'] = []): ThoughtContext {
  return {
    currentState: {
      health: 20,
      food: 20,
      nearbyHostiles: 0,
      gameMode: 'survival',
      inventory: [],
      timeOfDay: 6000,
      biome: 'plains',
      weather: 'clear',
      position: { x: 0, y: 64, z: 0 },
      hasShelterNearby: false,
      isNight: false,
      ...overrides,
    },
    currentTasks: tasks,
    emotionalState: 'neutral',
  };
}

describe('Drive Tick', () => {
  let generator: EnhancedThoughtGenerator;

  beforeEach(() => {
    generator = new EnhancedThoughtGenerator({
      thoughtInterval: 0, // disable throttle for tests
    });
  });

  // Access private method via any cast for testing
  function callEvaluateDriveTick(ctx: ThoughtContext): CognitiveThought | null {
    return (generator as any).evaluateDriveTick(ctx);
  }

  function callSelectDrive(inventory: any[], timeOfDay: number, ctx: ThoughtContext) {
    return (generator as any).selectDrive(inventory, timeOfDay, ctx);
  }

  // ==========================================
  // Safety gates
  // ==========================================

  describe('safety gates', () => {
    it('does not fire when health < 16', () => {
      const result = callEvaluateDriveTick(makeContext({ health: 10 }));
      expect(result).toBeNull();
    });

    it('does not fire when food < 16', () => {
      const result = callEvaluateDriveTick(makeContext({ food: 10 }));
      expect(result).toBeNull();
    });

    it('does not fire when hostiles > 0', () => {
      const result = callEvaluateDriveTick(makeContext({ nearbyHostiles: 2 }));
      expect(result).toBeNull();
    });

    it('does not fire in creative mode', () => {
      const result = callEvaluateDriveTick(makeContext({ gameMode: 'creative' }));
      expect(result).toBeNull();
    });

    it('does not fire in spectator mode', () => {
      const result = callEvaluateDriveTick(makeContext({ gameMode: 'spectator' }));
      expect(result).toBeNull();
    });

    it('fires when all safety gates pass', () => {
      const result = callEvaluateDriveTick(makeContext());
      expect(result).not.toBeNull();
      expect(result!.context.cognitiveSystem).toBe('drive-tick');
    });
  });

  // ==========================================
  // Timer enforcement
  // ==========================================

  describe('timer enforcement', () => {
    it('does not fire twice within interval', () => {
      const ctx = makeContext();
      const first = callEvaluateDriveTick(ctx);
      expect(first).not.toBeNull();

      const second = callEvaluateDriveTick(ctx);
      expect(second).toBeNull();
    });
  });

  // ==========================================
  // Drive selection logic
  // ==========================================

  describe('selectDrive priorities', () => {
    it('selects collect oak_log when inventory empty', () => {
      const result = callSelectDrive([], 6000, makeContext());
      expect(result).not.toBeNull();
      expect(result!.extractedGoal.action).toBe('collect');
      expect(result!.extractedGoal.target).toBe('oak_log');
      expect(result!.extractedGoal.amount).toBe(8);
    });

    it('selects build shelter when night approaching and hasShelterNearby=false', () => {
      const inv = [{ name: 'oak_log', count: 20, displayName: 'Oak Log' }];
      const result = callSelectDrive(inv, 11500, makeContext({ hasShelterNearby: false }));
      expect(result).not.toBeNull();
      expect(result!.extractedGoal.action).toBe('build');
      expect(result!.extractedGoal.target).toBe('basic_shelter');
    });

    it('skips shelter drive when hasShelterNearby is undefined (fail-closed)', () => {
      // undefined = signal unavailable, should not trigger shelter build
      const inv = [{ name: 'oak_log', count: 20, displayName: 'Oak Log' }];
      const ctx = makeContext({});
      // Remove hasShelterNearby entirely to simulate undefined
      delete (ctx.currentState as any).hasShelterNearby;
      const result = callSelectDrive(inv, 11500, ctx);
      expect(result).not.toBeNull();
      // Should skip shelter and pick the next priority (craft crafting_table)
      expect(result!.extractedGoal.action).not.toBe('build');
    });

    it('selects craft crafting_table when has logs but no table', () => {
      const inv = [{ name: 'oak_log', count: 20, displayName: 'Oak Log' }];
      const result = callSelectDrive(inv, 6000, makeContext());
      expect(result).not.toBeNull();
      expect(result!.extractedGoal.action).toBe('craft');
      expect(result!.extractedGoal.target).toBe('crafting_table');
    });

    it('selects craft wooden_pickaxe when has table but no pickaxe', () => {
      const inv = [
        { name: 'oak_log', count: 20, displayName: 'Oak Log' },
        { name: 'crafting_table', count: 1, displayName: 'Crafting Table' },
      ];
      const result = callSelectDrive(inv, 6000, makeContext());
      expect(result).not.toBeNull();
      expect(result!.extractedGoal.action).toBe('craft');
      expect(result!.extractedGoal.target).toBe('wooden_pickaxe');
    });

    it('selects collect oak_log when log stock low', () => {
      const inv = [
        { name: 'oak_log', count: 5, displayName: 'Oak Log' },
        { name: 'crafting_table', count: 1, displayName: 'Crafting Table' },
        { name: 'wooden_pickaxe', count: 1, displayName: 'Wooden Pickaxe' },
      ];
      const result = callSelectDrive(inv, 6000, makeContext());
      expect(result).not.toBeNull();
      expect(result!.extractedGoal.action).toBe('collect');
      expect(result!.extractedGoal.target).toBe('oak_log');
    });

    it('selects explore when well-stocked', () => {
      const inv = [
        { name: 'oak_log', count: 32, displayName: 'Oak Log' },
        { name: 'crafting_table', count: 1, displayName: 'Crafting Table' },
        { name: 'wooden_pickaxe', count: 1, displayName: 'Wooden Pickaxe' },
      ];
      const result = callSelectDrive(inv, 6000, makeContext());
      expect(result).not.toBeNull();
      expect(result!.extractedGoal.action).toBe('explore');
      expect(result!.extractedGoal.target).toBe('nearby');
    });
  });

  // ==========================================
  // Goal shape via buildGoalTagV1
  // ==========================================

  describe('goal shape', () => {
    it('produces valid GoalTagV1 structure', () => {
      const result = callEvaluateDriveTick(makeContext());
      expect(result).not.toBeNull();
      const goal = result!.metadata.extractedGoal;
      expect(goal).toBeDefined();
      expect(goal!.action).toBeTruthy();
      expect(goal!.target).toBeTruthy();
      expect(typeof goal!.amount).toBe('number');
    });

    it('sets extractedGoalSource to drive-tick', () => {
      const result = callEvaluateDriveTick(makeContext());
      expect(result).not.toBeNull();
      expect(result!.metadata.extractedGoalSource).toBe('drive-tick');
    });

    it('sets convertEligible to true', () => {
      const result = callEvaluateDriveTick(makeContext());
      expect(result).not.toBeNull();
      expect(result!.convertEligible).toBe(true);
    });

    it('sets novelty to high', () => {
      const result = callEvaluateDriveTick(makeContext());
      expect(result).not.toBeNull();
      expect(result!.novelty).toBe('high');
    });

    it('includes drive-tick and autonomous tags', () => {
      const result = callEvaluateDriveTick(makeContext());
      expect(result).not.toBeNull();
      expect(result!.tags).toContain('drive-tick');
      expect(result!.tags).toContain('autonomous');
    });
  });

  // ==========================================
  // Idempotency
  // ==========================================

  describe('idempotency', () => {
    it('skips when matching active task exists with progress', () => {
      const tasks = [{
        id: 'task-1',
        title: 'collect oak_log',
        progress: 0.5,
        status: 'active',
        type: 'gathering',
      }];
      const result = callEvaluateDriveTick(makeContext({ inventory: [] }, tasks));
      expect(result).toBeNull();
    });

    it('skips when matching pending task exists at 0% progress', () => {
      const tasks = [{
        id: 'task-1',
        title: 'collect oak_log',
        progress: 0,
        status: 'pending',
        type: 'gathering',
      }];
      const result = callEvaluateDriveTick(makeContext({ inventory: [] }, tasks));
      expect(result).toBeNull();
    });

    it('fires when no matching task exists', () => {
      const tasks = [{
        id: 'task-1',
        title: 'craft stone_pickaxe',
        progress: 0.5,
        status: 'active',
        type: 'crafting',
      }];
      // Empty inventory → wants to collect oak_log, but task is for stone_pickaxe
      const result = callEvaluateDriveTick(makeContext({ inventory: [] }, tasks));
      expect(result).not.toBeNull();
    });

    it('ignores completed/paused tasks for suppression check', () => {
      const tasks = [{
        id: 'task-1',
        title: 'collect oak_log',
        progress: 1.0,
        status: 'completed',
        type: 'gathering',
      }];
      const result = callEvaluateDriveTick(makeContext({ inventory: [] }, tasks));
      expect(result).not.toBeNull();
    });
  });

  // ==========================================
  // Agency counters
  // ==========================================

  describe('agency counters', () => {
    it('increments driveTicks counter', () => {
      const before = generator.getAgencyCounters().driveTicks;
      callEvaluateDriveTick(makeContext());
      const after = generator.getAgencyCounters().driveTicks;
      expect(after).toBe(before + 1);
    });

    it('resetAgencyCounters resets all counters', () => {
      callEvaluateDriveTick(makeContext());
      generator.resetAgencyCounters();
      const counters = generator.getAgencyCounters();
      expect(counters.driveTicks).toBe(0);
      expect(counters.llmCalls).toBe(0);
      expect(counters.goalTags).toBe(0);
      expect(counters.signatureSuppressions).toBe(0);
      expect(counters.contentSuppressions).toBe(0);
    });
  });
});
