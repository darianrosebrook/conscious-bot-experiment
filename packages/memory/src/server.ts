/**
 * Memory System HTTP Server
 *
 * Provides HTTP API endpoints for the multi-store memory system.
 * Supports episodic, semantic, working, and provenance memory.
 *
 * @author @darianrosebrook
 */

import express from 'express';
import cors from 'cors';
import {
  EventLogger,
  SalienceScorer,
  MemoryConsolidation,
  EpisodicRetrieval,
  NarrativeGenerator,
} from './episodic';
import { createSemanticMemory } from './semantic';
import { createWorkingMemory } from './working';
import { createProvenanceSystem } from './provenance';
import { SkillRegistry } from './skills';
import { MemoryVersioningManager } from './memory-versioning-manager';
import { MemoryContext, ExperienceType } from './types';
import { normalizeExperienceType } from './utils/experience-normalizer';

// Enhanced memory system components
import {
  createEnhancedMemorySystem,
  createDefaultMemoryConfig,
} from './memory-system';
import { getMemoryRuntimeConfig, getMemorySystemConfig } from './config/memory-runtime-config';
import {
  EmbeddingService,
  SidecarEmbeddingBackend,
  type EmbeddingBackend,
} from './embedding-service';

const memoryConfig = getMemoryRuntimeConfig();

// Mutable world seed — can be updated at runtime via POST /enhanced/seed
let currentWorldSeed: string = memoryConfig.worldSeed;

// ============================================================================
// Degradation Reason Codes
// ============================================================================
type DegradedReason =
  | 'enhanced_search_failed'
  | 'reflection_query_failed'
  | 'stats_unavailable'
  | 'embedding_timeout'
  | 'db_query_timeout';

// ============================================================================
// Shared Embedding Backend Instance (single-instance invariant)
// The same backend instance is used by:
//   1. EmbeddingService inside EnhancedMemorySystem (via config.embeddingBackend)
//   2. /ready health checks
// ============================================================================
const embeddingBackend: EmbeddingBackend = new SidecarEmbeddingBackend(
  process.env.LLM_SIDECAR_URL ?? process.env.OLLAMA_HOST ?? 'http://localhost:5002',
  10_000
);

// ============================================================================
// Lightweight DB Probe Pool (init-independent readiness check)
// IMPORTANT: Derives connection config from the same source as the vector DB
// (getMemorySystemConfig) to guarantee they target the same Postgres instance.
// This pool exists solely for /ready to probe Postgres without requiring
// enhancedMemorySystem to be initialized.
// ============================================================================
import { Pool } from 'pg';

function buildProbePool(): Pool {
  // Use the same config source as EnhancedVectorDatabase (via createDefaultMemoryConfig → getMemorySystemConfig)
  const sysConfig = getMemorySystemConfig(currentWorldSeed);
  const sanitizedSeed = currentWorldSeed.replace('-', 'n');
  const seedDatabase = `${sysConfig.database}_seed_${sanitizedSeed}`;
  const connectionString = `postgresql://${sysConfig.user}:${sysConfig.password}@${sysConfig.host}:${sysConfig.port}/${seedDatabase}`;
  console.log(`[memory] Probe pool targeting: ${sysConfig.host}:${sysConfig.port}/${seedDatabase} (user: ${sysConfig.user})`);
  return new Pool({
    connectionString,
    max: 1,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 1500,
  });
}

let probePool: Pool | null = null;
let probeSeed: string | null = null;

function getProbePool(): Pool {
  // Recreate if seed changed (different database); explicitly close old pool
  if (probePool && probeSeed !== currentWorldSeed) {
    const oldPool = probePool;
    probePool = null;
    probeSeed = null;
    oldPool.end().catch((err) => {
      console.warn('[memory] Failed to close old probe pool:', err.message);
    });
  }
  if (!probePool) {
    probePool = buildProbePool();
    probeSeed = currentWorldSeed;
  }
  return probePool;
}

// ============================================================================
// Seed-Keyed Lazy Init with Retry-on-Failure (Fix D)
// ============================================================================
let enhancedMemorySystem: any = null;
let enhancedMemoryInitPromise: Promise<any> | null = null;
let enhancedMemoryInitSeed: string | null = null;

async function getEnhancedMemorySystem() {
  // Seed boundary invariant: if world seed changed, invalidate cached system
  if (enhancedMemorySystem && enhancedMemoryInitSeed !== currentWorldSeed) {
    console.warn(`[memory] World seed changed (${enhancedMemoryInitSeed} → ${currentWorldSeed}), reinitializing`);
    enhancedMemorySystem = null;
    enhancedMemoryInitPromise = null;
  }

  if (enhancedMemorySystem) return enhancedMemorySystem;

  if (!enhancedMemoryInitPromise) {
    enhancedMemoryInitPromise = (async () => {
      const config = createDefaultMemoryConfig(currentWorldSeed);
      // Thread shared backend to enforce single-instance invariant
      config.embeddingBackend = embeddingBackend;
      const system = createEnhancedMemorySystem(config);
      await system.initialize();
      return system;
    })();
  }

  try {
    enhancedMemorySystem = await enhancedMemoryInitPromise;
    enhancedMemoryInitSeed = currentWorldSeed;
    return enhancedMemorySystem;
  } catch (err) {
    enhancedMemoryInitPromise = null; // Clear so next call retries
    throw err;
  }
}

// ============================================================================
// Init-Independent Subsystem Checks (Fix C)
//
// "Gating checks" (database, embeddings) determine /ready status code.
// "Diagnostic checks" (enhanced_init) are informational only — they appear
// in the payload but do NOT affect whether /ready returns 200 or 503.
// ============================================================================
/** Diagnostic entry: ok required; error and mode optional (mode for informational keys like knowledge_graph). */
type DiagnosticEntry = { ok: boolean; error?: string; mode?: string };

interface SubsystemChecks {
  gating: Record<string, { ok: boolean; error?: string }>;
  diagnostic: Record<string, DiagnosticEntry>;
}

