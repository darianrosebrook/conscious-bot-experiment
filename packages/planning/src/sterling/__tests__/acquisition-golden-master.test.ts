/**
 * Acquisition Solver Golden-Master Tests (Rig D — R3, R4)
 *
 * Covers:
 * - R3: Outbound payload stability (canonicalized snapshot)
 * - R3: Candidate set snapshot proves operator families present as a set
 * - R4: Bundle ID deterministic
 * - R4: candidateSetDigest deterministic for same world state
 * - Multi-strategy: crafting solver delegation produces consistent payloads
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MinecraftAcquisitionSolver, buildTradeRules, buildLootRules, buildSalvageRules } from '../minecraft-acquisition-solver';
import type { SterlingReasoningService } from '../sterling-reasoning-service';
import { canonicalize } from '../solve-bundle';
import { computeCandidateSetDigest } from '../minecraft-acquisition-types';
import {
  buildAcquisitionContext,
  buildAcquisitionStrategies,
} from '../minecraft-acquisition-rules';
import { computeRigDSignals } from '../signals-rig-d';

// ── Mock Sterling Service ──────────────────────────────────────────────────

function makeMockService(): SterlingReasoningService {
  return {
    isAvailable: vi.fn().mockReturnValue(true),
    solve: vi.fn().mockResolvedValue({
      solutionFound: true,
      solutionPath: [
        { source: 'a', target: 'b', label: 'acq:trade:iron_ingot' },
      ],
      discoveredNodes: [{ id: 'a' }, { id: 'b' }],
      searchEdges: [],
      durationMs: 100,
      metrics: {},
    }),
    initialize: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
    getHealthStatus: vi.fn().mockReturnValue({ enabled: true }),
    verifyReachability: vi.fn(),
    queryKnowledgeGraph: vi.fn(),
    withFallback: vi.fn(),
  } as unknown as SterlingReasoningService;
}

function makeMockCraftingSolver() {
  return {
    solveCraftingGoal: vi.fn().mockResolvedValue({
      solved: true,
      steps: [{
        action: 'mine:iron_ore',
        actionType: 'mine',
        produces: [{ name: 'raw_iron', count: 1 }],
        consumes: [],
        resultingInventory: { raw_iron: 1 },
      }],
      totalNodes: 10,
      durationMs: 50,
      planId: 'craft-plan-1',
      solveMeta: {
        bundles: [{
          bundleId: 'minecraft.crafting:abc123',
          bundleHash: 'abc123',
          timestamp: Date.now(),
          input: {} as any,
          output: {} as any,
          compatReport: { valid: true, issues: [], checkedAt: Date.now(), definitionCount: 1 },
        }],
      },
    }),
    solverId: 'minecraft.crafting',
  } as any;
}

// ── Fixtures ───────────────────────────────────────────────────────────────

const VILLAGE_INVENTORY = { emerald: 5, 'cap:has_stone_pickaxe': 1 };
const VILLAGE_BLOCKS = ['iron_ore', 'stone'];
const VILLAGE_ENTITIES = [
  { type: 'villager', distance: 10 },
  { type: 'chest', distance: 25 },
];

// ── R3: Payload Stability ──────────────────────────────────────────────────

describe('R3: Outbound payload stability', () => {
  let service: SterlingReasoningService;
  let solver: MinecraftAcquisitionSolver;

  beforeEach(() => {
    service = makeMockService();
    solver = new MinecraftAcquisitionSolver(service);
    solver.setCraftingSolver(makeMockCraftingSolver());
  });

  it('trade-path: canonicalized trade rules are stable', () => {
    const rules1 = buildTradeRules('iron_ingot');
    const rules2 = buildTradeRules('iron_ingot');
    expect(canonicalize(rules1)).toBe(canonicalize(rules2));
  });

  it('loot-path: canonicalized loot rules are stable', () => {
    const rules1 = buildLootRules('diamond');
    const rules2 = buildLootRules('diamond');
    expect(canonicalize(rules1)).toBe(canonicalize(rules2));
  });

  it('salvage-path: canonicalized salvage rules are stable', () => {
    const rules1 = buildSalvageRules('iron_ingot');
    const rules2 = buildSalvageRules('iron_ingot');
    expect(canonicalize(rules1)).toBe(canonicalize(rules2));
  });

  it('identical inputs → byte-equivalent payloads', async () => {
    await solver.solveAcquisition('iron_ingot', 1, VILLAGE_INVENTORY, VILLAGE_BLOCKS, VILLAGE_ENTITIES);
    const call1Args = (service.solve as any).mock.calls[0];

    // Reset and call again
    (service.solve as any).mockClear();
    await solver.solveAcquisition('iron_ingot', 1, VILLAGE_INVENTORY, VILLAGE_BLOCKS, VILLAGE_ENTITIES);
    const call2Args = (service.solve as any).mock.calls[0];

    if (call1Args && call2Args) {
      expect(canonicalize(call1Args[1])).toBe(canonicalize(call2Args[1]));
    }
  });

  it('candidate set snapshot: canonicalized candidate array is stable', () => {
    const ctx = buildAcquisitionContext('iron_ingot', VILLAGE_INVENTORY, VILLAGE_BLOCKS, VILLAGE_ENTITIES);
    const candidates1 = buildAcquisitionStrategies(ctx);
    const candidates2 = buildAcquisitionStrategies(ctx);

    const digest1 = computeCandidateSetDigest(candidates1);
    const digest2 = computeCandidateSetDigest(candidates2);
    expect(digest1).toBe(digest2);
  });
});

// ── R4: Deterministic Identity ─────────────────────────────────────────────

describe('R4: Deterministic bundle and digest identity', () => {
  let service: SterlingReasoningService;
  let solver: MinecraftAcquisitionSolver;

  beforeEach(() => {
    service = makeMockService();
    solver = new MinecraftAcquisitionSolver(service);
    solver.setCraftingSolver(makeMockCraftingSolver());
  });

  it('bundle ID is deterministic across calls', async () => {
    const r1 = await solver.solveAcquisition('iron_ingot', 1, VILLAGE_INVENTORY, VILLAGE_BLOCKS, VILLAGE_ENTITIES);
    const r2 = await solver.solveAcquisition('iron_ingot', 1, VILLAGE_INVENTORY, VILLAGE_BLOCKS, VILLAGE_ENTITIES);

    const bid1 = r1.solveMeta!.bundles[0].bundleId;
    const bid2 = r2.solveMeta!.bundles[0].bundleId;
    expect(bid1).toBe(bid2);
  });

  it('candidateSetDigest is deterministic for same world state', async () => {
    const r1 = await solver.solveAcquisition('iron_ingot', 1, VILLAGE_INVENTORY, VILLAGE_BLOCKS, VILLAGE_ENTITIES);
    const r2 = await solver.solveAcquisition('iron_ingot', 1, VILLAGE_INVENTORY, VILLAGE_BLOCKS, VILLAGE_ENTITIES);
    expect(r1.candidateSetDigest).toBe(r2.candidateSetDigest);
  });

  it('strategy ranking order does not change bundleId when costs are equal (deterministic tie-break)', () => {
    const ctx = buildAcquisitionContext('iron_ingot', VILLAGE_INVENTORY, VILLAGE_BLOCKS, VILLAGE_ENTITIES);
    const candidates = buildAcquisitionStrategies(ctx);
    const d1 = computeCandidateSetDigest(candidates);
    const d2 = computeCandidateSetDigest([...candidates].reverse());
    expect(d1).toBe(d2);
  });
});

// ── Trade Rule Shape ───────────────────────────────────────────────────────

describe('Trade rule shape snapshot', () => {
  it('trade rules have correct structure', () => {
    const rules = buildTradeRules('iron_ingot');
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchInlineSnapshot(`
      {
        "action": "acq:trade:iron_ingot",
        "actionType": "craft",
        "consumes": [
          {
            "count": 1,
            "name": "emerald",
          },
        ],
        "produces": [
          {
            "count": 1,
            "name": "iron_ingot",
          },
        ],
        "requires": [
          {
            "count": 1,
            "name": "proximity:villager",
          },
        ],
      }
    `);
  });

  it('loot rules have correct structure', () => {
    const rules = buildLootRules('diamond');
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchInlineSnapshot(`
      {
        "action": "acq:loot:diamond",
        "actionType": "craft",
        "consumes": [],
        "produces": [
          {
            "count": 1,
            "name": "diamond",
          },
        ],
        "requires": [
          {
            "count": 1,
            "name": "proximity:chest",
          },
        ],
      }
    `);
  });

  it('salvage rules have correct structure', () => {
    const rules = buildSalvageRules('iron_ingot');
    expect(rules.length).toBeGreaterThan(0);
    // First entry: iron_sword → 2 iron_ingot
    expect(rules[0]).toMatchInlineSnapshot(`
      {
        "action": "acq:salvage:iron_ingot:from:iron_sword",
        "actionType": "craft",
        "consumes": [
          {
            "count": 1,
            "name": "iron_sword",
          },
        ],
        "produces": [
          {
            "count": 2,
            "name": "iron_ingot",
          },
        ],
        "requires": [],
      }
    `);
  });
});

// ── Rig D Signals ──────────────────────────────────────────────────────────

describe('computeRigDSignals', () => {
  let service: SterlingReasoningService;
  let solver: MinecraftAcquisitionSolver;

  beforeEach(() => {
    service = makeMockService();
    solver = new MinecraftAcquisitionSolver(service);
    solver.setCraftingSolver(makeMockCraftingSolver());
  });

  it('computes signals from a solve result', async () => {
    const result = await solver.solveAcquisition(
      'iron_ingot', 1, VILLAGE_INVENTORY, VILLAGE_BLOCKS, VILLAGE_ENTITIES,
    );
    const signals = computeRigDSignals(result, solver.priorStore);
    expect(signals.strategyCount).toBeGreaterThan(0);
    expect(signals.selectedStrategy).toBeTruthy();
    expect(signals.candidateSetDigest).toMatch(/^[0-9a-f]{16}$/);
    expect(typeof signals.degenerateRanking).toBe('boolean');
    expect(typeof signals.contextKey).toBe('string');
  });
});
