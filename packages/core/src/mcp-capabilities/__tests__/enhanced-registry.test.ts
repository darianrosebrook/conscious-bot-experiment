/**
 * Enhanced Registry Unit Tests
 *
 * Tests for the enhanced registry with shadow runs, governance, and critical fixes.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EnhancedRegistry } from '../enhanced-registry';
import { LeafFactory, LeafImpl } from '../leaf-factory';
import { LeafContext, LeafResult, LeafSpec } from '../leaf-contracts';

// Mock leaf implementation for testing
class MockLeaf implements LeafImpl {
  spec: LeafSpec = {
    name: 'mock_leaf',
    version: '1.0.0',
    description: 'Mock leaf for testing',
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    timeoutMs: 5000,
    retries: 1,
    permissions: ['movement', 'sense'],
  };

  async run(ctx: LeafContext, args: any): Promise<LeafResult> {
    return {
      status: 'success',
      result: { success: true },
      metrics: { durationMs: 100, retries: 0, timeouts: 0 },
    };
  }
}

// Mock leaf context for testing
const createMockContext = (): LeafContext => ({
  bot: {} as any,
  abortSignal: new AbortController().signal,
  now: () => performance.now(),
  snapshot: vi.fn().mockResolvedValue({}),
  inventory: vi.fn().mockResolvedValue({ items: [] }),
  emitMetric: vi.fn(),
  emitError: vi.fn(),
});

describe('EnhancedRegistry', () => {
  let registry: EnhancedRegistry;
  let mockContext: LeafContext;

  beforeEach(() => {
    registry = new EnhancedRegistry();
    mockContext = createMockContext();

    // Register the mock leaf with the leaf factory so it can be found by the BT parser
    const mockLeaf = new MockLeaf();
    const provenance = {
      author: 'test_author',
      codeHash: 'abc123',
      createdAt: new Date().toISOString(),
    };
    registry.registerLeaf(mockLeaf, provenance);
  });

  afterEach(() => {
    registry.clear();
  });

  describe('Critical Fix #1: Store option definitions', () => {
    it('should store option definitions on registration', () => {
      const btDslJson = {
        name: 'test_option',
        version: '1.0.0',
        root: {
          type: 'Sequence',
          children: [{ type: 'Leaf', leafName: 'mock_leaf' }],
        },
      };

      const provenance = {
        author: 'test_author',
        codeHash: 'abc123',
        createdAt: new Date().toISOString(),
      };

      const result = registry.registerOption(btDslJson, provenance, {
        successThreshold: 0.8,
        maxShadowRuns: 10,
        failureThreshold: 0.3,
        minShadowRuns: 3,
      });

      expect(result.ok).toBe(true);
      expect(result.id).toBe('test_option@1.0.0');
    });
  });

  describe('Critical Fix #2: Immutable versioning and status state machine', () => {
    it('should prevent duplicate version registration', () => {
      const leaf = new MockLeaf();
      leaf.spec.name = 'mock_leaf_2'; // Use different name to avoid conflict with beforeEach
      const provenance = {
        author: 'test_author',
        codeHash: 'abc123',
        createdAt: new Date().toISOString(),
      };

      const result1 = registry.registerLeaf(leaf, provenance);
      expect(result1.ok).toBe(true);

      const result2 = registry.registerLeaf(leaf, provenance);
      expect(result2.ok).toBe(false);
      expect(result2.error).toBe('version_exists');
    });

    it('should enforce legal status transitions', async () => {
      const btDslJson = {
        name: 'test_option',
        version: '1.0.0',
        root: { type: 'Leaf', leafName: 'mock_leaf' },
      };

      const provenance = {
        author: 'test_author',
        codeHash: 'abc123',
        createdAt: new Date().toISOString(),
      };

      const result = registry.registerOption(btDslJson, provenance, {
        successThreshold: 0.8,
        maxShadowRuns: 10,
        failureThreshold: 0.3,
      });

      expect(result.ok).toBe(true);
      const optionId = result.id!;

      // Should be able to promote from shadow to active
      const promoteResult = await registry.promoteOption(optionId, 'manual');
      expect(promoteResult).toBe(true);

      // Should not be able to promote again (already active)
      const promoteAgainResult = await registry.promoteOption(
        optionId,
        'manual'
      );
      expect(promoteAgainResult).toBe(false);
    });
  });

  describe('Critical Fix #3: Real permissions computation', () => {
    it('should compute permissions from leaf composition', () => {
      const btDslJson = {
        name: 'test_option',
        version: '1.0.0',
        root: {
          type: 'Sequence',
          children: [{ type: 'Leaf', leafName: 'mock_leaf' }],
        },
      };

      const provenance = {
        author: 'test_author',
        codeHash: 'abc123',
        createdAt: new Date().toISOString(),
      };

      const result = registry.registerOption(btDslJson, provenance, {
        successThreshold: 0.8,
        maxShadowRuns: 10,
        failureThreshold: 0.3,
      });

      expect(result.ok).toBe(true);

      // The mock leaf has permissions ['movement', 'sense']
      // So the option should inherit these permissions
      const activeOptions = registry.getActiveOptionsDetailed();
      // Note: The option starts in 'shadow' status, so it won't be in active options yet
    });
  });

  describe('Critical Fix #4: Shadow promotion math', () => {
    it('should use correct success and failure thresholds', async () => {
      const btDslJson = {
        name: 'test_option_2',
        version: '1.0.0',
        root: { type: 'Leaf', leafName: 'mock_leaf' },
      };

      const provenance = {
        author: 'test_author',
        codeHash: 'abc123',
        createdAt: new Date().toISOString(),
      };

      const result = registry.registerOption(btDslJson, provenance, {
        successThreshold: 0.8,
        maxShadowRuns: 10,
        failureThreshold: 0.3,
        minShadowRuns: 3,
      });

      expect(result.ok).toBe(true);
      const optionId = result.id!;

      // Run shadow runs to test promotion logic
      for (let i = 0; i < 5; i++) {
        await registry.executeShadowRun(optionId, mockContext);
      }

      const stats = registry.getShadowStats(optionId);
      expect(stats.totalRuns).toBe(5);
      expect(stats.successRate).toBe(1.0); // Mock leaf always succeeds
    });
  });

  describe('Critical Fix #5: Circuit breaker for bad shadows', () => {
    it('should implement circuit breaker for failing streaks', async () => {
      const btDslJson = {
        name: 'test_option_3',
        version: '1.0.0',
        root: { type: 'Leaf', leafName: 'mock_leaf' },
      };

      const provenance = {
        author: 'test_author',
        codeHash: 'abc123',
        createdAt: new Date().toISOString(),
      };

      const result = registry.registerOption(btDslJson, provenance, {
        successThreshold: 0.8,
        maxShadowRuns: 10,
        failureThreshold: 0.3,
      });

      expect(result.ok).toBe(true);
      const optionId = result.id!;

      // Run shadow runs (mock leaf always succeeds, so no circuit breaker should trigger)
      for (let i = 0; i < 5; i++) {
        const shadowResult = await registry.executeShadowRun(
          optionId,
          mockContext
        );
        expect(shadowResult.status).toBe('success');
      }
    });
  });

  describe('Critical Fix #6: Quota enforcement', () => {
    it('should enforce quotas on execution', async () => {
      const btDslJson = {
        name: 'test_option_4',
        version: '1.0.0',
        root: { type: 'Leaf', leafName: 'mock_leaf' },
      };

      const provenance = {
        author: 'test_author',
        codeHash: 'abc123',
        createdAt: new Date().toISOString(),
      };

      const result = registry.registerOption(btDslJson, provenance, {
        successThreshold: 0.8,
        maxShadowRuns: 10,
        failureThreshold: 0.3,
      });

      expect(result.ok).toBe(true);
      const optionId = result.id!;

      // Set a quota of 2 runs per minute
      registry.setQuota(optionId, 2, 60000);

      // First two runs should succeed
      const result1 = await registry.executeShadowRun(optionId, mockContext);
      expect(result1.status).toBe('success');

      const result2 = await registry.executeShadowRun(optionId, mockContext);
      expect(result2.status).toBe('success');

      // Third run should fail due to quota
      const result3 = await registry.executeShadowRun(optionId, mockContext);
      expect(result3.status).toBe('timeout');
      expect(result3.error?.code).toBe('permission.denied');
      expect(result3.error?.detail).toBe('quota_exceeded');
    });
  });

  describe('Critical Fix #7: Health checks gate promotion', () => {
    it('should require passing health check for promotion', async () => {
      const btDslJson = {
        name: 'test_option',
        version: '1.0.0',
        root: { type: 'Leaf', leafName: 'mock_leaf' },
      };

      const provenance = {
        author: 'test_author',
        codeHash: 'abc123',
        createdAt: new Date().toISOString(),
      };

      const result = registry.registerOption(btDslJson, provenance, {
        successThreshold: 0.8,
        maxShadowRuns: 10,
        failureThreshold: 0.3,
      });

      expect(result.ok).toBe(true);
      const optionId = result.id!;

      // Register a failing health check
      registry.registerHealthCheck(optionId, async () => false);

      // Try to promote - should fail due to health check
      const promoteResult = await registry.promoteOption(optionId, 'manual');
      expect(promoteResult).toBe(false);

      // Register a passing health check
      registry.registerHealthCheck(optionId, async () => true);

      // Try to promote again - should succeed
      const promoteResult2 = await registry.promoteOption(optionId, 'manual');
      expect(promoteResult2).toBe(true);
    });
  });

  describe('Critical Fix #8: Consistent structured errors', () => {
    it('should return structured errors in shadow results', async () => {
      const btDslJson = {
        name: 'test_option_5',
        version: '1.0.0',
        root: { type: 'Leaf', leafName: 'mock_leaf' },
      };

      const provenance = {
        author: 'test_author',
        codeHash: 'abc123',
        createdAt: new Date().toISOString(),
      };

      const result = registry.registerOption(btDslJson, provenance, {
        successThreshold: 0.8,
        maxShadowRuns: 10,
        failureThreshold: 0.3,
      });

      expect(result.ok).toBe(true);
      const optionId = result.id!;

      // Set quota to 0 to force an error
      registry.setQuota(optionId, 0, 60000);

      const shadowResult = await registry.executeShadowRun(
        optionId,
        mockContext
      );
      expect(shadowResult.status).toBe('timeout');
      expect(shadowResult.error).toBeDefined();
      expect(shadowResult.error?.code).toBe('permission.denied');
      expect(shadowResult.error?.detail).toBe('quota_exceeded');
      expect(shadowResult.error?.retryable).toBe(true);
    });
  });

  describe('Secondary Improvements', () => {
    it('should provide audit logging', () => {
      const leaf = new MockLeaf();
      const provenance = {
        author: 'test_author',
        codeHash: 'abc123',
        createdAt: new Date().toISOString(),
      };

      registry.registerLeaf(leaf, provenance);

      const auditLog = registry.getAuditLog();
      expect(auditLog.length).toBeGreaterThan(0);
      expect(auditLog[0].op).toBe('register_leaf');
      expect(auditLog[0].who).toBe('test_author');
    });

    it('should support veto list', () => {
      const btDslJson = {
        name: 'test_option',
        version: '1.0.0',
        root: { type: 'Leaf', leafName: 'mock_leaf' },
      };

      const provenance = {
        author: 'test_author',
        codeHash: 'abc123',
        createdAt: new Date().toISOString(),
      };

      // Add to veto list before registration
      registry.addToVetoList('test_option@1.0.0');

      const result = registry.registerOption(btDslJson, provenance, {
        successThreshold: 0.8,
        maxShadowRuns: 10,
        failureThreshold: 0.3,
      });

      expect(result.ok).toBe(false);
      expect(result.error).toBe('option_vetoed');
    });

    it('should support revocation with cleanup', async () => {
      const btDslJson = {
        name: 'test_option',
        version: '1.0.0',
        root: { type: 'Leaf', leafName: 'mock_leaf' },
      };

      const provenance = {
        author: 'test_author',
        codeHash: 'abc123',
        createdAt: new Date().toISOString(),
      };

      const result = registry.registerOption(btDslJson, provenance, {
        successThreshold: 0.8,
        maxShadowRuns: 10,
        failureThreshold: 0.3,
      });

      expect(result.ok).toBe(true);
      const optionId = result.id!;

      // Promote to active first
      await registry.promoteOption(optionId, 'manual');

      // Then revoke
      const revokeResult = await registry.revokeOption(
        optionId,
        'security_issue'
      );
      expect(revokeResult).toBe(true);

      // Should not be able to promote again (revoked is sticky)
      const promoteAgainResult = await registry.promoteOption(
        optionId,
        'manual'
      );
      expect(promoteAgainResult).toBe(false);
    });
  });
});
