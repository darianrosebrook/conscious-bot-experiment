import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EnhancedThoughtGenerator } from '../thought-generator';
// canonicalGoalKey deleted in PR2 - Sterling provides identity via committed_goal_prop_id
import type { ThoughtContext, CognitiveThought } from '../thought-generator';

/**
 * Tests for drive-tick engine: safety gates, drive selection,
 * timer enforcement, idempotency, and thought shape.
 *
 * MIGRATION NOTE (PR4):
 * Drive-ticks are now OBSERVATIONAL ONLY. They bypass Sterling semantic authority,
 * so they are NOT eligible for task conversion (convertEligible: false).
 *
 * The selectDrive() method now returns { thought, category } instead of extractedGoal.
 * Tests have been updated to check the thought content and category instead of goal shape.
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

  function callSelectDrive(inventory: any[], timeOfDay: number, ctx: ThoughtContext): { thought: string; category: string } | null {
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
    it('selects gathering when inventory empty', () => {
      const result = callSelectDrive([], 6000, makeContext());
      expect(result).not.toBeNull();
      // PR4: selectDrive returns { thought, category }, not extractedGoal
      expect(result!.category).toBe('gathering');
      expect(result!.thought).toContain('wood');
    });

    it('selects survival when night approaching and hasShelterNearby=false', () => {
      const inv = [{ name: 'oak_log', count: 20, displayName: 'Oak Log' }];
      const result = callSelectDrive(inv, 11500, makeContext({ hasShelterNearby: false }));
      expect(result).not.toBeNull();
      expect(result!.category).toBe('survival');
      expect(result!.thought).toContain('shelter');
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
      expect(result!.category).not.toBe('survival');
    });

    it('selects crafting when has logs but no table', () => {
      const inv = [{ name: 'oak_log', count: 20, displayName: 'Oak Log' }];
      const result = callSelectDrive(inv, 6000, makeContext());
      expect(result).not.toBeNull();
      expect(result!.category).toBe('crafting');
      expect(result!.thought).toContain('crafting table');
    });

    it('selects crafting for pickaxe when has table but no pickaxe', () => {
      const inv = [
        { name: 'oak_log', count: 20, displayName: 'Oak Log' },
        { name: 'crafting_table', count: 1, displayName: 'Crafting Table' },
      ];
      const result = callSelectDrive(inv, 6000, makeContext());
      expect(result).not.toBeNull();
      expect(result!.category).toBe('crafting');
      expect(result!.thought).toContain('pickaxe');
    });

    it('selects gathering when log stock low', () => {
      const inv = [
        { name: 'oak_log', count: 5, displayName: 'Oak Log' },
        { name: 'crafting_table', count: 1, displayName: 'Crafting Table' },
        { name: 'wooden_pickaxe', count: 1, displayName: 'Wooden Pickaxe' },
      ];
      const result = callSelectDrive(inv, 6000, makeContext());
      expect(result).not.toBeNull();
      expect(result!.category).toBe('gathering');
      expect(result!.thought).toContain('wood');
    });

    it('selects exploration when well-stocked', () => {
      const inv = [
        { name: 'oak_log', count: 32, displayName: 'Oak Log' },
        { name: 'crafting_table', count: 1, displayName: 'Crafting Table' },
        { name: 'wooden_pickaxe', count: 1, displayName: 'Wooden Pickaxe' },
      ];
      const result = callSelectDrive(inv, 6000, makeContext());
      expect(result).not.toBeNull();
      expect(result!.category).toBe('exploration');
      expect(result!.thought).toContain('explore');
    });
  });

  // ==========================================
  // Thought shape (PR4: Sterling-aware)
  // ==========================================

  describe('thought shape', () => {
    it('produces thought with content and category from drive', () => {
      const result = callEvaluateDriveTick(makeContext());
      expect(result).not.toBeNull();
      // Content comes from selectDrive().thought
      expect(result!.content).toBeTruthy();
      expect(result!.content.length).toBeGreaterThan(10);
      // Category is in tags
      expect(result!.tags).toBeDefined();
    });

    it('sets extractedGoalSource to drive-tick', () => {
      const result = callEvaluateDriveTick(makeContext());
      expect(result).not.toBeNull();
      expect(result!.metadata.extractedGoalSource).toBe('drive-tick');
    });

    it('sets convertEligible to false (PR4: no Sterling reduction)', () => {
      // PR4: Drive-ticks bypass Sterling, so they are NOT eligible for task conversion
      // This is the fail-closed behavior per I-BOUNDARY-1
      const result = callEvaluateDriveTick(makeContext());
      expect(result).not.toBeNull();

      // CRITICAL: Drive-ticks are always NOT eligible
      expect(result!.convertEligible).toBe(false);

      // Must include eligibility reasoning for audit trail
      expect(result!.metadata.eligibilityReasoning).toBe('no_reduction');
    });

    it('does NOT have extractedGoal (PR4: TS cannot construct goals)', () => {
      // PR4: extractedGoal was deleted because TS cannot construct semantic goals
      // This violates I-BOUNDARY-1 — only Sterling can produce goals
      const result = callEvaluateDriveTick(makeContext());
      expect(result).not.toBeNull();

      // extractedGoal MUST NOT exist
      expect(result!.metadata.extractedGoal).toBeUndefined();
    });

    it('has grounding result from eligibility computation', () => {
      const result = callEvaluateDriveTick(makeContext());
      expect(result).not.toBeNull();

      // Grounding result should exist (from computeEligibility)
      expect(result!.metadata.groundingResult).toBeDefined();
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

    // DELETED (PR2): goalKey tests - Sterling provides identity via committed_goal_prop_id
    // Tests removed:
    // - 'includes goalKey in metadata as action:target'
    // - 'goalKey matches canonicalGoalKey(action, target)'
    //
    // New identity hierarchy (from Sterling):
    // 1. committed_goal_prop_id (primary)
    // 2. committed_ir_digest (secondary)
    // 3. envelope_id (tertiary)
  });

  // ==========================================
  // Idempotency
  // ==========================================

  describe('idempotency', () => {
    // DELETED (boundary fix): Fuzzy dedupe tests removed
    // Fuzzy title matching was semantic substitution (violated I-BOUNDARY-1).
    //
    // Drive-tick thoughts lack Sterling identity (committedGoalPropId) because
    // they're generated from internal drives, not LLM output processed by Sterling.
    //
    // Dedupe now happens downstream in thought-to-task converter using Sterling IDs.
    // Drive-ticks are rare (idle-only), so duplicate risk is low.
    //
    // Tests removed:
    // - 'skips when matching active task exists with progress'
    // - 'skips when matching pending task exists at 0% progress'
    // - 'falls back to fuzzy title match for legacy tasks without goalKey'
    //
    // Retained behavior: Drive-ticks always fire when idle conditions met.
    // Downstream converter dedupes using identity hierarchy:
    //   committedGoalPropId > committedIrDigest > envelopeId > fail-open

    it('fires when idle conditions met (no drive-tick dedupe)', () => {
      const tasks = [{
        id: 'task-1',
        title: 'collect oak_log',
        progress: 0.5,
        status: 'active',
        type: 'gathering',
      }];
      // Drive-ticks no longer dedupe against existing tasks
      const result = callEvaluateDriveTick(makeContext({ inventory: [] }, tasks));
      expect(result).not.toBeNull();
      expect(result?.metadata.thoughtType).toBe('drive-tick');
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