async function getSubsystemChecks(): Promise<SubsystemChecks> {
  const gating: Record<string, { ok: boolean; error?: string }> = {};
  const diagnostic: Record<string, DiagnosticEntry> = {};

  // Database: lightweight probe pool check (no init required)
  // Timeout budget: 1500ms (must fit within planning's 2s discovery timeout)
  try {
    const pool = getProbePool();
    await Promise.race([
      pool.query('SELECT 1'),
      new Promise((_, rej) => setTimeout(() => rej(new Error('db probe timeout')), 1500)),
    ]);
    gating.database = { ok: true };
  } catch (err: any) {
    gating.database = { ok: false, error: err.message };
  }

  // Embedding backend: same instance used by EmbeddingService
  // Timeout budget: 1500ms (SidecarEmbeddingBackend.health() uses 3s internally,
  // but we race it tighter here so /ready responds within ~1.5s worst case)
  try {
    const health = await Promise.race([
      embeddingBackend.health(),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('embedding probe timeout')), 1500)),
    ]);
    gating.embeddings = { ok: health.ok, error: health.error };
  } catch (err: any) {
    gating.embeddings = { ok: false, error: err.message };
  }

  // Informational only — does NOT gate /ready
  diagnostic.enhanced_init = { ok: enhancedMemorySystem !== null };
  diagnostic.knowledge_graph = {
    ok: enhancedMemorySystem?.knowledgeGraphMode === 'hybrid',
    mode: enhancedMemorySystem?.knowledgeGraphMode ?? 'uninitialized',
  };

  return { gating, diagnostic };
}

const app: express.Application = express();
const port = memoryConfig.port;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize memory versioning manager
const memoryVersioningManager = new MemoryVersioningManager({
  enableVersioning: true,
  seedBasedIsolation: true,
  autoCreateNamespaces: true,
});

// Initialize skill registry
const skillRegistry = new SkillRegistry();

// Initialize memory system
const memorySystem = {
  episodic: {
    eventLogger: new EventLogger(),
    salienceScorer: new SalienceScorer(),
    consolidation: new MemoryConsolidation(new SalienceScorer()),
    retrieval: new EpisodicRetrieval(),
    narrativeGenerator: new NarrativeGenerator(),

    // Convenience methods
    getMemoryCount: () =>
      memorySystem.episodic.eventLogger.getStats().totalExperiences,
    getRecentMemories: (count: number) =>
      memorySystem.episodic.eventLogger
        .getRecentExperiences(3600000)
        .slice(0, count),
    storeMemory: (memory: any) => {
      const { type, note } = normalizeExperienceType(memory?.type);
      const parameters = {
        ...memory,
        type,
        metadata: {
          ...(memory?.metadata || {}),
          originalType: memory?.type,
          normalizationNote: note,
        },
      };
      return memorySystem.episodic.eventLogger.logExperience(
        type as ExperienceType,
        parameters.description,
        parameters
      );
    },
    retrieveMemories: (query: any) =>
      memorySystem.episodic.retrieval.retrieveByContext(query, {}),
  },
  semantic: {
    ...createSemanticMemory(),

    // Convenience methods
    getEntityCount: () =>
      memorySystem.semantic.knowledgeGraphCore.getStats().entityCount,
    getRelationshipCount: () =>
      memorySystem.semantic.knowledgeGraphCore.getStats().relationshipCount,
    storeEntity: (entity: any) =>
      memorySystem.semantic.knowledgeGraphCore.upsertEntity(entity),
    query: (query: any) => memorySystem.semantic.queryEngine.query(query),
  },
  working: {
    ...createWorkingMemory(),

    // Convenience methods
    getCurrentContext: () =>
      memorySystem.working.contextManager.getMostRelevantContexts(1)[0] || null,
    getAttentionLevel: () =>
      memorySystem.working.attentionManager.getCurrentLoad(),
  },
  provenance: {
    system: createProvenanceSystem(),

    // Convenience methods
    getActionCount: () =>
      memorySystem.provenance.system.getStats('system').decisions
        .totalDecisions,
    getRecentActions: (count: number) => {
      // Get all decisions and sort by timestamp (most recent first)
      const allDecisions = memorySystem.provenance.system
        .getAllDecisions('system')
        .sort((a: any, b: any) => b.timestamp - a.timestamp);

      // Extract actions from recent decisions
      const actions: Array<{
        id: string;
        type: string;
        description: string;
        timestamp: number;
        status: string;
        decisionId: string;
        result?: any;
      }> = [];

      for (const decision of allDecisions) {
        if (decision.execution?.actions) {
          for (const action of decision.execution.actions) {
            actions.push({
              id: action.id,
              type: action.type,
              description: action.description,
              timestamp: action.timestamp,
              status: action.status,
              decisionId: decision.id,
              result: action.result,
            });
          }
        }

        // Stop when we have enough actions
        if (actions.length >= count) break;
      }

      // Sort actions by timestamp (most recent first) and return requested count
      return actions
        .sort((a: any, b: any) => b.timestamp - a.timestamp)
        .slice(0, count);
    },
  },
  skills: {
    registry: skillRegistry,
  },
  versioning: {
    manager: memoryVersioningManager,

    // Convenience methods
    getActiveNamespace: () => memoryVersioningManager.getActiveNamespace(),
    getAllNamespaces: () => memoryVersioningManager.getAllNamespaces(),
    getStats: () => memoryVersioningManager.getStats(),
  },
};

let systemReady = memoryConfig.systemReadyOnBoot;
let readyAt: string | null = systemReady ? new Date().toISOString() : null;
let readySource: string | null = systemReady ? 'config' : null;

// Track connected SSE clients for memory updates
const memoryUpdateClients: Set<express.Response> = new Set();

/**
 * Broadcast a memory update to all connected SSE clients
 */
export function broadcastMemoryUpdate(event: string, data: any): void {
  const message = JSON.stringify({
    event,
    data,
    timestamp: Date.now(),
  });

  for (const client of memoryUpdateClients) {
    try {
      client.write(`data: ${message}\n\n`);
    } catch (error) {
      // Client disconnected, will be cleaned up
      memoryUpdateClients.delete(client);
    }
  }
}

// ============================================================================
// Health Endpoints: /live, /ready, /health (Fix C)
// ============================================================================

// /live — process alive (always 200, for startup gating and Docker/K8s liveness probes)
app.get('/live', (_req, res) => {
  res.json({ status: 'alive', system: 'memory', timestamp: Date.now() });
});

// /ready — real subsystem checks, can return 503 (for routing decisions)
// Only "gating" checks affect status; diagnostic checks are informational.
app.get('/ready', async (_req, res) => {
  const { gating, diagnostic } = await getSubsystemChecks();
  const allGatingOk = Object.values(gating).every(c => c.ok);
  res.status(allGatingOk ? 200 : 503).json({
    status: allGatingOk ? 'ready' : 'degraded',
    system: 'memory',
    timestamp: Date.now(),
    checks: gating,
    diagnostic,
  });
});

