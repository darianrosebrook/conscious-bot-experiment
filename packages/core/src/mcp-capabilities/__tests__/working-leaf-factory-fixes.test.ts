/**
 * Test suite for WorkingLeafFactory fixes
 *
 * Tests all high-priority fixes from the code review:
 * 1. Key delimiter collision prevention (@ in names)
 * 2. Proper semver sorting
 * 3. Rate limiter consistency and pruning
 * 4. Missing validator guards
 * 5. Input/output validation
 * 6. Error code improvements
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { WorkingLeafFactory } from '../working-leaf-factory.js';
import { LeafImpl, LeafSpec } from '../leaf-factory.js';
import { LeafContext } from '../leaf-contracts.js';

// Mock leaf implementations for testing
const createMockLeaf = (
  name: string,
  version: string,
  inputSchema: any = { type: 'object' },
  outputSchema?: any
): LeafImpl => ({
  spec: {
    name,
    version,
    description: `Test leaf ${name}`,
    inputSchema,
    outputSchema,
    rateLimitPerMin: 10,
    permissions: ['movement'],
  },
  run: async (ctx: LeafContext, args: unknown) => ({
    status: 'success' as const,
    result: { message: `Executed ${name}@${version}`, args },
  }),
});

describe('WorkingLeafFactory - High Priority Fixes', () => {
  let factory: WorkingLeafFactory;

  beforeEach(() => {
    factory = new WorkingLeafFactory();
  });

  describe('Fix 1: Key delimiter collision prevention', () => {
    it('should reject leaves with @ in name', () => {
      const leaf = createMockLeaf('test@leaf', '1.0.0');
      const result = factory.register(leaf);

      expect(result.ok).toBe(false);
      expect(result.error).toBe('invalid_name_char:@');
    });

    it('should accept leaves without @ in name', () => {
      const leaf = createMockLeaf('test_leaf', '1.0.0');
      const result = factory.register(leaf);

      expect(result.ok).toBe(true);
      expect(factory.has('test_leaf')).toBe(true);
    });

    it('should handle scoped names without @', () => {
      const leaf = createMockLeaf('team/tool', '1.0.0');
      const result = factory.register(leaf);

      expect(result.ok).toBe(true);
      expect(factory.has('team/tool')).toBe(true);
    });
  });

  describe('Fix 2: Proper semver sorting', () => {
    it('should return latest version using semver rules', () => {
      // Register in non-semver order
      factory.register(createMockLeaf('test', '1.10.0'));
      factory.register(createMockLeaf('test', '1.9.0'));
      factory.register(createMockLeaf('test', '2.0.0'));

      const latest = factory.get('test');
      expect(latest?.spec.version).toBe('2.0.0');
    });

    it('should handle prerelease versions correctly', () => {
      factory.register(createMockLeaf('test', '1.0.0-alpha.1'));
      factory.register(createMockLeaf('test', '1.0.0'));
      factory.register(createMockLeaf('test', '1.0.0-beta.1'));

      const latest = factory.get('test');
      expect(latest?.spec.version).toBe('1.0.0');
    });

    it('should handle invalid semver gracefully', () => {
      factory.register(createMockLeaf('test', 'invalid-version'));
      factory.register(createMockLeaf('test', '1.0.0'));

      const latest = factory.get('test');
      expect(latest?.spec.version).toBe('1.0.0');
    });
  });

  describe('Fix 3: Rate limiter consistency and pruning', () => {
    it('should use minute-based keys for rate limiting', async () => {
      const leaf = createMockLeaf('rate_test', '1.0.0');
      factory.register(leaf);

      // Mock time to control rate limiting
      const originalDateNow = Date.now;
      let mockTime = 1000000;
      Date.now = () => mockTime;

      try {
        // Should succeed for first 10 calls (rate limit)
        for (let i = 0; i < 10; i++) {
          const result = await factory.run(
            'rate_test',
            '1.0.0',
            {} as LeafContext,
            {}
          );
          expect(result.status).toBe('success');
        }

        // 11th call should be rate limited
        const result = await factory.run(
          'rate_test',
          '1.0.0',
          {} as LeafContext,
          {}
        );
        expect(result.status).toBe('failure');
        expect(result.error?.code).toBe('permission.denied');
        expect(result.error?.detail).toBe('rate_limited');
      } finally {
        Date.now = originalDateNow;
      }
    });

    it('should reset rate limit in new minute', async () => {
      const leaf = createMockLeaf('rate_test', '1.0.0');
      factory.register(leaf);

      const originalDateNow = Date.now;
      let mockTime = 1000000;
      Date.now = () => mockTime;

      try {
        // Use up rate limit
        for (let i = 0; i < 10; i++) {
          await factory.run('rate_test', '1.0.0', {} as LeafContext, {});
        }

        // Advance time by 1 minute
        mockTime += 60000;

        // Should succeed again
        const result = await factory.run(
          'rate_test',
          '1.0.0',
          {} as LeafContext,
          {}
        );
        expect(result.status).toBe('success');
      } finally {
        Date.now = originalDateNow;
      }
    });
  });

  describe('Fix 4: Missing validator guards', () => {
    it('should handle missing input validator gracefully', async () => {
      const leaf = createMockLeaf('test', '1.0.0');
      factory.register(leaf);

      // Manually remove validator to simulate corruption
      (factory as any).inputValidators.delete('test@1.0.0');

      const result = await factory.run('test', '1.0.0', {} as LeafContext, {});
      expect(result.status).toBe('failure');
      expect(result.error?.detail).toBe('input_validator_missing');
    });

    it('should handle missing output validator gracefully', async () => {
      const leaf = createMockLeaf(
        'test',
        '1.0.0',
        { type: 'object' },
        { type: 'object' }
      );
      factory.register(leaf);

      // Manually remove validator to simulate corruption
      (factory as any).outputValidators.delete('test@1.0.0');

      const result = await factory.run('test', '1.0.0', {} as LeafContext, {});
      expect(result.status).toBe('failure');
      expect(result.error?.detail).toBe('output_validator_missing');
    });
  });

  describe('Fix 5: Input/output validation', () => {
    it('should validate input schema', async () => {
      const leaf = createMockLeaf('test', '1.0.0', {
        type: 'object',
        properties: {
          required: { type: 'string' },
        },
        required: ['required'],
      });
      factory.register(leaf);

      // Invalid input - missing required field
      const result = await factory.run('test', '1.0.0', {} as LeafContext, {});
      expect(result.status).toBe('failure');
      expect(result.error?.code).toBe('invalid_input');
    });

    it('should validate output schema', async () => {
      const leaf = createMockLeaf(
        'test',
        '1.0.0',
        { type: 'object' },
        {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
          required: ['message'],
        }
      );

      // Override run to return invalid output
      leaf.run = async () => ({
        status: 'success' as const,
        result: { invalid: 'output' },
      });

      factory.register(leaf);

      const result = await factory.run('test', '1.0.0', {} as LeafContext, {});
      expect(result.status).toBe('failure');
      expect(result.error?.code).toBe('invalid_output');
    });
  });

  describe('Fix 6: Error code improvements', () => {
    it('should use specific error codes', async () => {
      const leaf = createMockLeaf('test', '1.0.0', {
        type: 'object',
        properties: {
          required: { type: 'string' },
        },
        required: ['required'],
      });
      factory.register(leaf);

      const result = await factory.run('test', '1.0.0', {} as LeafContext, {});
      expect(result.error?.code).toBe('invalid_input');
    });

    it('should use rate_limited error code', async () => {
      const leaf = createMockLeaf('test', '1.0.0');
      leaf.spec.rateLimitPerMin = 1;
      factory.register(leaf);

      // First call succeeds
      await factory.run('test', '1.0.0', {} as LeafContext, {});

      // Second call should be rate limited
      const result = await factory.run('test', '1.0.0', {} as LeafContext, {});
      expect(result.error?.code).toBe('permission.denied');
      expect(result.error?.detail).toBe('rate_limited');
    });
  });

  describe('Additional functionality', () => {
    it('should list all leaves correctly', () => {
      factory.register(createMockLeaf('leaf1', '1.0.0'));
      factory.register(createMockLeaf('leaf2', '2.0.0'));
      factory.register(createMockLeaf('leaf1', '1.1.0'));

      const leaves = factory.listLeaves();
      expect(leaves).toHaveLength(3);
      expect(leaves.map((l) => l.name)).toContain('leaf1');
      expect(leaves.map((l) => l.name)).toContain('leaf2');
    });

    it('should get names correctly', () => {
      factory.register(createMockLeaf('leaf1', '1.0.0'));
      factory.register(createMockLeaf('leaf2', '2.0.0'));
      factory.register(createMockLeaf('leaf1', '1.1.0'));

      const names = factory.getNames();
      expect(names).toHaveLength(2);
      expect(names).toContain('leaf1');
      expect(names).toContain('leaf2');
    });

    it('should remove leaves correctly', () => {
      factory.register(createMockLeaf('leaf1', '1.0.0'));
      factory.register(createMockLeaf('leaf1', '1.1.0'));
      factory.register(createMockLeaf('leaf2', '2.0.0'));

      expect(factory.size()).toBe(3);

      // Remove specific version
      const removed1 = factory.remove('leaf1', '1.0.0');
      expect(removed1).toBe(1);
      expect(factory.size()).toBe(2);

      // Remove all versions
      const removed2 = factory.remove('leaf1');
      expect(removed2).toBe(1);
      expect(factory.size()).toBe(1);
      expect(factory.has('leaf1')).toBe(false);
      expect(factory.has('leaf2')).toBe(true);
    });

    it('should get rate limit usage', () => {
      const leaf = createMockLeaf('test', '1.0.0');
      leaf.spec.rateLimitPerMin = 100;
      factory.register(leaf);

      const usage = factory.getRateLimitUsage('test', '1.0.0');
      expect(usage.used).toBe(0);
      expect(usage.limit).toBe(100);
    });
  });
});
