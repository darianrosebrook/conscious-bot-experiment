/**
 * Reference Asset Memory Store — conscious-bot.asset_memory.v0
 *
 * Implements the bot-side world-entity memory system with:
 * - Evidence-backed claims (append-only ledger with digest chain)
 * - L0->L3 myelin promotion/demotion ladder
 * - Chunk + type spatial indexing with verify-on-use
 * - Anti-reward-hacking: uniqueness budgets + place-vs-reuse gate
 */
import * as crypto from 'node:crypto';

// ── Types ──────────────────────────────────────────────────────────

export type MyelinLevel = 0 | 1 | 2 | 3;

export type AssetType =
  | 'workstation'
  | 'container'
  | 'farm'
  | 'bed'
  | 'person'
  | 'waypoint'
  | 'base';

export type EvidenceEventType =
  | 'observed'
  | 'verified'
  | 'used'
  | 'placed'
  | 'failed_verify'
  | 'failed_use'
  | 'merged'
  | 'budget_denied'
  | 'execution_failed';

export interface Vec3i {
  x: number;
  y: number;
  z: number;
}

export interface ChunkPos {
  cx: number;
  cz: number;
}

export type VerifyMethod =
  | { type: 'block_name_match'; expectedValue: string; radius: number }
  | { type: 'custom'; expectedValue: string; radius: number; customVerifierId: string };

export interface EvidenceEntry {
  timestampMs: number;
  tickId: number;
  eventType: EvidenceEventType;
  success: boolean;
  details?: Record<string, unknown>;
  chain: { prev?: string; digest: string };
}

export interface AssetClaim {
  assetId: string;
  assetType: AssetType;
  subType: string;
  owner: string;
  location: {
    dimension: string;
    blockPos: Vec3i;
    chunkPos: ChunkPos;
    baseId?: string;
  };
  tags: string[];
  interactRadius: number;
  verifyMethod: VerifyMethod;

  evidence: EvidenceEntry[];
  lastVerifiedAtTick: number | null;
  lastUsedAtTick: number | null;
  failureStreak: number;
  /** The myelin level when the current failure streak started. */
  streakStartLevel: MyelinLevel;

  confidence: number;
  value: number;
  myelinLevel: MyelinLevel;
}

// ── Constants ──────────────────────────────────────────────────────

export const MYELIN_THRESHOLDS = {
  L0_TO_L1: { mode: 'OR' as const, minVerifications: 1, minUses: 1 },
  L1_TO_L2: {
    placedByBotPromotes: true,
    OR: {
      minSuccessfulUses: 3,
      minVerifications: 2,
      minTimeSeparationTicks: 6000,
    },
  },
  L2_TO_L3: {
    minUses: 10,
    recentWindowEntries: 20,
    maxRecentFailures: 0,
    minValueScore: 0.5,
    minSuccessRate: 0.95,
  },
  DEMOTION_FAILURES: {
    L3_TO_L1: { consecutiveFailures: 3 },
    L2_TO_L1: { consecutiveFailures: 2 },
    L1_TO_L0: { consecutiveFailures: 1 },
  },
  DECAY_TTL_TICKS: {
    L0: 72_000,
    L1: 288_000,
    L2: Infinity,
    L3: Infinity,
  },
} as const;

export const ASSET_BUDGETS: Record<string, { maxPerBase: number; maxGlobal: number }> = {
  bed: { maxPerBase: 1, maxGlobal: 3 },
  crafting_table: { maxPerBase: 1, maxGlobal: 3 },
  furnace: { maxPerBase: 2, maxGlobal: 6 },
  blast_furnace: { maxPerBase: 1, maxGlobal: 3 },
  chest: { maxPerBase: 4, maxGlobal: 16 },
};

// ── Utilities ──────────────────────────────────────────────────────

export function sha16(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex').slice(0, 16);
}

