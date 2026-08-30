/**
 * Service seam schemas — runtime-enforced wire contracts.
 *
 * These encode what the endpoints actually emit on the wire, not what a TS
 * interface aspires to. The `/state` envelope drifted once (nearbyBlocks went
 * from positioned blocks to a string name list) and the planning consumer
 * crashed at runtime while the type said otherwise; these schemas exist so
 * that class of drift fails at the seam, loudly, at the producer.
 */

import { z } from 'zod';

// ============================================================================
// Shared primitives
// ============================================================================

export const Vec3Schema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

export const MinecraftItemSchema = z.object({
  type: z.string(),
  count: z.number(),
  slot: z.number(),
  metadata: z.unknown().optional(),
});

export const InventorySchema = z.object({
  items: z.array(MinecraftItemSchema),
  totalSlots: z.number(),
  usedSlots: z.number(),
});

/** A block with its world position — the consumer-facing block shape. */
export const PositionedBlockSchema = z.object({
  type: z.string(),
  name: z.string().optional(),
  position: Vec3Schema,
  properties: z.record(z.unknown()).optional(),
  hardness: z.number().nullish(),
  tool: z.string().nullish(),
});

export const NearbyEntitySchema = z.object({
  id: z.number(),
  type: z.string(),
  name: z.string().optional(),
  position: Vec3Schema,
  health: z.number().nullish(),
});

// ============================================================================
// /state — world state payload (full branch, as emitted by the handler)
// ============================================================================

/**
 * The full-branch worldState: player + environment, with positioned blocks
 * under `environment.nearbyBlocks` and the legacy string name list kept as a
 * sibling alongside `nearbyBlockSummary`.
 */
export const FullWorldStateSchema = z
  .object({
    player: z.object({
      position: Vec3Schema,
      health: z.number(),
      food: z.number(),
      experience: z.number(),
      gameMode: z.string(),
      dimension: z.string(),
    }),
    environment: z.object({
      timeOfDay: z.number(),
      weather: z.string().nullish(),
      biome: z.string(),
      biomeTemperature: z.number().nullish(),
      biomeHumidity: z.number().nullish(),
      biomeCategory: z.string().nullish(),
      nearbyLogs: z.number(),
      nearbyOres: z.number(),
      nearbyWater: z.number(),
      nearbyHostiles: z.number(),
      nearbyPassives: z.number(),
      /** Positioned blocks — consumers index this by `.position`. */
      nearbyBlocks: z.array(PositionedBlockSchema),
    }),
    nearbyEntities: z.array(NearbyEntitySchema),
    /** Legacy string name list — kept deliberately, see nearbyBlockSummary. */
    nearbyBlocks: z.array(z.string()),
    nearbyBlockSummary: z.object({
      known: z.boolean(),
      types: z.array(z.string()),
      counts: z.record(z.number()),
      scannedAt: z.number(),
    }),
  })
  .passthrough();

/** Flat convenience projection served at `data.data` for direct readers. */
export const FlatStateProjectionSchema = z
  .object({
    position: Vec3Schema,
    health: z.number(),
    food: z.number(),
    inventory: InventorySchema,
    timeOfDay: z.number(),
    weather: z.string().nullish(),
    biome: z.string(),
    biomeTemperature: z.number().nullish(),
    biomeHumidity: z.number().nullish(),
    biomeCategory: z.string().nullish(),
    dimension: z.string(),
    nearbyHostiles: z.number(),
    nearbyPassives: z.number(),
    nearbyLogs: z.number(),
    nearbyOres: z.number(),
    nearbyWater: z.number(),
  })
  .passthrough();

export const PlanningContextSchema = z
  .object({
    currentGoals: z.array(z.unknown()),
    activeTasks: z.array(z.unknown()),
    recentEvents: z.array(z.unknown()),
    emotionalState: z.object({
      confidence: z.number(),
      anxiety: z.number(),
      excitement: z.number(),
      caution: z.number(),
    }),
  })
  .passthrough();

/** Full-branch `data`: worldState + status + flat projection + isAlive. */
export const FullStateDataSchema = z
  .object({
    worldState: FullWorldStateSchema,
    status: z.literal('connected'),
    data: FlatStateProjectionSchema,
    isAlive: z.boolean(),
  })
  .passthrough();

// ============================================================================
// /state — minimal branch (bot interface unavailable, degraded serve)
// ============================================================================

/** Minimal-branch worldState: the textbook shape with empty collections. */
export const BasicWorldStateSchema = z
  .object({
    player: z.object({
      position: Vec3Schema,
      health: z.number(),
      food: z.number(),
      experience: z.number(),
      gameMode: z.string(),
      dimension: z.string(),
    }),
    inventory: InventorySchema,
    environment: z.object({
      timeOfDay: z.number(),
      isRaining: z.boolean(),
      nearbyBlocks: z.array(z.unknown()),
      nearbyEntities: z.array(z.unknown()),
    }),
    server: z.object({
      playerCount: z.number(),
      difficulty: z.string(),
      version: z.string(),
      worldSeed: z.string().optional(),
      worldName: z.string().optional(),
    }),
  })
  .passthrough();

export const BasicStateDataSchema = z
  .object({
    worldState: BasicWorldStateSchema,
    planningContext: PlanningContextSchema,
  })
  .passthrough();

/** Degraded branch: flat vitals only, no worldState wrapper. */
export const DegradedStateDataSchema = z
  .object({
    position: Vec3Schema,
    health: z.number(),
    food: z.number(),
    inventory: InventorySchema,
  })
  .passthrough();

/**
 * 200-envelope for GET /state. All success branches share the wrapper; the
 * payload is a union of the three documented shapes.
 */
export const WorldStateEnvelopeSchema = z
  .object({
    success: z.literal(true),
    status: z.enum(['connected', 'dead', 'disconnected']),
    data: z.union([FullStateDataSchema, BasicStateDataSchema, DegradedStateDataSchema]),
    isAlive: z.boolean(),
    _meta: z
      .object({
        minimal: z.boolean(),
        reason: z.string(),
      })
      .optional(),
  })
  .passthrough();

export type WorldStateEnvelope = z.infer<typeof WorldStateEnvelopeSchema>;
export type FullStateData = z.infer<typeof FullStateDataSchema>;
export type BasicStateData = z.infer<typeof BasicStateDataSchema>;
export type DegradedStateData = z.infer<typeof DegradedStateDataSchema>;

// ============================================================================
// /action — request and response envelopes
// ============================================================================

export const ActionRequestSchema = z
  .object({
    type: z.string().min(1),
    parameters: z.record(z.unknown()).optional(),
  })
  .passthrough();

export const ActionAcceptedResponseSchema = z
  .object({
    success: z.literal(true),
    action: z.string(),
    result: z.unknown(),
  })
  .passthrough();

export const ActionErrorResponseSchema = z
  .object({
    success: z.literal(false),
    message: z.string(),
    error: z.string().optional(),
  })
  .passthrough();

export const ActionResponseSchema = z.union([
  ActionAcceptedResponseSchema,
  ActionErrorResponseSchema,
]);

export type ActionRequest = z.infer<typeof ActionRequestSchema>;
export type ActionResponse = z.infer<typeof ActionResponseSchema>;
