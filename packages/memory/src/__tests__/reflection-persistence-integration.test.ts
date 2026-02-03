/**
 * Reflection Persistence Integration Tests (I1–I3)
 *
 * Require a live PostgreSQL instance with pgvector.
 * Gated behind POSTGRES_AVAILABLE=true.
 *
 * These tests verify that the reflection persistence pipeline works end-to-end
 * against real PostgreSQL — complementing the unit-level contract tests in
 * reflection-persistence-contract.test.ts.
 *
 * I1: Metadata persists to DB row (dedupeKey, memorySubtype, isPlaceholder in JSONB).
 * I2: Idempotency — duplicate dedupeKey → second write rejected or single row.
 * I3: queryByMetadataSubtype returns correct subtypes with ordering.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  EnhancedVectorDatabase,
  EnhancedMemoryChunk,
} from '../vector-database';

const POSTGRES_AVAILABLE = process.env.POSTGRES_AVAILABLE === 'true';

// Helper: create a minimal valid chunk with the given metadata fields
function makeReflectionChunk(
  id: string,
  content: string,
  metadata: Record<string, any>
): EnhancedMemoryChunk {
  return {
    id,
    content,
    embedding: new Array(768).fill(0.1),
    metadata: {
      type: 'thought',
      confidence: 0.5,
      source: 'reflection-reflection',
      timestamp: Date.now(),
      importance: 0.5,
      ...metadata,
    },
    entities: [],
    relationships: [],
    decayProfile: {
      memoryType: 'semantic',
      baseDecayRate: 0.01,
      lastAccessed: Date.now(),
      accessCount: 1,
      importance: 0.5,
      consolidationHistory: [],
    },
    provenance: {
      sourceSystem: 'memory_system',
      extractionMethod: 'chunking',
      confidence: 0.9,
      processingTime: Date.now(),
      version: '1.0.0',
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

describe.skipIf(!POSTGRES_AVAILABLE)(
  'Reflection Persistence Integration (I1–I3)',
  () => {
    let db: EnhancedVectorDatabase;
    const tableName = 'enhanced_memory_chunks_test';

    beforeAll(async () => {
      db = new EnhancedVectorDatabase({
        host: 'localhost',
        port: 5432,
        user: 'conscious_bot',
        password: 'secure_password',
        database: 'conscious_bot_test',
        worldSeed: '12345',
        tableName,
        dimension: 768,
      });
      await db.initialize();
    });

    afterAll(async () => {
      await db.close();
    });

    beforeEach(async () => {
      const client = await db['pool'].connect();
      try {
        await client.query(`TRUNCATE TABLE ${tableName}`);
      } finally {
        client.release();
      }
    });

    // ================================================================
    // I1: Metadata persists to DB row
    // ================================================================

    describe('I1: Metadata persistence', () => {
      it('I1a: dedupeKey, memorySubtype, isPlaceholder survive round-trip to DB', async () => {
        const chunk = makeReflectionChunk('sleep-5-0', 'Test reflection', {
          dedupeKey: 'sleep-5-0',
          memorySubtype: 'reflection',
          isPlaceholder: true,
          reflectionSchemaVersion: 1,
        });

        await db.upsertChunk(chunk);

        // Read back via findByDedupeKey
        const found = await db.findByDedupeKey('sleep-5-0');
        expect(found).not.toBeNull();
        expect(found!.metadata.dedupeKey).toBe('sleep-5-0');
        expect(found!.metadata.memorySubtype).toBe('reflection');
        expect(found!.metadata.isPlaceholder).toBe(true);
        expect(found!.metadata.reflectionSchemaVersion).toBe(1);
      });

      it('I1b: metadata fields without dedupeKey do not appear in findByDedupeKey', async () => {
        const chunk = makeReflectionChunk('regular-memory-1', 'Just a thought', {
          // No dedupeKey
          memorySubtype: undefined,
        });

        await db.upsertChunk(chunk);

        const found = await db.findByDedupeKey('regular-memory-1');
        expect(found).toBeNull();
      });
    });

    // ================================================================
    // I2: Idempotency
    // ================================================================

    describe('I2: Idempotency via unique dedupeKey', () => {
      it('I2a: findByDedupeKey returns existing row (route-level dedupe)', async () => {
        const chunk = makeReflectionChunk('death-10-64-20-5', 'First death', {
          dedupeKey: 'death-10-64-20-5',
          memorySubtype: 'reflection',
        });

        await db.upsertChunk(chunk);

        // Simulate what POST /enhanced/reflections does: check first
        const exists = await db.findByDedupeKey('death-10-64-20-5');
        expect(exists).not.toBeNull();
        expect(exists!.content).toBe('First death');
      });

      it('I2b: unique index rejects second chunk with same dedupeKey but different id', async () => {
        const chunk1 = makeReflectionChunk('chunk-id-1', 'First write', {
          dedupeKey: 'sleep-3-0',
          memorySubtype: 'reflection',
        });

        const chunk2 = makeReflectionChunk('chunk-id-2', 'Duplicate write', {
          dedupeKey: 'sleep-3-0',
          memorySubtype: 'reflection',
        });

        await db.upsertChunk(chunk1);

        // Second upsert with different id but same dedupeKey should fail
        // due to the unique partial index on metadata->>'dedupeKey'
        await expect(db.upsertChunk(chunk2)).rejects.toThrow();

        // Verify only one row exists
        const found = await db.findByDedupeKey('sleep-3-0');
        expect(found).not.toBeNull();
        expect(found!.id).toBe('chunk-id-1');
        expect(found!.content).toBe('First write');
      });

      it('I2c: same id + same dedupeKey does upsert (update, not reject)', async () => {
        const chunk1 = makeReflectionChunk('sleep-5-0', 'Original content', {
          dedupeKey: 'sleep-5-0',
          memorySubtype: 'reflection',
        });

        const chunk2 = makeReflectionChunk('sleep-5-0', 'Updated content', {
          dedupeKey: 'sleep-5-0',
          memorySubtype: 'reflection',
        });

        await db.upsertChunk(chunk1);
        await db.upsertChunk(chunk2); // Same id → ON CONFLICT (id) DO UPDATE

        const found = await db.findByDedupeKey('sleep-5-0');
        expect(found).not.toBeNull();
        expect(found!.content).toBe('Updated content');
      });
    });

    // ================================================================
    // I3: queryByMetadataSubtype
    // ================================================================

    describe('I3: queryByMetadataSubtype listing and ordering', () => {
      it('I3a: returns only rows with matching memorySubtype', async () => {
        const reflection = makeReflectionChunk('r1', 'A reflection', {
          dedupeKey: 'sleep-1-0',
          memorySubtype: 'reflection',
        });
        const lesson = makeReflectionChunk('l1', 'A lesson', {
          dedupeKey: 'lesson-1',
          memorySubtype: 'lesson',
        });
        const regular = makeReflectionChunk('m1', 'Regular memory', {
          // No memorySubtype
        });

        await db.upsertChunk(reflection);
        await db.upsertChunk(lesson);
        await db.upsertChunk(regular);

        const result = await db.queryByMetadataSubtype({
          subtypes: ['reflection'],
          limit: 10,
          offset: 0,
        });

        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].metadata.memorySubtype).toBe('reflection');
        expect(result.total).toBe(1);
      });

      it('I3b: returns multiple subtypes when requested', async () => {
        const reflection = makeReflectionChunk('r1', 'A reflection', {
          dedupeKey: 'sleep-1-0',
          memorySubtype: 'reflection',
        });
        const lesson = makeReflectionChunk('l1', 'A lesson', {
          dedupeKey: 'lesson-1',
          memorySubtype: 'lesson',
        });
        const checkpoint = makeReflectionChunk('c1', 'A checkpoint', {
          dedupeKey: 'checkpoint-1',
          memorySubtype: 'narrative_checkpoint',
        });

        await db.upsertChunk(reflection);
        await db.upsertChunk(lesson);
        await db.upsertChunk(checkpoint);

        const result = await db.queryByMetadataSubtype({
          subtypes: ['reflection', 'lesson', 'narrative_checkpoint'],
          limit: 10,
          offset: 0,
        });

        expect(result.rows).toHaveLength(3);
        expect(result.total).toBe(3);
      });

      it('I3c: ordering is newest-first (created_at DESC)', async () => {
        // Insert with slight delay to ensure different created_at
        const older = makeReflectionChunk('r-old', 'Older reflection', {
          dedupeKey: 'sleep-1-0',
          memorySubtype: 'reflection',
        });
        await db.upsertChunk(older);

        // Small delay to ensure distinct timestamps
        await new Promise((r) => setTimeout(r, 50));

        const newer = makeReflectionChunk('r-new', 'Newer reflection', {
          dedupeKey: 'sleep-2-0',
          memorySubtype: 'reflection',
        });
        await db.upsertChunk(newer);

        const result = await db.queryByMetadataSubtype({
          subtypes: ['reflection'],
          limit: 10,
          offset: 0,
        });

        expect(result.rows).toHaveLength(2);
        expect(result.rows[0].id).toBe('r-new'); // Newest first
        expect(result.rows[1].id).toBe('r-old');
      });

      it('I3d: pagination offset and limit work correctly', async () => {
        // Insert 5 reflections
        for (let i = 0; i < 5; i++) {
          const chunk = makeReflectionChunk(`r-${i}`, `Reflection ${i}`, {
            dedupeKey: `sleep-${i}-0`,
            memorySubtype: 'reflection',
          });
          await db.upsertChunk(chunk);
          if (i < 4) await new Promise((r) => setTimeout(r, 20));
        }

        // Page 1: first 2
        const page1 = await db.queryByMetadataSubtype({
          subtypes: ['reflection'],
          limit: 2,
          offset: 0,
        });
        expect(page1.rows).toHaveLength(2);
        expect(page1.total).toBe(5);

        // Page 2: next 2
        const page2 = await db.queryByMetadataSubtype({
          subtypes: ['reflection'],
          limit: 2,
          offset: 2,
        });
        expect(page2.rows).toHaveLength(2);
        expect(page2.total).toBe(5);

        // No overlap between pages
        const page1Ids = page1.rows.map((r) => r.id);
        const page2Ids = page2.rows.map((r) => r.id);
        expect(page1Ids.some((id) => page2Ids.includes(id))).toBe(false);

        // Page 3: last 1
        const page3 = await db.queryByMetadataSubtype({
          subtypes: ['reflection'],
          limit: 2,
          offset: 4,
        });
        expect(page3.rows).toHaveLength(1);
        expect(page3.total).toBe(5);
      });

      it('I3e: excludes isPlaceholder rows when includePlaceholders is false', async () => {
        const placeholder = makeReflectionChunk('p1', '[PLACEHOLDER] Placeholder', {
          dedupeKey: 'sleep-1-0',
          memorySubtype: 'reflection',
          isPlaceholder: true,
        });
        const real = makeReflectionChunk('r1', 'Real reflection', {
          dedupeKey: 'sleep-2-0',
          memorySubtype: 'reflection',
          isPlaceholder: false,
        });

        await db.upsertChunk(placeholder);
        await db.upsertChunk(real);

        const withPlaceholders = await db.queryByMetadataSubtype({
          subtypes: ['reflection'],
          limit: 10,
          offset: 0,
          includePlaceholders: true,
        });
        expect(withPlaceholders.total).toBe(2);

        const withoutPlaceholders = await db.queryByMetadataSubtype({
          subtypes: ['reflection'],
          limit: 10,
          offset: 0,
          includePlaceholders: false,
        });
        expect(withoutPlaceholders.total).toBe(1);
        expect(withoutPlaceholders.rows[0].id).toBe('r1');
      });
    });
  }
);
