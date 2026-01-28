/**
 * Server API for Dynamic Capability Registration
 *
 * Provides REST endpoints for dynamic capability registration, shadow runs,
 * and promotion/retirement of capabilities.
 *
 * @author @darianrosebrook
 */

import express from 'express';
import { EnhancedRegistry } from './mcp-capabilities/registry';
import { DynamicCreationFlow } from './mcp-capabilities/dynamic-creation-flow';
import { LeafContext } from './mcp-capabilities/leaf-contracts';

/**
 * Creates and configures the Express server with the given dependencies
 * @param registry - The capability registry instance
 * @param dynamicFlow - The dynamic creation flow instance
 * @returns Configured Express application
 */
export function createServer(
  registry: EnhancedRegistry,
  dynamicFlow: DynamicCreationFlow
): express.Application {
  const app: express.Application = express();
  app.use(express.json());

  // ============================================================================
  // Capability Registration Endpoints
  // ============================================================================

  /**
   * Register a new option (LLM-authored capability)
   * POST /capabilities/option/register
   */
  app.post('/capabilities/option/register', async (req, res) => {
    try {
      // Check authentication
      const authHeader = req.headers.authorization;
      const expectedKey = process.env.TRUSTED_SIGNER_API_KEY;

      if (
        !authHeader ||
        !expectedKey ||
        authHeader !== `Bearer ${expectedKey}`
      ) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized: Requires trusted signer authentication',
        });
      }

      const { btDsl, provenance, shadowConfig } = req.body;

      if (!btDsl || !provenance) {
        return res.status(400).json({
          success: false,
          error: 'Invalid BT-DSL',
          details: ['Invalid node type'],
        });
      }

      const result = registry.registerOption(btDsl, provenance, shadowConfig);

      if (result.ok) {
        res.json({
          success: true,
          optionId: result.id,
          message: 'Option capability registered successfully',
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error('Option registration failed:', error);
      res.status(500).json({
        success: false,
        error: 'Option registration failed',
      });
    }
  });

  /**
   * Register a new leaf (signed human build)
   * POST /capabilities/leaf/register
   */
  app.post('/capabilities/leaf/register', async (req, res) => {
    try {
      // Check authentication
      const authHeader = req.headers.authorization;
      const expectedKey = process.env.TRUSTED_SIGNER_API_KEY;

      if (
        !authHeader ||
        !expectedKey ||
        authHeader !== `Bearer ${expectedKey}`
      ) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized: Requires trusted signer authentication',
        });
      }

      const { spec, implementation } = req.body;

      if (!spec || !implementation || !spec.name || !spec.version) {
        return res.status(400).json({
          success: false,
          error: 'Invalid leaf spec: missing name or version',
        });
      }

      const result = registry.registerLeaf(implementation, {
        author: 'trusted-signer',
        codeHash: 'trusted-implementation',
        createdAt: new Date().toISOString(),
      });

      if (result.ok) {
        res.json({
          success: true,
          capabilityId: result.id,
          message: 'Leaf capability registered successfully',
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error('Leaf registration failed:', error);
      res.status(500).json({
        success: false,
        error: 'Leaf registration failed',
      });
    }
  });

  // ============================================================================
  // Capability Management Endpoints
  // ============================================================================

  /**
   * Promote a capability from shadow to active
   * POST /capabilities/:id/promote
   */
  app.post('/capabilities/:id/promote', async (req, res) => {
    try {
      // Check authentication
      const authHeader = req.headers.authorization;
      const expectedKey = process.env.TRUSTED_SIGNER_API_KEY;

      if (
        !authHeader ||
        !expectedKey ||
        authHeader !== `Bearer ${expectedKey}`
      ) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized: Requires trusted signer authentication',
        });
      }

      const { id } = req.params;
      const result = await registry.promoteCapability(id);

      if (result.success) {
        res.json({
          success: true,
          message: 'Capability promoted successfully',
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error('Capability promotion failed:', error);
      res.status(500).json({
        success: false,
        error: 'Capability promotion failed',
      });
    }
  });

  /**
   * Retire a capability
   * POST /capabilities/:id/retire
   */
  app.post('/capabilities/:id/retire', async (req, res) => {
    try {
      // Check authentication
      const authHeader = req.headers.authorization;
      const expectedKey = process.env.TRUSTED_SIGNER_API_KEY;

      if (
        !authHeader ||
        !expectedKey ||
        authHeader !== `Bearer ${expectedKey}`
      ) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized: Requires trusted signer authentication',
        });
      }

      const { id } = req.params;
      const result = await registry.retireCapability(id);

      if (result.success) {
        res.json({
          success: true,
          message: 'Capability retired successfully',
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error('Capability retirement failed:', error);
      res.status(500).json({
        success: false,
        error: 'Capability retirement failed',
      });
    }
  });

  /**
   * List capabilities with optional filtering
   * GET /capabilities
   */
  app.get('/capabilities', async (req, res) => {
    try {
      const { status, type, limit } = req.query;
      const capabilities = await registry.listCapabilities({
        status: status as string,
        type: type as string,
      });

      res.json({
        success: true,
        capabilities,
      });
    } catch (error) {
      console.error('List capabilities failed:', error);
      res.status(500).json({
        success: false,
        error: 'List capabilities failed',
      });
    }
  });

  /**
   * Get registry statistics
   * GET /capabilities/stats
   */
  app.get('/capabilities/stats', async (req, res) => {
    try {
      const stats = await registry.getStatistics();
      res.json({
        success: true,
        stats,
      });
    } catch (error) {
      console.error('Get statistics failed:', error);
      res.status(500).json({
        success: false,
        error: 'Get statistics failed',
      });
    }
  });

  /**
   * Get capability details
   * GET /capabilities/:id
   */
  app.get('/capabilities/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const capability = await registry.getCapability(id);

      if (capability) {
        res.json({
          success: true,
          capability,
        });
      } else {
        res.status(404).json({
          success: false,
          error: 'Capability not found',
        });
      }
    } catch (error) {
      console.error('Get capability failed:', error);
      res.status(500).json({
        success: false,
        error: 'Get capability failed',
      });
    }
  });

  // ============================================================================
  // Health Check Endpoint
  // ============================================================================

  /**
   * Health check endpoint
   * GET /health
   */
  app.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      system: 'core-capability-registry',
      timestamp: Date.now(),
      version: '1.0.0',
      endpoints: {
        leafRegistration: '/capabilities/leaf/register',
        optionRegistration: '/capabilities/option/register',
        capabilityPromotion: '/capabilities/:id/promote',
        capabilityRetirement: '/capabilities/:id/retire',
        capabilityDetails: '/capabilities/:id',
        capabilityList: '/capabilities',
      },
    });
  });

  // ============================================================================
  // Error Handling for 404
  // ============================================================================

  app.use('*', (req, res) => {
    res.status(404).json({
      success: false,
      error: 'Endpoint not found',
      availableEndpoints: [
        '/health',
        '/capabilities/leaf/register',
        '/capabilities/option/register',
        '/capabilities/:id/promote',
        '/capabilities/:id/retire',
        '/capabilities/:id',
        '/capabilities',
        '/capabilities/stats',
      ],
    });
  });

  return app;
}

// Create default server instance for production use
const registry = new EnhancedRegistry();
const dynamicFlow = new DynamicCreationFlow(registry);
const app = createServer(registry, dynamicFlow);

// Start the server if this file is run directly
const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith('/server.ts') ||
  process.argv[1].endsWith('/server.js')
);

if (isDirectRun) {
  const port = process.env.PORT || 3007;

  app.listen(port, () => {
    console.log(`Core API server ready on port ${port}`);
    console.log(`Health check: http://localhost:${port}/health`);
    console.log(`Capability registry endpoints available`);
  });
}

export default app;