export function chunkFromPos(p: Vec3i): ChunkPos {
  return { cx: Math.floor(p.x / 16), cz: Math.floor(p.z / 16) };
}

/**
 * 3D Euclidean distance between two block positions.
 * Used consistently for all spatial comparisons: resolveByPosition,
 * findNearest ranking, place-vs-reuse radius, and adapter sanity checks.
 */
export function dist(a: Vec3i, b: Vec3i): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function computeEvidenceDigest(
  prev: string | undefined,
  fields: Omit<EvidenceEntry, 'chain'>,
): string {
  const canon = JSON.stringify({ ...fields, prev: prev ?? null });
  return sha16(canon);
}

/**
 * Canonical success mapping for evidence event types.
 * success=true: events that represent positive interaction outcomes.
 * success=false: events that represent failures or neutral non-outcomes.
 */
export function isSuccessEvent(eventType: EvidenceEventType): boolean {
  switch (eventType) {
    case 'observed':
    case 'verified':
    case 'used':
    case 'placed':
    case 'merged':
      return true;
    case 'failed_verify':
    case 'failed_use':
    case 'execution_failed':
    case 'budget_denied':
      return false;
  }
}

// ── Verifier callback type ─────────────────────────────────────────

// eslint-disable-next-line no-unused-vars
export type VerifyFn = (claim: AssetClaim, atPos: Vec3i) => boolean;

// ── Input type for upsertClaim ─────────────────────────────────────

export type UpsertClaimInput = Omit<
  AssetClaim,
  | 'assetId'
  | 'evidence'
  | 'lastVerifiedAtTick'
  | 'lastUsedAtTick'
  | 'failureStreak'
  | 'streakStartLevel'
  | 'confidence'
  | 'value'
  | 'myelinLevel'
> & {
  firstSeenTick: number;
  firstSeenMs: number;
};

// ── Upsert result ─────────────────────────────────────────────────

export interface UpsertResult {
  claim: AssetClaim;
  /** True if a new claim was created (with auto-observed entry). False if existing claim returned. */
  created: boolean;
}

// ── Place-vs-reuse gate result ─────────────────────────────────────

export interface PlaceVsReuseResult {
  decision: 'reuse' | 'allow_place' | 'deny_budget';
  assetId?: string;
}

// ── Reference Store ────────────────────────────────────────────────

export class ReferenceAssetMemoryStore {
  private byId = new Map<string, AssetClaim>();
  private chunkIndex = new Map<string, Set<string>>();
  private typeIndex = new Map<string, Set<string>>();
  private verifier: VerifyFn;

  constructor(verifier: VerifyFn) {
    this.verifier = verifier;
  }

  get(assetId: string): AssetClaim | undefined {
    return this.byId.get(assetId);
  }

  all(): AssetClaim[] {
    return Array.from(this.byId.values());
  }

  /**
   * Returns the tickId of the last evidence entry for a claim,
   * or -Infinity if the claim doesn't exist.
   * Used by the wiring layer to clamp tick offsets against the ledger head.
   */
  lastEvidenceTick(assetId: string): number {
    const claim = this.byId.get(assetId);
    if (!claim || claim.evidence.length === 0) return -Infinity;
    return claim.evidence[claim.evidence.length - 1]!.tickId;
  }

  private chunkKey(dimension: string, chunk: ChunkPos): string {
    return `${dimension}:${chunk.cx},${chunk.cz}`;
  }

  private addToIndex(claim: AssetClaim): void {
    const ck = this.chunkKey(claim.location.dimension, claim.location.chunkPos);
    if (!this.chunkIndex.has(ck)) this.chunkIndex.set(ck, new Set());
    this.chunkIndex.get(ck)!.add(claim.assetId);

    const keys = new Set<string>([claim.assetType, claim.subType, ...claim.tags]);
    for (const k of keys) {
      if (!this.typeIndex.has(k)) this.typeIndex.set(k, new Set());
      this.typeIndex.get(k)!.add(claim.assetId);
    }
  }

