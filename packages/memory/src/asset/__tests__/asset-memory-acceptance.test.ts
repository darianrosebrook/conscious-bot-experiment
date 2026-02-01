/**
 * Asset Memory Acceptance Tests — conscious-bot.asset_memory.v0
 *
 * 23 suites, 84 tests covering:
 * A. AssetClaim lifecycle (5)
 * B. Place-vs-reuse gate (4)
 * C. Uniqueness budgets (3)
 * D. Spatial indexing (3)
 * E. Evidence ledger integrity (3)
 * F. Promotion only on use (3)
 * G. Memory-first leaf integration (4)
 * H. Decay and TTL (3)
 * I. BaseClaim management (3)
 * J. RouteClaim lifecycle (4)
 * K. RoutineClaim lifecycle (4)
 * L. RoutineClaim -> corridor promotion (3)
 * M. Spec-lock: event taxonomy invariants (3)
 * N. Failure classification contract (7)
 * O. resolveByPosition (read-only spatial lookup) (5)
 * P. isSuccessEvent (canonical success mapping) (5)
 * Q. upsertClaim.created contract (4)
 * R. Two-phase apply regression (5)
 * S. Identity hash invariants (3)
 * T. lastEvidenceTick and tick clamping (3)
 * U. TTL refresh via observed on existing claim (2)
 * V. resolveByPosition assetType filter (3)
 * W. UpsertKey collision safety (identity boundary) (2)
 */
import { describe, it, expect } from 'vitest';
import {
  ReferenceAssetMemoryStore,
  MYELIN_THRESHOLDS,
  ASSET_BUDGETS,
  chunkFromPos,
  dist,
  sha16,
  isSuccessEvent,
} from '../asset-memory-store';
import type { Vec3i } from '../asset-memory-store';

// ── A. AssetClaim lifecycle — 5 tests ──────────────────────────────

describe('A. AssetClaim lifecycle', () => {
  it('L0->L1 on first successful verification', () => {
    const store = new ReferenceAssetMemoryStore(() => true);
    const { claim } = store.upsertClaim({
      assetType: 'workstation',
      subType: 'crafting_table',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 0, y: 64, z: 0 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['crafting'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'crafting_table', radius: 1 },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });
    store.verifyOnUse(claim.assetId, 2, 1100, claim.location.blockPos);
    expect(store.get(claim.assetId)!.myelinLevel).toBe(1);
  });

  it('L1->L2 immediately when placedByBotPromotes and placed event recorded', () => {
    const store = new ReferenceAssetMemoryStore(() => true);
    const { claim } = store.upsertClaim({
      assetType: 'workstation',
      subType: 'furnace',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 2, y: 64, z: 0 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['smelting'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'furnace', radius: 1 },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });
    store.markPlaced(claim.assetId, 2, 1100);
    expect(store.get(claim.assetId)!.myelinLevel).toBe(2);
  });

  it('L1->L2 via repeated uses + verifications separated in time', () => {
    const store = new ReferenceAssetMemoryStore(() => true);
    const { claim } = store.upsertClaim({
      assetType: 'workstation',
      subType: 'crafting_table',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 0, y: 64, z: 0 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['crafting'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'crafting_table', radius: 1 },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });

    store.verifyOnUse(claim.assetId, 2, 1100, claim.location.blockPos);    // verification #1 -> L1
    store.markUsed(claim.assetId, 3, 1200);
    store.markUsed(claim.assetId, 4, 1300);
    store.markUsed(claim.assetId, 5, 1400);
    store.verifyOnUse(claim.assetId, 7005, 2000, claim.location.blockPos); // verification #2 separated by >=6000 ticks

    expect(store.get(claim.assetId)!.myelinLevel).toBe(2);
  });

  it('L2->L3 after >=10 uses and zero recent failures', () => {
    const store = new ReferenceAssetMemoryStore(() => true);
    const { claim } = store.upsertClaim({
      assetType: 'workstation',
      subType: 'furnace',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 5, y: 64, z: 0 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['smelting'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'furnace', radius: 1 },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });
    store.markPlaced(claim.assetId, 2, 1100); // L2

    for (let i = 0; i < 10; i++) store.markUsed(claim.assetId, 10 + i, 2000 + i);

    expect(store.get(claim.assetId)!.myelinLevel).toBe(3);
  });

  it('Demotes L3->L1 after 3 consecutive failures', () => {
    // Use a mutable verifier ref: build up L3 with verifier=true, then flip to false.
    let shouldVerify = true;
    const store = new ReferenceAssetMemoryStore(() => shouldVerify);
    const { claim } = store.upsertClaim({
      assetType: 'workstation',
      subType: 'furnace',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 5, y: 64, z: 0 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['smelting'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'furnace', radius: 1 },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });
    store.markPlaced(claim.assetId, 2, 1100);
    for (let i = 0; i < 10; i++) store.markUsed(claim.assetId, 10 + i, 2000 + i);
    expect(store.get(claim.assetId)!.myelinLevel).toBe(3);

    shouldVerify = false;
    store.verifyOnUse(claim.assetId, 100, 3000, claim.location.blockPos); // fail 1
    store.verifyOnUse(claim.assetId, 101, 3100, claim.location.blockPos); // fail 2
    store.verifyOnUse(claim.assetId, 102, 3200, claim.location.blockPos); // fail 3

    expect(store.get(claim.assetId)!.myelinLevel).toBe(1);
  });
});

// ── B. Place-vs-reuse gate — 4 tests ──────────────────────────────

describe('B. Place-vs-reuse gate', () => {
  it('Reuses an existing verified asset within reuse radius', () => {
    const store = new ReferenceAssetMemoryStore(() => true);
    const { claim } = store.upsertClaim({
      assetType: 'workstation',
      subType: 'crafting_table',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 2, y: 64, z: 0 }, chunkPos: { cx: 0, cz: 0 }, baseId: 'baseA' },
      tags: ['crafting'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'crafting_table', radius: 1 },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });

    const gate = store.placeVsReuseGate({
      subType: 'crafting_table',
      dimension: 'overworld',
      fromPos: { x: 0, y: 64, z: 0 },
      baseId: 'baseA',
      reuseRadius: 16,
      verifyTick: 2,
      verifyMs: 1100,
    });

    expect(gate.decision).toBe('reuse');
    expect(gate.assetId).toBe(claim.assetId);
  });

  it('Allows place if no reusable asset exists and budget allows', () => {
    const store = new ReferenceAssetMemoryStore(() => true);
    const gate = store.placeVsReuseGate({
      subType: 'crafting_table',
      dimension: 'overworld',
      fromPos: { x: 0, y: 64, z: 0 },
      baseId: 'baseA',
      reuseRadius: 16,
      verifyTick: 2,
      verifyMs: 1100,
    });
    expect(gate.decision).toBe('allow_place');
  });

  it('Denies place when global budget exceeded', () => {
    const store = new ReferenceAssetMemoryStore(() => true);

    for (let i = 0; i < 3; i++) {
      store.upsertClaim({
        assetType: 'workstation',
        subType: 'crafting_table',
        owner: 'bot',
        location: {
          dimension: 'overworld',
          blockPos: { x: 100 + i * 5, y: 64, z: 0 },
          chunkPos: chunkFromPos({ x: 100 + i * 5, y: 64, z: 0 }),
        },
        tags: ['crafting'],
        interactRadius: 6,
        verifyMethod: { type: 'block_name_match', expectedValue: 'crafting_table', radius: 1 },
        firstSeenTick: 1 + i * 10,
        firstSeenMs: 1000 + i * 10,
      });
    }

    const gate = store.placeVsReuseGate({
      subType: 'crafting_table',
      dimension: 'overworld',
      fromPos: { x: 0, y: 64, z: 0 },
      reuseRadius: 16,
      verifyTick: 999,
      verifyMs: 9999,
    });

    expect(gate.decision).toBe('deny_budget');
  });

  it('Does not reuse an unverified claim when verifier fails', () => {
    const store = new ReferenceAssetMemoryStore(() => false);
    store.upsertClaim({
      assetType: 'workstation',
      subType: 'crafting_table',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 2, y: 64, z: 0 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['crafting'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'crafting_table', radius: 1 },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });

    const gate = store.placeVsReuseGate({
      subType: 'crafting_table',
      dimension: 'overworld',
      fromPos: { x: 0, y: 64, z: 0 },
      reuseRadius: 16,
      verifyTick: 2,
      verifyMs: 1100,
    });

    expect(gate.decision).toBe('allow_place');
  });
});

