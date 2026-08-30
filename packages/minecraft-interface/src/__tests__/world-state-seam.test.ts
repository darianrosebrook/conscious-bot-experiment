/**
 * /state + /action seam contract tests (Phase 3 contract layer).
 *
 * The seam schema lives in @conscious-bot/executor-contracts; the builder
 * functions are the exact literals the /state handler serves. Provenance of
 * the negative fixture: real /state response captured from the running dev
 * server BEFORE the nearbyBlocks shape fix — it must stay invalid forever.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  WorldStateEnvelopeSchema,
  FullWorldStateSchema,
  ActionRequestSchema,
} from '@conscious-bot/executor-contracts';
import {
  buildFullStateEnvelope,
  buildBasicStateEnvelope,
  buildDegradedEnvelope,
} from '../world-state-response';

const FIXTURES = join(__dirname, 'fixtures');

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));
}

// Representative mapper world state — same shape the live handler feeds the
// builder (playerPosition tuple, hunger, _minecraftState buckets).
const representativeWs = {
  playerPosition: [-112.5, 98, 128.6751479927217],
  health: 6.5,
  hunger: 18,
  timeOfDay: 6000,
  weather: 'clear',
  nearbyLogs: 12,
  nearbyOres: 3,
  nearbyWater: 1,
  nearbyHostiles: 0,
  nearbyPassives: 4,
  _minecraftState: {
    player: { experience: 7, gameMode: 'survival', dimension: 'overworld' },
    environment: {
      nearbyBlocks: [
        {
          name: 'oak_log',
          type: 'oak_log',
          position: { x: 1, y: 64, z: 2 },
          hardness: 2.0,
          tool: 'axe',
        },
        { type: 'grass_block', position: { x: 0, y: 63, z: 0 } },
      ],
      nearbyBlockCounts: { oak_log: 3, grass_block: 40 },
      nearbyEntities: [
        {
          id: 123,
          type: 'cow',
          name: 'Cow',
          position: { x: 2, y: 64, z: 3 },
          health: 10,
        },
      ],
    },
  },
};

describe('/state seam: full branch', () => {
  it('builder output matches the committed golden fixture (modulo scan time)', () => {
    const envelope = buildFullStateEnvelope(
      representativeWs,
      { name: 'forest', temperature: 0.7, humidity: 0.8, category: 'forest', dimension: 'overworld' },
      { items: [{ type: 'dirt', count: 12, slot: 0 }], totalSlots: 36, usedSlots: 1 },
      true
    ) as Record<string, unknown>;
    const golden = loadFixture('world-state-full-captured.json') as Record<
      string,
      unknown
    >;
    // scannedAt is wall-clock at serve time — normalize before comparing.
    ((envelope as any).data.worldState.nearbyBlockSummary as any).scannedAt = 0;
    expect(envelope).toEqual(golden);
  });

  it('validates against the seam schema with positioned nearbyBlocks', () => {
    const envelope = buildFullStateEnvelope(
      representativeWs,
      { name: 'forest' },
      { items: [], totalSlots: 36, usedSlots: 0 },
      true
    );
    const parsed = WorldStateEnvelopeSchema.safeParse(envelope);
    expect(parsed.success).toBe(true);
    // THE incident assertion: the consumer (verifyNearbyBlock) unwraps
    // data.worldState.environment.nearbyBlocks and indexes .position.
    const blocks = (envelope as any).data.worldState.environment.nearbyBlocks;
    expect(blocks.length).toBeGreaterThan(0);
    for (const b of blocks) {
      expect(b.position).toEqual(
        expect.objectContaining({ x: expect.any(Number), y: expect.any(Number), z: expect.any(Number) })
      );
    }
  });

  it('biome-unknown fallback (absent temperature/humidity/category) still validates', () => {
    // detectBiome's catch branch returns only { name: 'unknown' }.
    const envelope = buildFullStateEnvelope(
      representativeWs,
      { name: 'unknown' },
      { items: [], totalSlots: 36, usedSlots: 0 },
      true
    );
    expect(WorldStateEnvelopeSchema.safeParse(envelope).success).toBe(true);
  });
});

describe('/state seam: minimal + degraded branches', () => {
  it('basic envelope (interface unavailable) validates', () => {
    const envelope = buildBasicStateEnvelope(
      { bot: { position: { x: 1, y: 64, z: 2 }, health: 20, food: 20 } },
      true
    );
    const parsed = WorldStateEnvelopeSchema.safeParse(envelope);
    expect(parsed.success).toBe(true);
  });

  it('degraded envelope (bot gone) validates', () => {
    expect(
      WorldStateEnvelopeSchema.safeParse(buildDegradedEnvelope('disconnected'))
        .success
    ).toBe(true);
  });
});

describe('/state seam: pre-fix drifted payload must stay invalid', () => {
  it('rejects the captured legacy payload (string-list nearbyBlocks era)', () => {
    const drifted = loadFixture('world-state-drifted-legacy.json');
    // Envelope level: no union branch accepts the legacy shape.
    const parsed = WorldStateEnvelopeSchema.safeParse(drifted);
    expect(parsed.success).toBe(false);
    // Incident level: the legacy worldState lacks the positioned
    // environment.nearbyBlocks the consumer unwraps.
    const ws = (drifted as any)?.data?.worldState;
    const wsParsed = FullWorldStateSchema.safeParse(ws);
    expect(wsParsed.success).toBe(false);
    const paths = wsParsed.success
      ? []
      : wsParsed.error.issues.map((i) => i.path.join('.'));
    expect(paths.some((p) => p.endsWith('nearbyBlocks'))).toBe(true);
    // And the consumer's unwrap path yields nothing usable on it.
    expect(ws?.environment?.nearbyBlocks).toBeUndefined();
  });
});

describe('/action seam: request envelope', () => {
  it('accepts a well-formed action request', () => {
    expect(
      ActionRequestSchema.safeParse({
        type: 'dig_block',
        parameters: { blockType: 'oak_log', count: 1 },
      }).success
    ).toBe(true);
  });

  it('tolerates extra envelope fields (passthrough)', () => {
    expect(
      ActionRequestSchema.safeParse({ type: 'chat', source: 'dashboard' })
        .success
    ).toBe(true);
  });

  it('rejects missing, empty, and non-string type', () => {
    expect(ActionRequestSchema.safeParse({}).success).toBe(false);
    expect(ActionRequestSchema.safeParse({ type: '' }).success).toBe(false);
    expect(ActionRequestSchema.safeParse({ type: 42 }).success).toBe(false);
  });

  it('rejects non-object parameters', () => {
    expect(
      ActionRequestSchema.safeParse({ type: 'chat', parameters: 'hi' }).success
    ).toBe(false);
  });
});
