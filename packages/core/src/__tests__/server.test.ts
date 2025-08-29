/**
 * Core Server API Tests
 *
 * Tests for the capability registration server endpoints
 *
 * @author @darianrosebrook
 */

import request from 'supertest';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { createServer } from '../server';
import { EnhancedRegistry } from '../mcp-capabilities/enhanced-registry';
import { DynamicCreationFlow } from '../mcp-capabilities/dynamic-creation-flow';
import { BTDSLParser } from '../mcp-capabilities/bt-dsl-parser';
import { LeafFactory } from '../mcp-capabilities/leaf-factory';

// Mock the dependencies
vi.mock('../mcp-capabilities/enhanced-registry');
vi.mock('../mcp-capabilities/dynamic-creation-flow');
vi.mock('../mcp-capabilities/bt-dsl-parser');
vi.mock('../mcp-capabilities/leaf-factory');

const MockEnhancedRegistry = EnhancedRegistry as vi.MockedClass<
  typeof EnhancedRegistry
>;
const MockDynamicCreationFlow = DynamicCreationFlow as vi.MockedClass<
  typeof DynamicCreationFlow
>;
const MockBTDSLParser = BTDSLParser as vi.MockedClass<typeof BTDSLParser>;
const MockLeafFactory = LeafFactory as vi.MockedClass<typeof LeafFactory>;