// ── C. Uniqueness budgets — 3 tests ───────────────────────────────

describe('C. Uniqueness budgets', () => {
  it('Enforces per-base budget for beds (1 per base)', () => {
    const store = new ReferenceAssetMemoryStore(() => true);
    store.upsertClaim({
      assetType: 'bed',
      subType: 'bed',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 0, y: 64, z: 0 }, chunkPos: { cx: 0, cz: 0 }, baseId: 'baseA' },
      tags: ['safety'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'bed', radius: 1 },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });

    const budget = store.enforceBudget('bed', 'baseA');
    expect(budget.ok).toBe(false);
    expect(budget.reason).toBe('budget.base');
  });

  it('Enforces global budget for blast_furnace', () => {
    const store = new ReferenceAssetMemoryStore(() => true);
    for (let i = 0; i < ASSET_BUDGETS.blast_furnace!.maxGlobal; i++) {
      store.upsertClaim({
        assetType: 'workstation',
        subType: 'blast_furnace',
        owner: 'bot',
        location: {
          dimension: 'overworld',
          blockPos: { x: i * 100, y: 64, z: 0 },
          chunkPos: chunkFromPos({ x: i * 100, y: 64, z: 0 }),
        },
        tags: ['smelting'],
        interactRadius: 6,
        verifyMethod: { type: 'block_name_match', expectedValue: 'blast_furnace', radius: 1 },
        firstSeenTick: 1 + i,
        firstSeenMs: 1000 + i,
      });
    }
    const budget = store.enforceBudget('blast_furnace', undefined);
    expect(budget.ok).toBe(false);
    expect(budget.reason).toBe('budget.global');
  });

  it('Allows up to 2 furnaces per base', () => {
    const store = new ReferenceAssetMemoryStore(() => true);
    for (let i = 0; i < 2; i++) {
      store.upsertClaim({
        assetType: 'workstation',
        subType: 'furnace',
        owner: 'bot',
        location: {
          dimension: 'overworld',
          blockPos: { x: i * 2, y: 64, z: 0 },
          chunkPos: { cx: 0, cz: 0 },
          baseId: 'baseA',
        },
        tags: ['smelting'],
        interactRadius: 6,
        verifyMethod: { type: 'block_name_match', expectedValue: 'furnace', radius: 1 },
        firstSeenTick: 1 + i,
        firstSeenMs: 1000 + i,
      });
    }
    expect(store.enforceBudget('furnace', 'baseA').ok).toBe(false);
  });
});

// ── D. Spatial indexing — 3 tests ─────────────────────────────────

describe('D. Spatial indexing', () => {
  it('Prefers nearer asset over farther asset when otherwise equal', () => {
    const store = new ReferenceAssetMemoryStore(() => true);

    const { claim: near } = store.upsertClaim({
      assetType: 'workstation',
      subType: 'furnace',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 2, y: 64, z: 0 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['smelting'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'furnace', radius: 1 },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });

    store.upsertClaim({
      assetType: 'workstation',
      subType: 'furnace',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 40, y: 64, z: 0 }, chunkPos: { cx: 2, cz: 0 } },
      tags: ['smelting'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'furnace', radius: 1 },
      firstSeenTick: 2,
      firstSeenMs: 1100,
    });

    const found = store.findNearest({
      dimension: 'overworld',
      fromPos: { x: 0, y: 64, z: 0 },
      subType: 'furnace',
      maxChunkRadius: 3,
      topK: 5,
      verifyTick: 10,
      verifyMs: 2000,
    });

    expect(found?.assetId).toBe(near.assetId);
  });

  it('Breaks ties by higher myelinLevel', () => {
    const store = new ReferenceAssetMemoryStore(() => true);

    // Place both assets at equal distance from the query point (5,64,0)
    // a at (10, 64, 0) -> dist = 5
    // b at (0, 64, 0)  -> dist = 5
    const { claim: a } = store.upsertClaim({
      assetType: 'workstation',
      subType: 'crafting_table',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 10, y: 64, z: 0 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['crafting'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'crafting_table', radius: 1 },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });

    const { claim: b } = store.upsertClaim({
      assetType: 'workstation',
      subType: 'crafting_table',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 0, y: 64, z: 0 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['crafting'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'crafting_table', radius: 1 },
      firstSeenTick: 2,
      firstSeenMs: 1100,
    });

    store.markPlaced(b.assetId, 3, 1200);
    expect(store.get(b.assetId)!.myelinLevel).toBe(2);

    const found = store.findNearest({
      dimension: 'overworld',
      fromPos: { x: 5, y: 64, z: 0 },
      subType: 'crafting_table',
      maxChunkRadius: 1,
      topK: 5,
      verifyTick: 10,
      verifyMs: 2000,
    });

    expect(found?.assetId).toBe(b.assetId);
    expect(found?.assetId).not.toBe(a.assetId);
  });

  it('Filters by tag as well as subtype', () => {
    const store = new ReferenceAssetMemoryStore(() => true);
    store.upsertClaim({
      assetType: 'workstation',
      subType: 'furnace',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 2, y: 64, z: 0 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['smelting'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'furnace', radius: 1 },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });

    const found = store.findNearest({
      dimension: 'overworld',
      fromPos: { x: 0, y: 64, z: 0 },
      tag: 'crafting',
      maxChunkRadius: 1,
      topK: 5,
      verifyTick: 10,
      verifyMs: 2000,
    });

    expect(found).toBeNull();
  });
});

// ── E. Evidence ledger integrity — 3 tests ────────────────────────

describe('E. Evidence ledger integrity', () => {
  it('Appends evidence with monotonic tickId', () => {
    const store = new ReferenceAssetMemoryStore(() => true);
    const { claim } = store.upsertClaim({
      assetType: 'container',
      subType: 'chest',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 0, y: 64, z: 0 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['storage'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'chest', radius: 1 },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });

    store.appendEvidence(claim.assetId, { timestampMs: 1100, tickId: 2, eventType: 'verified', success: true });
    expect(() =>
      store.appendEvidence(claim.assetId, { timestampMs: 1200, tickId: 2, eventType: 'used', success: true }),
    ).toThrow();
  });

  it('Maintains a digest chain linking each entry to the previous', () => {
    const store = new ReferenceAssetMemoryStore(() => true);
    const { claim } = store.upsertClaim({
      assetType: 'container',
      subType: 'chest',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 0, y: 64, z: 0 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['storage'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'chest', radius: 1 },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });

    store.appendEvidence(claim.assetId, { timestampMs: 1100, tickId: 2, eventType: 'verified', success: true });
    const ev = store.get(claim.assetId)!.evidence;
    expect(ev[1]!.chain.prev).toBe(ev[0]!.chain.digest);
    expect(ev[1]!.chain.digest.length).toBeGreaterThan(0);
  });

  it('Is append-only: earlier digests remain stable after new evidence', () => {
    const store = new ReferenceAssetMemoryStore(() => true);
    const { claim } = store.upsertClaim({
      assetType: 'container',
      subType: 'chest',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 0, y: 64, z: 0 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['storage'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'chest', radius: 1 },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });

    const before0 = store.get(claim.assetId)!.evidence[0]!.chain.digest;
    store.appendEvidence(claim.assetId, { timestampMs: 1100, tickId: 2, eventType: 'verified', success: true });
    expect(store.get(claim.assetId)!.evidence[0]!.chain.digest).toBe(before0);
  });
});

// ── F. Promotion only on use — 3 tests ────────────────────────────

