/**
 * Core Capability Registration Server
 *
 * Provides HTTP API endpoints for capability registration and management.
 * Implements the MCP-style registry with authentication and validation.
 *
 * @author @darianrosebrook
 */

import express from 'express';
import cors from 'cors';
import {
  EnhancedRegistry,
  EnhancedSpec,
  ShadowRunResult,
} from './mcp-capabilities/enhanced-registry';
import { DynamicCreationFlow } from './mcp-capabilities/dynamic-creation-flow';
import { LeafFactory } from './mcp-capabilities/leaf-factory';

const app: express.Application = express();
const port = process.env.CORE_PORT ? parseInt(process.env.CORE_PORT) : 3007;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize core components (can be overridden for testing)
let registry: EnhancedRegistry | null = null;
let dynamicFlow: DynamicCreationFlow | null = null;
let leafFactory: LeafFactory | null = null;

// Function to initialize components (allows for dependency injection in tests)
export function initializeComponents(
  registryInstance?: EnhancedRegistry,
  dynamicFlowInstance?: DynamicCreationFlow,
  leafFactoryInstance?: LeafFactory
) {
  registry = registryInstance || new EnhancedRegistry();
  dynamicFlow = dynamicFlowInstance || new DynamicCreationFlow(registry);
  leafFactory = leafFactoryInstance || new LeafFactory();
}

// Lazy initialization function
function getComponents() {
  if (!registry || !dynamicFlow || !leafFactory) {
    initializeComponents();
  }
  return {
    registry: registry!,
    dynamicFlow: dynamicFlow!,
    leafFactory: leafFactory!,
  };
}

// Authentication middleware for trusted signers
const authenticateTrustedSigner = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  const authHeader = req.headers.authorization;
  const apiKey = process.env.TRUSTED_SIGNER_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: 'Server not configured with trusted signer authentication',
    });
  }

  if (!authHeader || authHeader !== `Bearer ${apiKey}`) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Requires trusted signer authentication',
    });
  }

  next();
};

// Health check endpoint
app.get('/health', (req: express.Request, res: express.Response) => {
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
// Capability Registration Endpoints
// ============================================================================

/**
 * POST /capabilities/leaf/register
 * Register a new leaf capability (trusted signers only)
 */
app.post(
  '/capabilities/leaf/register',
  authenticateTrustedSigner,
  async (req: express.Request, res: express.Response) => {
    try {
      const { spec, implementation } = req.body;

      if (!spec || !implementation) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: spec and implementation',
        });
      }

      // Validate leaf spec
      if (!spec.name || !spec.version) {
        return res.status(400).json({
          success: false,
          error: 'Invalid leaf spec: missing name or version',
        });
      }

      // Register the leaf
      const provenance = {
        author: 'trusted-signer',
        parentLineage: [],
        codeHash: 'trusted-implementation',
        createdAt: new Date().toISOString(),
        metadata: { source: 'api-registration' },
      };

      // Create a leaf implementation object
      const leafImpl = {
        spec,
        run: implementation.run,
      };

      const { registry } = getComponents();
      const result = registry.registerLeaf(leafImpl, provenance, 'active');

      if (!result.ok) {
        return res.status(400).json({
          success: false,
          error: result.error || 'Registration failed',
        });
      }

      res.status(200).json({
        success: true,
        capabilityId: result.id,
        message: 'Leaf capability registered successfully',
      });
    } catch (error) {
      console.error('Error registering leaf capability:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error during leaf registration',
      });
    }
  }
);

/**
 * POST /capabilities/option/register
 * Register a new option capability (open to LLM proposals)
 */
app.post(
  '/capabilities/option/register',
  async (req: express.Request, res: express.Response) => {
    try {
      const { btDsl } = req.body;

      if (!btDsl) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: btDsl',
        });
      }

      // Register the option with shadow configuration
      const shadowConfig = {
        successThreshold: 0.7,
        failureThreshold: 0.3,
        maxShadowRuns: 10,
        minShadowRuns: 3,
      };

      const provenance = {
        author: 'llm-proposal',
        parentLineage: [],
        codeHash: 'bt-dsl-generated',
        createdAt: new Date().toISOString(),
        metadata: { source: 'api-registration' },
      };

      const { registry } = getComponents();
      const result = registry.registerOption(btDsl, provenance, shadowConfig);

      if (!result.ok) {
        return res.status(400).json({
          success: false,
          error: result.error || 'Option registration failed',
        });
      }

      res.status(200).json({
        success: true,
        capabilityId: result.id,
        message: 'Option capability registered successfully (shadow mode)',
        shadowConfig,
      });
    } catch (error) {
      console.error('Error registering option capability:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error during option registration',
      });
    }
  }
);

