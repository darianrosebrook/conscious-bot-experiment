#!/usr/bin/env tsx

/**
 * Test Real Leaf Implementations Import
 *
 * This test verifies that we can now import real leaf implementations
 * after fixing the mineflayer-pathfinder import issues.
 */

import { EnhancedRegistry } from '../core/src/mcp-capabilities/enhanced-registry';
import { DynamicCreationFlow } from '../core/src/mcp-capabilities/dynamic-creation-flow';
import { BTDSLParser } from '../core/src/mcp-capabilities/bt-dsl-parser';

console.log('🌿 Testing Real Leaf Implementations Import');
console.log('===========================================');

async function testRealLeaves() {
  try {
    console.log('\n🔧 Test 1: Import Real Leaf Implementations');
    console.log('============================================');

    // Try to import real leaf implementations
    const { MoveToLeaf, StepForwardSafelyLeaf } = await import(
      './src/leaves/movement-leaves'
    );
    const { PlaceBlockLeaf } = await import('./src/leaves/interaction-leaves');

    console.log('✅ MoveToLeaf imported successfully');
    console.log('✅ StepForwardSafelyLeaf imported successfully');
    console.log('✅ PlaceBlockLeaf imported successfully');

    console.log('\n🔧 Test 2: Initialize Real Leaves');
    console.log('==================================');

    // Initialize real leaves
    const moveToLeaf = new MoveToLeaf();
    const stepForwardLeaf = new StepForwardSafelyLeaf();
    const placeLeaf = new PlaceBlockLeaf();

    console.log('✅ MoveToLeaf initialized');
    console.log('✅ StepForwardSafelyLeaf initialized');
    console.log('✅ PlaceBlockLeaf initialized');

    console.log('\n🔧 Test 3: Register Real Leaves with Registry');
    console.log('=============================================');

    // Initialize registry and register real leaves
    const registry = new EnhancedRegistry();
    const dynamicFlow = new DynamicCreationFlow(registry);
    const btParser = new BTDSLParser();

    // Register real leaves
    registry.populateLeafFactory([moveToLeaf, stepForwardLeaf, placeLeaf]);

    console.log('✅ Real leaves registered with registry');

    // Test BT-DSL with real leaves
    const testBTDSL = {
      name: 'test.real_movement',
      version: '1.0.0',
      description: 'Test with real leaf implementations',
      root: {
        type: 'Sequence',
        children: [
          {
            type: 'Leaf',
            leafName: 'move_to',
            args: { pos: { x: 10, y: 64, z: 10 }, safe: true },
          },
          {
            type: 'Leaf',
            leafName: 'step_forward_safely',
            args: {},
          },
        ],
      },
    };

    const parseResult = btParser.parse(testBTDSL, registry.getLeafFactory());
    if (!parseResult.valid) {
      throw new Error(
        `BT-DSL parsing failed: ${parseResult.errors.join(', ')}`
      );
    }

    console.log('✅ BT-DSL parsing with real leaves successful');

    // Test option registration with real leaves
    const registrationResult = registry.registerOption(
      testBTDSL,
      {
        author: 'test',
        createdAt: new Date().toISOString(),
        codeHash: 'test-hash',
      },
      {
        successThreshold: 0.8,
        maxShadowRuns: 10,
        failureThreshold: 0.3,
        minShadowRuns: 3,
      }
    );

    if (!registrationResult.ok) {
      throw new Error(
        `Option registration failed: ${registrationResult.error}`
      );
    }

    console.log('✅ Option registration with real leaves successful');

    console.log('\n🎉 REAL LEAF IMPLEMENTATIONS WORKING!');
    console.log('======================================');
    console.log('✅ All real leaf implementations imported successfully');
    console.log('✅ Real leaves registered with registry');
    console.log('✅ BT-DSL parsing with real leaves working');
    console.log('✅ Option registration with real leaves working');
    console.log('\n📋 Ready for real Minecraft integration!');
  } catch (error) {
    console.error('\n❌ Real leaf test failed:', error);
    console.log('\n🔧 Need to fix remaining import issues');
  }
}

// Run the test
testRealLeaves().catch(console.error);
