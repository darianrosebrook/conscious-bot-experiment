/**
 * Evidence Builder
 *
 * Converts raw mineflayer entity data into deterministic EvidenceBatch
 * with integer-bucketed spatial values and canonical sort order.
 */

import {
  EvidenceBatch,
  EvidenceItem,
  CanonicalEvidenceKey,
  POS_BUCKET_SIZE,
  DIST_BUCKET_SIZE,
  ENTITY_KIND_ENUM,
} from './types';

const MAX_DETECTION_DISTANCE = 15;

/** Integer-bucket a position coordinate. */
export function toPosBucket(v: number): number {
  return Math.floor(v / POS_BUCKET_SIZE);
}

/** Integer-bucket a distance value. */
export function toDistBucket(d: number): number {
  return Math.floor(d / DIST_BUCKET_SIZE);
}

/** Map entity name to numeric enum for deterministic sorting. */
export function kindToEnum(name: string): number {
  return ENTITY_KIND_ENUM[name] ?? ENTITY_KIND_ENUM.unknown;
}

/** Canonical sort key for deterministic evidence ordering. */
function evidenceSortKey(item: EvidenceItem): string {
  return [
    String(item.distBucket).padStart(4, '0'),
    String(item.posBucketX + 100000).padStart(6, '0'),
    String(item.posBucketY + 100000).padStart(6, '0'),
    String(item.posBucketZ + 100000).padStart(6, '0'),
    String(item.kindEnum).padStart(4, '0'),
  ].join(':');
}

/**
 * Sort evidence items in canonical order:
 * distBucket ASC, posBucketX ASC, posBucketY ASC, posBucketZ ASC, kindEnum ASC
 *
 * Returns a new sorted array (does not mutate input).
 */
export function canonicalizeEvidence(items: EvidenceItem[]): EvidenceItem[] {
  return [...items].sort((a, b) => {
    const ka = evidenceSortKey(a);
    const kb = evidenceSortKey(b);
    if (ka < kb) return -1;
    if (ka > kb) return 1;
    return 0;
  });
}

export interface LOSProvider {
  checkLineOfSight(targetPos: { x: number; y: number; z: number }): Promise<boolean>;
}

/**
 * Build an EvidenceBatch from the current mineflayer bot state.
 *
 * Filters entities by distance <= MAX_DETECTION_DISTANCE, excludes items
 * and the bot itself, maps to EvidenceItems with integer buckets, and
 * returns canonically sorted.
 */
export function buildEvidenceBatch(
  bot: {
    entity: { position: { x: number; y: number; z: number }; id?: number };
    entities: Record<
      string | number,
      {
        id: number;
        name?: string;
        type?: string;
        position: { x: number; y: number; z: number };
        health?: number;
      }
    >;
  },
  tickId: number,
  losResults?: Map<number, boolean>
): EvidenceBatch {
  const botPos = bot.entity.position;
  const items: EvidenceItem[] = [];

  for (const entity of Object.values(bot.entities)) {
    // Skip self
    if (entity.id === bot.entity.id) continue;
    // Skip items (drops)
    if (entity.name === 'item' || entity.type === 'item') continue;

    const dx = entity.position.x - botPos.x;
    const dy = entity.position.y - botPos.y;
    const dz = entity.position.z - botPos.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (distance > MAX_DETECTION_DISTANCE) continue;

    const kind = entity.name || entity.type || 'unknown';
    let los: EvidenceItem['los'] = 'unknown';
    if (losResults) {
      const hasLos = losResults.get(entity.id);
      if (hasLos === true) los = 'visible';
      else if (hasLos === false) los = 'occluded';
    }

    const features: Record<string, number | string> = {};
    if (entity.health !== undefined) {
      features.health = entity.health;
    }

    items.push({
      engineId: entity.id,
      kind,
      kindEnum: kindToEnum(kind),
      posBucketX: toPosBucket(entity.position.x),
      posBucketY: toPosBucket(entity.position.y),
      posBucketZ: toPosBucket(entity.position.z),
      distBucket: toDistBucket(distance),
      los,
      features,
    });
  }

  return {
    tickId,
    items: canonicalizeEvidence(items),
  };
}