describe('Core Server API', () => {
  let mockRegistry: vi.Mocked<EnhancedRegistry>;
  let mockBtParser: vi.Mocked<BTDSLParser>;
  let mockDynamicFlow: vi.Mocked<DynamicCreationFlow>;
  let mockLeafFactory: vi.Mocked<LeafFactory>;
  let app: any;

  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks();

    // Set up environment variable for testing
    process.env.TRUSTED_SIGNER_API_KEY = 'test-api-key';

    // Setup mock registry
    mockRegistry = {
      registerLeaf: vi.fn().mockResolvedValue({ ok: false, error: 'default' }),
      registerOption: vi
        .fn()
        .mockResolvedValue({ ok: false, error: 'default' }),
      promoteCapability: vi
        .fn()
        .mockResolvedValue({ success: false, error: 'default' }),
      retireCapability: vi
        .fn()
        .mockResolvedValue({ success: false, error: 'default' }),
      getCapability: vi.fn().mockResolvedValue(null),
      listCapabilities: vi.fn().mockResolvedValue([]),
      getStatistics: vi.fn().mockResolvedValue({}),
    } as any;

    // Setup mock BT parser
    mockBtParser = {
      parse: vi.fn().mockReturnValue({ valid: true, errors: [] }),
    } as any;

    // Setup mock dynamic flow
    mockDynamicFlow = {
      detectImpasse: vi.fn(),
      requestOptionProposals: vi.fn(),
    } as any;

    // Setup mock leaf factory
    mockLeafFactory = {
      register: vi.fn(),
      get: vi.fn(),
      clear: vi.fn(),
    } as any;

    // Mock the constructors
    MockEnhancedRegistry.mockImplementation(() => mockRegistry);
    MockBTDSLParser.mockImplementation(() => mockBtParser);
    MockDynamicCreationFlow.mockImplementation(() => mockDynamicFlow);
    MockLeafFactory.mockImplementation(() => mockLeafFactory);

    // Create server with mocked dependencies
    app = createServer(mockRegistry, mockDynamicFlow);
  });

  describe('Health Check', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'healthy',
        system: 'core-capability-registry',
        timestamp: expect.any(Number),
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
  });

  describe('Leaf Registration', () => {
    const validLeafSpec = {
      name: 'test_leaf',
      version: '1.0.0',
      description: 'Test leaf for testing',
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
    };

    const validImplementation = {
      run: 'test-function',
      metadata: {
        type: 'test',
        version: '1.0.0',
      },
    };

    it('should register leaf with valid authentication', async () => {
      mockRegistry.registerLeaf.mockReturnValue({
        ok: true,
        id: 'test_leaf@1.0.0',
      });

      const response = await request(app)
        .post('/capabilities/leaf/register')
        .set('Authorization', 'Bearer test-api-key')
        .send({
          spec: validLeafSpec,
          implementation: validImplementation,
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        capabilityId: 'test_leaf@1.0.0',
        message: 'Leaf capability registered successfully',
      });

      expect(mockRegistry.registerLeaf).toHaveBeenCalledWith(
        validImplementation,
        expect.objectContaining({
          author: 'trusted-signer',
          codeHash: 'trusted-implementation',
        })
      );
    });

    it('should reject leaf registration without authentication', async () => {
      const response = await request(app)
        .post('/capabilities/leaf/register')
        .send({
          spec: validLeafSpec,
          implementation: validImplementation,
        });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        success: false,
        error: 'Unauthorized: Requires trusted signer authentication',
      });
    });

    it('should reject leaf registration with invalid spec', async () => {
      const response = await request(app)
        .post('/capabilities/leaf/register')
        .set('Authorization', 'Bearer test-api-key')
        .send({
          spec: { name: 'test' }, // Missing required fields
          implementation: validImplementation,
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: 'Invalid leaf spec: missing name or version',
      });
    });

    it('should handle registration failure', async () => {
      mockRegistry.registerLeaf.mockReturnValue({
        ok: false,
        error: 'Leaf registration failed',
      });

      const response = await request(app)
        .post('/capabilities/leaf/register')
        .set('Authorization', 'Bearer test-api-key')
        .send({
          spec: validLeafSpec,
          implementation: validImplementation,
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: 'Leaf registration failed',
      });
    });
  });

  describe('Option Registration', () => {
    const validBtDsl = {
      root: {
        type: 'sequence',
        children: [
          {
            type: 'action',
            name: 'test_action',
            action: 'test_action',
          },
        ],
      },
    };

    it('should register option with valid BT-DSL', async () => {
      mockRegistry.registerOption.mockReturnValue({
        ok: true,
        id: 'opt.test_option@1.0.0',
      });

      const response = await request(app)
        .post('/capabilities/option/register')
        .set('Authorization', 'Bearer test-api-key')
        .send({
          btDsl: validBtDsl,
          provenance: {
            author: 'llm-proposal',
            provenance: 'api-registration',
            codeHash: 'bt-dsl-generated',
          },
          shadowConfig: {
            successThreshold: 0.7,
            failureThreshold: 0.3,
            maxShadowRuns: 10,
            autoPromote: true,
            autoRetire: true,
          },
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        optionId: 'opt.test_option@1.0.0',
        message: 'Option capability registered successfully',
      });

      expect(mockRegistry.registerOption).toHaveBeenCalledWith(
        validBtDsl,
        expect.objectContaining({
          author: 'llm-proposal',
          provenance: 'api-registration',
          codeHash: 'bt-dsl-generated',
        }),
        expect.objectContaining({
          successThreshold: 0.7,
          failureThreshold: 0.3,
          maxShadowRuns: 10,
          autoPromote: true,
          autoRetire: true,
        })
      );
    });

    it('should reject option registration without authentication', async () => {
      const response = await request(app)
        .post('/capabilities/option/register')
        .send({
          btDsl: validBtDsl,
        });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        success: false,
        error: 'Unauthorized: Requires trusted signer authentication',
      });
    });

    it('should reject option registration with invalid BT-DSL', async () => {
      const response = await request(app)
        .post('/capabilities/option/register')
        .set('Authorization', 'Bearer test-api-key')
        .send({
          btDsl: validBtDsl,
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: 'Invalid BT-DSL',
        details: ['Invalid node type'],
      });
    });

    it('should handle option registration failure', async () => {
      mockRegistry.registerOption.mockReturnValue({
        ok: false,
        error: 'Option registration failed',
      });

      const response = await request(app)
        .post('/capabilities/option/register')
        .set('Authorization', 'Bearer test-api-key')
        .send({
          btDsl: validBtDsl,
          provenance: {
            author: 'llm-proposal',
            provenance: 'api-registration',
            codeHash: 'bt-dsl-generated',
          },
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: 'Option registration failed',
      });
    });
  });

  describe('Capability Management', () => {
    it('should promote capability', async () => {
      mockRegistry.promoteCapability.mockResolvedValue({
        success: true,
      });

      const response = await request(app)
        .post('/capabilities/test-capability/promote')
        .set('Authorization', 'Bearer test-api-key');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        message: 'Capability promoted successfully',
      });

      expect(mockRegistry.promoteCapability).toHaveBeenCalledWith(
        'test-capability'
      );
    });

    it('should retire capability', async () => {
      mockRegistry.retireCapability.mockResolvedValue({
        success: true,
      });

      const response = await request(app)
        .post('/capabilities/test-capability/retire')
        .set('Authorization', 'Bearer test-api-key');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        message: 'Capability retired successfully',
      });

      expect(mockRegistry.retireCapability).toHaveBeenCalledWith(
        'test-capability'
      );
    });

    it('should get capability details', async () => {
      const mockCapability = {
        id: 'test-capability',
        name: 'Test Capability',
        status: 'active',
      };

      mockRegistry.getCapability.mockResolvedValue(mockCapability);

      const response = await request(app).get('/capabilities/test-capability');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        capability: mockCapability,
      });

      expect(mockRegistry.getCapability).toHaveBeenCalledWith(
        'test-capability'
      );
    });

    it('should list capabilities', async () => {
      const mockCapabilities = [
        { id: 'cap1', name: 'Capability 1', status: 'active' },
        { id: 'cap2', name: 'Capability 2', status: 'shadow' },
      ];

      mockRegistry.listCapabilities.mockResolvedValue(mockCapabilities);

      const response = await request(app).get('/capabilities?status=active');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        capabilities: mockCapabilities,
      });

      expect(mockRegistry.listCapabilities).toHaveBeenCalledWith({
        status: 'active',
        category: undefined,
        limit: undefined,
      });
    });

    it('should get registry statistics', async () => {
      const mockStats = {
        totalCapabilities: 10,
        activeCapabilities: 5,
        shadowCapabilities: 3,
        retiredCapabilities: 2,
      };

      mockRegistry.getStatistics.mockResolvedValue(mockStats);

      const response = await request(app).get('/capabilities/stats');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        stats: mockStats,
      });

      expect(mockRegistry.getStatistics).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle internal server errors', async () => {
      mockRegistry.getCapability.mockRejectedValue(new Error('Database error'));

      const response = await request(app).get('/capabilities/test');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        success: false,
        error: 'Get capability failed',
      });
    });

    it('should return 404 for unknown endpoints', async () => {
      const response = await request(app).get('/unknown-endpoint');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: 'Endpoint not found',
        availableEndpoints: expect.any(Array),
      });
    });
  });
});
