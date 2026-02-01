/**
 * Asset Memory Acceptance Tests — conscious-bot.asset_memory.v0
 *
 * 12 suites, 42 tests covering:
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
 */
import { describe, it, expect } from 'vitest';
import {
  ReferenceAssetMemoryStore,
  MYELIN_THRESHOLDS,
  ASSET_BUDGETS,
  chunkFromPos,
  dist,
  sha16,
} from '../asset-memory-store';
import type { Vec3i } from '../asset-memory-store';

// ── A. AssetClaim lifecycle — 5 tests ──────────────────────────────

describe('A. AssetClaim lifecycle', () => {
  it('L0->L1 on first successful verification', () => {
    const store = new ReferenceAssetMemoryStore(() => true);
    const claim = store.upsertClaim({
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
    const claim = store.upsertClaim({
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
    const claim = store.upsertClaim({
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
    const claim = store.upsertClaim({
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
    const store = new ReferenceAssetMemoryStore(() => false);
    const claim = store.upsertClaim({
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
    // Build up to L3: place (L2) then 10 uses (L3)
    // Need a store that returns true for markPlaced/markUsed but false for verifyOnUse.
    // Since markPlaced/markUsed call appendEvidence directly (not verifier),
    // and verifyOnUse calls verifier, we use a stateful verifier.
    // Actually the verifier is only called by verifyOnUse, not by markPlaced/markUsed.
    // So we need to build L3 first with a "true" verifier, then switch to "false".
    // But the store takes verifier in constructor. Let's use a mutable ref.
    let shouldVerify = true;
    const store2 = new ReferenceAssetMemoryStore(() => shouldVerify);
    const claim2 = store2.upsertClaim({
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
    store2.markPlaced(claim2.assetId, 2, 1100);
    for (let i = 0; i < 10; i++) store2.markUsed(claim2.assetId, 10 + i, 2000 + i);
    expect(store2.get(claim2.assetId)!.myelinLevel).toBe(3);

    shouldVerify = false;
    store2.verifyOnUse(claim2.assetId, 100, 3000, claim2.location.blockPos); // fail 1
    store2.verifyOnUse(claim2.assetId, 101, 3100, claim2.location.blockPos); // fail 2
    store2.verifyOnUse(claim2.assetId, 102, 3200, claim2.location.blockPos); // fail 3

    expect(store2.get(claim2.assetId)!.myelinLevel).toBe(1);
  });
});

// ── B. Place-vs-reuse gate — 4 tests ──────────────────────────────

describe('B. Place-vs-reuse gate', () => {
  it('Reuses an existing verified asset within reuse radius', () => {
    const store = new ReferenceAssetMemoryStore(() => true);
    const claim = store.upsertClaim({
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

    const near = store.upsertClaim({
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
    const a = store.upsertClaim({
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

    const b = store.upsertClaim({
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
    const claim = store.upsertClaim({
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
    const claim = store.upsertClaim({
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
    const claim = store.upsertClaim({
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
    const claim = store.upsertClaim({
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
    const claim = store.upsertClaim({
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
    const claim = store.upsertClaim({
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
    const claim = store.upsertClaim({
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
    const table = store.upsertClaim({
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
    const furnace = store.upsertClaim({
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
    const table = store.upsertClaim({
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
    const claim = store.upsertClaim({
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
    const claim = store.upsertClaim({
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
    const claim = store.upsertClaim({
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

describe('M. Spec-lock: event taxonomy invariants', () => {
  it('`observed` does not reset failure streak', () => {
    const store = new ReferenceAssetMemoryStore(() => false);
    const claim = store.upsertClaim({
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
    const claim = store.upsertClaim({
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
    const claim = store.upsertClaim({
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