  private removeFromIndex(claim: AssetClaim): void {
    const ck = this.chunkKey(claim.location.dimension, claim.location.chunkPos);
    this.chunkIndex.get(ck)?.delete(claim.assetId);

    const keys = new Set<string>([claim.assetType, claim.subType, ...claim.tags]);
    for (const k of keys) this.typeIndex.get(k)?.delete(claim.assetId);
  }

  upsertClaim(input: UpsertClaimInput): UpsertResult {
    // Identity fields only: assetType, subType, owner, dimension, blockPos.
    // Non-identity fields (tags, verifyMethod, interactRadius, firstSeenTick)
    // are excluded so that the same block observed at different times or with
    // different policy attributes merges into one claim.
    const stable = JSON.stringify({
      assetType: input.assetType,
      subType: input.subType,
      owner: input.owner,
      dimension: input.location.dimension,
      blockPos: input.location.blockPos,
    });
    const assetId = `asset_${sha16(stable)}`;

    const existing = this.byId.get(assetId);
    if (existing) return { claim: existing, created: false };

    const entryFields = {
      timestampMs: input.firstSeenMs,
      tickId: input.firstSeenTick,
      eventType: 'observed' as const,
      success: true,
      details: { created: true },
    };
    const digest = computeEvidenceDigest(undefined, entryFields);
    const evidence: EvidenceEntry = { ...entryFields, chain: { digest } };

    const claim: AssetClaim = {
      assetId,
      assetType: input.assetType,
      subType: input.subType,
      owner: input.owner,
      location: {
        ...input.location,
        chunkPos: input.location.chunkPos ?? chunkFromPos(input.location.blockPos),
      },
      tags: Array.from(new Set(input.tags)).sort(),
      interactRadius: input.interactRadius,
      verifyMethod: input.verifyMethod,

      evidence: [evidence],
      lastVerifiedAtTick: null,
      lastUsedAtTick: null,
      failureStreak: 0,
      streakStartLevel: 0,

      confidence: 0.2,
      value: 0.5,
      myelinLevel: 0,
    };

    this.byId.set(assetId, claim);
    this.addToIndex(claim);
    return { claim, created: true };
  }

  appendEvidence(assetId: string, fields: Omit<EvidenceEntry, 'chain'>): AssetClaim {
    const claim = this.byId.get(assetId);
    if (!claim) throw new Error(`missing_claim:${assetId}`);

    const last = claim.evidence[claim.evidence.length - 1]!;
    if (fields.tickId <= last.tickId) throw new Error('non_monotonic_tick');

    const digest = computeEvidenceDigest(last.chain.digest, fields);
    const entry: EvidenceEntry = {
      ...fields,
      chain: { prev: last.chain.digest, digest },
    };
    claim.evidence.push(entry);

    if (
      (fields.eventType === 'verified' ||
        fields.eventType === 'used' ||
        fields.eventType === 'placed') &&
      fields.success
    ) {
      claim.failureStreak = 0;
      claim.streakStartLevel = claim.myelinLevel;
      if (fields.eventType === 'verified') claim.lastVerifiedAtTick = fields.tickId;
      if (fields.eventType === 'used') claim.lastUsedAtTick = fields.tickId;
    }
    if (
      (fields.eventType === 'failed_verify' || fields.eventType === 'failed_use') &&
      !fields.success
    ) {
      if (claim.failureStreak === 0) {
        // New streak — record the level we're falling from.
        claim.streakStartLevel = claim.myelinLevel;
      }
      claim.failureStreak += 1;
    }

    this.recomputeDerived(claim);
    return claim;
  }

  verifyOnUse(assetId: string, tickId: number, ms: number, atPos: Vec3i): boolean {
    const claim = this.byId.get(assetId);
    if (!claim) return false;
    const ok = this.verifier(claim, atPos);
    this.appendEvidence(assetId, {
      timestampMs: ms,
      tickId,
      eventType: ok ? 'verified' : 'failed_verify',
      success: ok,
      details: { atPos },
    });
    return ok;
  }