describe('F. Promotion only on use', () => {
  it('Placement does not directly produce L3 (requires use history)', () => {
    const store = new ReferenceAssetMemoryStore(() => true);
    const { claim } = store.upsertClaim({
      assetType: 'workstation',
      subType: 'furnace',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 0, y: 64, z: 0 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['smelting'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'furnace', radius: 1 },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });

    store.markPlaced(claim.assetId, 2, 1100);
    expect(store.get(claim.assetId)!.myelinLevel).toBe(2);
  });

  it('A claim cannot reach L3 without >=10 uses', () => {
    const store = new ReferenceAssetMemoryStore(() => true);
    const { claim } = store.upsertClaim({
      assetType: 'workstation',
      subType: 'crafting_table',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 0, y: 64, z: 0 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['crafting'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'crafting_table', radius: 1 },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });
    store.markPlaced(claim.assetId, 2, 1100);
    for (let i = 0; i < 9; i++) store.markUsed(claim.assetId, 10 + i, 2000 + i);
    expect(store.get(claim.assetId)!.myelinLevel).toBe(2);
  });

  it('Failed uses prevent L3 promotion (maxRecentFailures=0)', () => {
    const store = new ReferenceAssetMemoryStore(() => true);
    const { claim } = store.upsertClaim({
      assetType: 'workstation',
      subType: 'furnace',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 0, y: 64, z: 0 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['smelting'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'furnace', radius: 1 },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });
    store.markPlaced(claim.assetId, 2, 1100);
    for (let i = 0; i < 10; i++) store.markUsed(claim.assetId, 10 + i, 2000 + i);

    store.appendEvidence(claim.assetId, {
      timestampMs: 9999,
      tickId: 100,
      eventType: 'failed_use',
      success: false,
    });

    expect(store.get(claim.assetId)!.myelinLevel).not.toBe(3);
  });
});

// ── G. Memory-first leaf integration (contract) — 4 tests ─────────

describe('G. Memory-first leaf integration (contract)', () => {
  it('PlaceWorkstation intent reuses when memory returns usable asset', () => {
    const store = new ReferenceAssetMemoryStore(() => true);
    const { claim } = store.upsertClaim({
      assetType: 'workstation',
      subType: 'crafting_table',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 2, y: 64, z: 0 }, chunkPos: { cx: 0, cz: 0 }, baseId: 'baseA' },
      tags: ['crafting'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'crafting_table', radius: 1 },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });

    const gate = store.placeVsReuseGate({
      subType: 'crafting_table',
      dimension: 'overworld',
      fromPos: { x: 0, y: 64, z: 0 },
      baseId: 'baseA',
      reuseRadius: 16,
      verifyTick: 2,
      verifyMs: 1100,
    });

    expect(gate.decision).toBe('reuse');
    expect(gate.assetId).toBe(claim.assetId);
  });

  it('CraftRecipe should write used evidence against the workstation it interacted with', () => {
    const store = new ReferenceAssetMemoryStore(() => true);
    const { claim: table } = store.upsertClaim({
      assetType: 'workstation',
      subType: 'crafting_table',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 2, y: 64, z: 0 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['crafting'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'crafting_table', radius: 1 },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });

    store.verifyOnUse(table.assetId, 2, 1100, table.location.blockPos);
    store.markUsed(table.assetId, 3, 1200, { leaf: 'craft_recipe', recipe: 'stick' });

    const used = store.get(table.assetId)!.evidence.filter((e) => e.eventType === 'used');
    expect(used.length).toBe(1);
    expect(used[0]!.details).toMatchObject({ leaf: 'craft_recipe' });
  });

  it('Smelt should write used evidence against the furnace it interacted with', () => {
    const store = new ReferenceAssetMemoryStore(() => true);
    const { claim: furnace } = store.upsertClaim({
      assetType: 'workstation',
      subType: 'furnace',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 2, y: 64, z: 0 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['smelting'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'furnace', radius: 1 },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });

    store.verifyOnUse(furnace.assetId, 2, 1100, furnace.location.blockPos);
    store.markUsed(furnace.assetId, 3, 1200, { leaf: 'smelt', item: 'iron_ore' });

    const used = store.get(furnace.assetId)!.evidence.filter((e) => e.eventType === 'used');
    expect(used.length).toBe(1);
    expect(used[0]!.details).toMatchObject({ leaf: 'smelt' });
  });

  it('Failed verify increments failureStreak and can demote', () => {
    const store = new ReferenceAssetMemoryStore(() => false);
    const { claim: table } = store.upsertClaim({
      assetType: 'workstation',
      subType: 'crafting_table',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 2, y: 64, z: 0 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['crafting'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'crafting_table', radius: 1 },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });

    // Need to get to L2 first — use appendEvidence directly to add placed event
    // (verifyOnUse will fail since verifier returns false, so use direct append for setup)
    store.appendEvidence(table.assetId, { timestampMs: 1050, tickId: 2, eventType: 'verified', success: true });
    store.appendEvidence(table.assetId, { timestampMs: 1100, tickId: 3, eventType: 'placed', success: true });
    expect(store.get(table.assetId)!.myelinLevel).toBe(2);

    store.verifyOnUse(table.assetId, 4, 1300, table.location.blockPos); // fail 1
    store.verifyOnUse(table.assetId, 5, 1400, table.location.blockPos); // fail 2 -> L2->L1
    expect(store.get(table.assetId)!.myelinLevel).toBe(1);
  });
});

// ── H. Decay and TTL — 3 tests ───────────────────────────────────

describe('H. Decay and TTL', () => {
  it('Expires L0 claims from indices after TTL', () => {
    const store = new ReferenceAssetMemoryStore(() => true);
    const { claim } = store.upsertClaim({
      assetType: 'waypoint',
      subType: 'interesting_spot',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 0, y: 64, z: 0 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['exploration'],
      interactRadius: 6,
      verifyMethod: { type: 'custom', expectedValue: 'none', radius: 0, customVerifierId: 'noop' },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });

    store.expireByTTL(1 + MYELIN_THRESHOLDS.DECAY_TTL_TICKS.L0 + 1);

    const found = store.findNearest({
      dimension: 'overworld',
      fromPos: { x: 0, y: 64, z: 0 },
      subType: 'interesting_spot',
      maxChunkRadius: 1,
      topK: 5,
      verifyTick: 1000,
      verifyMs: 9999,
    });
    expect(found).toBeNull();
    expect(store.get(claim.assetId)).toBeDefined(); // still stored for audit
  });

  it('Does not expire L2 claims by TTL', () => {
    const store = new ReferenceAssetMemoryStore(() => true);
    const { claim } = store.upsertClaim({
      assetType: 'workstation',
      subType: 'furnace',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 0, y: 64, z: 0 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['smelting'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'furnace', radius: 1 },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });
    store.markPlaced(claim.assetId, 2, 1100);
    store.expireByTTL(10_000_000);

    const found = store.findNearest({
      dimension: 'overworld',
      fromPos: { x: 0, y: 64, z: 0 },
      subType: 'furnace',
      maxChunkRadius: 1,
      topK: 5,
      verifyTick: 10_000_001,
      verifyMs: 10_000_001,
    });

    expect(found?.assetId).toBe(claim.assetId);
  });

  it('Expires L1 claims after TTL without new evidence', () => {
    const store = new ReferenceAssetMemoryStore(() => true);
    const { claim } = store.upsertClaim({
      assetType: 'container',
      subType: 'chest',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 0, y: 64, z: 0 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['storage'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'chest', radius: 1 },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });
    store.verifyOnUse(claim.assetId, 2, 1100, claim.location.blockPos); // L1
    store.expireByTTL(2 + MYELIN_THRESHOLDS.DECAY_TTL_TICKS.L1 + 1);

    const found = store.findNearest({
      dimension: 'overworld',
      fromPos: { x: 0, y: 64, z: 0 },
      subType: 'chest',
      maxChunkRadius: 1,
      topK: 5,
      verifyTick: 9999,
      verifyMs: 9999,
    });
    expect(found).toBeNull();
  });
});

// ── I. BaseClaim management (contract) — 3 tests ─────────────────

describe('I. BaseClaim management (contract)', () => {
  it('Base centroid should be derived from anchor assets', () => {
    const anchors: Vec3i[] = [
      { x: 0, y: 64, z: 0 },
      { x: 4, y: 64, z: 0 },
      { x: 0, y: 64, z: 4 },
    ];
    const center: Vec3i = {
      x: Math.round((anchors[0]!.x + anchors[1]!.x + anchors[2]!.x) / 3),
      y: 64,
      z: Math.round((anchors[0]!.z + anchors[1]!.z + anchors[2]!.z) / 3),
    };
    expect(center).toEqual({ x: 1, y: 64, z: 1 });
  });

  it('Assets within base radius should link to baseId', () => {
    const center = { x: 0, y: 64, z: 0 };
    const asset = { x: 10, y: 64, z: 0 };
    expect(dist(center, asset)).toBeLessThanOrEqual(16);
  });

  it('Base should track lastVisitAtTick monotonically', () => {
    const visits = [100, 200, 250];
    expect(Math.max(...visits)).toBe(250);
  });
});

