// packages/planning/src/sterling/__tests__/temporal-crafting-e2e.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { MinecraftCraftingSolver } from '../minecraft-crafting-solver';
import type { MinecraftCraftingRule } from '../minecraft-crafting-types';
import * as ruleBuilderModule from '../minecraft-crafting-rules';

import * as temporalEnrichmentModule from '../../temporal/temporal-enrichment';
import { computeTemporalEnrichment } from '../../temporal/temporal-enrichment';
import type { TemporalMode } from '../../temporal/temporal-enrichment';

import {
  MINECRAFT_BUCKET_SIZE_TICKS,
  HORIZON_BUCKETS,
  MAX_WAIT_BUCKETS,
  inferSlotsFromBlocks,
  makeTemporalState,
  toTickBucket,
} from '../../temporal/time-state';

import {
  annotateRuleWithDuration,
  computeDurationTicks,
  findDuration,
} from '../../temporal/duration-model';

import {
  deriveSlotNeeds,
  checkDeadlockForRules,
} from '../../temporal/deadlock-prevention';

import { getBatchHint } from '../../temporal/batch-operators';

import { P03ReferenceAdapter } from '../primitives/p03/p03-reference-adapter';

/**
 * Rig C Temporal Planning — End-to-End Integration Test
 *
 * Proves: mcData → rules → enrichment → payload → result
 * No live Sterling backend required (mock service).
 *
 * Two mock strategies:
 *   1. "Permissive mock" — returns a fixed response regardless of payload.
 *      Used for tests that only care about payload shape / temporal fields.
 *   2. "Strict mock" — validates the payload and derives the response from it.
 *      Used for integration tests that prove mcData → rules → payload correctness.
 *
 * Notes:
 * - buildCraftingRules (today) does not generate smelt rules, so smelt/deadlock
 *   cases inject smelt rules via vi.spyOn on the rule builder module.
 * - This file intentionally avoids importing any "extra" test utils; it mirrors
 *   the golden-master mock pattern but remains self-contained.
 */

// -----------------------------
// Shared fixtures & helpers
// -----------------------------

const STICK_MC_DATA: any = {
  itemsByName: {
    stick: { id: 1, name: 'stick' },
    oak_planks: { id: 2, name: 'oak_planks' },
    oak_log: { id: 3, name: 'oak_log' },
    iron_ingot: { id: 10, name: 'iron_ingot' },
    iron_ore: { id: 11, name: 'iron_ore' },
  },
  items: {
    1: { id: 1, name: 'stick' },
    2: { id: 2, name: 'oak_planks' },
    3: { id: 3, name: 'oak_log' },
    10: { id: 10, name: 'iron_ingot' },
    11: { id: 11, name: 'iron_ore' },
  },
  recipes: {
    // stick: 4 from 2 planks + 2 planks (simplified)
    1: [
      {
        result: { id: 1, count: 4 },
        ingredients: [2, 2],
      },
    ],
    // planks: 4 from 1 log (simplified)
    2: [
      {
        result: { id: 2, count: 4 },
        ingredients: [3],
      },
    ],
  },
};

/**
 * Mock Sterling response — must match the SterlingSolveResult shape
 * that the solver's mapSolutionToSteps and metric extraction expect:
 *   { solutionFound, solutionPath, discoveredNodes, searchEdges, metrics, durationMs }
 */
function makeSolvedResponse(partial?: Record<string, unknown>) {
  return {
    solutionFound: true,
    solutionPath: [
      { source: 'S0', target: 'S1' },
      { source: 'S1', target: 'S2' },
      { source: 'S2', target: 'S3' },
    ],
    discoveredNodes: ['S0', 'S1', 'S2', 'S3'],
    searchEdges: [
      { source: 'S0', target: 'S1', label: { action: 'mine:oak_log' } },
      { source: 'S1', target: 'S2', label: { action: 'craft:oak_planks' } },
      { source: 'S2', target: 'S3', label: { action: 'craft:stick' } },
    ],
    metrics: { planId: 'plan_test_0' },
    durationMs: 7,
    ...partial,
  };
}

/**
 * Build a Sterling response derived from the solve payload's rules.
 * Each rule becomes one edge in the solution path, so the response is
 * structurally consistent with the request — a bug in rule construction
 * will cause a mismatch in the mapped steps.
 */
function makeDerivedResponse(payload: Record<string, unknown>) {
  const rules = payload.rules as MinecraftCraftingRule[];
  const nodes = Array.from({ length: rules.length + 1 }, (_, i) => `S${i}`);
  const solutionPath = rules.map((_, i) => ({
    source: `S${i}`,
    target: `S${i + 1}`,
  }));
  const searchEdges = rules.map((r, i) => ({
    source: `S${i}`,
    target: `S${i + 1}`,
    label: { action: r.action },
  }));

  return {
    solutionFound: true,
    solutionPath,
    discoveredNodes: nodes,
    searchEdges,
    metrics: { planId: 'plan_derived_0' },
    durationMs: 5,
  };
}

/**
 * Permissive mock — returns a fixed response regardless of payload.
 * Good for tests that only care about payload shape / temporal field presence.
 */
function createMockService(response?: Record<string, unknown>) {
  const solve = vi.fn(async (_domain: string, _payload: unknown) => {
    return response ?? makeSolvedResponse();
  });

  return {
    solve,
    isAvailable: () => true,
    available: true,
  };
}

/**
 * Strict mock — validates the payload via assertPayload, then builds a response
 * derived from the payload's rules. Failures in rule construction surface as
 * assertion errors inside the mock, not as silently-passing tests.
 */
function createStrictMockService(
  assertPayload: (payload: Record<string, unknown>) => void,
) {
  const solve = vi.fn(async (_domain: string, payload: unknown) => {
    const p = payload as Record<string, unknown>;
    assertPayload(p);
    return makeDerivedResponse(p);
  });

  return {
    solve,
    isAvailable: () => true,
    available: true,
  };
}

function getLastSolvePayload(service: any): any {
  const calls = (service.solve as ReturnType<typeof vi.fn>).mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1][1];
}