// /health — always 200, diagnostic payload for humans/dashboard/start.js
app.get('/health', async (_req, res) => {
  const { gating, diagnostic } = await getSubsystemChecks();
  const allGatingOk = Object.values(gating).every(c => c.ok);
  res.json({
    status: allGatingOk ? 'healthy' : 'degraded',
    system: 'memory',
    timestamp: Date.now(),
    version: '0.1.0',
    checks: { ...gating, ...diagnostic },
    enhancedMemorySystem: {
      available: !!enhancedMemorySystem,
      endpoints: ['/live', '/ready', '/enhanced/status'],
    },
  });
});

// GET /memory-updates - SSE endpoint for real-time memory updates
app.get('/memory-updates', (req, res) => {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  // Add client to the set
  memoryUpdateClients.add(res);
  console.log(`[SSE] Client connected to memory-updates (${memoryUpdateClients.size} total)`);

  // Send initial connection confirmation
  const initMessage = JSON.stringify({
    event: 'connected',
    data: { message: 'Connected to memory updates stream' },
    timestamp: Date.now(),
  });
  res.write(`data: ${initMessage}\n\n`);

  // Send keepalive every 30 seconds
  const keepaliveInterval = setInterval(() => {
    try {
      res.write(`: keepalive\n\n`);
    } catch {
      clearInterval(keepaliveInterval);
      memoryUpdateClients.delete(res);
    }
  }, 30000);

  // Clean up on disconnect
  req.on('close', () => {
    clearInterval(keepaliveInterval);
    memoryUpdateClients.delete(res);
    console.log(`[SSE] Client disconnected from memory-updates (${memoryUpdateClients.size} remaining)`);
  });
});

// Startup readiness endpoint
app.get('/system/ready', (_req, res) => {
  res.json({ ready: systemReady, readyAt, source: readySource });
});

app.post('/system/ready', (req, res) => {
  if (!systemReady) {
    systemReady = true;
    readyAt = new Date().toISOString();
    readySource =
      typeof req.body?.source === 'string' ? req.body.source : 'startup';
  }
  res.json({ ready: systemReady, readyAt, accepted: true });
});

// Get memory system state
app.get('/state', (req, res) => {
  try {
    const state = {
      episodic: {
        totalMemories: memorySystem.episodic.getMemoryCount(),
        recentMemories: memorySystem.episodic.getRecentMemories(10),
      },
      semantic: {
        totalEntities: memorySystem.semantic.getEntityCount(),
        totalRelationships: memorySystem.semantic.getRelationshipCount(),
      },
      working: {
        currentContext: memorySystem.working.getCurrentContext(),
        attentionLevel: memorySystem.working.getAttentionLevel(),
      },
      provenance: {
        totalActions: memorySystem.provenance.getActionCount(),
        recentActions: memorySystem.provenance.getRecentActions(10),
      },
    };

    res.json(state);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get memory state' });
  }
});

// GET /memories — Dashboard-compatible list for use-periodic-refresh (proxy target)
app.get('/memories', async (req, res) => {
  const degradedReasons: DegradedReason[] = [];
  try {
    enhancedMemorySystem = await getEnhancedMemorySystem();

    let memories: Array<{
      id: string;
      timestamp: string;
      type: string;
      content: string;
      tags?: string[];
      score?: number;
    }> = [];

    try {
      const searchResults = await enhancedMemorySystem.searchMemories({
        query: '*',
        limit: 50,
      });

      memories = (searchResults.results || []).map((r: any) => ({
        id: r.id || r.chunk?.id || 'unknown',
        timestamp: new Date(r.chunk?.createdAt ?? r.createdAt ?? Date.now()).toISOString(),
        type: r.type || r.chunk?.decayProfile?.memoryType || 'episodic',
        content: r.content || r.chunk?.content || '',
        tags: r.chunk?.metadata?.tags,
        score: r.importance ?? r.chunk?.decayProfile?.importance,
      }));
    } catch (err) {
      console.warn('[memory] Enhanced search failed, falling back to episodic:', (err as Error).message);
      degradedReasons.push('enhanced_search_failed');
      // Fallback to episodic experiences when enhanced system unavailable
      const recent = memorySystem.episodic.eventLogger.getRecentExperiences(86400000);
      memories = recent.map((m: any) => ({
        id: m.id || `exp-${m.timestamp}`,
        timestamp: new Date(m.timestamp).toISOString(),
        type: m.type || 'episodic',
        content: m.description || '',
        tags: m.tags,
        score: m.salienceScore,
      }));
    }

    res.json({
      memories,
      ...(degradedReasons.length > 0 && {
        _degraded: true,
        _degraded_reasons: degradedReasons,
      }),
    });
  } catch (error) {
    console.error('Failed to list memories:', error);
    res.json({ memories: [], _degraded: true, _degraded_reasons: ['enhanced_search_failed'] });
  }
});

// GET /events — Dashboard-compatible list from episodic event logger (proxy target)
app.get('/events', (req, res) => {
  try {
    const recent = memorySystem.episodic.eventLogger.getRecentExperiences(86400000);
    const events = recent.map((e: any) => ({
      id: e.id || `event-${e.timestamp}`,
      timestamp: new Date(e.timestamp).toISOString(),
      type: e.type || 'episodic',
      content: e.description || '',
      payload: { description: e.description, metadata: e.metadata },
    }));
    res.json({ events });
  } catch (error) {
    console.error('Failed to list events:', error);
    res.json({ events: [] });
  }
});

