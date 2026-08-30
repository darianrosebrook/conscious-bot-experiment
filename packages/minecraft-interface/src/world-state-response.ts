/**
 * /state seam — payload assembly + schema enforcement.
 *
 * The envelope literals here are lifted verbatim from the /state handler in
 * server.ts. Every 200 response passes through `respondWithState`, which
 * validates the payload against WorldStateEnvelopeSchema before it leaves the
 * service: producer-side drift (the nearbyBlocks class) fails here, loudly,
 * instead of crashing an unrelated consumer.
 */

import type { Response } from 'express';
import {
  WorldStateEnvelopeSchema,
  type WorldStateEnvelope,
} from '@conscious-bot/executor-contracts';

/** Biome info as returned by detectBiome in server.ts. */
export interface BiomeInfo {
  name: string;
  temperature?: number;
  humidity?: number;
  category?: string;
  dimension?: string;
}

/** Loose inventory-state shape produced by extractInventoryState. */
export interface InventoryState {
  items: Array<{ type: string; count: number; slot: number }>;
  totalSlots: number;
  usedSlots: number;
}

/**
 * Validate and send a /state payload. Fail-closed: a payload that no longer
 * matches the seam schema is a producer bug — answer 500 with the schema
 * issues instead of serving a shape consumers will crash on.
 */
export function respondWithState(res: Response, payload: unknown): void {
  const parsed = WorldStateEnvelopeSchema.safeParse(payload);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 8).map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    }));
    console.error(
      '[minecraft-interface] /state payload failed seam schema:',
      JSON.stringify(issues)
    );
    res.status(500).json({
      success: false,
      message: 'internal state failed the /state seam schema',
      issues,
    });
    return;
  }
  res.json(payload as WorldStateEnvelope);
}

/**
 * Full branch: live bot, real world state. `ws` is the mapper's world state
 * (loosely typed at this boundary by design — the seam schema is the
 * enforcement, not a TS interface).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildFullStateEnvelope(
  ws: any,
  biome: BiomeInfo,
  inventoryState: InventoryState,
  isAlive: boolean
): unknown {
  return {
    success: true,
    status: isAlive ? 'connected' : 'dead',
    data: {
      worldState: {
        player: {
          position: {
            x: ws.playerPosition[0],
            y: ws.playerPosition[1],
            z: ws.playerPosition[2],
          },
          health: ws.health,
          food: ws.hunger,
          experience: ws._minecraftState?.player?.experience ?? 0,
          gameMode: ws._minecraftState?.player?.gameMode ?? 'survival',
          dimension: ws._minecraftState?.player?.dimension ?? 'overworld',
        },
        environment: {
          timeOfDay: ws.timeOfDay,
          weather: ws.weather,
          biome: biome.name,
          biomeTemperature: biome.temperature,
          biomeHumidity: biome.humidity,
          biomeCategory: biome.category,
          nearbyLogs: ws.nearbyLogs ?? 0,
          nearbyOres: ws.nearbyOres ?? 0,
          nearbyWater: ws.nearbyWater ?? 0,
          nearbyHostiles: ws.nearbyHostiles ?? 0,
          nearbyPassives: ws.nearbyPassives ?? 0,
          // Positioned blocks (name + coordinates) — kept alongside the string
          // name list at worldState.nearbyBlocks so consumers that need
          // positions (mini-map) don't have to guess.
          nearbyBlocks: ws._minecraftState?.environment?.nearbyBlocks ?? [],
        },
        nearbyEntities: (
          ws._minecraftState?.environment?.nearbyEntities ?? []
        ).slice(0, 10),
        nearbyBlocks: Object.keys(
          ws._minecraftState?.environment?.nearbyBlockCounts ?? {}
        ),
        nearbyBlockSummary: {
          known: ws._minecraftState?.environment != null,
          types: Object.keys(
            ws._minecraftState?.environment?.nearbyBlockCounts ?? {}
          ),
          counts: ws._minecraftState?.environment?.nearbyBlockCounts ?? {},
          scannedAt: Date.now(),
        },
      },
      status: 'connected',
      data: {
        position: {
          x: ws.playerPosition[0],
          y: ws.playerPosition[1],
          z: ws.playerPosition[2],
        },
        health: ws.health,
        food: ws.hunger,
        inventory: inventoryState,
        // Environment data surfaced for cognition to read directly
        timeOfDay: ws.timeOfDay,
        weather: ws.weather,
        biome: biome.name,
        biomeTemperature: biome.temperature,
        biomeHumidity: biome.humidity,
        biomeCategory: biome.category,
        dimension: ws._minecraftState?.player?.dimension ?? 'overworld',
        nearbyHostiles: ws.nearbyHostiles ?? 0,
        nearbyPassives: ws.nearbyPassives ?? 0,
        nearbyLogs: ws.nearbyLogs ?? 0,
        nearbyOres: ws.nearbyOres ?? 0,
        nearbyWater: ws.nearbyWater ?? 0,
      },
      isAlive: ws.health > 0,
    },
    isAlive,
  };
}

/**
 * Minimal branch: interface or bot adapter unavailable — serve the textbook
 * shape with empty collections, flagged via _meta.minimal.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildBasicStateEnvelope(
  executionStatus: any,
  isAlive: boolean
): unknown {
  return {
    success: true,
    status: isAlive ? 'connected' : 'dead',
    data: {
      worldState: {
        player: {
          position: executionStatus?.bot?.position || { x: 0, y: 64, z: 0 },
          health: executionStatus?.bot?.health || 20,
          food: executionStatus?.bot?.food || 20,
          experience: 0,
          gameMode: executionStatus?.bot?.gameMode || 'survival',
          dimension: executionStatus?.bot?.dimension || 'overworld',
        },
        inventory: {
          items: [],
          totalSlots: 36,
          usedSlots: 0,
        },
        environment: {
          timeOfDay: 0,
          isRaining: false,
          nearbyBlocks: [],
          nearbyEntities: [],
        },
        server: {
          playerCount: 1,
          difficulty: executionStatus?.bot?.server?.difficulty || 'normal',
          version: executionStatus?.bot?.server?.version || '1.21.9',
        },
      },
      planningContext: {
        currentGoals: [],
        activeTasks: [],
        recentEvents: [],
        emotionalState: {
          confidence: 0.5,
          anxiety: 0.1,
          excitement: 0.3,
          caution: 0.2,
        },
      },
    },
    isAlive,
    _meta: { minimal: true, reason: 'bot_unavailable' },
  };
}

/**
 * Degraded branch: bot instance gone — flat vitals only.
 */
export function buildDegradedEnvelope(reason: string): unknown {
  return {
    success: true,
    status: 'disconnected',
    data: {
      position: { x: 0, y: 64, z: 0 },
      health: 0,
      food: 0,
      inventory: {
        items: [],
        totalSlots: 36,
        usedSlots: 0,
      },
    },
    isAlive: false,
    _meta: { minimal: true, reason },
  };
}
