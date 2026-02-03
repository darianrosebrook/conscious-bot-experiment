/**
 * Reasoning routes: ReAct reasoning, step generation, reflection.
 */

import { Router } from 'express';
import { ReActArbiter } from '../react-arbiter/ReActArbiter';
import { generateTaskSteps } from '../server-utils/step-generation-helpers';

export interface ReasoningRouteDeps {
  reactArbiter: ReActArbiter;
}

export function createReasoningRoutes(deps: ReasoningRouteDeps): Router {
  const router = Router();

  // POST /reason - Execute a single ReAct reasoning step
  router.post('/reason', async (req, res) => {
    try {
      const {
        snapshot,
        inventory,
        goalStack,
        memorySummaries,
        lastToolResult,
        reflexionHints,
      } = req.body;

      // Validate required fields
      if (!snapshot || !inventory || !goalStack) {
        return res.status(400).json({
          error: 'Missing required fields: snapshot, inventory, goalStack',
        });
      }

      const context = {
        snapshot,
        inventory,
        goalStack,
        memorySummaries: memorySummaries || [],
        lastToolResult,
        reflexionHints,
      };

      const step = await deps.reactArbiter.reason(context);

      res.json({
        success: true,
        step,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('ReAct reasoning failed:', error);
      res.status(500).json({
        error: 'ReAct reasoning failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /** @deprecated Planning service no longer calls this endpoint (Phase 2, Change C).
   *  Kept for dashboard/external consumers. Do not add new callers. */
  // POST /generate-steps - Generate task steps from cognitive system
  router.post('/generate-steps', async (req, res) => {
    try {
      const { task, context } = req.body;

      // Validate required fields
      if (!task || !task.title) {
        return res.status(400).json({
          error: 'Missing required fields: task.title',
        });
      }

      console.log('Generating dynamic steps for task:', task.title);

      // Use the new method from ReAct Arbiter to generate task-specific steps
      const steps = await generateTaskSteps(deps.reactArbiter, task, context);

      console.log('Generated dynamic steps:', steps);

      res.json({
        success: true,
        steps,
        reasoning: `Generated ${steps.length} steps for task: ${task.title}`,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Dynamic step generation failed:', error);
      res.status(500).json({
        error: 'Dynamic step generation failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // POST /reflect - Generate Reflexion-style verbal self-feedback
  router.post('/reflect', async (req, res) => {
    try {
      const { episodeTrace, outcome, errors } = req.body;

      // Validate required fields
      if (!episodeTrace || !outcome) {
        return res.status(400).json({
          error: 'Missing required fields: episodeTrace, outcome',
        });
      }

      if (!['success', 'failure'].includes(outcome)) {
        return res.status(400).json({
          error: 'Outcome must be either "success" or "failure"',
        });
      }

      const reflection = await deps.reactArbiter.reflect(
        episodeTrace,
        outcome,
        errors
      );

      res.json({
        success: true,
        reflection,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Reflection generation failed:', error);
      res.status(500).json({
        error: 'Reflection generation failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}