// GET /notes — Dashboard-compatible list from reflections (proxy target)
app.get('/notes', async (req, res) => {
  const degradedReasons: DegradedReason[] = [];
  try {
    enhancedMemorySystem = await getEnhancedMemorySystem();

    let notes: Array<{
      id: string;
      timestamp: string;
      type: string;
      title: string;
      content: string;
      source: string;
      confidence: number;
    }> = [];

    try {
      const reflectionResult = await enhancedMemorySystem.queryReflections({
        subtypes: ['reflection', 'lesson', 'narrative_checkpoint'],
        limit: 50,
        page: 1,
      });

      notes = reflectionResult.items.map((r: any) => {
        const meta = r.metadata || {};
        return {
          id: r.id,
          timestamp: new Date(r.createdAt || meta.timestamp || Date.now()).toISOString(),
          type: meta.reflectionType || meta.memorySubtype || 'reflection',
          title: meta.title || '',
          content: r.content || '',
          source: meta.source || 'reflection',
          confidence: meta.confidence ?? 0.5,
        };
      });
    } catch (err) {
      console.warn('[memory] Reflection query failed:', (err as Error).message);
      degradedReasons.push('reflection_query_failed');
    }

    res.json({
      notes,
      ...(degradedReasons.length > 0 && {
        _degraded: true,
        _degraded_reasons: degradedReasons,
      }),
    });
  } catch (error) {
    console.error('Failed to list notes:', error);
    res.json({ notes: [], _degraded: true, _degraded_reasons: ['reflection_query_failed'] });
  }
});

// Get telemetry data
app.get('/telemetry', (req, res) => {
  try {
    const telemetry = {
      events: [
        {
          id: `memory-${Date.now()}`,
          timestamp: Date.now(),
          source: 'memory-system',
          type: 'memory_state',
          data: {
            episodicMemories: memorySystem.episodic.getMemoryCount(),
            semanticMemories: memorySystem.semantic.getEntityCount(),
            workingMemoryUsage: memorySystem.working.getAttentionLevel(),
            recentExperiences: memorySystem.episodic
              .getRecentMemories(5)
              .map((m: any) => m.description),
          },
        },
      ],
    };

    res.json(telemetry);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get telemetry' });
  }
});

// Memory context endpoint for planning integration
app.post('/memory-context', async (req, res) => {
  try {
    const context = req.body;

    // Initialize enhanced memory system if needed
    enhancedMemorySystem = await getEnhancedMemorySystem();

    // Get memory context
    const memoryContext =
      await enhancedMemorySystem.getMemoryEnhancedContext(context);

    res.json(memoryContext);
  } catch (error) {
    console.error('Failed to get memory context:', error);
    res.status(500).json({
      memories: [],
      insights: ['Memory system error occurred'],
      recommendations: ['Consider using fallback planning'],
      confidence: 0.0,
    });
  }
});

// Search endpoint for hybrid memory retrieval
app.post('/search', async (req, res) => {
  try {
    const searchQuery = req.body;

    // Initialize enhanced memory system if needed
    enhancedMemorySystem = await getEnhancedMemorySystem();

    // Perform hybrid search
    const searchResults = await enhancedMemorySystem.searchMemories({
      query: searchQuery.query || 'Search query',
      limit: searchQuery.limit || 10,
      types: searchQuery.types,
      entities: searchQuery.entities,
      maxAge: searchQuery.maxAge,
    });

    res.json({
      results: searchResults.results,
      confidence: searchResults.confidence,
    });
  } catch (error) {
    console.warn('[memory] Search failed:', (error as Error).message);
    res.json({
      results: [],
      confidence: 0.0,
      _degraded: true,
      _degraded_reasons: ['enhanced_search_failed'],
    });
  }
});

// Thought storage endpoint
app.post('/thought', async (req, res) => {
  try {
    const thought = req.body;

    // Initialize enhanced memory system if needed
    enhancedMemorySystem = await getEnhancedMemorySystem();

    // Store thought as memory
    const chunkIds = await enhancedMemorySystem.ingestMemory({
      content: thought.content,
      type: 'thought',
      source: thought.attribution || 'cognitive-system',
      customMetadata: {
        thoughtType: thought.type,
        category: thought.category,
        priority: thought.priority,
        attribution: thought.attribution,
        timestamp: thought.timestamp,
      },
    });

    res.json({ success: true, id: chunkIds[0], chunkIds });
  } catch (error) {
    console.error('Failed to store thought:', error);
    res.status(500).json({ success: false, error: 'Failed to store thought' });
  }
});

// Execute memory action
app.post('/action', (req, res) => {
  try {
    const { action, parameters } = req.body;

    let result;
    switch (action) {
      case 'store_episodic':
        result = memorySystem.episodic.storeMemory(parameters);
        // Broadcast to SSE clients
        broadcastMemoryUpdate('eventAdded', {
          id: result?.id || `event-${Date.now()}`,
          timestamp: new Date().toISOString(),
          type: parameters.type || 'episodic',
          content: parameters.description || parameters.content,
          payload: parameters,
        });
        break;
      case 'retrieve_episodic':
        result = memorySystem.episodic.retrieveMemories(parameters);
        break;
      case 'store_semantic':
        result = memorySystem.semantic.storeEntity(parameters);
        break;
      case 'query_semantic':
        result = memorySystem.semantic.query(parameters);
        break;
      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }

    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: 'Failed to execute action' });
  }
});