  markUsed(
    assetId: string,
    tickId: number,
    ms: number,
    details?: Record<string, unknown>,
  ): void {
    this.appendEvidence(assetId, {
      timestampMs: ms,
      tickId,
      eventType: 'used',
      success: true,
      details,
    });
  }

  markPlaced(assetId: string, tickId: number, ms: number): void {
    this.appendEvidence(assetId, {
      timestampMs: ms,
      tickId,
      eventType: 'placed',
      success: true,
    });
  }

  private recomputeDerived(claim: AssetClaim): void {
    const recent = claim.evidence.slice(-20);
    const v = recent.filter(
      (e) => e.eventType === 'verified' && e.success,
    ).length;
    const u = recent.filter((e) => e.eventType === 'used' && e.success).length;
    const f = recent.filter(
      (e) =>
        (e.eventType === 'failed_verify' || e.eventType === 'failed_use') &&
        !e.success,
    ).length;

    claim.confidence = Math.max(0, Math.min(1, 0.2 + 0.08 * v + 0.05 * u - 0.15 * f));

    const hi = new Set(['bed', 'crafting_table', 'furnace', 'blast_furnace']);
    claim.value = hi.has(claim.subType) ? 0.8 : 0.5;

    const denom = v + u + f;
    const successRate = denom === 0 ? 1 : (v + u) / denom;

    const usedCount = claim.evidence.filter(
      (e) => e.eventType === 'used' && e.success,
    ).length;
    const verifiedCount = claim.evidence.filter(
      (e) => e.eventType === 'verified' && e.success,
    ).length;
    const placedCount = claim.evidence.filter(
      (e) => e.eventType === 'placed' && e.success,
    ).length;

    const recentWindow = claim.evidence.slice(
      -MYELIN_THRESHOLDS.L2_TO_L3.recentWindowEntries,
    );
    const recentFailures = recentWindow.filter(
      (e) =>
        (e.eventType === 'failed_verify' || e.eventType === 'failed_use') &&
        !e.success,
    ).length;

    // Streak-based demotions: use streakStartLevel to determine which demotion
    // rule applies. This prevents cascading (e.g., L3 maintenance->L2 on fail 1,
    // then L2 streak->L1 on fail 2, then L1 streak->L0 on fail 3). The streak
    // rules should be evaluated against the level when the streak *started*.
    const ssl = claim.streakStartLevel;

    if (
      ssl === 3 &&
      claim.failureStreak >=
        MYELIN_THRESHOLDS.DEMOTION_FAILURES.L3_TO_L1.consecutiveFailures
    ) {
      claim.myelinLevel = 1;
    } else if (
      ssl === 2 &&
      claim.failureStreak >=
        MYELIN_THRESHOLDS.DEMOTION_FAILURES.L2_TO_L1.consecutiveFailures
    ) {
      claim.myelinLevel = 1;
    } else if (
      ssl === 1 &&
      claim.failureStreak >=
        MYELIN_THRESHOLDS.DEMOTION_FAILURES.L1_TO_L0.consecutiveFailures
    ) {
      claim.myelinLevel = 0;
    }

    // L3 maintenance: if currently at L3 and L3 criteria no longer hold (e.g.,
    // recent failure in window), demote to L2. This fires even during a streak —
    // a single failure invalidates L3 criteria — but streak-based rules above
    // take priority if they already fired.
    if (claim.myelinLevel === 3) {
      const l3Holds =
        usedCount >= MYELIN_THRESHOLDS.L2_TO_L3.minUses &&
        recentFailures <= MYELIN_THRESHOLDS.L2_TO_L3.maxRecentFailures &&
        claim.value >= MYELIN_THRESHOLDS.L2_TO_L3.minValueScore &&
        successRate >= MYELIN_THRESHOLDS.L2_TO_L3.minSuccessRate;
      if (!l3Holds) {
        claim.myelinLevel = 2;
      }
    }

    // Promotions: only when failureStreak is 0 (no active degradation)
    if (claim.failureStreak === 0) {
      if (claim.myelinLevel === 0) {
        if (
          verifiedCount >= MYELIN_THRESHOLDS.L0_TO_L1.minVerifications ||
          usedCount >= MYELIN_THRESHOLDS.L0_TO_L1.minUses ||
          placedCount >= 1
        ) {
          claim.myelinLevel = 1;
        }
      }

      if (claim.myelinLevel === 1) {
        const placedByBot = placedCount >= 1;
        const vs = claim.evidence.filter(
          (e) => e.eventType === 'verified' && e.success,
        );
        const firstV = vs.length ? vs[0]!.tickId : null;
        const lastV = vs.length ? vs[vs.length - 1]!.tickId : null;
        const sepOK =
          firstV !== null &&
          lastV !== null &&
          lastV - firstV >= MYELIN_THRESHOLDS.L1_TO_L2.OR.minTimeSeparationTicks;

        const orOK =
          usedCount >= MYELIN_THRESHOLDS.L1_TO_L2.OR.minSuccessfulUses &&
          verifiedCount >= MYELIN_THRESHOLDS.L1_TO_L2.OR.minVerifications &&
          sepOK;

        if ((MYELIN_THRESHOLDS.L1_TO_L2.placedByBotPromotes && placedByBot) || orOK) {
          claim.myelinLevel = 2;
        }
      }

      if (claim.myelinLevel === 2) {
        if (
          usedCount >= MYELIN_THRESHOLDS.L2_TO_L3.minUses &&
          recentFailures <= MYELIN_THRESHOLDS.L2_TO_L3.maxRecentFailures &&
          claim.value >= MYELIN_THRESHOLDS.L2_TO_L3.minValueScore &&
          successRate >= MYELIN_THRESHOLDS.L2_TO_L3.minSuccessRate
        ) {
          claim.myelinLevel = 3;
        }
      }
    }
  }