/**
 * POST /capabilities/:id/promote
 * Promote a capability from shadow to active
 */
app.post(
  '/capabilities/:id/promote',
  authenticateTrustedSigner,
  async (req: express.Request, res: express.Response) => {
    try {
      const { id } = req.params;

      const { registry } = getComponents();
      const result = await registry.promoteCapability(id);

      if (!result) {
        return res.status(400).json({
          success: false,
          error: 'Promotion failed',
        });
      }

      res.status(200).json({
        success: true,
        message: `Capability ${id} promoted to active status`,
      });
    } catch (error) {
      console.error('Error promoting capability:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error during capability promotion',
      });
    }
  }
);

/**
 * POST /capabilities/:id/retire
 * Retire a capability
 */
app.post(
  '/capabilities/:id/retire',
  authenticateTrustedSigner,
  async (req: express.Request, res: express.Response) => {
    try {
      const { id } = req.params;

      const { registry } = getComponents();
      const result = await registry.retireCapability(id);

      if (!result) {
        return res.status(400).json({
          success: false,
          error: 'Retirement failed',
        });
      }

      res.status(200).json({
        success: true,
        message: `Capability ${id} retired successfully`,
      });
    } catch (error) {
      console.error('Error retiring capability:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error during capability retirement',
      });
    }
  }
);

/**
 * GET /capabilities/stats
 * Get registry statistics
 */
app.get(
  '/capabilities/stats',
  async (req: express.Request, res: express.Response) => {
    try {
      const { registry } = getComponents();
      const stats = await registry.getStatistics();

      res.status(200).json({
        success: true,
        stats,
      });
    } catch (error) {
      console.error('Error retrieving registry statistics:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error retrieving statistics',
      });
    }
  }
);

/**
 * GET /capabilities
 * List all capabilities
 */
app.get(
  '/capabilities',
  async (req: express.Request, res: express.Response) => {
    try {
      const { status, type } = req.query;

      const { registry } = getComponents();
      const capabilities = await registry.listCapabilities({
        status: status as string,
        type: type as string,
      });

      res.status(200).json({
        success: true,
        capabilities,
        count: capabilities.length,
      });
    } catch (error) {
      console.error('Error listing capabilities:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error listing capabilities',
      });
    }
  }
);

/**
 * GET /capabilities/:id
 * Get capability details
 */
app.get(
  '/capabilities/:id',
  async (req: express.Request, res: express.Response) => {
    try {
      const { id } = req.params;

      const { registry } = getComponents();
      const capability = await registry.getCapability(id);

      if (!capability) {
        return res.status(404).json({
          success: false,
          error: 'Capability not found',
        });
      }

      res.status(200).json({
        success: true,
        capability,
      });
    } catch (error) {
      console.error('Error retrieving capability:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error retrieving capability',
      });
    }
  }
);

// ============================================================================
// Error handling middleware
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
      success: false,
      error: 'Internal server error',
    });
  }
);

// 404 handler
app.use('*', (req: express.Request, res: express.Response) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    availableEndpoints: [
      'GET /health',
      'POST /capabilities/leaf/register',
      'POST /capabilities/option/register',
      'POST /capabilities/:id/promote',
      'POST /capabilities/:id/retire',
      'GET /capabilities/:id',
      'GET /capabilities',
      'GET /capabilities/stats',
      'POST /impasse/detect',
    ],
  });
});

// Start server
if (import.meta.url === `file://${process.argv[1]}`) {
  app.listen(port, () => {
    console.log(`🚀 Core Capability Registry Server running on port ${port}`);
    console.log(`📊 Health check: http://localhost:${port}/health`);
    console.log(
      `🔧 Capability registration: http://localhost:${port}/capabilities`
    );
  });
}

export default app;
