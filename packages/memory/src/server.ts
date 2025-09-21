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
  DEFAULT_MEMORY_CONFIG,
} from './memory-system';

// Initialize enhanced memory system (lazy initialization)
let enhancedMemorySystem: any = null;

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
      const allDecisions = memorySystem.provenance.system.decisionTracker.getAllDecisions()
        .sort((a, b) => b.timestamp - a.timestamp);
      
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
              result: action.result
            });
          }
        }
        
        // Stop when we have enough actions
        if (actions.length >= count) break;
      }
      
      // Sort actions by timestamp (most recent first) and return requested count
      return actions
        .sort((a, b) => b.timestamp - a.timestamp)
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

// Execute memory action
app.post('/action', (req, res) => {
  try {
    const { action, parameters } = req.body;

    let result;
    switch (action) {
      case 'store_episodic':
        result = memorySystem.episodic.storeMemory(parameters);
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
    if (!enhancedMemorySystem) {
      enhancedMemorySystem = createEnhancedMemorySystem(DEFAULT_MEMORY_CONFIG);
      await enhancedMemorySystem.initialize();
    }

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
    const worldSeed = process.env.WORLD_SEED || '0';
    res.json({
      success: true,
      worldSeed: parseInt(worldSeed),
      databaseName:
        worldSeed !== '0'
          ? `${process.env.PG_DATABASE || 'conscious_bot'}_seed_${worldSeed}`
          : process.env.PG_DATABASE || 'conscious_bot',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get world seed information',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get database information
app.get('/enhanced/database', async (req, res) => {
  try {
    // Initialize enhanced system if needed
    if (!enhancedMemorySystem) {
      enhancedMemorySystem = createEnhancedMemorySystem(DEFAULT_MEMORY_CONFIG);
      await enhancedMemorySystem.initialize();
    }

    const databaseName = enhancedMemorySystem.getDatabaseName();
    res.json({
      success: true,
      databaseName,
      configuration: {
        host: process.env.PG_HOST || 'localhost',
        port: parseInt(process.env.PG_PORT || '5432'),
        user: process.env.PG_USER || 'postgres',
        database: process.env.PG_DATABASE || 'conscious_bot',
        worldSeed: parseInt(process.env.WORLD_SEED || '0'),
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

// Start server
app.listen(port, () => {
  console.log(`Memory system server running on port ${port}`);
  console.log(`Health check: http://localhost:${port}/health`);
  console.log(
    `Enhanced system status: http://localhost:${port}/enhanced/status`
  );
  console.log(`Current seed info: http://localhost:${port}/enhanced/seed`);
  console.log(`Database info: http://localhost:${port}/enhanced/database`);
});

export default app;
