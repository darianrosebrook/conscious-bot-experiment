/**
 * Centralized memory runtime config. Single typed, validated configuration
 * derived from env at startup. Code should read from this module instead of
 * direct process.env for memory server and system behavior.
 *
 * Env vars documented here (defaults in code):
 * - PORT (3001), SYSTEM_READY_ON_BOOT (0), WORLD_SEED (required unless dev)
 * - PG_HOST, PG_PORT, PG_USER, PG_PASSWORD, PG_DATABASE
 * - MLX_SIDECAR_HOST/UMAP_SERVICE_HOST, MLX_SIDECAR_PORT/UMAP_SERVICE_PORT
 * - MEMORY_ALLOW_DEDUPE_CLEANUP (false)
 * - MEMORY_* (see buildMemorySystemConfig)
 *
 * Sidecar URL precedence (for embedding backend):
 *   1. LLM_SIDECAR_URL  — canonical full URL
 *   2. OLLAMA_HOST       — deprecated fallback
 *   3. http://localhost:5002 — default
 *
 * @author @darianrosebrook
 */

import crypto from 'node:crypto';
import type { EnhancedMemorySystemConfig } from '../memory-system';

export type MemoryRunMode = 'production' | 'dev';

export type MemoryRuntimeConfig = {
  runMode: MemoryRunMode;
  port: number;
  systemReadyOnBoot: boolean;
  worldSeed: string;
  pg: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
  };
  umapHost: string;
  umapPort: string;
  allowDedupeCleanup: boolean;
  configDigest: string;
};

const DEV_DEFAULT_WORLD_SEED = '1';

function getNodeEnv(): string {
  return String(process.env.NODE_ENV || '').toLowerCase();
}

function getRunMode(): MemoryRunMode {
  return getNodeEnv() === 'production' ? 'production' : 'dev';
}

function getRequiredWorldSeed(override?: string): string {
  const raw = override ?? process.env.WORLD_SEED;
  if (!raw || raw === '0') {
    if (
      getNodeEnv() === 'development' ||
      process.env.MEMORY_DEV_DEFAULT_SEED === 'true'
    ) {
      return DEV_DEFAULT_WORLD_SEED;
    }
    throw new Error(
      'WORLD_SEED environment variable is required and must be non-zero. ' +
        'Set it to the Minecraft world seed to enable per-seed database isolation. ' +
        'For local dev without a seed, set MEMORY_DEV_DEFAULT_SEED=true.'
    );
  }
  return raw;
}

function parsePort(): number {
  const raw = process.env.PORT ?? '3001';
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1 || n > 65535) {
    throw new Error(`Invalid PORT: ${raw}. Must be 1-65535.`);
  }
  return n;
}