function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();

  const norm = (v: any): any => {
    if (v === null || typeof v !== 'object') return v;
    if (seen.has(v)) return '[Circular]';
    seen.add(v);

    if (Array.isArray(v)) return v.map(norm);

    const keys = Object.keys(v).sort();
    const out: any = {};
    for (const k of keys) out[k] = norm(v[k]);
    return out;
  };

  return JSON.stringify(norm(value));
}

function expectNoTemporalPayloadFields(payload: any) {
  expect(payload).not.toHaveProperty('currentTickBucket');
  expect(payload).not.toHaveProperty('horizonBucket');
  expect(payload).not.toHaveProperty('bucketSizeTicks');
  expect(payload).not.toHaveProperty('slots');
}

function expectSlotsCanonicallySorted(
  slots: Array<{ id: string; type: string; readyAtBucket: number }>
) {
  for (let i = 1; i < slots.length; i++) {
    const a = slots[i - 1];
    const b = slots[i];

    const typeCmp = a.type.localeCompare(b.type);
    if (typeCmp < 0) continue;

    if (typeCmp > 0) {
      throw new Error(
        `Slots not sorted by type: ${a.type} should not come before ${b.type}`
      );
    }

    // type equal
    if (a.readyAtBucket < b.readyAtBucket) continue;

    if (a.readyAtBucket > b.readyAtBucket) {
      throw new Error(
        `Slots not sorted by readyAtBucket for type=${a.type}: ${a.readyAtBucket} > ${b.readyAtBucket}`
      );
    }

    // readyAt equal
    expect(a.id.localeCompare(b.id)).toBeLessThanOrEqual(0);
  }
}

// Synthetic smelt rules (since buildCraftingRules never produces smelt today).
const SMELT_IRON_RULE: MinecraftCraftingRule = {
  action: 'smelt:iron_ore',
  actionType: 'smelt',
  produces: [{ name: 'iron_ingot', count: 1 }],
  consumes: [{ name: 'iron_ore', count: 1 }],
  requires: [],
  needsTable: false,
  needsFurnace: true,
  baseCost: 1,
};

// A craft rule that is "fail-closed" furnace-requiring (to test needsFurnace logic).
const CRAFT_WITH_FURNACE_NEED: MinecraftCraftingRule = {
  action: 'craft:foo',
  actionType: 'craft',
  produces: [{ name: 'foo', count: 1 }],
  consumes: [{ name: 'bar', count: 1 }],
  requires: [],
  needsTable: false,
  needsFurnace: true,
  baseCost: 1,
};

/**
 * Expected rules from buildCraftingRules(STICK_MC_DATA, 'stick').
 * Traced from the recipe tree: stick ← oak_planks ← oak_log (mine).
 */
const EXPECTED_STICK_ACTIONS = ['mine:oak_log', 'craft:oak_planks', 'craft:stick'] as const;
const EXPECTED_STICK_RULES = {
  'craft:stick': { consumes: [{ name: 'oak_planks', count: 2 }], produces: [{ name: 'stick', count: 4 }] },
  'craft:oak_planks': { consumes: [{ name: 'oak_log', count: 1 }], produces: [{ name: 'oak_planks', count: 4 }] },
  'mine:oak_log': { consumes: [] as { name: string; count: number }[], produces: [{ name: 'oak_log', count: 1 }] },
} as const;

// -----------------------------
// Test suites A–K
// -----------------------------

