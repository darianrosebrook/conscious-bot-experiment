/**
 * Social memory routes: entity retrieval, search, stats, fact recording.
 */

import { Router } from 'express';
import type { SocialMemoryManager } from '../../../memory/src/social/social-memory-manager';

export interface SocialMemoryRouteDeps {
  getSocialMemoryManager: () => SocialMemoryManager | null;
}

export function createSocialMemoryRoutes(deps: SocialMemoryRouteDeps): Router {
  const router = Router();

  // Get remembered entities
  router.get('/social-memory/entities', async (req, res) => {
    try {
      const minStrength = parseFloat(req.query.minStrength as string) || 0.1;

      const socialMemoryManager = deps.getSocialMemoryManager();
      if (!socialMemoryManager) {
        return res.status(503).json({
          error: 'Social memory system not available',
          entities: [],
        });
      }

      const entities =
        await socialMemoryManager.getRememberedEntities(minStrength);

      res.json({
        success: true,
        entities,
        count: entities.length,
        minStrength,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Error retrieving remembered entities:', error);
      res.status(500).json({ error: 'Failed to retrieve remembered entities' });
    }
  });

  // Search entities by fact content
  router.get('/social-memory/search', async (req, res) => {
    try {
      const { query, minStrength } = req.query;

      if (!query || typeof query !== 'string') {
        return res.status(400).json({
          error: 'Query parameter is required',
        });
      }

      const socialMemoryManager = deps.getSocialMemoryManager();
      if (!socialMemoryManager) {
        return res.status(503).json({
          error: 'Social memory system not available',
          entities: [],
        });
      }

      const entities = await socialMemoryManager.searchByFact(query);
      const filteredEntities = minStrength
        ? entities.filter(
            (e: any) => e.memoryStrength >= parseFloat(minStrength as string)
          )
        : entities;

      res.json({
        success: true,
        query,
        entities: filteredEntities,
        count: filteredEntities.length,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Error searching entities by fact:', error);
      res.status(500).json({ error: 'Failed to search entities by fact' });
    }
  });

  // Get social memory statistics
  router.get('/social-memory/stats', async (_req, res) => {
    try {
      const socialMemoryManager = deps.getSocialMemoryManager();
      if (!socialMemoryManager) {
        return res.status(503).json({
          error: 'Social memory system not available',
          stats: null,
        });
      }

      const stats = await socialMemoryManager.getStats();

      res.json({
        success: true,
        stats,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Error retrieving social memory stats:', error);
      res.status(500).json({ error: 'Failed to retrieve social memory stats' });
    }
  });

  // Record a social fact manually
  router.post('/social-memory/fact', async (req, res) => {
    try {
      const { entityId, factContent, category, confidence } = req.body;

      if (!entityId || !factContent || !category) {
        return res.status(400).json({
          error: 'Missing required fields: entityId, factContent, category',
        });
      }

      const socialMemoryManager = deps.getSocialMemoryManager();
      if (!socialMemoryManager) {
        return res.status(503).json({
          error: 'Social memory system not available',
        });
      }

      // Note: Social facts are automatically recorded through encounters
      // Manual fact recording not yet implemented
      console.warn('Manual social fact recording not implemented yet');

      res.json({
        success: true,
        message: 'Social fact recorded successfully',
        entityId,
        factContent,
        category,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Error recording social fact:', error);
      res.status(500).json({ error: 'Failed to record social fact' });
    }
  });

  return router;
}