function computeConfigDigest(canonical: Record<string, unknown>): string {
  const payload = JSON.stringify(canonical, Object.keys(canonical).sort());
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

let cachedRuntime: MemoryRuntimeConfig | null = null;
let cachedBaseConfig: Omit<EnhancedMemorySystemConfig, 'worldSeed'> | null =
  null;
let cachedDefaultWorldSeed: string | null = null;

/** Clears cached config. For testing only. */
export function resetMemoryRuntimeConfigForTesting(): void {
  cachedRuntime = null;
  cachedBaseConfig = null;
  cachedDefaultWorldSeed = null;
}

function buildMemorySystemBaseFromEnv(): Omit<
  EnhancedMemorySystemConfig,
  'worldSeed'
> {
  return {
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432'),
    user: process.env.PG_USER || 'conscious_bot',
    password: process.env.PG_PASSWORD || 'secure_password',
    database: process.env.PG_DATABASE || 'conscious_bot',
    vectorDbTableName: 'memory_chunks',
    sidecarUrl: process.env.LLM_SIDECAR_URL ?? process.env.OLLAMA_HOST ?? 'http://localhost:5002',
    embeddingModel: process.env.MEMORY_EMBEDDING_MODEL || 'embeddinggemma',
    embeddingDimension: parseInt(
      process.env.MEMORY_EMBEDDING_DIMENSION || '768'
    ),
    defaultGraphWeight: parseFloat(
      process.env.MEMORY_HYBRID_GRAPH_WEIGHT || '0.5'
    ),
    defaultVectorWeight: parseFloat(
      process.env.MEMORY_HYBRID_VECTOR_WEIGHT || '0.5'
    ),
    maxSearchResults: parseInt(process.env.MEMORY_MAX_SEARCH_RESULTS || '20'),
    minSimilarity: parseFloat(process.env.MEMORY_MIN_SIMILARITY || '0.1'),
    chunkingConfig: {
      maxTokens: parseInt(process.env.MEMORY_CHUNK_SIZE || '900'),
      overlapPercent: parseFloat(process.env.MEMORY_CHUNK_OVERLAP || '0.12'),
      semanticSplitting: process.env.MEMORY_SEMANTIC_SPLITTING !== 'false',
    },
    enableQueryExpansion: process.env.MEMORY_QUERY_EXPANSION !== 'false',
    enableDiversification: process.env.MEMORY_DIVERSIFICATION !== 'false',
    enableSemanticBoost: process.env.MEMORY_SEMANTIC_BOOST !== 'false',
    enablePersistence: process.env.MEMORY_PERSISTENCE !== 'false',
    enableMemoryDecay: process.env.MEMORY_ENABLE_DECAY !== 'false',
    decayEvaluationInterval: parseInt(
      process.env.MEMORY_DECAY_INTERVAL || '3600000'
    ),
    maxMemoryRetentionDays: parseInt(
      process.env.MEMORY_MAX_RETENTION_DAYS || '90'
    ),
    frequentAccessThreshold: parseInt(
      process.env.MEMORY_FREQUENT_THRESHOLD || '5'
    ),
    forgottenThresholdDays: parseInt(
      process.env.MEMORY_FORGOTTEN_THRESHOLD || '30'
    ),
    enableMemoryConsolidation:
      process.env.MEMORY_ENABLE_CONSOLIDATION !== 'false',
    enableMemoryArchiving: process.env.MEMORY_ENABLE_ARCHIVING !== 'false',
    enableNarrativeTracking: process.env.MEMORY_ENABLE_NARRATIVE !== 'false',
    enableMetacognition: process.env.MEMORY_ENABLE_METACOGNITION !== 'false',
    enableSelfModelUpdates: process.env.MEMORY_ENABLE_SELF_MODEL !== 'false',
    enableMultiHopReasoning: process.env.MEMORY_ENABLE_MULTIHOP !== 'false',
    enableProvenanceTracking: process.env.MEMORY_ENABLE_PROVENANCE !== 'false',
    enableDecayAwareRanking:
      process.env.MEMORY_ENABLE_DECAY_RANKING !== 'false',
    maxHops: parseInt(process.env.MEMORY_MAX_HOPS || '3'),
    maxReflections: parseInt(process.env.MEMORY_MAX_REFLECTIONS || '1000'),
    reflectionCheckpointInterval: parseInt(
      process.env.MEMORY_CHECKPOINT_INTERVAL || '86400000'
    ),
    minLessonConfidence: parseFloat(
      process.env.MEMORY_MIN_LESSON_CONFIDENCE || '0.6'
    ),
    enableToolEfficiencyTracking:
      process.env.MEMORY_TOOL_EFFICIENCY !== 'false',
    toolEfficiencyEvaluationInterval: parseInt(
      process.env.MEMORY_TOOL_EFFICIENCY_INTERVAL || '300000'
    ),
    minUsesForToolRecommendation: parseInt(
      process.env.MEMORY_MIN_TOOL_USES || '3'
    ),
    toolEfficiencyRecencyWeight: parseFloat(
      process.env.MEMORY_TOOL_RECENCY_WEIGHT || '0.7'
    ),
    enableBehaviorTreeLearning:
      process.env.MEMORY_BEHAVIOR_TREE_LEARNING !== 'false',
    enableCognitivePatternTracking:
      process.env.MEMORY_COGNITIVE_PATTERNS !== 'false',
    maxPatternsPerContext: parseInt(process.env.MEMORY_MAX_PATTERNS || '10'),
    enableAutoRecommendations:
      process.env.MEMORY_AUTO_RECOMMENDATIONS !== 'false',
    toolEfficiencyThreshold: parseFloat(
      process.env.MEMORY_EFFICIENCY_THRESHOLD || '0.6'
    ),
    toolEfficiencyCleanupInterval: parseInt(
      process.env.MEMORY_TOOL_CLEANUP_INTERVAL || '3600000'
    ),
  };
}

/**
 * Returns the single validated memory runtime config (server, pg, umap, flags).
 * Validates at first call.
 */
export function getMemoryRuntimeConfig(): MemoryRuntimeConfig {
  if (cachedRuntime) return cachedRuntime;

  const runMode = getRunMode();
  const worldSeed = getRequiredWorldSeed();
  const port = parsePort();
  const pg = {
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432'),
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || '',
    database: process.env.PG_DATABASE || 'conscious_bot',
  };
  const umapHost =
    process.env.MLX_SIDECAR_HOST ||
    process.env.UMAP_SERVICE_HOST ||
    'localhost';
  const umapPort =
    process.env.MLX_SIDECAR_PORT || process.env.UMAP_SERVICE_PORT || '5002';
  const allowDedupeCleanup = process.env.MEMORY_ALLOW_DEDUPE_CLEANUP === 'true';
  const systemReadyOnBoot = process.env.SYSTEM_READY_ON_BOOT === '1';

  const canonical = {
    runMode,
    port,
    systemReadyOnBoot,
    worldSeed,
    pgHost: pg.host,
    pgPort: pg.port,
    pgDatabase: pg.database,
    umapHost,
    umapPort,
    allowDedupeCleanup,
  };
  const configDigest = computeConfigDigest(canonical);

  cachedDefaultWorldSeed = worldSeed;
  cachedRuntime = {
    runMode,
    port,
    systemReadyOnBoot,
    worldSeed,
    pg,
    umapHost,
    umapPort,
    allowDedupeCleanup,
    configDigest,
  };
  return cachedRuntime;
}

/**
 * Returns full EnhancedMemorySystemConfig for the memory system. Use
 * seedOverride when the runtime seed has changed (e.g. POST /enhanced/seed).
 */
export function getMemorySystemConfig(
  seedOverride?: string
): EnhancedMemorySystemConfig {
  if (!cachedBaseConfig) {
    cachedBaseConfig = buildMemorySystemBaseFromEnv();
  }
  if (cachedDefaultWorldSeed === null) {
    cachedDefaultWorldSeed = getRequiredWorldSeed();
  }
  const worldSeed = seedOverride ?? cachedDefaultWorldSeed;
  return {
    ...cachedBaseConfig,
    worldSeed,
  };
}