  findNearest(opts: {
    dimension: string;
    fromPos: Vec3i;
    subType?: string;
    tag?: string;
    maxChunkRadius: number;
    topK: number;
    verifyTick: number;
    verifyMs: number;
  }): AssetClaim | null {
    const fromChunk = chunkFromPos(opts.fromPos);
    const candidates: string[] = [];

    for (let r = 0; r <= opts.maxChunkRadius; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
          const ck = this.chunkKey(opts.dimension, {
            cx: fromChunk.cx + dx,
            cz: fromChunk.cz + dz,
          });
          const ids = this.chunkIndex.get(ck);
          if (!ids) continue;
          for (const id of ids) candidates.push(id);
        }
      }
    }

    const filtered = candidates.filter((id) => {
      if (opts.subType && !this.typeIndex.get(opts.subType)?.has(id)) return false;
      if (opts.tag && !this.typeIndex.get(opts.tag)?.has(id)) return false;
      return true;
    });

    const unique = Array.from(new Set(filtered))
      .map((id) => this.byId.get(id)!)
      .filter(Boolean);

    unique.sort((a, b) => {
      const da = dist(opts.fromPos, a.location.blockPos);
      const db = dist(opts.fromPos, b.location.blockPos);
      if (da !== db) return da - db;
      if (a.myelinLevel !== b.myelinLevel) return b.myelinLevel - a.myelinLevel;
      if (a.confidence !== b.confidence) return b.confidence - a.confidence;
      const lauA = a.lastUsedAtTick ?? -1;
      const lauB = b.lastUsedAtTick ?? -1;
      return lauB - lauA;
    });

    for (const claim of unique.slice(0, opts.topK)) {
      const ok = this.verifyOnUse(
        claim.assetId,
        opts.verifyTick,
        opts.verifyMs,
        claim.location.blockPos,
      );
      if (ok) return claim;
    }
    return null;
  }

  /**
   * Read-only spatial lookup: find a claim near a position without
   * triggering verify-on-use or mutating any state.
   * Used by the evidence adapter to resolve attribution.
   */
  resolveByPosition(opts: {
    dimension: string;
    pos: Vec3i;
    subType?: string;
    assetType?: AssetType;
    maxDistance?: number;
  }): AssetClaim | null {
    const maxDist = opts.maxDistance ?? 2;
    const fromChunk = chunkFromPos(opts.pos);
    const chunkRadius = Math.max(1, Math.ceil(maxDist / 16));
    const candidates: AssetClaim[] = [];

    for (let dx = -chunkRadius; dx <= chunkRadius; dx++) {
      for (let dz = -chunkRadius; dz <= chunkRadius; dz++) {
        const ck = this.chunkKey(opts.dimension, {
          cx: fromChunk.cx + dx,
          cz: fromChunk.cz + dz,
        });
        const ids = this.chunkIndex.get(ck);
        if (!ids) continue;
        for (const id of ids) {
          const claim = this.byId.get(id);
          if (!claim) continue;
          if (opts.subType && claim.subType !== opts.subType) continue;
          if (opts.assetType && claim.assetType !== opts.assetType) continue;
          if (dist(opts.pos, claim.location.blockPos) <= maxDist) {
            candidates.push(claim);
          }
        }
      }
    }

    if (candidates.length === 0) return null;
    // Prefer exact match, then nearest
    candidates.sort((a, b) => {
      const da = dist(opts.pos, a.location.blockPos);
      const db = dist(opts.pos, b.location.blockPos);
      return da - db;
    });
    return candidates[0]!;
  }

  enforceBudget(
    subType: string,
    baseId: string | undefined,
  ): { ok: boolean; reason?: string } {
    const budget = ASSET_BUDGETS[subType];
    if (!budget) return { ok: true };

    const all = this.all().filter((c) => c.subType === subType);
    if (all.length >= budget.maxGlobal)
      return { ok: false, reason: 'budget.global' };

    if (baseId) {
      const inBase = all.filter((c) => c.location.baseId === baseId);
      if (inBase.length >= budget.maxPerBase)
        return { ok: false, reason: 'budget.base' };
    }
    return { ok: true };
  }

  placeVsReuseGate(opts: {
    subType: string;
    dimension: string;
    fromPos: Vec3i;
    baseId?: string;
    reuseRadius: number;
    verifyTick: number;
    verifyMs: number;
  }): PlaceVsReuseResult {
    const maxChunks = Math.max(1, Math.ceil(opts.reuseRadius / 16));
    const found = this.findNearest({
      dimension: opts.dimension,
      fromPos: opts.fromPos,
      subType: opts.subType,
      maxChunkRadius: maxChunks,
      topK: 5,
      verifyTick: opts.verifyTick,
      verifyMs: opts.verifyMs,
    });

    if (found && dist(opts.fromPos, found.location.blockPos) <= opts.reuseRadius) {
      return { decision: 'reuse', assetId: found.assetId };
    }

    const budget = this.enforceBudget(opts.subType, opts.baseId);
    if (!budget.ok) return { decision: 'deny_budget' };
    return { decision: 'allow_place' };
  }

  expireByTTL(nowTick: number): void {
    for (const claim of this.byId.values()) {
      const ttl =
        claim.myelinLevel === 0
          ? MYELIN_THRESHOLDS.DECAY_TTL_TICKS.L0
          : claim.myelinLevel === 1
            ? MYELIN_THRESHOLDS.DECAY_TTL_TICKS.L1
            : Infinity;

      if (ttl === Infinity) continue;

      const lastTick = claim.evidence[claim.evidence.length - 1]!.tickId;
      if (nowTick - lastTick > ttl) this.removeFromIndex(claim);
    }
  }
}
