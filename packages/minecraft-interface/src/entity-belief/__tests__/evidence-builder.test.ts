import { describe, it, expect } from 'vitest';
import {
  buildEvidenceBatch,
  canonicalizeEvidence,
  toPosBucket,
  toDistBucket,
  kindToEnum,
} from '../evidence-builder';
import { EvidenceItem, ENTITY_KIND_ENUM } from '../types';

describe('toPosBucket', () => {
  it('floors positive coordinates to integer buckets', () => {
    expect(toPosBucket(3.7)).toBe(3);
    expect(toPosBucket(0.9)).toBe(0);
    expect(toPosBucket(10.0)).toBe(10);
  });

  it('floors negative coordinates correctly', () => {
    expect(toPosBucket(-0.1)).toBe(-1);
    expect(toPosBucket(-3.7)).toBe(-4);
  });
});

describe('toDistBucket', () => {
  it('buckets distance by DIST_BUCKET_SIZE (2)', () => {
    expect(toDistBucket(0)).toBe(0);
    expect(toDistBucket(1.9)).toBe(0);
    expect(toDistBucket(2.0)).toBe(1);
    expect(toDistBucket(3.5)).toBe(1);
    expect(toDistBucket(14.9)).toBe(7);
  });
});

describe('kindToEnum', () => {
  it('maps known hostile entities to their enum', () => {
    expect(kindToEnum('zombie')).toBe(ENTITY_KIND_ENUM.zombie);
    expect(kindToEnum('creeper')).toBe(ENTITY_KIND_ENUM.creeper);
    expect(kindToEnum('skeleton')).toBe(ENTITY_KIND_ENUM.skeleton);
  });

  it('maps known passive entities to their enum', () => {
    expect(kindToEnum('villager')).toBe(ENTITY_KIND_ENUM.villager);
    expect(kindToEnum('cow')).toBe(ENTITY_KIND_ENUM.cow);
  });

  it('maps unknown entities to unknown enum', () => {
    expect(kindToEnum('nonexistent_entity')).toBe(ENTITY_KIND_ENUM.unknown);
  });
});

describe('canonicalizeEvidence', () => {
  it('sorts by distBucket, then posBucketX/Y/Z, then kindEnum', () => {
    const items: EvidenceItem[] = [
      makeItem({ distBucket: 3, posBucketX: 1, kindEnum: 2 }),
      makeItem({ distBucket: 1, posBucketX: 5, kindEnum: 1 }),
      makeItem({ distBucket: 1, posBucketX: 2, kindEnum: 3 }),
    ];

    const sorted = canonicalizeEvidence(items);

    expect(sorted[0].distBucket).toBe(1);
    expect(sorted[0].posBucketX).toBe(2);
    expect(sorted[1].distBucket).toBe(1);
    expect(sorted[1].posBucketX).toBe(5);
    expect(sorted[2].distBucket).toBe(3);
  });

  it('does not mutate the input array', () => {
    const items: EvidenceItem[] = [
      makeItem({ distBucket: 3 }),
      makeItem({ distBucket: 1 }),
    ];
    const original = [...items];
    canonicalizeEvidence(items);
    expect(items[0].distBucket).toBe(original[0].distBucket);
  });

  it('produces deterministic order on identical inputs', () => {
    const items: EvidenceItem[] = [
      makeItem({ distBucket: 2, posBucketX: 3, kindEnum: 1 }),
      makeItem({ distBucket: 1, posBucketX: 5, kindEnum: 2 }),
    ];
    const a = canonicalizeEvidence(items);
    const b = canonicalizeEvidence(items);
    expect(a.map(i => i.distBucket)).toEqual(b.map(i => i.distBucket));
    expect(a.map(i => i.kindEnum)).toEqual(b.map(i => i.kindEnum));
  });
});

