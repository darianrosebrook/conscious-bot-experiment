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
    console.log('Leaf registration result:', result);
  });

  it('should parse simple BT-DSL', () => {
    const btDslJson = {
      name: 'test_option',
      version: '1.0.0',
      root: {
        type: 'Sequence',
        children: [{ type: 'Leaf', leafName: 'mock_leaf' }],
      },
    };

    console.log('Testing BT-DSL:', JSON.stringify(btDslJson, null, 2));
    console.log('Leaf factory has mock_leaf:', leafFactory.has('mock_leaf'));
    console.log(
      'Available leaves:',
      leafFactory.listLeaves().map((l) => `${l.name}@${l.version}`)
    );

    const result = parser.parse(btDslJson, leafFactory);

    console.log('Parse result:', result);

    expect(result.valid).toBe(true);
  });
});