// Control endpoint
app.post('/control', (req, res) => {
  try {
    const { action, parameters } = req.body;

    switch (action) {
      case 'pause':
        // Implement pause logic
        res.json({ status: 'paused' });
        break;
      case 'resume':
        // Implement resume logic
        res.json({ status: 'resumed' });
        break;
      case 'step':
        // Implement step logic
        res.json({ status: 'stepped' });
        break;
      default:
        res.status(400).json({ error: `Unknown control action: ${action}` });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to execute control action' });
  }
});

// ============================================================================
// Skill Registry Endpoints
// ============================================================================

// GET /skills - Get all skills
app.get('/skills', (req, res) => {
  try {
    const skills = memorySystem.skills.registry.getAllSkills();

    res.json({
      success: true,
      skills,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Error getting skills:', error);
    res.status(500).json({
      error: 'Failed to get skills',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /skills/stats - Get skill reuse statistics
app.get('/skills/stats', (req, res) => {
  try {
    const stats = memorySystem.skills.registry.getSkillReuseStats();

    res.json({
      success: true,
      stats,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Error getting skill stats:', error);
    res.status(500).json({
      error: 'Failed to get skill stats',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /skills/:id - Get specific skill
app.get('/skills/:id', (req, res) => {
  try {
    const { id } = req.params;
    const skill = memorySystem.skills.registry.getSkill(id);

    if (!skill) {
      return res.status(404).json({ error: 'Skill not found' });
    }

    res.json({
      success: true,
      skill,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Error getting skill:', error);
    res.status(500).json({
      error: 'Failed to get skill',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// POST /skills - Register new skill
app.post('/skills', (req, res) => {
  try {
    const skillData = req.body;
    const skill = memorySystem.skills.registry.registerSkill(skillData);

    res.json({
      success: true,
      skill,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Error registering skill:', error);
    res.status(500).json({
      error: 'Failed to register skill',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// POST /skills/usage - Record skill usage
app.post('/skills/usage', (req, res) => {
  try {
    const { skillId, success, duration } = req.body;

    if (
      !skillId ||
      typeof success !== 'boolean' ||
      typeof duration !== 'number'
    ) {
      return res
        .status(400)
        .json({ error: 'Missing required fields: skillId, success, duration' });
    }

    memorySystem.skills.registry.recordSkillUsage(skillId, success, duration);

    res.json({
      success: true,
      message: 'Skill usage recorded',
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Error recording skill usage:', error);
    res.status(500).json({
      error: 'Failed to record skill usage',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /curriculum - Get curriculum goals
app.get('/curriculum', (req, res) => {
  try {
    const { completedSkills } = req.query;
    const completedSkillsArray = completedSkills
      ? String(completedSkills).split(',')
      : [];

    const nextGoal =
      memorySystem.skills.registry.getNextCurriculumGoal(completedSkillsArray);

    res.json({
      success: true,
      nextGoal,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Error getting curriculum goal:', error);
    res.status(500).json({
      error: 'Failed to get curriculum goal',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// POST /curriculum/complete - Mark curriculum goal as completed
app.post('/curriculum/complete', (req, res) => {
  try {
    const { goalId } = req.body;

    if (!goalId) {
      return res.status(400).json({ error: 'Missing required field: goalId' });
    }

    memorySystem.skills.registry.completeCurriculumGoal(goalId);

    res.json({
      success: true,
      message: 'Curriculum goal completed',
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Error completing curriculum goal:', error);
    res.status(500).json({
      error: 'Failed to complete curriculum goal',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get memory system stats
app.get('/stats', (req, res) => {
  try {
    const stats = {
      episodic: memorySystem.episodic.getMemoryCount(),
      semantic: {
        entities: memorySystem.semantic.getEntityCount(),
        relationships: memorySystem.semantic.getRelationshipCount(),
      },
      working: {
        attentionLevel: memorySystem.working.getAttentionLevel(),
        currentContext: memorySystem.working.getCurrentContext(),
      },
      provenance: memorySystem.provenance.getActionCount(),
      versioning: memorySystem.versioning.getStats(),
    };

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Failed to get memory stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get memory stats',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Memory versioning endpoints
app.post('/versioning/activate', (req, res) => {
  try {
    const { worldSeed, worldName, sessionId } = req.body;

    const context: MemoryContext = {
      worldSeed,
      worldName,
      sessionId: sessionId || `session_${Date.now()}`,
      timestamp: Date.now(),
      version: '1.0.0',
    };

    const namespace =
      memorySystem.versioning.manager.activateNamespace(context);

    res.json({
      success: true,
      data: {
        namespace,
        message: `Activated namespace: ${namespace.id}`,
      },
    });
  } catch (error) {
    console.error('Failed to activate namespace:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to activate namespace',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

app.get('/versioning/namespaces', (req, res) => {
  try {
    const namespaces = memorySystem.versioning.getAllNamespaces();
    const activeNamespace = memorySystem.versioning.getActiveNamespace();

    res.json({
      success: true,
      data: {
        namespaces,
        activeNamespace,
      },
    });
  } catch (error) {
    console.error('Failed to get namespaces:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get namespaces',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

app.get('/versioning/active', (req, res) => {
  try {
    const activeNamespace = memorySystem.versioning.getActiveNamespace();

    res.json({
      success: true,
      data: activeNamespace,
    });
  } catch (error) {
    console.error('Failed to get active namespace:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get active namespace',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

app.get('/versioning/stats', (req, res) => {
  try {
    const stats = memorySystem.versioning.getStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Failed to get versioning stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get versioning stats',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Enhanced Memory System Endpoints
// ============================================================================

// Get enhanced memory system status
app.get('/enhanced/status', async (req, res) => {
  try {
    // Initialize enhanced system if needed
    enhancedMemorySystem = await getEnhancedMemorySystem();

    const status = await enhancedMemorySystem.getStatus();
    res.json({
      success: true,
      status,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get enhanced memory system status',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get current world seed
app.get('/enhanced/seed', (req, res) => {
  try {
    if (!currentWorldSeed || currentWorldSeed === '0') {
      return res.status(500).json({
        success: false,
        message:
          'WORLD_SEED is not set or is 0. Per-seed database isolation requires a valid world seed.',
      });
    }
    const baseName = memoryConfig.pg.database;
    const sanitizedSeed = currentWorldSeed.replace('-', 'n');
    res.json({
      success: true,
      worldSeed: currentWorldSeed,
      databaseName: `${baseName}_seed_${sanitizedSeed}`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get world seed information',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Set world seed at runtime (switches to a different per-seed database)
app.post('/enhanced/seed', async (req, res) => {
  try {
    const { worldSeed } = req.body;
    if (!worldSeed || String(worldSeed) === '0') {
      return res.status(400).json({
        success: false,
        message: 'worldSeed is required and must be non-zero.',
      });
    }

    const newSeed = String(worldSeed);

    // No-op if seed hasn't changed
    if (newSeed === currentWorldSeed) {
      const baseName = memoryConfig.pg.database;
      const sanitizedSeed = newSeed.replace('-', 'n');
      return res.json({
        success: true,
        message: 'Seed unchanged.',
        worldSeed: currentWorldSeed,
        databaseName: `${baseName}_seed_${sanitizedSeed}`,
      });
    }

    // Close existing system so the next request creates one with the new seed
    if (enhancedMemorySystem) {
      await enhancedMemorySystem.close();
      enhancedMemorySystem = null;
      enhancedMemoryInitPromise = null;
      enhancedMemoryInitSeed = null;
    }

    currentWorldSeed = newSeed;

    const baseName = memoryConfig.pg.database;
    const sanitizedSeed = newSeed.replace('-', 'n');
    res.json({
      success: true,
      message: `Seed updated to ${newSeed}. Database will be created on next request.`,
      worldSeed: currentWorldSeed,
      databaseName: `${baseName}_seed_${sanitizedSeed}`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update world seed',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get database information
app.get('/enhanced/database', async (req, res) => {
  try {
    // Initialize enhanced system if needed
    enhancedMemorySystem = await getEnhancedMemorySystem();

    const databaseName = enhancedMemorySystem.getDatabaseName();
    res.json({
      success: true,
      databaseName,
      configuration: {
        host: memoryConfig.pg.host,
        port: memoryConfig.pg.port,
        user: memoryConfig.pg.user,
        database: memoryConfig.pg.database,
        worldSeed: currentWorldSeed,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get database information',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================================================
// Database Management Endpoints
// ============================================================================

// GET /enhanced/stats — Database overview with chunk counts, entity/relationship counts, type distribution
app.get('/enhanced/stats', async (req, res) => {
  try {
    enhancedMemorySystem = await getEnhancedMemorySystem();

    // Always try to get status (works even without full DB init)
    const status = await enhancedMemorySystem.getStatus();
    const baseName = memoryConfig.pg.database;
    const sanitizedSeed = currentWorldSeed.replace('-', 'n');
    const databaseName = status.database?.name || `${baseName}_seed_${sanitizedSeed}`;

    // Try to get detailed stats, but fall back gracefully
    let stats: any = null;
    try {
      stats = await enhancedMemorySystem.getStats();
    } catch (err) {
      console.warn('[memory] Stats query failed:', (err as Error).message);
    }

    res.json({
      success: true,
      data: {
        databaseName,
        worldSeed: currentWorldSeed,
        totalChunks: stats?.totalMemories ?? status.database?.totalChunks ?? 0,
        entityCount: stats?.typeDistribution
          ? (Object.values(stats.typeDistribution) as number[]).reduce((a: number, b: number) => a + b, 0)
          : 0,
        relationshipCount: 0,
        memoryTypeDistribution: stats?.typeDistribution ?? {},
        tableSizeBytes: 0,
        indexInfo: [],
        services: status.services,
        configuration: status.configuration,
      },
    });
  } catch (error) {
    console.error('Failed to get enhanced stats:', error);
    // Even on error, return a minimal response so the UI doesn't break
    const baseName = memoryConfig.pg.database;
    const sanitizedSeed = currentWorldSeed.replace('-', 'n');
    res.json({
      success: true,
      data: {
        databaseName: `${baseName}_seed_${sanitizedSeed}`,
        worldSeed: currentWorldSeed,
        totalChunks: 0,
        entityCount: 0,
        relationshipCount: 0,
        memoryTypeDistribution: {},
        tableSizeBytes: 0,
        indexInfo: [],
      },
    });
  }
});

// GET /enhanced/memories — Browse memory chunks with pagination (S4, S7)
app.get('/enhanced/memories', async (req, res) => {
  try {
    enhancedMemorySystem = await getEnhancedMemorySystem();

    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const type = req.query.type as string | undefined;
    const sortBy = (req.query.sortBy as string) || 'created';
    const contentPreviewLength = parseInt(req.query.contentPreviewLength as string) || 200;
    const includeReflections = req.query.includeReflections === 'true';

    let memories: any[] = [];
    try {
      const searchResults = await enhancedMemorySystem.searchMemories({
        query: '*',
        limit: limit,
        types: type ? [type] : undefined,
      });

      memories = (searchResults.results || [])
        .filter((r: any) => {
          // S4: Exclude reflection subtypes by default
          if (!includeReflections) {
            const meta = r.metadata || r.chunk?.metadata || {};
            const subtype = meta.memorySubtype;
            if (subtype && ['reflection', 'lesson', 'narrative_checkpoint'].includes(subtype)) {
              return false;
            }
          }
          return true;
        })
        .map((r: any) => ({
          id: r.id || r.chunk?.id || 'unknown',
          content: (r.content || r.chunk?.content || '').slice(0, contentPreviewLength),
          memoryType: r.type || r.chunk?.decayProfile?.memoryType || 'unknown',
          importance: r.importance ?? r.chunk?.decayProfile?.importance ?? 0,
          accessCount: r.chunk?.decayProfile?.accessCount ?? 0,
          lastAccessed: r.chunk?.decayProfile?.lastAccessed ?? 0,
          createdAt: r.chunk?.createdAt ?? 0,
          entityCount: r.chunk?.entities?.length ?? 0,
          relationshipCount: r.chunk?.relationships?.length ?? 0,
        }));
    } catch (err) {
      console.warn('[memory] Enhanced memories browse failed:', (err as Error).message);
    }

    res.json({
      success: true,
      data: {
        memories,
        page,
        limit,
        total: memories.length,
      },
    });
  } catch (error) {
    console.error('Failed to browse memories:', error);
    res.json({
      success: true,
      data: { memories: [], page: 1, limit: 20, total: 0 },
    });
  }
});

// GET /enhanced/knowledge-graph — Knowledge graph summary
app.get('/enhanced/knowledge-graph', async (req, res) => {
  try {
    enhancedMemorySystem = await getEnhancedMemorySystem();

    let stats: any = null;
    try {
      stats = await enhancedMemorySystem.getStats();
    } catch (err) {
      console.warn('[memory] Knowledge graph stats failed:', (err as Error).message);
    }

    res.json({
      success: true,
      data: {
        topEntities: [],
        entityTypeDistribution: stats?.typeDistribution ?? {},
        relationshipTypeDistribution: {},
        totalEntities: stats?.totalMemories ?? 0,
        totalRelationships: 0,
      },
    });
  } catch (error) {
    console.error('Failed to get knowledge graph:', error);
    res.json({
      success: true,
      data: {
        topEntities: [],
        entityTypeDistribution: {},
        relationshipTypeDistribution: {},
        totalEntities: 0,
        totalRelationships: 0,
      },
    });
  }
});

// GET /enhanced/embeddings-3d — Fetch embeddings, reduce via UMAP service, return 3D points for visualization
app.get('/enhanced/embeddings-3d', async (req, res) => {
  try {
    enhancedMemorySystem = await getEnhancedMemorySystem();
    const vectorDb = enhancedMemorySystem.getVectorDatabase();

    const limit = Math.min(parseInt(req.query.limit as string) || 500, 2000);
    const memoryTypes = req.query.types
      ? (req.query.types as string).split(',')
      : undefined;
    const minImportance = parseFloat(req.query.minImportance as string) || 0;

    // Fetch raw embeddings from the vector database
    const data = await vectorDb.getEmbeddingsForVisualization({
      limit,
      memoryTypes,
      minImportance,
    });

    if (data.embeddings.length < 5) {
      return res.json({
        points: [],
        message: 'Not enough memories for visualization (need 5+)',
        count: data.embeddings.length,
      });
    }

    // Call UMAP endpoint on MLX sidecar for dimensionality reduction
    // (UMAP is now consolidated into the MLX sidecar service on port 5002)
    const { umapHost, umapPort } = memoryConfig;

    try {
      const umapResponse = await fetch(`http://${umapHost}:${umapPort}/reduce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeddings: data.embeddings,
          ids: data.ids,
          metadata: data.metadata,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!umapResponse.ok) {
        throw new Error(`UMAP service error: ${umapResponse.statusText}`);
      }

      const result = await umapResponse.json();
      res.json(result);
    } catch (umapError) {
      // Graceful fallback: return empty visualization with informative message
      // when the MLX sidecar is unavailable
      const errorMsg = umapError instanceof Error ? umapError.message : 'Unknown error';
      console.warn(`[embeddings-3d] UMAP service unavailable (${umapHost}:${umapPort}): ${errorMsg}`);
      res.json({
        points: [],
        message: `UMAP service unavailable. Start the MLX sidecar on port ${umapPort} to enable 3D embedding visualization.`,
        count: data.embeddings.length,
        serviceStatus: 'unavailable',
      });
    }
  } catch (error) {
    console.error('[embeddings-3d] Error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
      points: [],
    });
  }
});

// GET /enhanced/embedding-health — Embedding health metrics
app.get('/enhanced/embedding-health', async (req, res) => {
  try {
    enhancedMemorySystem = await getEnhancedMemorySystem();

    const status = await enhancedMemorySystem.getStatus();

    res.json({
      success: true,
      data: {
        dimension: status.configuration?.embeddingDimension ?? 768,
        totalEmbeddings: status.database?.totalChunks ?? 0,
        normStats: { min: 0, max: 0, avg: 0, stddev: 0 },
        indexType: 'HNSW',
        indexSize: status.database?.storageSize ?? '0MB',
        sampleSimilarityDistribution: [],
      },
    });
  } catch (error) {
    console.error('Failed to get embedding health:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get embedding health',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// POST /enhanced/reset — Truncate all memory tables for the current seed database
app.post('/enhanced/reset', async (req, res) => {
  try {
    const { confirm } = req.body;
    const worldSeed = currentWorldSeed || '0';

    if (!confirm || confirm !== worldSeed) {
      return res.status(400).json({
        success: false,
        message: `Confirmation does not match. Send { "confirm": "${worldSeed}" } to reset.`,
      });
    }

    let cleaned = 0;
    try {
      enhancedMemorySystem = await getEnhancedMemorySystem();
      try {
        cleaned = await enhancedMemorySystem.cleanup(0);
      } catch (cleanupError) {
        const msg =
          cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
        if (msg.includes('does not exist')) {
          cleaned = 0;
        } else {
          throw cleanupError;
        }
      }
    } catch (initOrCleanupError) {
      const msg =
        initOrCleanupError instanceof Error
          ? initOrCleanupError.message
          : String(initOrCleanupError);
      if (
        msg.includes('does not exist') ||
        msg.includes('permission denied to create extension')
      ) {
        cleaned = 0;
      } else {
        throw initOrCleanupError;
      }
    }

    res.json({
      success: true,
      message: `Database reset complete. Removed ${cleaned} records.`,
      removedCount: cleaned,
    });
  } catch (error) {
    console.error('Failed to reset database:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset database',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// POST /enhanced/drop — Drop the entire per-seed database
app.post('/enhanced/drop', async (req, res) => {
  try {
    const { confirm } = req.body;
    const baseName = memoryConfig.pg.database;
    const sanitizedSeed = currentWorldSeed.replace('-', 'n');
    const expectedName = `${baseName}_seed_${sanitizedSeed}`;

    if (!confirm || confirm !== expectedName) {
      return res.status(400).json({
        success: false,
        message: `Confirmation does not match. Send { "confirm": "${expectedName}" } to drop.`,
      });
    }

    // Close the existing enhanced memory system connection
    if (enhancedMemorySystem) {
      await enhancedMemorySystem.close();
      enhancedMemorySystem = null;
      enhancedMemoryInitPromise = null;
      enhancedMemoryInitSeed = null;
    }

    res.json({
      success: true,
      message: `Database "${expectedName}" drop requested. The database connection has been closed. Manual DROP DATABASE is required for full removal.`,
    });
  } catch (error) {
    console.error('Failed to drop database:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to drop database',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================================================
// Reflection, Consolidation & Single-Memory Endpoints
// ============================================================================

// GET /enhanced/reflections — Query DB for reflections with pagination (S3: DB is canonical)
app.get('/enhanced/reflections', async (req, res) => {
  try {
    enhancedMemorySystem = await getEnhancedMemorySystem();

    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const includePlaceholders = req.query.includePlaceholders === 'true';

    // S3: All listing queries go to PostgreSQL with proper offset-based pagination
    let reflections: any[] = [];
    let total = 0;
    let lessons: any[] = [];
    let narrative: any = null;

    try {
      // Reflections from DB with real pagination (ordered by created_at DESC)
      const reflectionResult = await enhancedMemorySystem.queryReflections({
        subtypes: ['reflection'],
        limit,
        page,
        includePlaceholders,
      });
      reflections = reflectionResult.items.map((r: any) => {
        const meta = r.metadata || {};
        return {
          id: r.id,
          type: meta.reflectionType || meta.memorySubtype || 'unknown',
          content: r.content || '',
          timestamp: r.createdAt || meta.timestamp || 0,
          emotionalValence: meta.emotionalValence ?? 0,
          confidence: meta.confidence ?? 0.5,
          insights: meta.insights || [],
          lessons: meta.lessons || [],
          tags: meta.tags || [],
          isPlaceholder: meta.isPlaceholder ?? false,
          memorySubtype: meta.memorySubtype,
          dedupeKey: meta.dedupeKey,
          significance: meta.significance,
          narrativeArc: meta.narrativeArc,
          emotionalTone: meta.emotionalTone,
          title: meta.title,
        };
      });
      total = reflectionResult.total;

      // Lessons from DB (not in-memory) — separate subtype query
      const lessonResult = await enhancedMemorySystem.queryReflections({
        subtypes: ['lesson'],
        limit: 50,
        page: 1,
        includePlaceholders,
      });
      lessons = lessonResult.items.map((r: any) => {
        const meta = r.metadata || {};
        return {
          id: r.id,
          content: r.content || '',
          category: meta.category || 'general',
          effectiveness: meta.effectiveness ?? 0,
          applicationCount: meta.applicationCount ?? 0,
        };
      });

      // Latest narrative checkpoint from DB (not in-memory)
      const narrativeResult = await enhancedMemorySystem.queryReflections({
        subtypes: ['narrative_checkpoint'],
        limit: 1,
        page: 1,
        includePlaceholders,
      });
      if (narrativeResult.items.length > 0) {
        const r = narrativeResult.items[0];
        const meta = r.metadata || {};
        narrative = {
          id: r.id,
          title: meta.title || 'Narrative Checkpoint',
          summary: r.content || '',
          timestamp: r.createdAt || meta.timestamp || 0,
          significance: meta.significance ?? 0,
          narrativeArc: meta.narrativeArc || 'unknown',
          emotionalTone: meta.emotionalTone || 'neutral',
        };
      }
    } catch (err) {
      console.warn('[memory] Reflections query failed:', (err as Error).message);
    }

    res.json({
      success: true,
      data: {
        reflections,
        lessons,
        narrative,
        page,
        limit,
        total,
      },
    });
  } catch (error) {
    console.error('Failed to get reflections:', error);
    res.json({
      success: true,
      data: { reflections: [], lessons: [], narrative: null, page: 1, limit: 20, total: 0 },
    });
  }
});

// POST /enhanced/reflections — Create a new reflection (S2: dedupeKey rejection)
app.post('/enhanced/reflections', async (req, res) => {
  try {
    enhancedMemorySystem = await getEnhancedMemorySystem();

    const { type, content, context, lessons, insights, dedupeKey, isPlaceholder } = req.body;

    if (!type || !content) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: type, content',
      });
    }

    // S2: Direct DB-backed dedupe check using metadata JSONB index
    // Checks pending registry → in-memory map → DB in that order
    if (dedupeKey) {
      try {
        const exists = await enhancedMemorySystem.findByDedupeKey(dedupeKey);
        if (exists) {
          return res.json({
            success: true,
            status: 'duplicate',
            source: 'preflight',
            message: `Reflection with dedupeKey "${dedupeKey}" already exists`,
          });
        }
      } catch (err) {
        console.warn('[memory] Dedupe preflight check failed, proceeding with creation:', (err as Error).message);
      }
    }

    // dedupeKey is threaded through to become reflection.id and metadata.dedupeKey
    // isPlaceholder is preserved for metadata contract
    const reflection = await enhancedMemorySystem.addReflection(
      type,
      content,
      context || { emotionalState: 'neutral', currentGoals: [], recentEvents: [], location: null, timeOfDay: 'unknown' },
      lessons || [],
      insights || [],
      dedupeKey,
      isPlaceholder
    );

    // Broadcast to SSE clients
    broadcastMemoryUpdate('noteAdded', {
      id: reflection.id,
      timestamp: new Date().toISOString(),
      type: type,
      title: reflection.title || '',
      content: content,
      source: 'reflection',
      confidence: reflection.confidence || 0,
    });

    res.json({
      success: true,
      data: reflection,
    });
  } catch (error: any) {
    // S2b: Translate DB unique constraint violation (23505) into duplicate response
    // This is the backstop for multi-process scenarios where the preflight check
    // passed but another process persisted the same dedupeKey before us.
    if (error?.code === '23505' || error?.message?.includes('duplicate key')) {
      const dedupeKey = req.body?.dedupeKey || 'unknown';
      console.log(`DB unique constraint caught duplicate: ${dedupeKey}`);
      return res.json({
        success: true,
        status: 'duplicate',
        source: 'db_constraint',
        message: `Reflection with dedupeKey "${dedupeKey}" already exists (DB constraint)`,
      });
    }

    console.error('Failed to create reflection:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create reflection',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// POST /enhanced/consolidate — Trigger memory consolidation (S6: single-flight lock)
let consolidationRunning = false;
let pendingConsolidationTrigger: string | null = null;

app.post('/enhanced/consolidate', async (req, res) => {
  const { trigger, dedupeKey } = req.body || {};

  if (consolidationRunning) {
    pendingConsolidationTrigger = trigger || 'unknown';
    return res.json({
      success: true,
      status: 'coalesced',
      message: 'Consolidation already running; will run again after.',
    });
  }

  consolidationRunning = true;
  try {
    enhancedMemorySystem = await getEnhancedMemorySystem();
    const decayResult = await enhancedMemorySystem.evaluateMemoryDecay();
    const narrative = enhancedMemorySystem.getNarrativeCheckpoint();

    res.json({
      success: true,
      data: {
        trigger: trigger || 'manual',
        dedupeKey,
        decayResult,
        narrative,
        consolidatedAt: Date.now(),
      },
    });
  } catch (error) {
    console.error('Failed to run consolidation:', error);
    res.status(500).json({
      success: false,
      message: 'Consolidation failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  } finally {
    consolidationRunning = false;
    // If a trigger was coalesced, run one more pass
    if (pendingConsolidationTrigger) {
      const coalescedTrigger = pendingConsolidationTrigger;
      pendingConsolidationTrigger = null;
      setImmediate(async () => {
        consolidationRunning = true;
        try {
          enhancedMemorySystem = await getEnhancedMemorySystem();
          await enhancedMemorySystem.evaluateMemoryDecay();
          console.log(`Coalesced consolidation pass completed (trigger: ${coalescedTrigger})`);
        } catch (err) {
          console.warn('Coalesced consolidation pass failed:', err);
        } finally {
          consolidationRunning = false;
        }
      });
    }
  }
});

// GET /enhanced/memories/:id — Full content of a single memory chunk (S7)
app.get('/enhanced/memories/:id', async (req, res) => {
  try {
    enhancedMemorySystem = await getEnhancedMemorySystem();
    const memory = await enhancedMemorySystem.getMemoryById(req.params.id);

    if (!memory) {
      return res.status(404).json({
        success: false,
        message: 'Memory not found',
      });
    }

    res.json({
      success: true,
      data: memory,
    });
  } catch (error) {
    console.error('Failed to get memory by id:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get memory',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Start server
app.listen(port, () => {
  console.log(`[Memory] Server running on port ${port}`);
  console.log(`[Memory] Endpoints: /live, /ready, /health, /enhanced/* (status, seed, database, stats)`);
});

export default app;
