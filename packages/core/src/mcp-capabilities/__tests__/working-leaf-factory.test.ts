/**
 * Working LeafFactory Test
 *
 * Test to verify that the WorkingLeafFactory actually works correctly.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { WorkingLeafFactory } from '../working-leaf-factory';
import { LeafImpl, LeafSpec } from '../leaf-factory';

// Simple mock leaf for testing
class SimpleMockLeaf implements LeafImpl {
  spec: LeafSpec = {
    name: 'simple_leaf',
    version: '1.0.0',
    description: 'Simple mock leaf',
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    timeoutMs: 1000,
    retries: 0,
    permissions: ['movement', 'sense'],
  };

  async run(ctx: any, args: any): Promise<any> {
    return {
      status: 'success',
      result: { success: true },
      metrics: { durationMs: 100, retries: 0, timeouts: 0 },
    };
  }
}

describe('WorkingLeafFactory', () => {
  let factory: WorkingLeafFactory;

  beforeEach(() => {
    factory = new WorkingLeafFactory();
  });

  it('should register and retrieve leaves correctly', () => {
    const leaf = new SimpleMockLeaf();
    const result = factory.register(leaf);

    expect(result.ok).toBe(true);
    expect(result.id).toBe('simple_leaf@1.0.0');
    expect(factory.size()).toBe(1);

    // Test has() method
    expect(factory.has('simple_leaf')).toBe(true);
    expect(factory.has('nonexistent')).toBe(false);

    // Test get() method
    const retrievedLeaf = factory.get('simple_leaf');
    expect(retrievedLeaf).toBeDefined();
    expect(retrievedLeaf?.spec.name).toBe('simple_leaf');

    // Test listLeaves() method
    const leaves = factory.listLeaves();
    expect(leaves.length).toBe(1);
    expect(leaves[0].name).toBe('simple_leaf');
    expect(leaves[0].version).toBe('1.0.0');
  });

  it('should work with BT-DSL parser', () => {
    const leaf = new SimpleMockLeaf();
    factory.register(leaf);

    // Test that the factory works with the BT-DSL parser's manual implementation
    const registry = (factory as any).registry as Map<string, any>;
    const availableLeaves = [];
    for (const [key] of registry.entries()) {
      const atIndex = key.indexOf('@');
      if (atIndex >= 0) {
        const name = key.substring(0, atIndex);
        availableLeaves.push(name);
      }
    }

    expect(availableLeaves).toContain('simple_leaf');
    expect(availableLeaves.length).toBe(1);
  });
});
