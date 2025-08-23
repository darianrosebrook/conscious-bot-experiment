/**
 * Memory System HTTP Server
 *
 * Provides HTTP API endpoints for the memory system.
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
import { createWorkingMemory } from './working';
import { createSemanticMemory } from './semantic';
import { createProvenanceSystem } from './provenance';

const app = express();
const port = process.env.PORT ? parseInt(process.env.PORT) : 3001;

// Middleware
app.use(cors());
app.use(express.json());

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
    storeMemory: (memory: any) =>
      memorySystem.episodic.eventLogger.logExperience(
        memory.type,
        memory.description,
        memory
      ),
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
    getRecentActions: (count: number) => [], // TODO: Implement recent actions retrieval
  },
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    system: 'memory',
    timestamp: Date.now(),
    version: '0.1.0',
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

// Start server
app.listen(port, () => {
  console.log(`Memory system server running on port ${port}`);
  console.log(`Health check: http://localhost:${port}/health`);
});

export default app;