describe('buildEvidenceBatch', () => {
  it('filters entities within 15 blocks', () => {
    const bot = makeBotWithEntities([
      { id: 1, name: 'zombie', x: 5, y: 64, z: 5 },   // ~7.07 blocks
      { id: 2, name: 'skeleton', x: 20, y: 64, z: 20 }, // ~28 blocks (too far)
    ]);

    const batch = buildEvidenceBatch(bot, 1);

    expect(batch.items.length).toBe(1);
    expect(batch.items[0].kind).toBe('zombie');
    expect(batch.items[0].engineId).toBe(1);
  });

  it('excludes items (drops) and self', () => {
    const bot = makeBotWithEntities([
      { id: 1, name: 'zombie', x: 5, y: 64, z: 0 },
      { id: 2, name: 'item', x: 3, y: 64, z: 0 },
      { id: 99, name: 'player', x: 0, y: 64, z: 0 }, // bot entity
    ]);
    // Bot self ID
    bot.entity.id = 99;

    const batch = buildEvidenceBatch(bot, 1);

    expect(batch.items.length).toBe(1);
    expect(batch.items[0].kind).toBe('zombie');
  });

  it('uses integer buckets for position and distance', () => {
    const bot = makeBotWithEntities([
      { id: 1, name: 'zombie', x: 3.7, y: 64.2, z: -1.3 },
    ]);

    const batch = buildEvidenceBatch(bot, 1);

    expect(batch.items[0].posBucketX).toBe(3);
    expect(batch.items[0].posBucketY).toBe(64);
    expect(batch.items[0].posBucketZ).toBe(-2);
    expect(typeof batch.items[0].distBucket).toBe('number');
    expect(Number.isInteger(batch.items[0].distBucket)).toBe(true);
  });

  it('returns canonically sorted items', () => {
    const bot = makeBotWithEntities([
      { id: 1, name: 'zombie', x: 10, y: 64, z: 0 },    // farther
      { id: 2, name: 'skeleton', x: 3, y: 64, z: 0 },   // closer
    ]);

    const batch = buildEvidenceBatch(bot, 1);

    // Closer entity should sort first (lower distBucket)
    expect(batch.items[0].distBucket).toBeLessThanOrEqual(batch.items[1].distBucket);
  });

  it('enriches LOS from provided results map', () => {
    const bot = makeBotWithEntities([
      { id: 1, name: 'zombie', x: 5, y: 64, z: 0 },
      { id: 2, name: 'skeleton', x: 3, y: 64, z: 0 },
    ]);

    const losResults = new Map<number, boolean>([
      [1, true],
      [2, false],
    ]);

    const batch = buildEvidenceBatch(bot, 1, losResults);

    const zombie = batch.items.find(i => i.kind === 'zombie')!;
    const skeleton = batch.items.find(i => i.kind === 'skeleton')!;
    expect(zombie.los).toBe('visible');
    expect(skeleton.los).toBe('occluded');
  });

  it('defaults LOS to unknown when no LOS results provided', () => {
    const bot = makeBotWithEntities([
      { id: 1, name: 'zombie', x: 5, y: 64, z: 0 },
    ]);

    const batch = buildEvidenceBatch(bot, 1);

    expect(batch.items[0].los).toBe('unknown');
  });

  it('sets tickId on the batch', () => {
    const bot = makeBotWithEntities([]);
    const batch = buildEvidenceBatch(bot, 42);
    expect(batch.tickId).toBe(42);
  });

  it('includes health in features when available', () => {
    const bot = makeBotWithEntities([
      { id: 1, name: 'zombie', x: 5, y: 64, z: 0, health: 10 },
    ]);

    const batch = buildEvidenceBatch(bot, 1);

    expect(batch.items[0].features.health).toBe(10);
  });
});

// ── Helpers ──────────────────────────────────────────────────────────

function makeItem(overrides: Partial<EvidenceItem> = {}): EvidenceItem {
  return {
    engineId: 0,
    kind: 'zombie',
    kindEnum: kindToEnum('zombie'),
    posBucketX: 0,
    posBucketY: 64,
    posBucketZ: 0,
    distBucket: 0,
    los: 'unknown',
    features: {},
    ...overrides,
  };
}

function makeBotWithEntities(
  entities: Array<{ id: number; name: string; x: number; y: number; z: number; health?: number }>
) {
  const entityMap: Record<number, any> = {};

  // Bot entity at origin
  entityMap[99] = {
    id: 99,
    name: 'player',
    type: 'player',
    position: { x: 0, y: 64, z: 0 },
  };

  for (const e of entities) {
    entityMap[e.id] = {
      id: e.id,
      name: e.name,
      type: e.name,
      position: { x: e.x, y: e.y, z: e.z },
      health: e.health,
    };
  }

  return {
    entity: { position: { x: 0, y: 64, z: 0 }, id: 99 },
    entities: entityMap,
  };
}