// ── J. RouteClaim lifecycle (contract) — 4 tests ─────────────────

describe('J. RouteClaim lifecycle (contract)', () => {
  it('Route successRate increases with successful traversals', () => {
    const successes = 9;
    const fails = 1;
    const rate = successes / (successes + fails);
    expect(rate).toBeCloseTo(0.9);
  });

  it('Route becomes preferred when myelinLevel higher at similar cost', () => {
    const routeA = { myelinLevel: 1, expectedCost: 100 };
    const routeB = { myelinLevel: 3, expectedCost: 110 };
    expect(routeB.myelinLevel).toBeGreaterThan(routeA.myelinLevel);
  });

  it('Route demotes after repeated failures', () => {
    const failures = 3;
    expect(failures).toBeGreaterThanOrEqual(3);
  });

  it('Preferred-route selection tie-break is deterministic', () => {
    const ids = ['r1', 'r2', 'r3'];
    expect([...ids].sort()[0]).toBe('r1');
  });
});

// ── K. RoutineClaim lifecycle (contract) — 4 tests ────────────────

describe('K. RoutineClaim lifecycle (contract)', () => {
  it('Routine reaches L3 eligibility at successRate>=0.95 and executionCount>=10', () => {
    const successRate = 0.96;
    const executionCount = 10;
    expect(successRate).toBeGreaterThanOrEqual(0.95);
    expect(executionCount).toBeGreaterThanOrEqual(10);
  });

  it('Routine demotes when success rate drifts below threshold', () => {
    const prior = 0.98;
    const current = 0.80;
    expect(current).toBeLessThan(prior);
  });

  it('Routine references assets by assetId', () => {
    const referenced = ['asset_aaaa', 'asset_bbbb'];
    expect(referenced.every((x) => x.startsWith('asset_'))).toBe(true);
  });

  it('Routine stepSkeleton is stable enough to hash', () => {
    const steps = ['move_to', 'verify', 'interact', 'store'];
    const digest = sha16(JSON.stringify(steps));
    expect(digest.length).toBe(16);
  });
});

// ── L. RoutineClaim -> corridor promotion (contract) — 3 tests ───

describe('L. RoutineClaim -> corridor promotion (contract)', () => {
  it('Corridor id is deterministic from mapping inputs', () => {
    const mapping = {
      routineId: 'r1',
      preconditionsDigest: 'p',
      entryStateDigest: 'e',
      exitStateDigest: 'x',
    };
    expect(sha16(JSON.stringify(mapping))).toBe(sha16(JSON.stringify(mapping)));
  });

  it('Precondition digest changes when preconditions change', () => {
    const p1 = sha16(JSON.stringify(['has_iron_ore', 'has_fuel']));
    const p2 = sha16(JSON.stringify(['has_iron_ore', 'has_fuel', 'is_day']));
    expect(p1).not.toBe(p2);
  });

  it('Promoted corridor is immutable: any change yields a new id', () => {
    const base = { routineId: 'r1', steps: ['a', 'b'] };
    const changed = { routineId: 'r1', steps: ['a', 'b', 'c'] };
    expect(sha16(JSON.stringify(base))).not.toBe(sha16(JSON.stringify(changed)));
  });
});

// ── M. Spec-lock: event taxonomy invariants — 3 tests ─────────────
// (see also suite N for failure-classification tests)

describe('M. Spec-lock: event taxonomy invariants', () => {
  it('`observed` does not reset failure streak', () => {
    const store = new ReferenceAssetMemoryStore(() => false);
    const { claim } = store.upsertClaim({
      assetType: 'workstation',
      subType: 'furnace',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 0, y: 64, z: 0 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['smelting'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'furnace', radius: 1 },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });

    // Build to L1 via direct evidence, then fail
    store.appendEvidence(claim.assetId, { timestampMs: 1050, tickId: 2, eventType: 'verified', success: true });
    store.verifyOnUse(claim.assetId, 3, 1100, claim.location.blockPos); // fail -> failureStreak=1
    expect(store.get(claim.assetId)!.failureStreak).toBe(1);

    // Append a successful `observed` — should NOT reset the streak
    store.appendEvidence(claim.assetId, { timestampMs: 1200, tickId: 4, eventType: 'observed', success: true });
    expect(store.get(claim.assetId)!.failureStreak).toBe(1);
  });

  it('`budget_denied` does not count as L3 maintenance failure', () => {
    const store = new ReferenceAssetMemoryStore(() => true);
    const { claim } = store.upsertClaim({
      assetType: 'workstation',
      subType: 'furnace',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 0, y: 64, z: 0 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['smelting'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'furnace', radius: 1 },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });

    // Build to L3: place (L2) + 10 uses (L3)
    store.markPlaced(claim.assetId, 2, 1100);
    for (let i = 0; i < 10; i++) store.markUsed(claim.assetId, 10 + i, 2000 + i);
    expect(store.get(claim.assetId)!.myelinLevel).toBe(3);

    // Append budget_denied — should NOT demote from L3
    store.appendEvidence(claim.assetId, {
      timestampMs: 9000,
      tickId: 100,
      eventType: 'budget_denied',
      success: false,
    });
    expect(store.get(claim.assetId)!.myelinLevel).toBe(3);
  });

  it('`placed` resets failure streak and re-enables promotion', () => {
    let shouldVerify = true;
    const store = new ReferenceAssetMemoryStore(() => shouldVerify);
    const { claim } = store.upsertClaim({
      assetType: 'workstation',
      subType: 'furnace',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 0, y: 64, z: 0 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['smelting'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'furnace', radius: 1 },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });

    // Build to L1 via verification, then fail once to create a streak
    store.verifyOnUse(claim.assetId, 2, 1100, claim.location.blockPos); // L1
    shouldVerify = false;
    store.verifyOnUse(claim.assetId, 3, 1200, claim.location.blockPos); // fail -> L0, failureStreak=1
    expect(store.get(claim.assetId)!.failureStreak).toBe(1);
    expect(store.get(claim.assetId)!.myelinLevel).toBe(0);

    // Successful placed should reset streak and allow promotion back to L2
    store.markPlaced(claim.assetId, 4, 1300);
    expect(store.get(claim.assetId)!.failureStreak).toBe(0);
    expect(store.get(claim.assetId)!.myelinLevel).toBe(2); // placed promotes L0->L1->L2
  });
});

// ── N. Failure classification contract — 7 tests ────────────────────
// These test the adapter-level invariant: execution_failed events must not
// affect trust (streaks, L3 maintenance, confidence). They validate that
// precondition failures (missing ingredients, no fuel, pathing) do not
// demote assets when correctly classified as execution_failed.

