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

// Mutable world seed — can be updated at runtime via POST /enhanced/seed
let currentWorldSeed: string = process.env.WORLD_SEED || '';

// Initialize enhanced memory system (lazy initialization)
let enhancedMemorySystem: any = null;

async function getEnhancedMemorySystem() {
  if (!enhancedMemorySystem) {
    enhancedMemorySystem = createEnhancedMemorySystem(
      createDefaultMemoryConfig(currentWorldSeed)
    );
    await enhancedMemorySystem.initialize();
  }
  return enhancedMemorySystem;
}

const app: express.Application = express();
const port = process.env.PORT ? parseInt(process.env.PORT) : 3001;

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

let systemReady = process.env.SYSTEM_READY_ON_BOOT === '1';
let readyAt: string | null = systemReady ? new Date().toISOString() : null;
let readySource: string | null = systemReady ? 'env' : null;

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

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    system: 'memory',
    timestamp: Date.now(),
    version: '0.1.0',
    enhancedMemorySystem: {
      available: true,
      description:
        'New vector search + GraphRAG system with per-seed isolation',
      endpoints: ['/enhanced/status', '/enhanced/seed', '/enhanced/database'],
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
    console.error('Failed to perform memory search:', error);
    res.status(500).json({
      results: [],
      confidence: 0.0,
      error: 'Search service unavailable',
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
    const baseName = process.env.PG_DATABASE || 'conscious_bot';
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
      const baseName = process.env.PG_DATABASE || 'conscious_bot';
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
    }

    currentWorldSeed = newSeed;
    process.env.WORLD_SEED = newSeed;

    const baseName = process.env.PG_DATABASE || 'conscious_bot';
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
        host: process.env.PG_HOST || 'localhost',
        port: parseInt(process.env.PG_PORT || '5432'),
        user: process.env.PG_USER || 'postgres',
        database: process.env.PG_DATABASE || 'conscious_bot',
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
    const baseName = process.env.PG_DATABASE || 'conscious_bot';
    const sanitizedSeed = currentWorldSeed.replace('-', 'n');
    const databaseName = status.database?.name || `${baseName}_seed_${sanitizedSeed}`;

    // Try to get detailed stats, but fall back gracefully
    let stats: any = null;
    try {
      stats = await enhancedMemorySystem.getStats();
    } catch {
      // Database may not be fully initialized — use status data instead
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
    const baseName = process.env.PG_DATABASE || 'conscious_bot';
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
    } catch {
      // Database not available — return empty
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
    } catch {
      // Database not available
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
    const umapHost = process.env.MLX_SIDECAR_HOST || process.env.UMAP_SERVICE_HOST || 'localhost';
    const umapPort = process.env.MLX_SIDECAR_PORT || process.env.UMAP_SERVICE_PORT || '5002';

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
    const worldSeed = process.env.WORLD_SEED || '0';

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
    const baseName = process.env.PG_DATABASE || 'conscious_bot';
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
    } catch {
      // Database not available — return empty
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
      } catch {
        // DB check failure — proceed with creation (write queue will also dedupe)
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
  console.log(`[Memory] Endpoints: /health, /enhanced/* (status, seed, database, stats)`);
});

export default app;
