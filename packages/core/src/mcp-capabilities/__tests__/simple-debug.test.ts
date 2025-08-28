import { describe, it, expect, beforeEach } from 'vitest';
import { EnhancedRegistry } from '../enhanced-registry';
import { LeafImpl, LeafSpec, LeafContext, LeafResult } from '../leaf-contracts';

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

describe('Simple Debug Test', () => {
  it('should work', () => {
    const registry = new EnhancedRegistry();

    // Register the mock leaf
    const mockLeaf = new MockLeaf();
    const provenance = {
      author: 'test_author',
      codeHash: 'abc123',
      createdAt: new Date().toISOString(),
    };

    console.log('Registering leaf...');
    const leafResult = registry.registerLeaf(mockLeaf, provenance);
    console.log('Leaf registration result:', leafResult);

    // Check if leaf is available
    console.log(
      'Leaf factory has mock_leaf:',
      registry.getLeafFactory().has('mock_leaf')
    );
    console.log(
      'Available leaves:',
      registry
        .getLeafFactory()
        .listLeaves()
        .map((l) => `${l.name}@${l.version}`)
    );

    // Try to register an option
    const btDslJson = {
      name: 'test_option',
      version: '1.0.0',
      root: {
        type: 'Sequence',
        children: [{ type: 'Leaf', leafName: 'mock_leaf' }],
      },
    };

    console.log('Registering option...');
    const optionResult = registry.registerOption(btDslJson, provenance, {
      successThreshold: 0.8,
      maxShadowRuns: 10,
      failureThreshold: 0.3,
      minShadowRuns: 3,
    });

    console.log('Option registration result:', optionResult);

    expect(optionResult.ok).toBe(true);
  });
});