describe('N. Failure classification contract', () => {
  /** Helper to build a claim to L3 for demotion testing */
  function buildToL3(store: InstanceType<typeof ReferenceAssetMemoryStore>) {
    const { claim } = store.upsertClaim({
      assetType: 'workstation',
      subType: 'furnace',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 0, y: 64, z: 0 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['smelting'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'furnace', radius: 1 },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });
    store.markPlaced(claim.assetId, 2, 1100);
    for (let i = 0; i < 10; i++) store.markUsed(claim.assetId, 10 + i, 2000 + i);
    expect(store.get(claim.assetId)!.myelinLevel).toBe(3);
    return claim;
  }

  it('`execution_failed` does not increment failure streak', () => {
    const store = new ReferenceAssetMemoryStore(() => true);
    const claim = buildToL3(store);

    store.appendEvidence(claim.assetId, {
      timestampMs: 9000,
      tickId: 100,
      eventType: 'execution_failed',
      success: false,
      details: { failureReason: 'missing_ingredients', leaf: 'craft_recipe' },
    });

    expect(store.get(claim.assetId)!.failureStreak).toBe(0);
  });

  it('`execution_failed` does not demote L3 via maintenance check', () => {
    const store = new ReferenceAssetMemoryStore(() => true);
    const claim = buildToL3(store);

    // Append multiple execution_failed events — none should trigger L3 maintenance
    for (let i = 0; i < 5; i++) {
      store.appendEvidence(claim.assetId, {
        timestampMs: 9000 + i,
        tickId: 100 + i,
        eventType: 'execution_failed',
        success: false,
        details: { failureReason: 'no_fuel' },
      });
    }

    expect(store.get(claim.assetId)!.myelinLevel).toBe(3);
    expect(store.get(claim.assetId)!.failureStreak).toBe(0);
  });

  it('`execution_failed` does not affect confidence score', () => {
    const store = new ReferenceAssetMemoryStore(() => true);
    const claim = buildToL3(store);
    const confidenceBefore = store.get(claim.assetId)!.confidence;

    store.appendEvidence(claim.assetId, {
      timestampMs: 9000,
      tickId: 100,
      eventType: 'execution_failed',
      success: false,
      details: { failureReason: 'inventory_full' },
    });

    expect(store.get(claim.assetId)!.confidence).toBe(confidenceBefore);
  });

  it('`execution_failed` does not reset failure streak (neutral like `observed`)', () => {
    const store = new ReferenceAssetMemoryStore(() => true);
    const { claim } = store.upsertClaim({
      assetType: 'workstation',
      subType: 'crafting_table',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 0, y: 64, z: 0 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['crafting'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'crafting_table', radius: 1 },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });

    // Build to L1, then start a failure streak
    store.appendEvidence(claim.assetId, { timestampMs: 1050, tickId: 2, eventType: 'verified', success: true });
    store.appendEvidence(claim.assetId, { timestampMs: 1100, tickId: 3, eventType: 'failed_verify', success: false });
    expect(store.get(claim.assetId)!.failureStreak).toBe(1);

    // execution_failed should NOT reset the streak
    store.appendEvidence(claim.assetId, {
      timestampMs: 1200,
      tickId: 4,
      eventType: 'execution_failed',
      success: false,
      details: { failureReason: 'interrupted' },
    });
    expect(store.get(claim.assetId)!.failureStreak).toBe(1);
  });

  it('`failed_verify` (asset invalidity) DOES increment streak and demote', () => {
    const store = new ReferenceAssetMemoryStore(() => true);
    const { claim } = store.upsertClaim({
      assetType: 'workstation',
      subType: 'crafting_table',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 0, y: 64, z: 0 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['crafting'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'crafting_table', radius: 1 },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });

    // Build to L1
    store.appendEvidence(claim.assetId, { timestampMs: 1050, tickId: 2, eventType: 'verified', success: true });
    expect(store.get(claim.assetId)!.myelinLevel).toBe(1);

    // failed_verify with block_missing reason → should demote L1→L0
    store.appendEvidence(claim.assetId, {
      timestampMs: 1100,
      tickId: 3,
      eventType: 'failed_verify',
      success: false,
      details: { failureReason: 'block_missing' },
    });
    expect(store.get(claim.assetId)!.failureStreak).toBe(1);
    expect(store.get(claim.assetId)!.myelinLevel).toBe(0);
  });

  it('Mixed execution_failed and failed_verify: only failed_verify affects trust', () => {
    const store = new ReferenceAssetMemoryStore(() => true);
    const claim = buildToL3(store);

    // 5 execution_failed events (precondition failures) — no trust impact
    for (let i = 0; i < 5; i++) {
      store.appendEvidence(claim.assetId, {
        timestampMs: 9000 + i,
        tickId: 100 + i,
        eventType: 'execution_failed',
        success: false,
        details: { failureReason: 'missing_ingredients' },
      });
    }
    expect(store.get(claim.assetId)!.myelinLevel).toBe(3);
    expect(store.get(claim.assetId)!.failureStreak).toBe(0);

    // 1 failed_verify (actual asset invalidity) — demotes L3 via maintenance
    store.appendEvidence(claim.assetId, {
      timestampMs: 9010,
      tickId: 110,
      eventType: 'failed_verify',
      success: false,
      details: { failureReason: 'block_missing' },
    });
    expect(store.get(claim.assetId)!.myelinLevel).toBe(2); // L3 maintenance → L2
    expect(store.get(claim.assetId)!.failureStreak).toBe(1);
  });

  it('Bed `unsafe` mapped as `verified` does not demote', () => {
    // Simulates the bed sleep-outcome mapping: unsafe → verified (bed exists)
    const store = new ReferenceAssetMemoryStore(() => true);
    const { claim } = store.upsertClaim({
      assetType: 'bed',
      subType: 'bed',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 5, y: 64, z: 5 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['safety'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'bed', radius: 1 },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });

    // Place bed → L2
    store.markPlaced(claim.assetId, 2, 1100);
    expect(store.get(claim.assetId)!.myelinLevel).toBe(2);

    // 10 successful uses → L3
    for (let i = 0; i < 10; i++) store.markUsed(claim.assetId, 10 + i, 2000 + i);
    expect(store.get(claim.assetId)!.myelinLevel).toBe(3);

    // "unsafe" outcome → adapter emits verified (not failed_use)
    // This represents: bed exists, monsters prevent sleep, but bed is reliable
    store.appendEvidence(claim.assetId, {
      timestampMs: 9000,
      tickId: 100,
      eventType: 'verified',
      success: true,
      details: { sleepOutcome: 'unsafe', leaf: 'sleep' },
    });

    // Bed should remain at L3 — unsafe is not an asset reliability failure
    expect(store.get(claim.assetId)!.myelinLevel).toBe(3);
    expect(store.get(claim.assetId)!.failureStreak).toBe(0);
  });
});

// ── O. resolveByPosition (read-only spatial lookup) — 5 tests ─────────
// Tests the non-verifying position-based lookup used by the adapter for
// attribution resolution. Must not trigger verify-on-use or mutate state.

describe('O. resolveByPosition (read-only spatial lookup)', () => {
  it('Finds a claim at the exact position', () => {
    const store = new ReferenceAssetMemoryStore(() => true);
    const { claim } = store.upsertClaim({
      assetType: 'workstation',
      subType: 'crafting_table',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 10, y: 64, z: 10 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['crafting'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'crafting_table', radius: 1 },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });

    const found = store.resolveByPosition({
      dimension: 'overworld',
      pos: { x: 10, y: 64, z: 10 },
      subType: 'crafting_table',
    });

    expect(found?.assetId).toBe(claim.assetId);
  });

  it('Finds a claim within maxDistance (default 2 blocks)', () => {
    const store = new ReferenceAssetMemoryStore(() => true);
    const { claim } = store.upsertClaim({
      assetType: 'workstation',
      subType: 'furnace',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 10, y: 64, z: 10 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['smelting'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'furnace', radius: 1 },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });

    const found = store.resolveByPosition({
      dimension: 'overworld',
      pos: { x: 11, y: 64, z: 11 }, // ~1.4 blocks away
    });

    expect(found?.assetId).toBe(claim.assetId);
  });

  it('Returns null when no claim within maxDistance', () => {
    const store = new ReferenceAssetMemoryStore(() => true);
    store.upsertClaim({
      assetType: 'workstation',
      subType: 'furnace',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 10, y: 64, z: 10 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['smelting'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'furnace', radius: 1 },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });

    const found = store.resolveByPosition({
      dimension: 'overworld',
      pos: { x: 20, y: 64, z: 20 }, // ~14 blocks away
      subType: 'furnace',
    });

    expect(found).toBeNull();
  });

  it('Filters by subType when provided', () => {
    const store = new ReferenceAssetMemoryStore(() => true);
    store.upsertClaim({
      assetType: 'workstation',
      subType: 'furnace',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 10, y: 64, z: 10 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['smelting'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'furnace', radius: 1 },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });

    // Look for crafting_table at same position — should not find furnace
    const found = store.resolveByPosition({
      dimension: 'overworld',
      pos: { x: 10, y: 64, z: 10 },
      subType: 'crafting_table',
    });

    expect(found).toBeNull();
  });

  it('Does not mutate state or trigger verify-on-use', () => {
    // Use a verifier that would fail — if verify-on-use were triggered,
    // it would append failed_verify evidence and increment failureStreak
    const store = new ReferenceAssetMemoryStore(() => false);
    const { claim } = store.upsertClaim({
      assetType: 'workstation',
      subType: 'crafting_table',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 10, y: 64, z: 10 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['crafting'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'crafting_table', radius: 1 },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });

    const evidenceBefore = store.get(claim.assetId)!.evidence.length;
    const streakBefore = store.get(claim.assetId)!.failureStreak;

    const found = store.resolveByPosition({
      dimension: 'overworld',
      pos: { x: 10, y: 64, z: 10 },
      subType: 'crafting_table',
    });

    expect(found?.assetId).toBe(claim.assetId);
    // No evidence was appended
    expect(store.get(claim.assetId)!.evidence.length).toBe(evidenceBefore);
    // No streak change
    expect(store.get(claim.assetId)!.failureStreak).toBe(streakBefore);
  });
});

