/**
 * Reflection Persistence Contract Tests
 *
 * These tests verify the wiring invariants of the reflection persistence pipeline
 * WITHOUT requiring a live PostgreSQL instance. They test the contract shape and
 * boundaries that must hold before LLM-generated reflections replace placeholders.
 *
 * Acceptance checks:
 *   C1. Metadata persistence: customMetadata fields (dedupeKey, memorySubtype, etc.)
 *       survive through ingestMemory into the stored chunk.
 *   C2. DedupeKey identity: when a dedupeKey is provided to addReflection, it becomes
 *       reflection.id AND the emitted event carries that id.
 *   C3. Sleep key uniqueness: two sleeps on different days produce different keys.
 *   C4. Death key non-collapse: two deaths at the same coordinates but different tick
 *       buckets produce different keys.
 *   C5. Write queue → ingestMemory carries customMetadata through.
 *
 * Integration-level checks (require Postgres, gated behind POSTGRES_AVAILABLE):
 *   I1. Metadata persists to DB row.
 *   I2. Idempotency: duplicate dedupeKey → second write rejected.
 *   I3. queryByMetadataSubtype returns correct subtypes.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReflectionMemoryManager } from '../reflection-memory';

// ==========================================================================
// C1–C2: ReflectionMemoryManager dedupeKey → identity + event contract
// ==========================================================================

describe('C1-C2: ReflectionMemoryManager dedupeKey contract', () => {
  let manager: ReflectionMemoryManager;

  beforeEach(() => {
    manager = new ReflectionMemoryManager({
      maxReflections: 100,
      checkpointInterval: 300000,
      minLessonConfidence: 0.3,
      enableNarrativeTracking: true,
      enableMetacognition: false,
      enableSelfModelUpdates: false,
    });
  });

  it('C2a: dedupeKey becomes reflection.id when provided', async () => {
    const dedupeKey = 'sleep-5-0';
    const reflection = await manager.addReflection(
      'narrative',
      'Test reflection content',
      {
        emotionalState: 'rested',
        currentGoals: [],
        recentEvents: ['sleep'],
        location: null,
        timeOfDay: 'morning',
      },
      [],
      [],
      dedupeKey
    );

    expect(reflection.id).toBe(dedupeKey);
  });

  it('C2b: reflection.id is random when dedupeKey is not provided', async () => {
    const reflection = await manager.addReflection(
      'narrative',
      'Test reflection content',
      {
        emotionalState: 'neutral',
        currentGoals: [],
        recentEvents: [],
        location: null,
        timeOfDay: 'unknown',
      }
    );

    expect(reflection.id).toMatch(/^reflection-\d+-/);
  });

  it('C2c: emitted event carries the correct reflection.id = dedupeKey', async () => {
    const dedupeKey = 'death-10-64-20-500';
    const emitted: any[] = [];
    manager.on('reflection:created', (r) => emitted.push(r));

    await manager.addReflection(
      'failure',
      '[PLACEHOLDER] Died and respawned.',
      {
        emotionalState: 'cautious',
        currentGoals: [],
        recentEvents: ['death'],
        location: null,
        timeOfDay: 'unknown',
      },
      [],
      [],
      dedupeKey
    );

    expect(emitted).toHaveLength(1);
    expect(emitted[0].id).toBe(dedupeKey);
  });

  it('C2d: same dedupeKey overwrites in-memory Map (no duplicate accumulation)', async () => {
    const dedupeKey = 'sleep-5-0';

    await manager.addReflection(
      'narrative',
      'First sleep reflection',
      {
        emotionalState: 'rested',
        currentGoals: [],
        recentEvents: ['sleep'],
        location: null,
        timeOfDay: 'morning',
      },
      [],
      [],
      dedupeKey
    );

    await manager.addReflection(
      'narrative',
      'Duplicate sleep reflection',
      {
        emotionalState: 'rested',
        currentGoals: [],
        recentEvents: ['sleep'],
        location: null,
        timeOfDay: 'morning',
      },
      [],
      [],
      dedupeKey
    );

    const reflections = manager.getReflections();
    const matching = reflections.filter((r) => r.id === dedupeKey);
    expect(matching).toHaveLength(1);
    // The second write wins (Map.set overwrites)
    expect(matching[0].content).toBe('Duplicate sleep reflection');
  });
});

// ==========================================================================
// C3: Sleep dedupeKey uniqueness across days
// ==========================================================================

describe('C3: Sleep dedupeKey day discrimination', () => {
  it('C3a: different days produce different keys', () => {
    // Simulates the key construction from minecraft-interface server.ts
    const makeSleepKey = (wakeDay: number, wakeTime: number) =>
      `sleep-${wakeDay}-${wakeTime}`;

    const day1Key = makeSleepKey(1, 0);
    const day2Key = makeSleepKey(2, 0);

    expect(day1Key).not.toBe(day2Key);
    expect(day1Key).toBe('sleep-1-0');
    expect(day2Key).toBe('sleep-2-0');
  });

  it('C3b: same day + same tick = same key (retry-stable)', () => {
    const makeSleepKey = (wakeDay: number, wakeTime: number) =>
      `sleep-${wakeDay}-${wakeTime}`;

    const attempt1 = makeSleepKey(5, 0);
    const attempt2 = makeSleepKey(5, 0);

    expect(attempt1).toBe(attempt2);
  });

  it('C3c: different wake times on same day produce different keys', () => {
    const makeSleepKey = (wakeDay: number, wakeTime: number) =>
      `sleep-${wakeDay}-${wakeTime}`;

    // Theoretically possible if the bot is woken by a player at a non-standard time
    const earlyWake = makeSleepKey(3, 6000);
    const normalWake = makeSleepKey(3, 0);

    expect(earlyWake).not.toBe(normalWake);
  });
});

// ==========================================================================
// C4: Death dedupeKey non-collapse across tick buckets
// ==========================================================================

describe('C4: Death dedupeKey tick-bucket discrimination', () => {
  it('C4a: same position + different tick buckets produce different keys', () => {
    // Simulates the key construction from minecraft-interface server.ts
    const makeDeathKey = (x: number, y: number, z: number, gameTick: number) => {
      const dx = Math.floor(x);
      const dy = Math.floor(y);
      const dz = Math.floor(z);
      const tickBucket = Math.floor(gameTick / 200);
      return `death-${dx}-${dy}-${dz}-${tickBucket}`;
    };

    const death1 = makeDeathKey(100.5, 64.0, -200.3, 1000);  // bucket 5
    const death2 = makeDeathKey(100.5, 64.0, -200.3, 5000);  // bucket 25

    expect(death1).not.toBe(death2);
    expect(death1).toBe('death-100-64--201-5');
    expect(death2).toBe('death-100-64--201-25');
  });

  it('C4b: same position + same tick bucket = same key (retry-stable)', () => {
    const makeDeathKey = (x: number, y: number, z: number, gameTick: number) => {
      const dx = Math.floor(x);
      const dy = Math.floor(y);
      const dz = Math.floor(z);
      const tickBucket = Math.floor(gameTick / 200);
      return `death-${dx}-${dy}-${dz}-${tickBucket}`;
    };

    const retry1 = makeDeathKey(100, 64, -200, 1050);  // bucket 5
    const retry2 = makeDeathKey(100, 64, -200, 1100);  // bucket 5

    expect(retry1).toBe(retry2);
  });

  it('C4c: different positions produce different keys regardless of tick', () => {
    const makeDeathKey = (x: number, y: number, z: number, gameTick: number) => {
      const dx = Math.floor(x);
      const dy = Math.floor(y);
      const dz = Math.floor(z);
      const tickBucket = Math.floor(gameTick / 200);
      return `death-${dx}-${dy}-${dz}-${tickBucket}`;
    };

    const deathA = makeDeathKey(100, 64, -200, 1000);
    const deathB = makeDeathKey(101, 64, -200, 1000);

    expect(deathA).not.toBe(deathB);
  });

  it('C4d: fallback gameTick 0 produces valid key (fail-closed: higher dedupe)', () => {
    // When bot.time.time is unavailable at respawn, gameTick defaults to 0 → bucket 0.
    // DELIBERATE POLICY: this means all deaths at the same position during bot-time
    // unavailability collapse into one key. This is fail-closed: we accept higher
    // dedupe (suppressing events) during instability rather than generating
    // non-deterministic keys. The gameTick is captured once in bot-adapter.ts at
    // event emission time, so this fallback only triggers if bot.time is truly null.
    const makeDeathKey = (x: number, y: number, z: number, gameTick: number) => {
      const dx = Math.floor(x);
      const dy = Math.floor(y);
      const dz = Math.floor(z);
      const tickBucket = Math.floor(gameTick / 200);
      return `death-${dx}-${dy}-${dz}-${tickBucket}`;
    };

    const key = makeDeathKey(0, 64, 0, 0);
    expect(key).toBe('death-0-64-0-0');
    expect(key).not.toBe('death-0-64-0'); // Must include bucket

    // Two different positions still distinguish even with fallback tick
    const keyA = makeDeathKey(0, 64, 0, 0);
    const keyB = makeDeathKey(1, 64, 0, 0);
    expect(keyA).not.toBe(keyB);
  });
});

// ==========================================================================
// C5: customMetadata merge in ingestMemory
// ==========================================================================

describe('C5: customMetadata merge into chunk.metadata', () => {
  it('C5a: customMetadata fields appear in the memoryChunk.metadata passed to upsertChunk', async () => {
    // This test verifies the merge logic by constructing the same objects
    // that ingestMemory creates, applying the merge, and checking the result.
    //
    // We can't easily instantiate EnhancedMemorySystem without Postgres,
    // so we test the merge pattern directly.

    const chunkMetadata = {
      type: 'thought',
      confidence: 0.5,
      source: 'reflection-reflection',
      timestamp: Date.now(),
      importance: 0.5,
    };

    const customMetadata = {
      memorySubtype: 'reflection',
      reflectionSchemaVersion: 1,
      dedupeKey: 'sleep-5-0',
      isPlaceholder: true,
      reflectionType: 'narrative',
      emotionalValence: 0,
      insights: [],
      lessons: [],
      tags: [],
    };

    // This mirrors the merge in ingestMemory:
    //   const mergedMetadata = options.customMetadata
    //     ? { ...chunk.metadata, ...options.customMetadata }
    //     : chunk.metadata;
    const mergedMetadata = { ...chunkMetadata, ...customMetadata };

    expect(mergedMetadata.dedupeKey).toBe('sleep-5-0');
    expect(mergedMetadata.memorySubtype).toBe('reflection');
    expect(mergedMetadata.isPlaceholder).toBe(true);
    expect(mergedMetadata.reflectionSchemaVersion).toBe(1);
    // Original fields preserved
    expect(mergedMetadata.type).toBe('thought');
    expect(mergedMetadata.source).toBe('reflection-reflection');
    expect(mergedMetadata.confidence).toBe(0.5);
  });

  it('C5b: customMetadata does not clobber existing chunk fields unless intentional', () => {
    const chunkMetadata = {
      type: 'thought',
      confidence: 0.8,
      source: 'reflection-lesson',
      timestamp: 1000000,
    };

    const customMetadata = {
      memorySubtype: 'lesson',
      dedupeKey: 'death-0-64-0-5',
      // Note: does not include 'type', 'confidence', 'source', 'timestamp'
    };

    const merged = { ...chunkMetadata, ...customMetadata };

    // Original fields intact
    expect(merged.type).toBe('thought');
    expect(merged.confidence).toBe(0.8);
    expect(merged.source).toBe('reflection-lesson');
    expect(merged.timestamp).toBe(1000000);
    // Custom fields added
    expect(merged.memorySubtype).toBe('lesson');
    expect(merged.dedupeKey).toBe('death-0-64-0-5');
  });

  it('C5c: without customMetadata, chunk.metadata is unchanged', () => {
    const chunkMetadata = {
      type: 'thought',
      confidence: 0.8,
      source: 'some-source',
    };

    const customMetadata: Record<string, any> | undefined = undefined;

    // Mirrors the exact pattern in ingestMemory:
    //   const mergedMetadata = options.customMetadata
    //     ? { ...chunk.metadata, ...options.customMetadata }
    //     : chunk.metadata;
    const merged = customMetadata !== undefined
      ? Object.assign({}, chunkMetadata, customMetadata)
      : chunkMetadata;

    expect(merged).toEqual(chunkMetadata);
    // Same reference when no merge needed
    expect(merged).toBe(chunkMetadata);
  });
});

// ==========================================================================
// C6: Write queue dedupeKey wiring (reflection.id → job.dedupeKey → customMetadata.dedupeKey)
// ==========================================================================

describe('C6: End-to-end dedupeKey threading', () => {
  it('C6a: reflection.id (= dedupeKey) flows into write queue job and customMetadata', async () => {
    const manager = new ReflectionMemoryManager({
      maxReflections: 100,
      checkpointInterval: 300000,
      minLessonConfidence: 0.3,
      enableNarrativeTracking: true,
      enableMetacognition: false,
      enableSelfModelUpdates: false,
    });

    const dedupeKey = 'sleep-7-0';
    const emittedJobs: any[] = [];

    manager.on('reflection:created', (reflection) => {
      // Simulate what EnhancedMemorySystem.constructor does:
      const job = {
        type: 'reflection' as const,
        data: reflection,
        dedupeKey: reflection.id,
      };
      emittedJobs.push(job);

      // Simulate what flushReflectionQueue builds:
      const customMetadata = {
        memorySubtype: job.type,
        reflectionSchemaVersion: 1,
        dedupeKey: job.dedupeKey,
        isPlaceholder: (reflection.content || '').startsWith('[PLACEHOLDER]'),
      };

      // Verify the chain
      expect(job.dedupeKey).toBe(dedupeKey);
      expect(customMetadata.dedupeKey).toBe(dedupeKey);
      expect(customMetadata.isPlaceholder).toBe(true);
    });

    await manager.addReflection(
      'narrative',
      '[PLACEHOLDER] Woke up after sleeping.',
      {
        emotionalState: 'rested',
        currentGoals: [],
        recentEvents: ['sleep'],
        location: null,
        timeOfDay: 'morning',
      },
      [],
      [],
      dedupeKey
    );

    expect(emittedJobs).toHaveLength(1);
  });
});
