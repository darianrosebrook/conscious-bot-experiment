/**
 * Telemetry routes: state, telemetry, stress, interoception history.
 */

import { Router } from 'express';
import { CognitiveMetricsTracker } from '../cognitive-metrics-tracker';
import { CognitiveStateTracker } from '../cognitive-state-tracker';
import {
  calculateCognitiveLoad,
  calculateAttentionLevel,
  calculateCreativityLevel,
  getActiveProcessCount,
  getSystemCpuUsage,
} from '../server-utils/cognitive-load-calculators';

export interface TelemetryRouteDeps {
  metricsTracker: CognitiveMetricsTracker;
  cognitiveStateTracker: CognitiveStateTracker;
  cognitionSystem: {
    cognitiveCore: {
      contextOptimizer: { isActive: () => boolean };
      conversationManager: { isActive: () => boolean };
      creativeSolver: { isActive: () => boolean };
    };
    constitutionalFilter: { getRulesCount: () => number };
    intrusionInterface: { isActive: () => boolean };
    selfModel: { getIdentityCount: () => number; getActiveIdentities: () => any[] };
    socialCognition: { getAgentCount: () => number; getRelationshipCount: () => number };
  };
  getInteroState: () => any;
  getInteroHistory: (since: number, limit: number) => any[];
  getInteroHistorySummary: () => any;
  halveStressAxes: () => void;
  setSpawnPosition: (pos: { x: number; y: number; z: number }) => void;
  resetTimers: () => void;
  getNetworkRequestCount: () => number;
}

export function createTelemetryRoutes(deps: TelemetryRouteDeps): Router {
  const router = Router();

  // Get cognition system state
  router.get('/state', (_req, res) => {
    try {
      const state = {
        cognitiveCore: {
          contextOptimizer: {
            active: deps.cognitionSystem.cognitiveCore.contextOptimizer.isActive(),
            optimizationCount: deps.metricsTracker.getOptimizationCount(),
          },
          conversationManager: {
            activeConversations:
              deps.cognitiveStateTracker.getActiveConversationCount(),
            totalConversations: deps.metricsTracker.getConversationCount(),
          },
          creativeSolver: {
            active: deps.cognitionSystem.cognitiveCore.creativeSolver.isActive(),
            solutionsGenerated: deps.metricsTracker.getSolutionsGenerated(),
          },
        },
        constitutionalFilter: {
          rulesCount: deps.cognitionSystem.constitutionalFilter.getRulesCount(),
          violationsBlocked: deps.metricsTracker.getViolationsBlocked(),
        },
        intrusionInterface: {
          active: deps.cognitionSystem.intrusionInterface.isActive(),
          intrusionsHandled: deps.metricsTracker.getIntrusionsHandled(),
        },
        selfModel: {
          identityCount: deps.cognitionSystem.selfModel.getIdentityCount(),
          activeIdentities: deps.cognitionSystem.selfModel.getActiveIdentities(),
        },
        socialCognition: {
          agentModels: deps.cognitionSystem.socialCognition.getAgentCount(),
          relationships: deps.cognitionSystem.socialCognition.getRelationshipCount(),
        },
        intero: deps.getInteroState(),
      };

      res.json(state);
    } catch (error) {
      console.error('Error getting cognition state:', error);
      res.status(500).json({ error: 'Failed to get cognition state' });
    }
  });

  // Halve stress axes (e.g. after sleep or respawn at bed)
  router.post('/stress/reset', (req, res) => {
    try {
      const body = req.body || {};
      if (body.spawnPosition && typeof body.spawnPosition === 'object') {
        deps.setSpawnPosition({
          x: body.spawnPosition.x ?? 0,
          y: body.spawnPosition.y ?? 64,
          z: body.spawnPosition.z ?? 0,
        });
      }
      deps.resetTimers();
      deps.halveStressAxes();
      res.json({ intero: deps.getInteroState() });
    } catch (error) {
      console.error('Error resetting stress:', error);
      res.status(500).json({ error: 'Failed to reset stress' });
    }
  });

  // Interoception history for evaluation dashboard
  router.get('/intero/history', (req, res) => {
    const since = parseInt(req.query.since as string) || 0;
    const limit = Math.min(parseInt(req.query.limit as string) || 300, 1800);
    res.json({
      success: true,
      snapshots: deps.getInteroHistory(since, limit),
      summary: deps.getInteroHistorySummary(),
      currentIntero: deps.getInteroState(),
    });
  });

  // Stress boundary decision stats for evaluation dashboard
  router.get('/intero/boundary-stats', (_req, res) => {
    try {
      const fs = require('fs');
      const logPath =
        process.env.STRESS_BOUNDARY_LOG_PATH || 'stress-boundary.log';
      const eventCounts: Record<string, number> = {
        observation_thought: 0,
        intrusion_accept: 0,
        intrusion_resist: 0,
        task_selected: 0,
      };
      let totalEvents = 0;

      try {
        if (fs.existsSync(logPath)) {
          const raw = fs.readFileSync(logPath, 'utf-8');
          const lines = raw.split('\n').filter((l: string) => l.trim());
          for (const line of lines) {
            try {
              const entry = JSON.parse(line);
              if (entry.event && eventCounts[entry.event] !== undefined) {
                eventCounts[entry.event]++;
                totalEvents++;
              }
            } catch {
              // Skip malformed lines
            }
          }
        }
      } catch {
        // Log file unreadable
      }

      const accepts = eventCounts.intrusion_accept;
      const resists = eventCounts.intrusion_resist;
      const acceptResistRatio =
        accepts + resists > 0 ? accepts / (accepts + resists) : 0;

      res.json({
        success: true,
        totalEvents,
        eventCounts,
        acceptResistRatio: Math.round(acceptResistRatio * 100) / 100,
      });
    } catch (error) {
      console.error('Error reading boundary stats:', error);
      res.status(500).json({ error: 'Failed to read boundary stats' });
    }
  });

  // Get telemetry data
  router.get('/telemetry', (_req, res) => {
    try {
      const telemetry = {
        events: [
          {
            id: `cognition-${Date.now()}`,
            timestamp: Date.now(),
            source: 'cognition-system',
            type: 'cognition_state',
            data: {
              cognitiveLoad: calculateCognitiveLoad(deps.getNetworkRequestCount),
              attentionLevel: calculateAttentionLevel(),
              creativityLevel: calculateCreativityLevel(),
              metrics: {
                activeProcesses: getActiveProcessCount(),
                memoryUsage: process.memoryUsage(),
                uptime: process.uptime(),
                cpuUsage: getSystemCpuUsage(),
                networkRequests: deps.getNetworkRequestCount(),
              },
            },
          },
        ],
      };

      res.json(telemetry);
    } catch (error) {
      console.error('Error getting cognition telemetry:', error);
      res.status(500).json({ error: 'Failed to get telemetry' });
    }
  });

  return router;
}