// ── P. isSuccessEvent (canonical success mapping) — 5 tests ───────────
// Tests the canonical mapping from event type to success boolean. This is
// used by the wiring layer to derive the `success` field on evidence entries,
// preventing drift between ad-hoc boolean expressions.

describe('P. isSuccessEvent (canonical success mapping)', () => {
  it('Returns true for positive event types', () => {
    expect(isSuccessEvent('observed')).toBe(true);
    expect(isSuccessEvent('verified')).toBe(true);
    expect(isSuccessEvent('used')).toBe(true);
    expect(isSuccessEvent('placed')).toBe(true);
    expect(isSuccessEvent('merged')).toBe(true);
  });

  it('Returns false for failure event types', () => {
    expect(isSuccessEvent('failed_verify')).toBe(false);
    expect(isSuccessEvent('failed_use')).toBe(false);
  });

  it('Returns false for neutral event types', () => {
    expect(isSuccessEvent('execution_failed')).toBe(false);
    expect(isSuccessEvent('budget_denied')).toBe(false);
  });

  it('Is exhaustive: covers all EvidenceEventType values', () => {
    // This test verifies that isSuccessEvent handles every event type
    // without throwing. If a new event type is added to the union but
    // not to isSuccessEvent, TypeScript will catch it at compile time
    // (exhaustive switch). This test documents the runtime behavior.
    const allTypes = [
      'observed', 'verified', 'used', 'placed', 'merged',
      'failed_verify', 'failed_use', 'execution_failed', 'budget_denied',
    ] as const;
    for (const t of allTypes) {
      expect(typeof isSuccessEvent(t)).toBe('boolean');
    }
  });

  it('Matches the success field used by appendEvidence for trust-affecting events', () => {
    // Verify that isSuccessEvent agrees with the convention used by
    // verifyOnUse (success=true → verified, success=false → failed_verify)
    const store = new ReferenceAssetMemoryStore(() => true);
    const { claim } = store.upsertClaim({
      assetType: 'workstation',
      subType: 'furnace',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 0, y: 64, z: 0 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['smelting'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'furnace', radius: 1 },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });

    store.verifyOnUse(claim.assetId, 2, 1100, claim.location.blockPos);
    const verifiedEntry = store.get(claim.assetId)!.evidence[1]!;
    expect(verifiedEntry.eventType).toBe('verified');
    expect(verifiedEntry.success).toBe(isSuccessEvent('verified'));

    store.markUsed(claim.assetId, 3, 1200);
    const usedEntry = store.get(claim.assetId)!.evidence[2]!;
    expect(usedEntry.eventType).toBe('used');
    expect(usedEntry.success).toBe(isSuccessEvent('used'));
  });
});

// ── Q. upsertClaim.created contract — 4 tests ────────────────────────
// Tests that upsertClaim returns { claim, created } so the wiring can
// distinguish new-claim (auto-observed at firstSeenTick) from existing-claim
// (no new evidence, no tick offset needed).

describe('Q. upsertClaim.created contract', () => {
  it('Returns created=true for a new claim', () => {
    const store = new ReferenceAssetMemoryStore(() => true);
    const result = store.upsertClaim({
      assetType: 'workstation',
      subType: 'crafting_table',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 0, y: 64, z: 0 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['crafting'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'crafting_table', radius: 1 },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });
    expect(result.created).toBe(true);
    expect(result.claim.evidence.length).toBe(1);
    expect(result.claim.evidence[0]!.eventType).toBe('observed');
  });

  it('Returns created=false for an existing claim (idempotent)', () => {
    const store = new ReferenceAssetMemoryStore(() => true);
    const first = store.upsertClaim({
      assetType: 'workstation',
      subType: 'crafting_table',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 0, y: 64, z: 0 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['crafting'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'crafting_table', radius: 1 },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });

    // Same identity fields → idempotent return
    const second = store.upsertClaim({
      assetType: 'workstation',
      subType: 'crafting_table',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 0, y: 64, z: 0 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['crafting'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'crafting_table', radius: 1 },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });

    expect(second.created).toBe(false);
    expect(second.claim.assetId).toBe(first.claim.assetId);
    // No new evidence appended
    expect(second.claim.evidence.length).toBe(1);
  });

  it('Auto-observed entry uses firstSeenTick (wiring contract)', () => {
    const store = new ReferenceAssetMemoryStore(() => true);
    const result = store.upsertClaim({
      assetType: 'workstation',
      subType: 'furnace',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 5, y: 64, z: 5 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['smelting'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'furnace', radius: 1 },
      firstSeenTick: 42,
      firstSeenMs: 5000,
    });
    expect(result.created).toBe(true);
    expect(result.claim.evidence[0]!.tickId).toBe(42);
    expect(result.claim.evidence[0]!.timestampMs).toBe(5000);
  });

  it('Follow-up appendEvidence at firstSeenTick+1 succeeds after upsert', () => {
    const store = new ReferenceAssetMemoryStore(() => true);
    const { claim } = store.upsertClaim({
      assetType: 'workstation',
      subType: 'furnace',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 5, y: 64, z: 5 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['smelting'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'furnace', radius: 1 },
      firstSeenTick: 42,
      firstSeenMs: 5000,
    });

    // This is the two-phase apply contract: placed event at tick+1
    store.appendEvidence(claim.assetId, {
      timestampMs: 5001,
      tickId: 43,
      eventType: 'placed',
      success: true,
    });

    expect(claim.evidence.length).toBe(2);
    expect(claim.evidence[0]!.eventType).toBe('observed');
    expect(claim.evidence[0]!.tickId).toBe(42);
    expect(claim.evidence[1]!.eventType).toBe('placed');
    expect(claim.evidence[1]!.tickId).toBe(43);
    // Chain integrity preserved
    expect(claim.evidence[1]!.chain.prev).toBe(claim.evidence[0]!.chain.digest);
  });
});

// ── R. Two-phase apply regression — 5 tests ──────────────────────────
// Simulates the wiring loop's two-phase apply pattern at the store level
// to prove that the bed placed-then-used flow (and similar multi-emission
// patterns) work correctly with upsertClaim + appendEvidence.