describe('Rig C temporal crafting e2e', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  // A. Baseline — mode=off
  describe('A. baseline — mode=off', () => {
    it('default (no temporal options) → no temporal payload fields, clean result', async () => {
      const service = createMockService(makeSolvedResponse());
      const solver = new MinecraftCraftingSolver(service as any);

      const result = await solver.solveCraftingGoal(
        'stick',
        [],
        STICK_MC_DATA,
        ['oak_log']
      );

      expect(service.solve).toHaveBeenCalledTimes(1);
      const payload = getLastSolvePayload(service);

      expectNoTemporalPayloadFields(payload);
      expect(result).toHaveProperty('solved', true);
      expect(result).toHaveProperty('steps');
      expect(Array.isArray((result as any).steps)).toBe(true);
    });

    it("explicit { mode: 'off' } → byte-equivalent payload to default", async () => {
      const serviceA = createMockService(makeSolvedResponse());
      const solverA = new MinecraftCraftingSolver(serviceA as any);

      await solverA.solveCraftingGoal('stick', [], STICK_MC_DATA, ['oak_log']);
      const payloadDefault = getLastSolvePayload(serviceA);

      const serviceB = createMockService(makeSolvedResponse());
      const solverB = new MinecraftCraftingSolver(serviceB as any);

      await solverB.solveCraftingGoal('stick', [], STICK_MC_DATA, ['oak_log'], {
        mode: 'off',
      });
      const payloadOff = getLastSolvePayload(serviceB);

      expect(stableStringify(payloadOff)).toBe(stableStringify(payloadDefault));
    });

    it('INERT enrichRule returns same reference (Object.is)', async () => {
      // This is a property of computeTemporalEnrichment(mode='off') as well as the solver’s short-circuit.
      const adapter = new P03ReferenceAdapter(MAX_WAIT_BUCKETS, 8);

      const rule: MinecraftCraftingRule = {
        action: 'craft:stick',
        actionType: 'craft',
        produces: [{ name: 'stick', count: 4 }],
        consumes: [{ name: 'oak_planks', count: 2 }],
        requires: [],
        needsTable: false,
        needsFurnace: false,
        baseCost: 1,
      };

      const enr = computeTemporalEnrichment({
        mode: 'off',
        adapter,
        stateInput: {
          nowTicks: 0,
          nearbyBlocks: [],
          bucketSizeTicks: MINECRAFT_BUCKET_SIZE_TICKS,
          horizonBuckets: HORIZON_BUCKETS,
        },
        rules: [rule],
      });

      expect(enr.mode).toBe('off');
      expect(Object.is(enr.enrichRule(rule), rule)).toBe(true);
      expect(enr.batchHint('iron_ore', 64).useBatch).toBe(false);
    });
  });

  // B. local_only — enrichment runs but stays local
  describe('B. local_only — enrichment runs but stays local', () => {
    it('furnace nearby → no temporal payload fields, Sterling called (no deadlock for craft/mine)', async () => {
      const service = createMockService(makeSolvedResponse());
      const solver = new MinecraftCraftingSolver(service as any);

      const result = await solver.solveCraftingGoal(
        'stick',
        [],
        STICK_MC_DATA,
        ['furnace', 'oak_log'],
        { mode: 'local_only', nowTicks: 500 }
      );

      expect(service.solve).toHaveBeenCalledTimes(1);
      const payload = getLastSolvePayload(service);
      expectNoTemporalPayloadFields(payload);

      expect(result).toHaveProperty('solved', true);
    });

    it('no nearby blocks → empty slots, valid state, no false deadlock', async () => {
      const adapter = new P03ReferenceAdapter(MAX_WAIT_BUCKETS, 8);
      const enr = computeTemporalEnrichment({
        mode: 'local_only',
        adapter,
        stateInput: {
          nowTicks: 1000,
          nearbyBlocks: [],
          bucketSizeTicks: MINECRAFT_BUCKET_SIZE_TICKS,
          horizonBuckets: HORIZON_BUCKETS,
        },
        rules: [], // craft/mine rules don’t matter here; we just want state construction
      });

      expect(enr.temporalState).toBeDefined();
      expect(enr.temporalState!.slots).toEqual([]);
      expect(enr.deadlock?.isDeadlock ?? false).toBe(false);
    });

    it('multiple furnace blocks → deterministic slot IDs and correct types for lit variants', async () => {
      const slots = inferSlotsFromBlocks([
        'lit_furnace',
        'furnace',
        'smoker',
        'lit_smoker',
        'furnace',
      ], 0);

      // All “lit_*” variants map to base slot type (furnace/smoker/blast_furnace)
      for (const s of slots) {
        expect(['furnace', 'smoker', 'blast_furnace']).toContain(s.type);
      }

      // Deterministic IDs (per type counter)
      const ids = slots.map((s) => s.id);
      // Expect at least furnace_0/furnace_1 and smoker_0/smoker_1 given the blocks above
      expect(ids).toContain('furnace_0');
      expect(ids).toContain('furnace_1');
      expect(ids).toContain('smoker_0');
      expect(ids).toContain('smoker_1');
    });
  });

  // C. sterling_temporal — temporal fields reach the wire
  describe('C. sterling_temporal — temporal fields reach the wire', () => {
    it('temporal fields on payload: currentTickBucket=5 for nowTicks=500, horizonBucket=105, all integers', async () => {
      const service = createMockService(makeSolvedResponse());
      const solver = new MinecraftCraftingSolver(service as any);

      await solver.solveCraftingGoal('stick', [], STICK_MC_DATA, ['furnace'], {
        mode: 'sterling_temporal',
        nowTicks: 500,
      });

      const payload = getLastSolvePayload(service);

      expect(payload).toHaveProperty('currentTickBucket', 5);
      expect(payload).toHaveProperty('horizonBucket', 5 + HORIZON_BUCKETS);
      expect(payload).toHaveProperty(
        'bucketSizeTicks',
        MINECRAFT_BUCKET_SIZE_TICKS
      );
      expect(payload).toHaveProperty('slots');

      expect(Number.isInteger(payload.currentTickBucket)).toBe(true);
      expect(Number.isInteger(payload.horizonBucket)).toBe(true);
      expect(Number.isInteger(payload.bucketSizeTicks)).toBe(true);
    });

    it('rules in payload still lack durationTicks/requiresSlotType (annotations stay local)', async () => {
      const service = createMockService(makeSolvedResponse());
      const solver = new MinecraftCraftingSolver(service as any);

      await solver.solveCraftingGoal('stick', [], STICK_MC_DATA, ['furnace'], {
        mode: 'sterling_temporal',
        nowTicks: 500,
      });

      const payload = getLastSolvePayload(service);
      const rules = payload.rules as Array<Record<string, unknown>>;

      for (const r of rules) {
        expect(r).not.toHaveProperty('durationTicks');
        expect(r).not.toHaveProperty('requiresSlotType');
      }
    });

    it('canonical slot ordering in payload matches P03 sort contract (type ASC, readyAt ASC, id ASC)', async () => {
      const service = createMockService(makeSolvedResponse());
      const solver = new MinecraftCraftingSolver(service as any);

      // Unsorted input
      await solver.solveCraftingGoal(
        'stick',
        [],
        STICK_MC_DATA,
        ['smoker', 'furnace', 'lit_furnace', 'blast_furnace', 'furnace'],
        { mode: 'sterling_temporal', nowTicks: 1234 }
      );

      const payload = getLastSolvePayload(service);
      const slots = payload.slots as Array<{
        id: string;
        type: string;
        readyAtBucket: number;
      }>;

      expect(Array.isArray(slots)).toBe(true);
      expect(slots.length).toBeGreaterThan(0);
      expectSlotsCanonicallySorted(slots);
    });
  });

  // D. Temporal state construction
  describe('D. temporal state construction', () => {
    it('realistic nowTicks=12345 → bucket 123, horizon 223, slot readyAt=123', async () => {
      const adapter = new P03ReferenceAdapter(MAX_WAIT_BUCKETS, 8);
      const st = makeTemporalState({
        nowTicks: 12345,
        nearbyBlocks: ['furnace'],
        bucketSizeTicks: MINECRAFT_BUCKET_SIZE_TICKS,
        horizonBuckets: HORIZON_BUCKETS,
      }, adapter);

      expect(st.time.currentBucket).toBe(123);
      expect(st.time.horizonBucket).toBe(123 + HORIZON_BUCKETS);
      expect(st.slots.length).toBeGreaterThan(0);
      // Inferred slots default to readyAtBucket=currentBucket
      expect(st.slots[0].readyAtBucket).toBe(123);
    });

    it('slotsObserved overrides nearbyBlocks inference', async () => {
      const adapter = new P03ReferenceAdapter(MAX_WAIT_BUCKETS, 8);

      const observed = [
        { id: 'furnace_obs_0', type: 'furnace', readyAtBucket: 7, capacity: 1 },
      ];

      const enr = computeTemporalEnrichment({
        mode: 'local_only',
        adapter,
        stateInput: {
          nowTicks: 800,
          nearbyBlocks: ['furnace', 'smoker', 'blast_furnace'],
          slotsObserved: observed as any,
          bucketSizeTicks: MINECRAFT_BUCKET_SIZE_TICKS,
          horizonBuckets: HORIZON_BUCKETS,
        },
        rules: [],
      });

      expect(enr.temporalState).toBeDefined();
      expect(enr.temporalState!.slots).toHaveLength(1);
      expect(enr.temporalState!.slots[0].id).toBe('furnace_obs_0');
    });

    it('edge case: nowTicks=0 → bucket 0, horizon 100, valid state', async () => {
      const adapter = new P03ReferenceAdapter(MAX_WAIT_BUCKETS, 8);
      const st = makeTemporalState({
        nowTicks: 0,
        nearbyBlocks: [],
        bucketSizeTicks: MINECRAFT_BUCKET_SIZE_TICKS,
        horizonBuckets: HORIZON_BUCKETS,
      }, adapter);

      expect(st.time.currentBucket).toBe(0);
      expect(st.time.horizonBucket).toBe(HORIZON_BUCKETS);
      expect(st.time.bucketSizeTicks).toBe(MINECRAFT_BUCKET_SIZE_TICKS);
      expect(st.slots).toEqual([]);
    });
  });

  // E. Duration annotations per action type
  describe('E. duration annotations per action type', () => {
    it('craft → durationTicks=0, no slot', () => {
      const annotated = annotateRuleWithDuration('craft:stick', 'craft', 1);
      expect(annotated.durationTicks).toBe(0);
      expect(annotated.requiresSlotType).toBeUndefined();
    });

    it('mine → durationTicks=40, no slot', () => {
      const annotated = annotateRuleWithDuration('mine:oak_log', 'mine', 1);
      expect(annotated.durationTicks).toBe(40);
      expect(annotated.requiresSlotType).toBeUndefined();
    });

    it("smelt → durationTicks=200, requiresSlotType='furnace'", () => {
      const annotated = annotateRuleWithDuration(SMELT_IRON_RULE.action, SMELT_IRON_RULE.actionType, 1);
      expect(annotated.durationTicks).toBe(200);
      expect(annotated.requiresSlotType).toBe('furnace');
    });

    it('place → durationTicks=5, no slot', () => {
      const annotated = annotateRuleWithDuration('place:furnace', 'place', 1);
      expect(annotated.durationTicks).toBe(5);
      expect(annotated.requiresSlotType).toBeUndefined();
    });

    it('enrichRule preserves all original rule fields', () => {
      const adapter = new P03ReferenceAdapter(MAX_WAIT_BUCKETS, 8);
      const base: MinecraftCraftingRule = {
        action: 'mine:oak_log',
        actionType: 'mine',
        produces: [{ name: 'oak_log', count: 1 }],
        consumes: [],
        requires: [{ name: 'axe', count: 1 }],
        needsTable: false,
        needsFurnace: false,
        baseCost: 7,
      };

      const enr = computeTemporalEnrichment({
        mode: 'local_only',
        adapter,
        stateInput: {
          nowTicks: 0,
          nearbyBlocks: [],
          bucketSizeTicks: MINECRAFT_BUCKET_SIZE_TICKS,
          horizonBuckets: HORIZON_BUCKETS,
        },
        rules: [base],
      });

      const out = enr.enrichRule(base);

      // Original fields preserved
      expect(out.action).toBe(base.action);
      expect(out.actionType).toBe(base.actionType);
      expect(out.produces).toEqual(base.produces);
      expect(out.consumes).toEqual(base.consumes);
      expect(out.requires).toEqual(base.requires);
      expect(out.needsTable).toBe(base.needsTable);
      expect(out.needsFurnace).toBe(base.needsFurnace);
      expect(out.baseCost).toBe(base.baseCost);
    });

    it('batch duration scaling: smelt with goalCount=5 → 1000', () => {
      expect(computeDurationTicks(SMELT_IRON_RULE.action, 5, SMELT_IRON_RULE.actionType)).toBe(1000);
    });
  });

  // F. Deadlock detection
  describe('F. deadlock detection', () => {
    it("smelt rule + no furnace slots → deadlock, blockedSlotTypes exactly ['furnace']", () => {
      const adapter = new P03ReferenceAdapter(MAX_WAIT_BUCKETS, 8);

      const enr = computeTemporalEnrichment({
        mode: 'local_only',
        adapter,
        stateInput: {
          nowTicks: 0,
          nearbyBlocks: [], // no furnaces
          bucketSizeTicks: MINECRAFT_BUCKET_SIZE_TICKS,
          horizonBuckets: HORIZON_BUCKETS,
        },
        rules: [SMELT_IRON_RULE],
      });

      expect(enr.deadlock).toBeDefined();
      expect(enr.deadlock!.isDeadlock).toBe(true);
      expect(enr.deadlock!.blockedSlotTypes).toEqual(['furnace']);
    });

    it('smelt rule + furnace slot present → no deadlock', () => {
      const adapter = new P03ReferenceAdapter(MAX_WAIT_BUCKETS, 8);

      const enr = computeTemporalEnrichment({
        mode: 'local_only',
        adapter,
        stateInput: {
          nowTicks: 0,
          nearbyBlocks: ['furnace'],
          bucketSizeTicks: MINECRAFT_BUCKET_SIZE_TICKS,
          horizonBuckets: HORIZON_BUCKETS,
        },
        rules: [SMELT_IRON_RULE],
      });

      expect(enr.deadlock?.isDeadlock ?? false).toBe(false);
    });

    it('craft-only rules + no slots → no deadlock (deriveSlotNeeds returns empty)', () => {
      const adapter = new P03ReferenceAdapter(MAX_WAIT_BUCKETS, 8);
      const craftRule: MinecraftCraftingRule = {
        action: 'craft:stick',
        actionType: 'craft',
        produces: [{ name: 'stick', count: 4 }],
        consumes: [{ name: 'oak_planks', count: 2 }],
        requires: [],
        needsTable: false,
        needsFurnace: false,
        baseCost: 1,
      };

      const needs = deriveSlotNeeds([craftRule]);
      expect(needs).toEqual([]);

      const enr = computeTemporalEnrichment({
        mode: 'local_only',
        adapter,
        stateInput: {
          nowTicks: 0,
          nearbyBlocks: [],
          bucketSizeTicks: MINECRAFT_BUCKET_SIZE_TICKS,
          horizonBuckets: HORIZON_BUCKETS,
        },
        rules: [craftRule],
      });

      expect(enr.deadlock?.isDeadlock ?? false).toBe(false);
    });

    it('injected smelt rule + no furnace → deadlock, service.solve NOT called', async () => {
      // Inject a smelt rule via the real solver boundary (not monkeypatch).
      // buildCraftingRules returns normal rules + the synthetic smelt rule.
      const realBuild = ruleBuilderModule.buildCraftingRules;
      const spy = vi.spyOn(ruleBuilderModule, 'buildCraftingRules').mockImplementation(
        (...args: Parameters<typeof realBuild>) => {
          const baseRules = realBuild(...args);
          return [...baseRules, SMELT_IRON_RULE];
        },
      );

      const service = createMockService(makeSolvedResponse());
      const solver = new MinecraftCraftingSolver(service as any);

      const result = await solver.solveCraftingGoal(
        'stick', [], STICK_MC_DATA,
        [], // no furnace blocks
        { mode: 'local_only', nowTicks: 0 },
      );

      expect(service.solve).not.toHaveBeenCalled();
      expect(result.solved).toBe(false);
      expect(result.error ?? '').toContain('deadlock');
      spy.mockRestore();
    });

    it('injected smelt rule + furnace present → no deadlock, service.solve called', async () => {
      const realBuild = ruleBuilderModule.buildCraftingRules;
      const spy = vi.spyOn(ruleBuilderModule, 'buildCraftingRules').mockImplementation(
        (...args: Parameters<typeof realBuild>) => {
          const baseRules = realBuild(...args);
          return [...baseRules, SMELT_IRON_RULE];
        },
      );

      const service = createMockService(makeSolvedResponse());
      const solver = new MinecraftCraftingSolver(service as any);

      const result = await solver.solveCraftingGoal(
        'stick', [], STICK_MC_DATA,
        ['furnace'], // furnace present — no deadlock
        { mode: 'local_only', nowTicks: 0 },
      );

      expect(service.solve).toHaveBeenCalledTimes(1);
      expect(result.solved).toBe(true);
      spy.mockRestore();
    });

    it('needsFurnace=true on a craft rule → furnace slot need via fail-closed logic', () => {
      const adapter = new P03ReferenceAdapter(MAX_WAIT_BUCKETS, 8);

      // Construct a temporal state with no slots — deadlock will trigger
      // because CRAFT_WITH_FURNACE_NEED has needsFurnace=true (fail-closed).
      const state = makeTemporalState({
        nowTicks: 0,
        nearbyBlocks: [], // no furnaces
        bucketSizeTicks: MINECRAFT_BUCKET_SIZE_TICKS,
        horizonBuckets: HORIZON_BUCKETS,
      }, adapter);

      const deadlock = checkDeadlockForRules(
        adapter,
        [CRAFT_WITH_FURNACE_NEED],
        state,
      );

      expect(deadlock.isDeadlock).toBe(true);
      expect(deadlock.blockedSlotTypes).toEqual(['furnace']);
    });
  });

  // G. Batch hints
  describe('G. batch hints', () => {
    it("iron_ore × 64 → useBatch: true, operatorId='smelt_batch_iron_ore', batchSize=64", () => {
      const adapter = new P03ReferenceAdapter(MAX_WAIT_BUCKETS, 8);

      const enr = computeTemporalEnrichment({
        mode: 'local_only',
        adapter,
        stateInput: {
          nowTicks: 0,
          nearbyBlocks: ['furnace'],
          bucketSizeTicks: MINECRAFT_BUCKET_SIZE_TICKS,
          horizonBuckets: HORIZON_BUCKETS,
        },
        rules: [],
      });

      const hint = enr.batchHint('iron_ore', 64);
      expect(hint.useBatch).toBe(true);
      expect(hint.operatorId).toBe('smelt_batch_iron_ore');
      expect(hint.batchSize).toBe(64);
    });

    it('iron_ore × 3 → useBatch: false (below threshold 8)', () => {
      const adapter = new P03ReferenceAdapter(MAX_WAIT_BUCKETS, 8);

      const enr = computeTemporalEnrichment({
        mode: 'local_only',
        adapter,
        stateInput: {
          nowTicks: 0,
          nearbyBlocks: ['furnace'],
          bucketSizeTicks: MINECRAFT_BUCKET_SIZE_TICKS,
          horizonBuckets: HORIZON_BUCKETS,
        },
        rules: [],
      });

      const hint = enr.batchHint('iron_ore', 3);
      expect(hint.useBatch).toBe(false);
    });

    it('oak_planks × 64 → useBatch: false (no matching operator)', () => {
      const adapter = new P03ReferenceAdapter(MAX_WAIT_BUCKETS, 8);

      const enr = computeTemporalEnrichment({
        mode: 'local_only',
        adapter,
        stateInput: {
          nowTicks: 0,
          nearbyBlocks: ['furnace'],
          bucketSizeTicks: MINECRAFT_BUCKET_SIZE_TICKS,
          horizonBuckets: HORIZON_BUCKETS,
        },
        rules: [],
      });

      const hint = enr.batchHint('oak_planks', 64);
      expect(hint.useBatch).toBe(false);
    });

    it('mode=off → always useBatch: false', () => {
      const adapter = new P03ReferenceAdapter(MAX_WAIT_BUCKETS, 8);

      const enr = computeTemporalEnrichment({
        mode: 'off',
        adapter,
        stateInput: {
          nowTicks: 0,
          nearbyBlocks: ['furnace'],
          bucketSizeTicks: MINECRAFT_BUCKET_SIZE_TICKS,
          horizonBuckets: HORIZON_BUCKETS,
        },
        rules: [],
      });

      expect(enr.batchHint('iron_ore', 64).useBatch).toBe(false);
    });

    it('iron_ore × 100 → batchSize clamped to 64 (maxBatchSize)', () => {
      // Direct unit check on batch operator hint helper as well
      const adapter = new P03ReferenceAdapter(MAX_WAIT_BUCKETS, 8);
      const hint = getBatchHint(adapter, 'iron_ore', 100);
      expect(hint.useBatch).toBe(true);
      expect(hint.batchSize).toBe(64);
    });
  });

  // H. Full pipeline round-trip
  describe('H. full pipeline round-trip', () => {
    it('same Sterling response across off/local_only/sterling_temporal → identical solved/steps', async () => {
      const response = makeSolvedResponse();

      const mk = async (mode?: TemporalMode) => {
        const service = createMockService(response);
        const solver = new MinecraftCraftingSolver(service as any);

        const opts =
          mode === undefined ? undefined : ({ mode, nowTicks: 500 } as any);

        const result = await solver.solveCraftingGoal(
          'stick',
          [],
          STICK_MC_DATA,
          ['furnace', 'oak_log'],
          opts
        );

        return { service, result };
      };

      const off = await mk(undefined);
      const local = await mk('local_only');
      const temporal = await mk('sterling_temporal');

      expect(off.result.solved).toBe(true);
      expect(local.result.solved).toBe(true);
      expect(temporal.result.solved).toBe(true);

      // Compare steps (shape may differ slightly depending on solver mapping, but actions should match).
      const stepsA = (off.result as any).steps;
      const stepsB = (local.result as any).steps;
      const stepsC = (temporal.result as any).steps;

      expect(stableStringify(stepsB)).toBe(stableStringify(stepsA));
      expect(stableStringify(stepsC)).toBe(stableStringify(stepsA));
    });

    it('payload rules byte-equivalent between off and local_only', async () => {
      const serviceA = createMockService(makeSolvedResponse());
      const solverA = new MinecraftCraftingSolver(serviceA as any);
      await solverA.solveCraftingGoal('stick', [], STICK_MC_DATA, ['oak_log']);
      const payloadOff = getLastSolvePayload(serviceA);

      const serviceB = createMockService(makeSolvedResponse());
      const solverB = new MinecraftCraftingSolver(serviceB as any);
      await solverB.solveCraftingGoal('stick', [], STICK_MC_DATA, ['oak_log'], {
        mode: 'local_only',
        nowTicks: 999,
      });
      const payloadLocal = getLastSolvePayload(serviceB);

      // Top-level payload should be byte-equivalent (temporal fields are absent in both).
      expect(stableStringify(payloadLocal)).toBe(stableStringify(payloadOff));
    });

    it('temporal fields present only in sterling_temporal payload', async () => {
      const serviceA = createMockService(makeSolvedResponse());
      const solverA = new MinecraftCraftingSolver(serviceA as any);
      await solverA.solveCraftingGoal('stick', [], STICK_MC_DATA, ['furnace'], {
        mode: 'local_only',
        nowTicks: 500,
      });
      const payloadLocal = getLastSolvePayload(serviceA);
      expectNoTemporalPayloadFields(payloadLocal);

      const serviceB = createMockService(makeSolvedResponse());
      const solverB = new MinecraftCraftingSolver(serviceB as any);
      await solverB.solveCraftingGoal('stick', [], STICK_MC_DATA, ['furnace'], {
        mode: 'sterling_temporal',
        nowTicks: 500,
      });
      const payloadTemporal = getLastSolvePayload(serviceB);
      expect(payloadTemporal).toHaveProperty('currentTickBucket');
      expect(payloadTemporal).toHaveProperty('slots');
    });
  });

  // I. Adapter reuse across solves
  describe('I. adapter reuse across solves', () => {
    it('4 sequential solves (off → local_only → sterling_temporal → off): correct output, no state pollution', async () => {
      const service = createMockService(makeSolvedResponse());
      const solver = new MinecraftCraftingSolver(service as any);

      const r1 = await solver.solveCraftingGoal('stick', [], STICK_MC_DATA, [
        'oak_log',
      ]);
      const p1 = getLastSolvePayload(service);
      expectNoTemporalPayloadFields(p1);
      expect(r1.solved).toBe(true);

      (service.solve as any).mockResolvedValueOnce(makeSolvedResponse());
      const r2 = await solver.solveCraftingGoal(
        'stick',
        [],
        STICK_MC_DATA,
        ['furnace'],
        {
          mode: 'local_only',
          nowTicks: 500,
        }
      );
      const p2 = getLastSolvePayload(service);
      expectNoTemporalPayloadFields(p2);
      expect(r2.solved).toBe(true);

      (service.solve as any).mockResolvedValueOnce(makeSolvedResponse());
      const r3 = await solver.solveCraftingGoal(
        'stick',
        [],
        STICK_MC_DATA,
        ['furnace', 'smoker'],
        {
          mode: 'sterling_temporal',
          nowTicks: 500,
        }
      );
      const p3 = getLastSolvePayload(service);
      expect(p3).toHaveProperty('currentTickBucket', 5);
      expect(p3).toHaveProperty('slots');
      expect(r3.solved).toBe(true);

      (service.solve as any).mockResolvedValueOnce(makeSolvedResponse());
      const r4 = await solver.solveCraftingGoal(
        'stick',
        [],
        STICK_MC_DATA,
        ['oak_log'],
        { mode: 'off' }
      );
      const p4 = getLastSolvePayload(service);
      expectNoTemporalPayloadFields(p4);
      expect(r4.solved).toBe(true);
    });

    it('adapter instance is same object before and after solves (Object.is)', async () => {
      const service = createMockService(makeSolvedResponse());
      const solver = new MinecraftCraftingSolver(service as any);

      const a0 = (solver as any).temporalAdapter;
      expect(a0).toBeDefined();

      await solver.solveCraftingGoal('stick', [], STICK_MC_DATA, ['oak_log']);
      await solver.solveCraftingGoal('stick', [], STICK_MC_DATA, ['furnace'], {
        mode: 'local_only',
        nowTicks: 100,
      });
      await solver.solveCraftingGoal('stick', [], STICK_MC_DATA, ['furnace'], {
        mode: 'sterling_temporal',
        nowTicks: 100,
      });

      const a1 = (solver as any).temporalAdapter;
      expect(Object.is(a0, a1)).toBe(true);
    });
  });

  // J. Canonical slot ordering end-to-end
  describe('J. canonical slot ordering end-to-end', () => {
    it('unsorted nearby blocks → canonically sorted slots in enrichment state', () => {
      const adapter = new P03ReferenceAdapter(MAX_WAIT_BUCKETS, 8);

      const enr = computeTemporalEnrichment({
        mode: 'local_only',
        adapter,
        stateInput: {
          nowTicks: 500,
          nearbyBlocks: [
            'smoker',
            'furnace',
            'lit_furnace',
            'blast_furnace',
            'furnace',
          ],
          bucketSizeTicks: MINECRAFT_BUCKET_SIZE_TICKS,
          horizonBuckets: HORIZON_BUCKETS,
        },
        rules: [],
      });

      const slots = enr.temporalState!.slots as Array<{
        id: string;
        type: string;
        readyAtBucket: number;
      }>;
      expect(slots.length).toBeGreaterThan(0);
      expectSlotsCanonicallySorted(slots);
    });

    it('reordered blocks → byte-identical temporal state (determinism)', () => {
      const adapter = new P03ReferenceAdapter(MAX_WAIT_BUCKETS, 8);

      const a = computeTemporalEnrichment({
        mode: 'local_only',
        adapter,
        stateInput: {
          nowTicks: 500,
          nearbyBlocks: ['furnace', 'smoker', 'furnace', 'blast_furnace'],
          bucketSizeTicks: MINECRAFT_BUCKET_SIZE_TICKS,
          horizonBuckets: HORIZON_BUCKETS,
        },
        rules: [],
      }).temporalState;

      const b = computeTemporalEnrichment({
        mode: 'local_only',
        adapter,
        stateInput: {
          nowTicks: 500,
          nearbyBlocks: ['blast_furnace', 'furnace', 'furnace', 'smoker'],
          bucketSizeTicks: MINECRAFT_BUCKET_SIZE_TICKS,
          horizonBuckets: HORIZON_BUCKETS,
        },
        rules: [],
      }).temporalState;

      expect(stableStringify(b)).toBe(stableStringify(a));
    });

    it('canonical ordering survives through Sterling payload attachment', async () => {
      const service = createMockService(makeSolvedResponse());
      const solver = new MinecraftCraftingSolver(service as any);

      await solver.solveCraftingGoal(
        'stick',
        [],
        STICK_MC_DATA,
        ['smoker', 'furnace', 'lit_furnace', 'blast_furnace', 'furnace'],
        { mode: 'sterling_temporal', nowTicks: 500 }
      );

      const payload = getLastSolvePayload(service);
      const slots = payload.slots as Array<{
        id: string;
        type: string;
        readyAtBucket: number;
      }>;
      expect(slots.length).toBeGreaterThan(0);
      expectSlotsCanonicallySorted(slots);
    });
  });

  // K. Strict mock — mcData → rules → payload → result correctness
  describe('K. strict mock — mcData → rules → payload → result', () => {
    it('payload contains exactly the expected goal and rule actions for stick', async () => {
      const service = createStrictMockService((payload) => {
        // Goal must be { stick: 1 }
        expect(payload.goal).toEqual({ stick: 1 });

        // Rules must contain exactly the expected 3 actions
        const rules = payload.rules as MinecraftCraftingRule[];
        const actions = rules.map((r) => r.action).sort();
        expect(actions).toEqual([...EXPECTED_STICK_ACTIONS].sort());
      });
      const solver = new MinecraftCraftingSolver(service as any);

      const result = await solver.solveCraftingGoal(
        'stick', [], STICK_MC_DATA, ['oak_log'],
      );

      expect(service.solve).toHaveBeenCalledTimes(1);
      expect(result.solved).toBe(true);
    });

    it('payload rules preserve correct consumes/produces cardinalities', async () => {
      const service = createStrictMockService((payload) => {
        const rules = payload.rules as MinecraftCraftingRule[];
        const byAction = new Map(rules.map((r) => [r.action, r]));

        for (const [action, expected] of Object.entries(EXPECTED_STICK_RULES)) {
          const rule = byAction.get(action);
          expect(rule, `rule ${action} should exist`).toBeDefined();
          expect(rule!.consumes).toEqual(expected.consumes);
          expect(rule!.produces).toEqual(expected.produces);
        }
      });
      const solver = new MinecraftCraftingSolver(service as any);

      const result = await solver.solveCraftingGoal(
        'stick', [], STICK_MC_DATA, ['oak_log'],
      );

      expect(result.solved).toBe(true);
      // Steps should map back to rule actions (derived response uses payload rules)
      const stepActions = result.steps.map((s) => s.action);
      for (const a of EXPECTED_STICK_ACTIONS) {
        expect(stepActions).toContain(a);
      }
    });

    it('derived response steps match payload rules (no phantom actions)', async () => {
      const service = createStrictMockService((payload) => {
        const rules = payload.rules as MinecraftCraftingRule[];
        expect(rules.length).toBeGreaterThan(0);
      });
      const solver = new MinecraftCraftingSolver(service as any);

      const result = await solver.solveCraftingGoal(
        'stick', [], STICK_MC_DATA, ['oak_log'],
      );

      expect(result.solved).toBe(true);
      // Every step action should be present in the rule set
      for (const step of result.steps) {
        expect(
          EXPECTED_STICK_ACTIONS as readonly string[],
        ).toContain(step.action);
      }
    });

    it('strict mock + sterling_temporal: temporal fields present and rules validated', async () => {
      const service = createStrictMockService((payload) => {
        // Temporal fields must be present
        expect(payload).toHaveProperty('currentTickBucket');
        expect(payload).toHaveProperty('horizonBucket');
        expect(payload).toHaveProperty('slots');

        // Rules still validated
        const rules = payload.rules as MinecraftCraftingRule[];
        const actions = rules.map((r) => r.action).sort();
        expect(actions).toEqual([...EXPECTED_STICK_ACTIONS].sort());

        // Annotations must NOT leak to Sterling
        for (const r of rules) {
          expect(r).not.toHaveProperty('durationTicks');
          expect(r).not.toHaveProperty('requiresSlotType');
        }
      });
      const solver = new MinecraftCraftingSolver(service as any);

      await solver.solveCraftingGoal(
        'stick', [], STICK_MC_DATA, ['furnace'],
        { mode: 'sterling_temporal', nowTicks: 500 },
      );

      expect(service.solve).toHaveBeenCalledTimes(1);
    });
  });

  // L. mapSolutionToSteps edge cases
  describe('L. mapSolutionToSteps edge cases', () => {
    it('response action not in rules → fallback step with action name', async () => {
      const service = createMockService({
        solutionFound: true,
        solutionPath: [{ source: 'S0', target: 'S1' }],
        discoveredNodes: ['S0', 'S1'],
        searchEdges: [
          { source: 'S0', target: 'S1', label: { action: 'craft:unknown_item' } },
        ],
        metrics: { planId: 'plan_unknown_action' },
        durationMs: 3,
      });
      const solver = new MinecraftCraftingSolver(service as any);

      const result = await solver.solveCraftingGoal(
        'stick', [], STICK_MC_DATA, ['oak_log'],
      );

      expect(result.solved).toBe(true);
      // The unknown action should produce a fallback step (not a crash)
      expect(result.steps.length).toBe(1);
      expect(result.steps[0].action).toBe('craft:unknown_item');
    });

    it('solutionFound true + solutionPath empty → solved with 0 steps', async () => {
      const service = createMockService({
        solutionFound: true,
        solutionPath: [],
        discoveredNodes: ['S0'],
        searchEdges: [],
        metrics: { planId: 'plan_trivial' },
        durationMs: 1,
      });
      const solver = new MinecraftCraftingSolver(service as any);

      const result = await solver.solveCraftingGoal(
        'stick', [], STICK_MC_DATA, ['oak_log'],
      );

      expect(result.solved).toBe(true);
      expect(result.steps).toHaveLength(0);
    });

    it('edge label missing action → step uses empty string action', async () => {
      const service = createMockService({
        solutionFound: true,
        solutionPath: [{ source: 'S0', target: 'S1' }],
        discoveredNodes: ['S0', 'S1'],
        searchEdges: [
          { source: 'S0', target: 'S1', label: {} },
        ],
        metrics: { planId: 'plan_empty_label' },
        durationMs: 2,
      });
      const solver = new MinecraftCraftingSolver(service as any);

      const result = await solver.solveCraftingGoal(
        'stick', [], STICK_MC_DATA, ['oak_log'],
      );

      expect(result.solved).toBe(true);
      expect(result.steps.length).toBe(1);
      // Empty action should produce a fallback step, not a crash
      expect(typeof result.steps[0].action).toBe('string');
    });
  });

  // M. Enrichment entrypoint call counts per mode
  describe('M. enrichment entrypoint call counts', () => {
    it('mode=off does NOT call computeTemporalEnrichment', async () => {
      const spy = vi.spyOn(temporalEnrichmentModule, 'computeTemporalEnrichment');
      const service = createMockService(makeSolvedResponse());
      const solver = new MinecraftCraftingSolver(service as any);

      await solver.solveCraftingGoal('stick', [], STICK_MC_DATA, ['oak_log']);

      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('mode=local_only calls computeTemporalEnrichment exactly once', async () => {
      const spy = vi.spyOn(temporalEnrichmentModule, 'computeTemporalEnrichment');
      const service = createMockService(makeSolvedResponse());
      const solver = new MinecraftCraftingSolver(service as any);

      await solver.solveCraftingGoal('stick', [], STICK_MC_DATA, ['oak_log'], {
        mode: 'local_only',
        nowTicks: 100,
      });

      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });

    it('mode=sterling_temporal calls computeTemporalEnrichment exactly once', async () => {
      const spy = vi.spyOn(temporalEnrichmentModule, 'computeTemporalEnrichment');
      const service = createMockService(makeSolvedResponse());
      const solver = new MinecraftCraftingSolver(service as any);

      await solver.solveCraftingGoal('stick', [], STICK_MC_DATA, ['furnace'], {
        mode: 'sterling_temporal',
        nowTicks: 100,
      });

      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });
  });

  // A couple of small cross-cutting sanity checks that help catch regressions
  // in constants and bucket math, without duplicating unit suites.
  describe('sanity checks', () => {
    it('toTickBucket uses floor division', () => {
      expect(toTickBucket(0, MINECRAFT_BUCKET_SIZE_TICKS)).toBe(0);
      expect(toTickBucket(99, MINECRAFT_BUCKET_SIZE_TICKS)).toBe(0);
      expect(toTickBucket(100, MINECRAFT_BUCKET_SIZE_TICKS)).toBe(1);
      expect(toTickBucket(199, MINECRAFT_BUCKET_SIZE_TICKS)).toBe(1);
    });

    it('findDuration is defined for core action types', () => {
      expect(findDuration('craft')).toBeDefined();
      expect(findDuration('mine')).toBeDefined();
      expect(findDuration('place')).toBeDefined();
      expect(findDuration('smelt')).toBeDefined();
    });
  });
});
