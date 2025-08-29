/**
 * Minimal debug test for LeafFactory
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LeafFactory } from '../leaf-factory';
import { LeafImpl, LeafSpec, LeafContext, LeafResult } from '../leaf-contracts';

// Simple mock leaf
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

  async run(ctx: LeafContext, args: any): Promise<LeafResult> {
    return {
      status: 'success',
      result: { success: true },
      metrics: { durationMs: 10, retries: 0, timeouts: 0 },
    };
  }
}

describe('LeafFactory Debug', () => {
  let factory: LeafFactory;

  beforeEach(() => {
    factory = new LeafFactory();
  });

  it('should work with minimal setup', () => {
    // Test 1: Register a leaf
    const leaf = new SimpleMockLeaf();
    const result = factory.register(leaf);

    console.log('Registration result:', result);
    expect(result.ok).toBe(true);
    expect(result.id).toBe('simple_leaf@1.0.0');

    // Test 2: Check size
    console.log('Factory size:', factory.size());
    expect(factory.size()).toBe(1);

    // Test 3: Check registry directly
    const registry = (factory as any).registry as Map<string, any>;
    console.log('Registry keys:', Array.from(registry.keys()));
    console.log('Registry size:', registry.size);
    expect(registry.size).toBe(1);
    expect(registry.has('simple_leaf@1.0.0')).toBe(true);

    // Test 4: Test listLeaves method
    console.log('Testing listLeaves...');
    const leaves = factory.listLeaves();
    console.log('listLeaves result:', leaves);
    console.log('listLeaves length:', leaves.length);

    // Test 5: Test has method
    console.log('Testing has...');
    const hasResult = factory.has('simple_leaf');
    console.log('has result:', hasResult);

    // Test 6: Test get method
    console.log('Testing get...');
    const getResult = factory.get('simple_leaf');
    console.log('get result:', getResult);

    // Manual implementation to compare
    console.log('Manual implementation...');
    const manualLeaves = [];
    for (const [key, leaf] of registry.entries()) {
      const atIndex = key.indexOf('@');
      if (atIndex >= 0) {
        const name = key.substring(0, atIndex);
        const version = key.substring(atIndex + 1);
        manualLeaves.push({ name, version, spec: leaf.spec });
      }
    }
    console.log('Manual leaves:', manualLeaves);

    // Expectations
    expect(leaves.length).toBe(1);
    expect(hasResult).toBe(true);
    expect(getResult).toBeDefined();
    expect(manualLeaves.length).toBe(1);
  });
});
