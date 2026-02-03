/**
 * Observation payload construction and related helpers.
 */

import {
  ObservationPayload,
  ObservationInsight,
} from '../environmental/observation-reasoner';

export interface ObservationQueueItem {
  observation: ObservationPayload;
  resolve: (insight: ObservationInsight) => void;
  reject: (err: unknown) => void;
  createdAt: number;
}

const POSITION_REDACTION_GRANULARITY = 5;

export const HOSTILE_KEYWORDS = [
  'zombie',
  'skeleton',
  'creeper',
  'spider',
  'witch',
  'enderman',
  'pillager',
  'vindicator',
  'evoker',
  'ravager',
  'phantom',
  'blaze',
  'ghast',
  'guardian',
  'warden',
];

export function redactPositionForLog(position?: { x: number; y: number; z: number }) {
  if (!position) return undefined;
  const round = (value: number) =>
    Math.round(value / POSITION_REDACTION_GRANULARITY) *
    POSITION_REDACTION_GRANULARITY;
  return {
    x: round(position.x),
    y: round(position.y),
    z: round(position.z),
  };
}

export function coerceNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

export function inferThreatLevel(
  name?: string
): 'unknown' | 'friendly' | 'neutral' | 'hostile' {
  if (!name) return 'unknown';
  const lowerName = name.toLowerCase();
  if (HOSTILE_KEYWORDS.some((keyword) => lowerName.includes(keyword))) {
    return 'hostile';
  }
  if (lowerName.includes('villager') || lowerName.includes('golem')) {
    return 'friendly';
  }
  if (
    lowerName.includes('cow') ||
    lowerName.includes('sheep') ||
    lowerName.includes('pig')
  ) {
    return 'neutral';
  }
  return 'unknown';
}

export function buildObservationPayload(
  raw: any,
  metadata: any = {}
): ObservationPayload | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  let bot = raw.bot || metadata?.bot || undefined;
  if (!bot || !bot.position) {
    // Try to get bot position from metadata
    if (metadata?.botPosition) {
      bot = { position: metadata.botPosition };
    } else {
      return null;
    }
  }

  const position = bot.position;
  if (
    position === undefined ||
    position.x === undefined ||
    position.y === undefined ||
    position.z === undefined
  ) {
    return null;
  }

  const observationId =
    typeof raw.observationId === 'string'
      ? raw.observationId
      : `obs-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const baseCategory =
    raw.category === 'environment' ? 'environment' : 'entity';
  const rawEntity = raw.entity || metadata?.entity;
  // Bot-adapter sends flat metadata (entityType, entityId, distance, position);
  // construct entity from that when raw.entity/metadata.entity is absent
  const entityFromMetadata =
    !rawEntity &&
    (metadata?.entityType ?? metadata?.entityId ?? metadata?.distance != null)
      ? {
          id: metadata?.entityId ?? observationId,
          name: metadata?.entityType ?? 'unknown',
          distance: coerceNumber(metadata?.distance),
          position: metadata?.position,
        }
      : undefined;
  const entity = rawEntity ?? entityFromMetadata;
  const event = raw.event ?? metadata?.event ?? undefined;

  const payload: ObservationPayload = {
    observationId,
    category: entity ? 'entity' : baseCategory,
    bot: {
      position: {
        x: Number(position.x) || 0,
        y: Number(position.y) || 0,
        z: Number(position.z) || 0,
      },
      health: coerceNumber(bot.health) || coerceNumber(metadata?.botHealth),
      food: coerceNumber(bot.food) || coerceNumber(metadata?.botFood),
      dimension: typeof bot.dimension === 'string' ? bot.dimension : undefined,
      gameMode: typeof bot.gameMode === 'string' ? bot.gameMode : undefined,
    },
    entity: entity
      ? {
          id: (entity.id ?? metadata?.entityId ?? observationId).toString(),
          name:
            typeof entity.name === 'string'
              ? entity.name
              : (metadata?.entityType ?? 'unknown'),
          displayName: entity.displayName,
          kind: entity.kind,
          threatLevel:
            entity.threatLevel ??
            metadata?.threatLevel ??
            inferThreatLevel(
              typeof entity.name === 'string'
                ? entity.name
                : metadata?.entityType
            ),
          distance:
            coerceNumber(entity.distance ?? metadata?.distance) ?? undefined,
          position: entity.position
            ? {
                x: Number(entity.position.x) || 0,
                y: Number(entity.position.y) || 0,
                z: Number(entity.position.z) || 0,
              }
            : metadata?.position
              ? {
                  x: Number(metadata.position.x) || 0,
                  y: Number(metadata.position.y) || 0,
                  z: Number(metadata.position.z) || 0,
                }
              : undefined,
          velocity: entity.velocity
            ? {
                x: Number(entity.velocity.x) || 0,
                y: Number(entity.velocity.y) || 0,
                z: Number(entity.velocity.z) || 0,
              }
            : undefined,
        }
      : undefined,
    event: event
      ? {
          type: event.type ?? metadata?.eventType ?? 'unknown',
          description: event.description ?? metadata?.description,
          severity: event.severity ?? metadata?.severity,
          position: event.position
            ? {
                x: Number(event.position.x) || 0,
                y: Number(event.position.y) || 0,
                z: Number(event.position.z) || 0,
              }
            : undefined,
        }
      : undefined,
    context:
      raw.context ??
      (metadata && Object.keys(metadata).length > 0 ? metadata : undefined),
    timestamp: coerceNumber(raw.timestamp) ?? Date.now(),
  };

  return payload;
}
