/**
 * Server API for Dynamic Capability Registration
 *
 * Provides REST endpoints for dynamic capability registration, shadow runs,
 * and promotion/retirement of capabilities.
 *
 * @author @darianrosebrook
 */

import express from 'express';
import { EnhancedRegistry } from './mcp-capabilities/enhanced-registry';
import { DynamicCreationFlow } from './mcp-capabilities/dynamic-creation-flow';
import { LeafContext } from './mcp-capabilities/leaf-contracts';

const app: express.Application = express();
app.use(express.json());

// Initialize MCP capabilities system
const registry = new EnhancedRegistry();
const dynamicFlow = new DynamicCreationFlow(registry);

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

    if (!authHeader || !expectedKey || authHeader !== `Bearer ${expectedKey}`) {
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

    if (!authHeader || !expectedKey || authHeader !== `Bearer ${expectedKey}`) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Requires trusted signer authentication',
      });
    }

    const { spec, implementation } = req.body;

    if (!spec || !implementation) {
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
      error: 'Registration failed',
    });
  }
});

// ============================================================================
// Shadow Run Endpoints
// ============================================================================

/**
 * Execute a shadow run for an option
 * POST /capabilities/:id/shadow-run
 */
app.post('/capabilities/:id/shadow-run', async (req, res) => {
  try {
    const { id } = req.params;
    const { leafContext, args } = req.body;

    if (!leafContext) {
      return res.status(400).json({
        error: 'missing_leaf_context',
        detail: 'leafContext is required',
      });
    }

    const result = await registry.executeShadowRun(id, leafContext, undefined);
    res.json(result);
  } catch (error) {
    console.error('Shadow run failed:', error);
    res.status(500).json({
      error: 'shadow_run_failed',
      detail: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================================================
// Capability Management Endpoints
// ============================================================================

/**
 * Promote an option from shadow to active
 * POST /capabilities/:id/promote
 */
app.post('/capabilities/:id/promote', async (req, res) => {
  try {
    // Check authentication
    const authHeader = req.headers.authorization;
    const expectedKey = process.env.TRUSTED_SIGNER_API_KEY;

    if (!authHeader || !expectedKey || authHeader !== `Bearer ${expectedKey}`) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Requires trusted signer authentication',
      });
    }

    const { id } = req.params;
    const { reason } = req.body;

    const success = await registry.promoteCapability(id);
    res.json({
      success: true,
      message: `Capability ${id} promoted to active status`,
    });
  } catch (error) {
    console.error('Option promotion failed:', error);
    res.status(500).json({
      error: 'promotion_failed',
      detail: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Retire an option
 * POST /capabilities/:id/retire
 */
app.post('/capabilities/:id/retire', async (req, res) => {
  try {
    // Check authentication
    const authHeader = req.headers.authorization;
    const expectedKey = process.env.TRUSTED_SIGNER_API_KEY;

    if (!authHeader || !expectedKey || authHeader !== `Bearer ${expectedKey}`) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Requires trusted signer authentication',
      });
    }

    const { id } = req.params;
    const { reason } = req.body;

    const success = await registry.retireCapability(id);
    res.json({
      success: true,
      message: `Capability ${id} retired successfully`,
    });
  } catch (error) {
    console.error('Option retirement failed:', error);
    res.status(500).json({
      error: 'retirement_failed',
      detail: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================================================
// Information Endpoints
// ============================================================================

/**
 * Get capability information
 * GET /capabilities/:id
 */
app.get('/capabilities/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const capability = await registry.getCapability(id);

    if (!capability) {
      return res.status(404).json({
        success: false,
        error: 'Capability not found',
      });
    }

    res.json({
      success: true,
      capability: capability,
    });
  } catch (error) {
    console.error('Get capability failed:', error);
    res.status(500).json({
      success: false,
      error: 'get_capability_failed',
    });
  }
});

/**
 * List all capabilities
 * GET /capabilities
 */
app.get('/capabilities', async (req, res) => {
  try {
    const { status, type } = req.query;
    const capabilities = await registry.listCapabilities({
      status: status as string,
      type: type as string,
    });

    res.json({
      success: true,
      capabilities: capabilities,
      count: capabilities.length,
    });
  } catch (error) {
    console.error('List capabilities failed:', error);
    res.status(500).json({
      success: false,
      error: 'list_capabilities_failed',
    });
  }
});

/**
 * Get shadow run statistics
 * GET /capabilities/:id/shadow-stats
 */
app.get('/capabilities/:id/shadow-stats', (req, res) => {
  try {
    const { id } = req.params;
    const stats = registry.getShadowStats(id);
    res.json(stats);
  } catch (error) {
    console.error('Get shadow stats failed:', error);
    res.status(500).json({
      error: 'get_shadow_stats_failed',
      detail: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Get registry statistics
 * GET /capabilities/stats
 */
app.get('/capabilities/stats', async (req, res) => {
  try {
    const capabilities = await registry.listCapabilities();
    const stats = {
      totalCapabilities: capabilities.length,
      activeCapabilities: capabilities.filter((c) => c.status === 'active')
        .length,
      shadowCapabilities: capabilities.filter((c) => c.status === 'shadow')
        .length,
      retiredCapabilities: capabilities.filter((c) => c.status === 'retired')
        .length,
    };

    res.json({
      success: true,
      statistics: stats,
    });
  } catch (error) {
    console.error('Get registry stats failed:', error);
    res.status(500).json({
      success: false,
      error: 'get_registry_stats_failed',
    });
  }
});

// ============================================================================
// Dynamic Creation Endpoints
// ============================================================================

/**
 * Propose new capability for a goal
 * POST /capabilities/propose
 */
app.post('/capabilities/propose', async (req, res) => {
  try {
    const { taskId, context, currentTask, recentFailures } = req.body;

    if (!taskId || !context || !currentTask) {
      return res.status(400).json({
        error: 'missing_required_fields',
        detail: 'taskId, context, and currentTask are required',
      });
    }

    const proposal = await dynamicFlow.requestOptionProposal(
      taskId,
      context,
      currentTask,
      recentFailures || []
    );

    if (proposal) {
      res.json({ ok: true, proposal });
    } else {
      res.json({ ok: false, error: 'no_proposal_generated' });
    }
  } catch (error) {
    console.error('Capability proposal failed:', error);
    res.status(500).json({
      error: 'proposal_failed',
      detail: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Register a proposed capability
 * POST /capabilities/register-proposal
 */
app.post('/capabilities/register-proposal', async (req, res) => {
  try {
    const { proposal, author } = req.body;

    if (!proposal || !author) {
      return res.status(400).json({
        error: 'missing_required_fields',
        detail: 'proposal and author are required',
      });
    }

    const result = await dynamicFlow.registerProposedOption(proposal, author);

    if (result.success) {
      res.json({ ok: true, optionId: result.optionId });
    } else {
      res.status(400).json({ ok: false, error: result.error });
    }
  } catch (error) {
    console.error('Proposal registration failed:', error);
    res.status(500).json({
      error: 'registration_failed',
      detail: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================================================
// Health and Status Endpoints
// ============================================================================

/**
 * Health check
 * GET /health
 */
app.get('/health', async (req, res) => {
  try {
    const capabilities = await registry.listCapabilities();
    const shadowOptions = registry.getShadowOptions();

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
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({
      error: 'health_check_failed',
      detail: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Get system status
 * GET /status
 */
app.get('/status', async (req, res) => {
  try {
    const capabilities = registry.listCapabilities();
    const shadowOptions = registry.getShadowOptions();

    res.json({
      capabilities: {
        total: (await capabilities).length,
        active: (await capabilities).filter((c) => c.status === 'active')
          .length,
        shadow: shadowOptions.length,
        retired: (await capabilities).filter((c) => c.status === 'retired')
          .length,
      },
      dynamicFlow: {
        enabled: true,
        impasseDetection: true,
        autoRetirement: true,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Status check failed:', error);
    res.status(500).json({
      error: 'status_check_failed',
      detail: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================================================
// Error Handling Middleware
// ============================================================================

app.use(
  (
    error: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    console.error('Unhandled error:', error);
    res.status(500).json({
      error: 'internal_server_error',
      detail: error.message || 'Unknown error occurred',
    });
  }
);

// ============================================================================
// Export
// ============================================================================

export { app, registry, dynamicFlow };

// Start server if this file is run directly
if (require.main === module) {
  const port = process.env.PORT || 3007;
  app.listen(port, () => {
    console.log(`Core API Server running on port ${port}`);
    console.log(`Health check: http://localhost:${port}/health`);
    console.log(`Status: http://localhost:${port}/status`);
  });
}
