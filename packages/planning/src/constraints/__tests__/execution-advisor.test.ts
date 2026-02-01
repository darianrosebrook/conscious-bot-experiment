/**
 * Rig G Execution Advisor Tests
 *
 * Covers:
 * - Version mismatch → fail-closed (block + replan)
 * - Feasibility failed → block with rejection reasons
 * - Feasibility passed → proceed with parallelism from ready-set size
 * - Parallelism clamped to [1, 3]
 * - Commuting pairs forwarded on success
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';
import { adviseExecution } from '../execution-advisor';
import type { RigGMetadata } from '../execution-advisor';
import type { RigGSignals } from '../partial-order-plan';
import type { CommutingPair } from '../dag-builder';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSignals(overrides: Partial<RigGSignals> = {}): RigGSignals {
  return {
    dag_node_count: 5,
    dag_edge_count: 4,
    ready_set_size_mean: 2.0,
    ready_set_size_p95: 3.0,
    commuting_pair_count: 1,
    feasibility_passed: true,
    feasibility_rejections: {},
    linearization_digest: 'abc123',
    plan_digest: 'def456',
    ...overrides,
  };
}

function makeMeta(overrides: Partial<RigGMetadata> = {}): RigGMetadata {
  return {
    version: 1,
    signals: makeSignals(),
    commutingPairs: [],
    computedAt: Date.now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Rig G Execution Advisor', () => {
  // =========================================================================
  // Stop-the-line regression: Version mismatch → fail-closed
  // =========================================================================

  describe('Version mismatch → fail-closed', () => {
    it('unknown version → shouldProceed=false, shouldReplan=true', () => {
      const meta = makeMeta({ version: 99 });
      const advice = adviseExecution(meta);

      expect(advice.shouldProceed).toBe(false);
      expect(advice.shouldReplan).toBe(true);
      expect(advice.blockReason).toContain('Unknown rigG metadata version');
      expect(advice.blockReason).toContain('99');
      expect(advice.replanReason).toContain('version mismatch');
    });

    it('version 0 → fail-closed', () => {
      const meta = makeMeta({ version: 0 });
      const advice = adviseExecution(meta);

      expect(advice.shouldProceed).toBe(false);
      expect(advice.shouldReplan).toBe(true);
    });

    it('version 2 → fail-closed (future version)', () => {
      const meta = makeMeta({ version: 2 });
      const advice = adviseExecution(meta);

      expect(advice.shouldProceed).toBe(false);
      expect(advice.shouldReplan).toBe(true);
    });

    it('fail-closed returns parallelism=1 and empty commuting pairs', () => {
      const meta = makeMeta({
        version: 99,
        commutingPairs: [{ nodeA: 'a', nodeB: 'b' }],
      });
      const advice = adviseExecution(meta);

      expect(advice.suggestedParallelism).toBe(1);
      expect(advice.reorderableStepPairs).toHaveLength(0);
    });
  });

  // =========================================================================
  // Feasibility gate
  // =========================================================================

  describe('Feasibility failed → block + replan', () => {
    it('single rejection → block with reason', () => {
      const meta = makeMeta({
        signals: makeSignals({
          feasibility_passed: false,
          feasibility_rejections: { missing_resource: 1 },
        }),
      });
      const advice = adviseExecution(meta);

      expect(advice.shouldProceed).toBe(false);
      expect(advice.shouldReplan).toBe(true);
      expect(advice.blockReason).toContain('Feasibility failed');
      expect(advice.blockReason).toContain('missing_resource');
      expect(advice.replanReason).toContain('Infeasible plan');
    });

    it('multiple rejections → all listed', () => {
      const meta = makeMeta({
        signals: makeSignals({
          feasibility_passed: false,
          feasibility_rejections: {
            missing_resource: 2,
            unreachable_block: 1,
          },
        }),
      });
      const advice = adviseExecution(meta);

      expect(advice.shouldProceed).toBe(false);
      expect(advice.blockReason).toContain('missing_resource');
      expect(advice.blockReason).toContain('unreachable_block');
    });

    it('feasibility failed returns parallelism=1', () => {
      const meta = makeMeta({
        signals: makeSignals({
          feasibility_passed: false,
          feasibility_rejections: { x: 1 },
        }),
      });
      const advice = adviseExecution(meta);

      expect(advice.suggestedParallelism).toBe(1);
      expect(advice.reorderableStepPairs).toHaveLength(0);
    });
  });

  // =========================================================================
  // Feasibility passed → proceed
  // =========================================================================

  describe('Feasibility passed → proceed', () => {
    it('basic feasible plan → shouldProceed=true', () => {
      const meta = makeMeta();
      const advice = adviseExecution(meta);

      expect(advice.shouldProceed).toBe(true);
      expect(advice.shouldReplan).toBe(false);
      expect(advice.blockReason).toBeUndefined();
      expect(advice.replanReason).toBeUndefined();
    });

    it('commuting pairs forwarded', () => {
      const pairs: CommutingPair[] = [
        { nodeA: 'a', nodeB: 'b' },
        { nodeA: 'c', nodeB: 'd' },
      ];
      const meta = makeMeta({ commutingPairs: pairs });
      const advice = adviseExecution(meta);

      expect(advice.reorderableStepPairs).toEqual(pairs);
    });
  });

  // =========================================================================
  // Parallelism from ready-set size
  // =========================================================================

  describe('Parallelism from ready-set size', () => {
    it('ready_set_size_mean=2.0 → parallelism=2', () => {
      const meta = makeMeta({
        signals: makeSignals({ ready_set_size_mean: 2.0 }),
      });
      const advice = adviseExecution(meta);

      expect(advice.suggestedParallelism).toBe(2);
    });

    it('ready_set_size_mean=1.0 → parallelism=1', () => {
      const meta = makeMeta({
        signals: makeSignals({ ready_set_size_mean: 1.0 }),
      });
      const advice = adviseExecution(meta);

      expect(advice.suggestedParallelism).toBe(1);
    });

    it('ready_set_size_mean=0.5 → clamped to 1', () => {
      const meta = makeMeta({
        signals: makeSignals({ ready_set_size_mean: 0.5 }),
      });
      const advice = adviseExecution(meta);

      expect(advice.suggestedParallelism).toBe(1);
    });

    it('ready_set_size_mean=10.0 → clamped to 3', () => {
      const meta = makeMeta({
        signals: makeSignals({ ready_set_size_mean: 10.0 }),
      });
      const advice = adviseExecution(meta);

      expect(advice.suggestedParallelism).toBe(3);
    });

    it('ready_set_size_mean=3.0 → parallelism=3', () => {
      const meta = makeMeta({
        signals: makeSignals({ ready_set_size_mean: 3.0 }),
      });
      const advice = adviseExecution(meta);

      expect(advice.suggestedParallelism).toBe(3);
    });

    it('ready_set_size_mean=2.7 → floor → parallelism=2', () => {
      const meta = makeMeta({
        signals: makeSignals({ ready_set_size_mean: 2.7 }),
      });
      const advice = adviseExecution(meta);

      expect(advice.suggestedParallelism).toBe(2);
    });
  });
});
