/**
 * System routes: health, readiness, thought generation control.
 */

import { Router } from 'express';

export interface SystemRouteDeps {
  startThoughtGeneration: () => void;
  stopThoughtGeneration: () => void;
  isRunning: () => boolean;
  getReadyState: () => { ready: boolean; readyAt: string | null; source: string | null };
  markReady: (source: string) => void;
  getTtsEnabled: () => boolean;
  setTtsEnabled: (enabled: boolean) => void;
}

export function createSystemRoutes(deps: SystemRouteDeps): Router {
  const router = Router();

  // Health check endpoint
  router.get('/health', (_req, res) => {
    res.json({
      status: 'healthy',
      system: 'cognition',
      timestamp: Date.now(),
      version: '0.1.0',
    });
  });

  // Startup readiness endpoint
  router.get('/system/ready', (_req, res) => {
    res.json(deps.getReadyState());
  });

  router.post('/system/ready', (req, res) => {
    const source =
      typeof req.body?.source === 'string' ? req.body.source : 'startup';
    deps.markReady(source);
    const state = deps.getReadyState();
    res.json({ ready: state.ready, readyAt: state.readyAt, accepted: true });
  });

  // Start thought generation endpoint
  router.post('/start-thoughts', (_req, res) => {
    try {
      deps.startThoughtGeneration();
      res.json({
        success: true,
        message: 'Enhanced thought generator started',
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Error starting thought generation:', error);
      res.status(500).json({
        error: 'Failed to start thought generation',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Stop thought generation endpoint
  router.post('/stop-thoughts', (_req, res) => {
    try {
      deps.stopThoughtGeneration();
      res.json({
        success: true,
        message: 'Enhanced thought generator stopped',
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Error stopping thought generation:', error);
      res.status(500).json({
        error: 'Failed to stop thought generation',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Get thought generation status endpoint
  router.get('/thoughts-status', (_req, res) => {
    res.json({
      isRunning: deps.isRunning(),
      interval: deps.isRunning() ? 30000 : null,
      timestamp: Date.now(),
    });
  });

  // TTS status endpoint
  router.get('/tts/status', (_req, res) => {
    res.json({
      enabled: deps.getTtsEnabled(),
      timestamp: Date.now(),
    });
  });

  // TTS toggle endpoint
  router.post('/tts/toggle', (req, res) => {
    const body = req.body;
    const enabled = typeof body?.enabled === 'boolean'
      ? body.enabled
      : !deps.getTtsEnabled();
    deps.setTtsEnabled(enabled);
    res.json({
      enabled: deps.getTtsEnabled(),
      timestamp: Date.now(),
    });
  });

  return router;
}
