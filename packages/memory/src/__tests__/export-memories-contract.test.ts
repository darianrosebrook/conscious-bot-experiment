/**
 * exportMemories() Contract Tests
 *
 * Validates the data contract for identity preservation exports:
 * - Structured type/subtype filtering (no taxonomy conflation)
 * - Deduplication when a memory matches both type and subtype filters
 * - Deterministic ordering for hash stability (createdAt ASC, id ASC)
 * - Newest-first DB selection so new memories enter the export window
 * - ok/error discriminated result shape
 * - Observability counts
 * - Suspiciously-empty warning
 *
 * No DB required — vectorDb methods are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EnhancedMemoryChunk } from '../vector-database';

// EnhancedMemorySystem requires WORLD_SEED at module load time
process.env.MEMORY_DEV_DEFAULT_SEED = 'true';

// Helper: build a minimal mock memory chunk
function mockChunk(
  id: string,
  content: string,
  createdAt: number,
  metadata: Record<string, any> = {}
): EnhancedMemoryChunk {
  return {
    id,
    content,
    embedding: [],
    metadata,
    entities: [],
    relationships: [],
    decayProfile: undefined,
    provenance: undefined,
    graphLinks: [],
    temporalContext: undefined,
    spatialContext: undefined,
    createdAt,
    updatedAt: createdAt,
  } as unknown as EnhancedMemoryChunk;
}

// We construct the system with a dummy config and replace vectorDb.
// This avoids needing a real DB connection.
async function createSystemWithMockVectorDb(mockVectorDb: any) {
  // Mock the pool.connect() call that happens in EnhancedVectorDatabase constructor
  vi.doMock('pg', () => ({
    Pool: vi.fn().mockImplementation(() => ({
      connect: vi.fn().mockResolvedValue({
        query: vi.fn().mockResolvedValue({ rows: [] }),
        release: vi.fn(),
      }),
      on: vi.fn(),
      end: vi.fn(),
    })),
  }));

  const { EnhancedMemorySystem, DEFAULT_MEMORY_CONFIG } = await import(
    '../memory-system'
  );

  const system = new EnhancedMemorySystem({
    ...DEFAULT_MEMORY_CONFIG,
    host: 'localhost',
    port: 5432,
    user: 'test',
    password: 'test',
    database: 'test',
    worldSeed: 'test-seed',
  });

  // Replace the private vectorDb with our mock
  (system as any).vectorDb = mockVectorDb;

  return system;
}

describe('exportMemories() contract', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('returns ok:true with empty memories when no filters specified', async () => {
    const mockDb = {
      queryByMetadataTypes: vi.fn(),
      queryByMetadataSubtype: vi.fn(),
    };
    const system = await createSystemWithMockVectorDb(mockDb);

    const result = await system.exportMemories({});

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.memories).toEqual([]);
      expect(result.counts.byType).toEqual({});
      expect(result.counts.bySubtype).toEqual({});
    }
    // Neither query should be called
    expect(mockDb.queryByMetadataTypes).not.toHaveBeenCalled();
    expect(mockDb.queryByMetadataSubtype).not.toHaveBeenCalled();
  });

  it('queries by type and subtype separately, deduplicates overlapping rows', async () => {
    // Chunk "overlap-1" appears in both type and subtype results
    const typeRows = [
      mockChunk('knowledge-1', 'Iron is strong', 1000, {
        type: 'knowledge',
      }),
      mockChunk('overlap-1', 'Crafting lesson', 2000, {
        type: 'knowledge',
        memorySubtype: 'lesson',
      }),
    ];

    const subtypeRows = [
      mockChunk('overlap-1', 'Crafting lesson', 2000, {
        type: 'knowledge',
        memorySubtype: 'lesson',
      }),
      mockChunk('reflection-1', 'I learned from failure', 3000, {
        type: 'thought',
        memorySubtype: 'reflection',
      }),
    ];

    const mockDb = {
      queryByMetadataTypes: vi.fn().mockResolvedValue({
        rows: typeRows,
        total: 2,
      }),
      queryByMetadataSubtype: vi.fn().mockResolvedValue({
        rows: subtypeRows,
        total: 2,
      }),
    };

    const system = await createSystemWithMockVectorDb(mockDb);

    const result = await system.exportMemories({
      types: ['knowledge'],
      subtypes: ['reflection', 'lesson'],
      limit: 500,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok:true');

    // 3 unique chunks, not 4 (overlap-1 deduplicated)
    expect(result.memories).toHaveLength(3);
    const ids = result.memories.map((m) => m.id);
    expect(ids).toEqual(['knowledge-1', 'overlap-1', 'reflection-1']);

    // Counts reflect deduplicated set
    expect(result.counts.byType).toEqual({ knowledge: 2, thought: 1 });
    expect(result.counts.bySubtype).toEqual({ lesson: 1, reflection: 1 });
  });

  it('sorts canonically ASC by createdAt then id for hash stability', async () => {
    // DB returns newest-first (DESC), but export should re-sort ASC
    const typeRows = [
      mockChunk('c', 'Third', 3000, { type: 'knowledge' }),
      mockChunk('a', 'First', 1000, { type: 'knowledge' }),
      mockChunk('b-2', 'Second tie', 2000, { type: 'knowledge' }),
      mockChunk('b-1', 'Second tie earlier id', 2000, { type: 'knowledge' }),
    ];

    const mockDb = {
      queryByMetadataTypes: vi.fn().mockResolvedValue({
        rows: typeRows,
        total: 4,
      }),
      queryByMetadataSubtype: vi.fn(),
    };

    const system = await createSystemWithMockVectorDb(mockDb);

    const result = await system.exportMemories({
      types: ['knowledge'],
      limit: 500,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok:true');

    const ids = result.memories.map((m) => m.id);
    // ASC by createdAt, then ASC by id for ties at t=2000
    expect(ids).toEqual(['a', 'b-1', 'b-2', 'c']);
  });

  it('selects newest-first at DB boundary (not stuck on oldest)', async () => {
    const mockDb = {
      queryByMetadataTypes: vi.fn().mockResolvedValue({
        rows: [],
        total: 0,
      }),
      queryByMetadataSubtype: vi.fn().mockResolvedValue({
        rows: [],
        total: 0,
      }),
    };

    const system = await createSystemWithMockVectorDb(mockDb);

    await system.exportMemories({
      types: ['knowledge'],
      subtypes: ['reflection'],
      limit: 10,
    });

    // queryByMetadataTypes should be called with sortOrder 'desc'
    expect(mockDb.queryByMetadataTypes).toHaveBeenCalledWith(
      expect.objectContaining({ sortOrder: 'desc' })
    );

    // queryByMetadataSubtype should also be called with sortOrder 'desc'
    expect(mockDb.queryByMetadataSubtype).toHaveBeenCalledWith(
      expect.objectContaining({ sortOrder: 'desc' })
    );
  });

  it('returns ok:false with error message on DB failure', async () => {
    const mockDb = {
      queryByMetadataTypes: vi
        .fn()
        .mockRejectedValue(new Error('connection refused')),
      queryByMetadataSubtype: vi.fn(),
    };

    const system = await createSystemWithMockVectorDb(mockDb);

    const result = await system.exportMemories({
      types: ['knowledge'],
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected ok:false');
    expect(result.error).toBe('connection refused');
    expect(result.memories).toEqual([]);
  });

  it('warns but succeeds when filters are non-empty but result is 0 rows', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const mockDb = {
      queryByMetadataTypes: vi.fn().mockResolvedValue({
        rows: [],
        total: 0,
      }),
      queryByMetadataSubtype: vi.fn(),
    };

    const system = await createSystemWithMockVectorDb(mockDb);

    const result = await system.exportMemories({
      types: ['knowledge'],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok:true');
    expect(result.memories).toEqual([]);

    // Should have logged a suspicious-empty warning
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('0 rows')
    );

    warnSpy.mockRestore();
  });

  it('uses default limit of 500 when not specified', async () => {
    const mockDb = {
      queryByMetadataTypes: vi.fn().mockResolvedValue({
        rows: [],
        total: 0,
      }),
      queryByMetadataSubtype: vi.fn(),
    };

    const system = await createSystemWithMockVectorDb(mockDb);

    await system.exportMemories({ types: ['knowledge'] });

    expect(mockDb.queryByMetadataTypes).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 500 })
    );
  });

  it('excludes placeholders from both query paths', async () => {
    const mockDb = {
      queryByMetadataTypes: vi.fn().mockResolvedValue({
        rows: [],
        total: 0,
      }),
      queryByMetadataSubtype: vi.fn().mockResolvedValue({
        rows: [],
        total: 0,
      }),
    };

    const system = await createSystemWithMockVectorDb(mockDb);

    await system.exportMemories({
      types: ['knowledge'],
      subtypes: ['reflection'],
    });

    expect(mockDb.queryByMetadataTypes).toHaveBeenCalledWith(
      expect.objectContaining({ includePlaceholders: false })
    );
    expect(mockDb.queryByMetadataSubtype).toHaveBeenCalledWith(
      expect.objectContaining({ includePlaceholders: false })
    );
  });
});

// =============================================================================
// ADR-004: Bundle versioning contract
// =============================================================================

describe('ADR-004: backup bundle envelope', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('export result includes a versioned bundle with schemaVersion=1', async () => {
    const typeRows = [
      mockChunk('k1', 'Knowledge', 1000, { type: 'knowledge' }),
    ];

    const mockDb = {
      queryByMetadataTypes: vi.fn().mockResolvedValue({
        rows: typeRows,
        total: 1,
      }),
      queryByMetadataSubtype: vi.fn(),
    };

    const system = await createSystemWithMockVectorDb(mockDb);

    const result = await system.exportMemories({
      types: ['knowledge'],
      limit: 100,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok:true');

    const { bundle } = result;
    expect(bundle.schemaVersion).toBe(1);
    expect(bundle.exportedAtMs).toBeGreaterThan(0);
    expect(bundle.selection).toEqual({
      types: ['knowledge'],
      subtypes: undefined,
      limit: 100,
    });
    expect(bundle.counts.total).toBe(1);
    expect(bundle.counts.byType).toEqual({ knowledge: 1 });
    expect(bundle.chunks).toHaveLength(1);
    expect(bundle.chunks[0].id).toBe('k1');
  });

  it('empty-filter export also produces a bundle with schemaVersion=1', async () => {
    const mockDb = {
      queryByMetadataTypes: vi.fn(),
      queryByMetadataSubtype: vi.fn(),
    };

    const system = await createSystemWithMockVectorDb(mockDb);

    const result = await system.exportMemories({});

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok:true');
    expect(result.bundle.schemaVersion).toBe(1);
    expect(result.bundle.counts.total).toBe(0);
    expect(result.bundle.chunks).toEqual([]);
  });

  it('importMemoryBackupBundle rejects unknown schema versions', async () => {
    const mockDb = {
      queryByMetadataTypes: vi.fn(),
      queryByMetadataSubtype: vi.fn(),
      batchRestoreChunks: vi.fn(),
    };

    const system = await createSystemWithMockVectorDb(mockDb);

    const badBundle = {
      schemaVersion: 999,
      exportedAtMs: Date.now(),
      selection: { types: ['knowledge'], limit: 500 },
      counts: { byType: {}, bySubtype: {}, total: 0 },
      chunks: [],
    };

    await expect(
      system.importMemoryBackupBundle(badBundle as any)
    ).rejects.toThrow('Unsupported memory backup bundle schemaVersion=999');

    // batchRestoreChunks should never have been called
    expect(mockDb.batchRestoreChunks).not.toHaveBeenCalled();
  });

  it('importMemoryBackupBundle routes through batchRestoreChunks (timestamp-preserving)', async () => {
    const mockDb = {
      queryByMetadataTypes: vi.fn(),
      queryByMetadataSubtype: vi.fn(),
      batchRestoreChunks: vi.fn().mockResolvedValue(undefined),
    };

    const system = await createSystemWithMockVectorDb(mockDb);

    const chunks = [
      mockChunk('r1', 'Restored memory', 1000, { type: 'knowledge' }),
    ];

    const bundle = {
      schemaVersion: 1 as const,
      exportedAtMs: Date.now(),
      selection: { types: ['knowledge'], limit: 500 },
      counts: { byType: { knowledge: 1 }, bySubtype: {}, total: 1 },
      chunks,
    };

    const count = await system.importMemoryBackupBundle(bundle);

    expect(count).toBe(1);
    expect(mockDb.batchRestoreChunks).toHaveBeenCalledWith(chunks);
  });
});

// =============================================================================
// ADR-002: Restore timestamp preservation (vector DB layer)
// =============================================================================

describe('ADR-002: restoreChunkWithClient timestamp validation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('restoreFromBackup routes through batchRestoreChunks, not storeChunk', async () => {
    const mockDb = {
      queryByMetadataTypes: vi.fn(),
      queryByMetadataSubtype: vi.fn(),
      batchRestoreChunks: vi.fn().mockResolvedValue(undefined),
      storeChunk: vi.fn(),
    };

    const system = await createSystemWithMockVectorDb(mockDb);

    // Populate the backup queue directly
    const chunks = [
      mockChunk('bq1', 'Backup memory', 5000, { type: 'knowledge' }),
    ];
    (system as any).backupQueue = chunks;

    // Trigger restoreFromBackup via enterRecoveryMode
    await system.enterRecoveryMode();

    // batchRestoreChunks should be called (timestamp-preserving)
    expect(mockDb.batchRestoreChunks).toHaveBeenCalledWith(chunks);

    // storeChunk should NOT have been called
    expect(mockDb.storeChunk).not.toHaveBeenCalled();
  });
});