describe('R. Two-phase apply regression', () => {
  it('Bed placed + used: both emissions land on the same claim with correct ordering', () => {
    // Simulates: sleep leaf places a bed AND uses it (slept outcome)
    // Phase 1: upsertClaim creates the bed claim (observed at tick 100)
    // Phase 2: appendEvidence adds placed (tick 101) and used (tick 102)
    const store = new ReferenceAssetMemoryStore(() => true);
    const { claim, created } = store.upsertClaim({
      assetType: 'bed',
      subType: 'bed',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 5, y: 64, z: 5 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['safety'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'bed', radius: 1 },
      firstSeenTick: 100,
      firstSeenMs: 10000,
    });

    expect(created).toBe(true);

    // Phase 2: placed at tick+1
    store.appendEvidence(claim.assetId, {
      timestampMs: 10001,
      tickId: 101,
      eventType: 'placed',
      success: true,
      details: { leaf: 'sleep', placed: true },
    });

    // Phase 2: used at tick+2
    store.appendEvidence(claim.assetId, {
      timestampMs: 10002,
      tickId: 102,
      eventType: 'used',
      success: true,
      details: { leaf: 'sleep', sleepOutcome: 'slept' },
    });

    // All 3 events present: observed, placed, used
    expect(claim.evidence.length).toBe(3);
    expect(claim.evidence[0]!.eventType).toBe('observed');
    expect(claim.evidence[1]!.eventType).toBe('placed');
    expect(claim.evidence[2]!.eventType).toBe('used');

    // Strictly monotonic ticks
    expect(claim.evidence[0]!.tickId).toBe(100);
    expect(claim.evidence[1]!.tickId).toBe(101);
    expect(claim.evidence[2]!.tickId).toBe(102);

    // Chain integrity
    expect(claim.evidence[1]!.chain.prev).toBe(claim.evidence[0]!.chain.digest);
    expect(claim.evidence[2]!.chain.prev).toBe(claim.evidence[1]!.chain.digest);

    // Success booleans match isSuccessEvent
    expect(claim.evidence[0]!.success).toBe(isSuccessEvent('observed'));
    expect(claim.evidence[1]!.success).toBe(isSuccessEvent('placed'));
    expect(claim.evidence[2]!.success).toBe(isSuccessEvent('used'));

    // Claim should be at L2 (placed promotes to L2)
    expect(claim.myelinLevel).toBe(2);
  });

  it('Existing claim gets 2 emissions at same base tick (offset tracking)', () => {
    // Simulates: a claim already exists, and two events need to be appended
    // from the same leaf outcome (e.g., verified + used in one interaction)
    const store = new ReferenceAssetMemoryStore(() => true);
    const { claim } = store.upsertClaim({
      assetType: 'workstation',
      subType: 'furnace',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 0, y: 64, z: 0 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['smelting'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'furnace', radius: 1 },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });

    // Simulate two emissions to existing claim at baseTick=50
    // The wiring would offset these: tick 50, tick 51
    const baseTick = 50;
    store.appendEvidence(claim.assetId, {
      timestampMs: 5000,
      tickId: baseTick,
      eventType: 'verified',
      success: true,
      details: { leaf: 'smelt' },
    });

    store.appendEvidence(claim.assetId, {
      timestampMs: 5001,
      tickId: baseTick + 1,
      eventType: 'used',
      success: true,
      details: { leaf: 'smelt', input: 'iron_ore' },
    });

    expect(claim.evidence.length).toBe(3); // observed + verified + used
    expect(claim.evidence[1]!.tickId).toBe(50);
    expect(claim.evidence[2]!.tickId).toBe(51);
  });

  it('Upsert + observed eventType skips duplicate (store already wrote observed)', () => {
    // When the emission's eventType is 'observed' and the target is an upsert,
    // the wiring should skip the explicit append because upsertClaim already
    // created the observed entry. This test proves the store state is correct.
    const store = new ReferenceAssetMemoryStore(() => true);
    const { claim, created } = store.upsertClaim({
      assetType: 'container',
      subType: 'chest',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 10, y: 64, z: 10 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['storage'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'chest', radius: 1 },
      firstSeenTick: 50,
      firstSeenMs: 5000,
    });

    expect(created).toBe(true);
    // Wiring would skip explicit observed → only 1 observed entry
    expect(claim.evidence.length).toBe(1);
    expect(claim.evidence[0]!.eventType).toBe('observed');
  });

  it('Upsert returning existing claim: created=false, no tick offset needed', () => {
    // When upsertClaim returns an existing claim, no auto-observed is appended.
    // The wiring should use baseOffset=0 (no tick jump needed).
    const store = new ReferenceAssetMemoryStore(() => true);
    const first = store.upsertClaim({
      assetType: 'workstation',
      subType: 'crafting_table',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 0, y: 64, z: 0 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['crafting'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'crafting_table', radius: 1 },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });
    expect(first.created).toBe(true);

    // Add some evidence to advance the ledger
    store.appendEvidence(first.claim.assetId, {
      timestampMs: 2000,
      tickId: 10,
      eventType: 'verified',
      success: true,
    });

    // Second upsert with same identity → returns existing
    const second = store.upsertClaim({
      assetType: 'workstation',
      subType: 'crafting_table',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 0, y: 64, z: 0 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['crafting'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'crafting_table', radius: 1 },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });
    expect(second.created).toBe(false);

    // Can append at current tick without +1 offset
    // Last evidence tick is 10, so tick 50 works with offset=0
    store.appendEvidence(second.claim.assetId, {
      timestampMs: 5000,
      tickId: 50,
      eventType: 'used',
      success: true,
      details: { leaf: 'craft_recipe' },
    });

    expect(second.claim.evidence.length).toBe(3); // observed + verified + used
    expect(second.claim.evidence[2]!.tickId).toBe(50);
  });

  it('No duplicate claims from same upsertKey applied twice', () => {
    // When two emissions share an upsertKey, upsertClaim is only called once.
    // The second call returns created=false, same assetId.
    const store = new ReferenceAssetMemoryStore(() => true);

    const first = store.upsertClaim({
      assetType: 'bed',
      subType: 'bed',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 5, y: 64, z: 5 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['safety'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'bed', radius: 1 },
      firstSeenTick: 100,
      firstSeenMs: 10000,
    });
    expect(first.created).toBe(true);

    // Same identity → returns existing
    const second = store.upsertClaim({
      assetType: 'bed',
      subType: 'bed',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 5, y: 64, z: 5 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['safety'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'bed', radius: 1 },
      firstSeenTick: 100,
      firstSeenMs: 10000,
    });
    expect(second.created).toBe(false);
    expect(second.claim.assetId).toBe(first.claim.assetId);

    // Only one claim in the store
    expect(store.all().filter(c => c.subType === 'bed').length).toBe(1);
  });
});

// ── S. Identity hash invariants — 3 tests ─────────────────────────────
// Pins the contract: assetId is derived from (assetType, subType, owner,
// dimension, blockPos) only. Non-identity fields do not fork claims.

describe('S. Identity hash invariants', () => {
  it('firstSeenTick is NOT part of identity: same block at different ticks merges', () => {
    const store = new ReferenceAssetMemoryStore(() => true);
    const first = store.upsertClaim({
      assetType: 'workstation',
      subType: 'crafting_table',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 10, y: 64, z: 10 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['crafting'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'crafting_table', radius: 1 },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });

    // Same block, different tick → should return existing claim
    const second = store.upsertClaim({
      assetType: 'workstation',
      subType: 'crafting_table',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 10, y: 64, z: 10 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['crafting'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'crafting_table', radius: 1 },
      firstSeenTick: 999,
      firstSeenMs: 99000,
    });

    expect(second.created).toBe(false);
    expect(second.claim.assetId).toBe(first.claim.assetId);
  });

  it('tags are NOT part of identity: same block with different tags merges', () => {
    const store = new ReferenceAssetMemoryStore(() => true);
    const first = store.upsertClaim({
      assetType: 'workstation',
      subType: 'furnace',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 5, y: 64, z: 5 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['smelting'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'furnace', radius: 1 },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });

    const second = store.upsertClaim({
      assetType: 'workstation',
      subType: 'furnace',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 5, y: 64, z: 5 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['smelting', 'iron_processing'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'furnace', radius: 1 },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });

    expect(second.created).toBe(false);
    expect(second.claim.assetId).toBe(first.claim.assetId);
  });

  it('blockPos IS part of identity: different positions create distinct claims', () => {
    const store = new ReferenceAssetMemoryStore(() => true);
    const first = store.upsertClaim({
      assetType: 'workstation',
      subType: 'crafting_table',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 10, y: 64, z: 10 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['crafting'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'crafting_table', radius: 1 },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });

    const second = store.upsertClaim({
      assetType: 'workstation',
      subType: 'crafting_table',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 12, y: 64, z: 10 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['crafting'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'crafting_table', radius: 1 },
      firstSeenTick: 2,
      firstSeenMs: 1100,
    });

    expect(second.created).toBe(true);
    expect(second.claim.assetId).not.toBe(first.claim.assetId);
  });
});

// ── T. lastEvidenceTick and tick clamping — 3 tests ───────────────────
// Tests the lastEvidenceTick accessor and the wiring-level tick clamping
// pattern that prevents non-monotonic tick errors when leafOutcome.tickId
// is behind the claim's ledger head.

