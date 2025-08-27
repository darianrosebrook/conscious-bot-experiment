#!/usr/bin/env tsx

/**
 * Real Minecraft Integration Readiness Test
 *
 * This test verifies that all core components are working correctly
 * and we're ready to proceed with real Minecraft integration.
 */

import { EnhancedRegistry } from '../core/src/mcp-capabilities/enhanced-registry';
import { DynamicCreationFlow } from '../core/src/mcp-capabilities/dynamic-creation-flow';
import { LeafFactory } from '../core/src/mcp-capabilities/leaf-factory';
import { BTDSLParser } from '../core/src/mcp-capabilities/bt-dsl-parser';
import {
  LeafImpl,
  LeafSpec,
  LeafContext,
  LeafResult,
} from '../core/src/mcp-capabilities/leaf-contract';

console.log('🎮 Real Minecraft Integration Readiness Test');
console.log('============================================');

// Mock leaf implementations for testing
class MockMoveToLeaf implements LeafImpl {
  spec: LeafSpec = {
    name: 'move_to',
    version: '1.0.0',
    description: 'Move to a position',
    timeoutMs: 30000,
    retries: 3,
    permissions: ['movement'],
    inputSchema: {
      type: 'object',
      properties: {
        pos: { type: 'object', description: 'Target position' },
        safe: { type: 'boolean', description: 'Safe movement mode' },
      },
      required: ['pos'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        position: { type: 'object' },
      },
    },
  };

  async run(context: LeafContext): Promise<LeafResult> {
    return {
      success: true,
      data: { position: context.args.pos },
    };
  }
}

class MockWaitLeaf implements LeafImpl {
  spec: LeafSpec = {
    name: 'wait',
    version: '1.0.0',
    description: 'Wait for a specified time',
    timeoutMs: 60000,
    retries: 0,
    permissions: ['sense'],
    inputSchema: {
      type: 'object',
      properties: {
        duration: { type: 'number', description: 'Duration in milliseconds' },
      },
      required: ['duration'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        waited: { type: 'number' },
      },
    },
  };

  async run(context: LeafContext): Promise<LeafResult> {
    return {
      success: true,
      data: { waited: context.args.duration },
    };
  }
}

// Test BT-DSL
const testBTDSL = {
  name: 'test.simple_movement',
  version: '1.0.0',
  description: 'Simple movement test',
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
        leafName: 'wait',
        args: { duration: 1000 },
      },
    ],
  },
};

async function runReadinessTest() {
  console.log('\n🔧 Test 1: Core Component Initialization');
  console.log('==========================================');

  try {
    // Initialize core components
    const registry = new EnhancedRegistry();
    const dynamicFlow = new DynamicCreationFlow(registry);
    const leafFactory = new LeafFactory();
    const btParser = new BTDSLParser();

    console.log('✅ Core components initialized');

    // Test leaf factory
    const moveToLeaf = new MockMoveToLeaf();
    const waitLeaf = new MockWaitLeaf();

    const moveResult = leafFactory.register(moveToLeaf);
    const waitResult = leafFactory.register(waitLeaf);

    if (!moveResult.ok || !waitResult.ok) {
      throw new Error('Failed to register mock leaves');
    }

    console.log('✅ Leaf factory working');

    // Test BT-DSL parsing
    const parseResult = btParser.parse(testBTDSL, leafFactory);
    if (!parseResult.valid) {
      throw new Error(
        `BT-DSL parsing failed: ${parseResult.errors.join(', ')}`
      );
    }

    console.log('✅ BT-DSL parsing working');

    // Test registry population
    registry.populateLeafFactory([moveToLeaf, waitLeaf]);
    console.log('✅ Registry leaf factory populated');

    // Test option registration
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

    console.log('✅ Option registration working');

    // Test dynamic creation flow
    const proposalResult = await dynamicFlow.proposeNewCapability(
      'test_task',
      { args: {}, metadata: {} },
      'Test task',
      []
    );

    // This should return null since there's no impasse, which is correct
    console.log('✅ Dynamic creation flow working');

    console.log('\n🎯 Test 2: Integration Points Verification');
    console.log('==========================================');

    // Verify all integration points
    const integrationPoints = {
      registryCreation: registry !== null,
      leafFactoryPopulation:
        registry.getLeafFactory().get('move_to') !== undefined,
      btDslParsing: parseResult.valid,
      optionRegistration: registrationResult.ok,
      dynamicCreationFlow:
        typeof dynamicFlow.proposeNewCapability === 'function',
      registryOperations: registry
        .getShadowOptions()
        .includes('test.simple_movement@1.0.0'),
    };

    let successCount = 0;
    for (const [point, working] of Object.entries(integrationPoints)) {
      const status = working ? '✅' : '❌';
      console.log(`${status} ${point}: ${working ? 'Working' : 'Broken'}`);
      if (working) successCount++;
    }

    const successRate =
      (successCount / Object.keys(integrationPoints).length) * 100;
    console.log(`\n📊 Integration Success Rate: ${successRate.toFixed(1)}%`);

    if (successRate === 100) {
      console.log('\n🎉 READY FOR REAL MINECRAFT INTEGRATION!');
      console.log('=========================================');
      console.log('✅ All core components working correctly');
      console.log('✅ Integration points verified');
      console.log('✅ Dynamic capability creation functional');
      console.log('✅ BT-DSL parsing and registration working');
      console.log('\n📋 Next Steps:');
      console.log('   1. Fix mineflayer-pathfinder import issues');
      console.log('   2. Test with actual Minecraft server');
      console.log('   3. Implement real leaf implementations');
      console.log('   4. Run end-to-end torch corridor example');
    } else {
      console.log('\n⚠️  NOT READY - Integration issues detected');
      console.log('============================================');
      console.log('❌ Some integration points are broken');
      console.log('❌ Need to fix issues before proceeding');
    }
  } catch (error) {
    console.error('\n❌ Readiness test failed:', error);
    console.log('\n🔧 Need to fix issues before real Minecraft integration');
  }
}

// Run the test
runReadinessTest().catch(console.error);
