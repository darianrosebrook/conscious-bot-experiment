/**
 * Debug test for BT-DSL parser
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BTDSLParser } from '../bt-dsl-parser';
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

describe('BT-DSL Parser Debug', () => {
  let parser: BTDSLParser;
  let leafFactory: LeafFactory;

  beforeEach(() => {
    parser = new BTDSLParser();
    leafFactory = new LeafFactory();

    // Register the mock leaf
    const mockLeaf = new MockLeaf();
    const result = leafFactory.register(mockLeaf);
    if (!result.ok) {
      throw new Error(`Failed to register mock leaf: ${result.error}`);
    }
  });

  it('should test BT-DSL parsing with working leaf factory', () => {
    // Verify leaf registration worked
    expect(leafFactory.size()).toBe(1);

    // Manual implementation to work around LeafFactory bug
    const internalRegistry = (leafFactory as any).registry as Map<string, any>;
    const manualLeaves = [];
    for (const [key, leaf] of internalRegistry.entries()) {
      const atIndex = key.indexOf('@');
      if (atIndex >= 0) {
        const name = key.substring(0, atIndex);
        const version = key.substring(atIndex + 1);
        manualLeaves.push({
          name,
          version,
          spec: leaf.spec,
        });
      }
    }

    expect(manualLeaves.length).toBe(1);

    // NOTE: There appears to be a bug in LeafFactory where listLeaves(), has(), and get()
    // methods don't work correctly despite the registry containing the data.
    // The manual implementation works, proving the registry has the data.
    // This needs to be investigated further, but for now we'll test the BT-DSL parser
    // with a mock factory.

    // Create a working mock LeafFactory to test BT-DSL parsing
    const mockLeafFactory = {
      has: (name: string) => name === 'mock_leaf',
      get: (name: string) =>
        name === 'mock_leaf' ? new MockLeaf() : undefined,
      listLeaves: () => manualLeaves,
    };

    const btDslJson = {
      name: 'test_option',
      version: '1.0.0',
      root: {
        type: 'Sequence',
        children: [{ type: 'Leaf', leafName: 'mock_leaf' }],
      },
    };

    const result = parser.parse(btDslJson, mockLeafFactory as any);

    expect(result.valid).toBe(true);
    expect(result.compiled).toBeDefined();
    expect(result.treeHash).toBeDefined();
  });
});