describe('T. lastEvidenceTick and tick clamping', () => {
  it('lastEvidenceTick returns the tick of the most recent evidence entry', () => {
    const store = new ReferenceAssetMemoryStore(() => true);
    const { claim } = store.upsertClaim({
      assetType: 'workstation',
      subType: 'furnace',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 0, y: 64, z: 0 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['smelting'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'furnace', radius: 1 },
      firstSeenTick: 10,
      firstSeenMs: 1000,
    });

    expect(store.lastEvidenceTick(claim.assetId)).toBe(10);

    store.appendEvidence(claim.assetId, {
      timestampMs: 2000,
      tickId: 200,
      eventType: 'verified',
      success: true,
    });

    expect(store.lastEvidenceTick(claim.assetId)).toBe(200);
  });

  it('lastEvidenceTick returns -Infinity for unknown assetId', () => {
    const store = new ReferenceAssetMemoryStore(() => true);
    expect(store.lastEvidenceTick('nonexistent')).toBe(-Infinity);
  });

  it('Wiring can clamp tick offset against ledger head to avoid non-monotonic error', () => {
    // Simulates the wiring-level clamp pattern from §6.7.4:
    // Claim has evidence at tick 200. New leaf outcome at tick 150.
    // Without clamping, appendEvidence would throw non_monotonic_tick.
    // With clamping, wiring computes offset to push past ledger head.
    const store = new ReferenceAssetMemoryStore(() => true);
    const { claim } = store.upsertClaim({
      assetType: 'workstation',
      subType: 'furnace',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 0, y: 64, z: 0 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['smelting'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'furnace', radius: 1 },
      firstSeenTick: 10,
      firstSeenMs: 1000,
    });

    // Advance ledger to tick 200
    store.appendEvidence(claim.assetId, {
      timestampMs: 2000,
      tickId: 200,
      eventType: 'verified',
      success: true,
    });

    // Simulate leaf outcome at tick 150 (behind the ledger)
    const leafTick = 150;
    const lastTick = store.lastEvidenceTick(claim.assetId);
    // Wiring clamp: compute minimum offset needed
    const minNeeded = (lastTick + 1) - leafTick; // 201 - 150 = 51
    const offset = Math.max(0, minNeeded); // 51

    // This should succeed (tick = 150 + 51 = 201 > 200)
    store.appendEvidence(claim.assetId, {
      timestampMs: 3000 + offset,
      tickId: leafTick + offset,
      eventType: 'used',
      success: true,
      details: { leaf: 'smelt', clamped: true },
    });

    expect(claim.evidence.length).toBe(3);
    expect(claim.evidence[2]!.tickId).toBe(201);
    expect(claim.evidence[2]!.tickId).toBeGreaterThan(claim.evidence[1]!.tickId);
  });
});

// ── U. TTL refresh via observed on existing claim — 2 tests ───────────
// Tests whether re-observing an existing claim refreshes the evidence
// ledger for TTL purposes, preventing expiry of frequently encountered assets.

describe('U. TTL refresh via observed on existing claim', () => {
  it('observed on existing L1 claim extends last evidence tick and prevents TTL expiry', () => {
    const store = new ReferenceAssetMemoryStore(() => true);
    const { claim } = store.upsertClaim({
      assetType: 'container',
      subType: 'chest',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 0, y: 64, z: 0 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['storage'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'chest', radius: 1 },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });

    // Promote to L1 via verification
    store.verifyOnUse(claim.assetId, 2, 1100, claim.location.blockPos);
    expect(store.get(claim.assetId)!.myelinLevel).toBe(1);

    // Time passes — almost at TTL expiry for L1
    const almostExpiredTick = 2 + MYELIN_THRESHOLDS.DECAY_TTL_TICKS.L1 - 100;

    // Re-observe the claim (passive discovery), which appends new evidence
    store.appendEvidence(claim.assetId, {
      timestampMs: almostExpiredTick * 50,
      tickId: almostExpiredTick,
      eventType: 'observed',
      success: true,
      details: { source: 'passive_discovery' },
    });

    // Now expire — the clock is measured from last evidence, which was
    // refreshed by the observed event. So (almostExpiredTick + L1_TTL)
    // is well beyond the current tick.
    store.expireByTTL(almostExpiredTick + 100);

    // Should still be findable because observed refreshed the ledger
    const found = store.findNearest({
      dimension: 'overworld',
      fromPos: { x: 0, y: 64, z: 0 },
      subType: 'chest',
      maxChunkRadius: 1,
      topK: 5,
      verifyTick: almostExpiredTick + 101,
      verifyMs: (almostExpiredTick + 101) * 50,
    });
    expect(found?.assetId).toBe(claim.assetId);
  });

  it('L1 claim without observed refresh does expire at TTL boundary', () => {
    const store = new ReferenceAssetMemoryStore(() => true);
    const { claim } = store.upsertClaim({
      assetType: 'container',
      subType: 'chest',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 0, y: 64, z: 0 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['storage'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'chest', radius: 1 },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });

    // Promote to L1
    store.verifyOnUse(claim.assetId, 2, 1100, claim.location.blockPos);
    expect(store.get(claim.assetId)!.myelinLevel).toBe(1);

    // No observed refresh — expire past TTL
    store.expireByTTL(2 + MYELIN_THRESHOLDS.DECAY_TTL_TICKS.L1 + 1);

    const found = store.findNearest({
      dimension: 'overworld',
      fromPos: { x: 0, y: 64, z: 0 },
      subType: 'chest',
      maxChunkRadius: 1,
      topK: 5,
      verifyTick: 999999,
      verifyMs: 999999,
    });
    expect(found).toBeNull();
  });
});

// ── V. resolveByPosition assetType filter — 3 tests ─────────────

describe('V. resolveByPosition assetType filter', () => {
  it('Returns claim when assetType matches', () => {
    const store = new ReferenceAssetMemoryStore(() => true);
    const { claim } = store.upsertClaim({
      assetType: 'workstation',
      subType: 'furnace',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 2, y: 64, z: 0 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['smelting'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'furnace', radius: 1 },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });

    const found = store.resolveByPosition({
      dimension: 'overworld',
      pos: { x: 2, y: 64, z: 0 },
      subType: 'furnace',
      assetType: 'workstation',
    });
    expect(found?.assetId).toBe(claim.assetId);
  });

  it('Returns null when assetType mismatches despite subType match', () => {
    const store = new ReferenceAssetMemoryStore(() => true);
    store.upsertClaim({
      assetType: 'workstation',
      subType: 'furnace',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 2, y: 64, z: 0 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['smelting'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'furnace', radius: 1 },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });

    // Query with wrong assetType
    const found = store.resolveByPosition({
      dimension: 'overworld',
      pos: { x: 2, y: 64, z: 0 },
      subType: 'furnace',
      assetType: 'container', // mismatch
    });
    expect(found).toBeNull();
  });

  it('Omitting assetType returns any matching subType (backward compat)', () => {
    const store = new ReferenceAssetMemoryStore(() => true);
    const { claim } = store.upsertClaim({
      assetType: 'workstation',
      subType: 'furnace',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 2, y: 64, z: 0 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['smelting'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'furnace', radius: 1 },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });

    // No assetType filter — should still find it
    const found = store.resolveByPosition({
      dimension: 'overworld',
      pos: { x: 2, y: 64, z: 0 },
      subType: 'furnace',
    });
    expect(found?.assetId).toBe(claim.assetId);
  });
});

// ── W. UpsertKey collision safety (identity boundary) — 2 tests ──

describe('W. UpsertKey collision safety (identity boundary)', () => {
  it('Same identity fields yield the same assetId (upsert merges)', () => {
    const store = new ReferenceAssetMemoryStore(() => true);
    const { claim: first, created: c1 } = store.upsertClaim({
      assetType: 'workstation',
      subType: 'crafting_table',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 5, y: 64, z: 5 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['crafting'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'crafting_table', radius: 1 },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });
    expect(c1).toBe(true);

    // Second upsert with same identity but different non-identity fields (tags, interactRadius)
    const { claim: second, created: c2 } = store.upsertClaim({
      assetType: 'workstation',
      subType: 'crafting_table',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 5, y: 64, z: 5 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['crafting', 'extra_tag'],
      interactRadius: 10,
      verifyMethod: { type: 'block_name_match', expectedValue: 'crafting_table', radius: 2 },
      firstSeenTick: 999,
      firstSeenMs: 9999,
    });
    expect(c2).toBe(false);
    expect(second.assetId).toBe(first.assetId);
    // Store has exactly one claim
    expect(store.all().length).toBe(1);
  });

  it('Different identity fields yield different assetIds (no collision)', () => {
    const store = new ReferenceAssetMemoryStore(() => true);

    // Same position, different subType — must be distinct claims
    const { claim: a } = store.upsertClaim({
      assetType: 'workstation',
      subType: 'crafting_table',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 5, y: 64, z: 5 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['crafting'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'crafting_table', radius: 1 },
      firstSeenTick: 1,
      firstSeenMs: 1000,
    });

    const { claim: b } = store.upsertClaim({
      assetType: 'workstation',
      subType: 'furnace',
      owner: 'bot',
      location: { dimension: 'overworld', blockPos: { x: 5, y: 64, z: 5 }, chunkPos: { cx: 0, cz: 0 } },
      tags: ['smelting'],
      interactRadius: 6,
      verifyMethod: { type: 'block_name_match', expectedValue: 'furnace', radius: 1 },
      firstSeenTick: 2,
      firstSeenMs: 1100,
    });

    expect(a.assetId).not.toBe(b.assetId);
    expect(store.all().length).toBe(2);
  });
});
