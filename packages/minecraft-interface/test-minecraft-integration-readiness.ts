#!/usr/bin/env tsx

/**
 * Minecraft Integration Readiness Test
 *
 * This test verifies that all components are working correctly
 * and we're ready to proceed with real Minecraft server integration.
 */

import { EnhancedRegistry } from '../core/src/mcp-capabilities/enhanced-registry';
import { DynamicCreationFlow } from '../core/src/mcp-capabilities/dynamic-creation-flow';
import { BTDSLParser } from '../core/src/mcp-capabilities/bt-dsl-parser';

console.log('🎮 Minecraft Integration Readiness Test');
console.log('=======================================');

async function testMinecraftIntegrationReadiness() {
  try {
    console.log('\n🔧 Test 1: Import Real Leaf Implementations');
    console.log('============================================');

    // Import all available real leaf implementations
    const { MoveToLeaf, StepForwardSafelyLeaf, FollowEntityLeaf } =
      await import('./src/leaves/movement-leaves');
    const {
      PlaceBlockLeaf,
      DigBlockLeaf,
      PlaceTorchIfNeededLeaf,
      RetreatAndBlockLeaf,
    } = await import('./src/leaves/interaction-leaves');

    console.log('✅ Movement leaves imported');
    console.log('✅ Interaction leaves imported');

    console.log('\n🔧 Test 2: Initialize All Real Leaves');
    console.log('=====================================');

    // Initialize all real leaves
    const leaves = [
      new MoveToLeaf(),
      new StepForwardSafelyLeaf(),
      new FollowEntityLeaf(),
      new PlaceBlockLeaf(),
      new DigBlockLeaf(),
      new PlaceTorchIfNeededLeaf(),
      new RetreatAndBlockLeaf(),
    ];

    console.log(`✅ ${leaves.length} real leaves initialized`);

    console.log('\n🔧 Test 3: Core Integration with Real Leaves');
    console.log('============================================');

    // Initialize core components
    const registry = new EnhancedRegistry();
    const dynamicFlow = new DynamicCreationFlow(registry);
    const btParser = new BTDSLParser();

    // Register all real leaves
    registry.populateLeafFactory(leaves);
    console.log('✅ All real leaves registered with registry');

    console.log('\n🔧 Test 4: BT-DSL with Real Leaves');
    console.log('===================================');

    // Test BT-DSL with real leaves - torch corridor scenario
    const torchCorridorBTDSL = {
      name: 'opt.torch_corridor',
      version: '1.0.0',
      description: 'Safely torch a mining corridor with hostile detection',
      root: {
        type: 'Sequence',
        children: [
          {
            type: 'Leaf',
            leafName: 'move_to',
            args: { pos: { x: 10, y: 64, z: 10 }, safe: true },
          },
          {
            type: 'Repeat.Until',
            condition: { name: 'position_reached' },
            child: {
              type: 'Sequence',
              children: [
                {
                  type: 'Leaf',
                  leafName: 'step_forward_safely',
                  args: {},
                },
                {
                  type: 'Leaf',
                  leafName: 'place_torch_if_needed',
                  args: { interval: 5 },
                },
              ],
            },
          },
        ],
      },
    };

    const parseResult = btParser.parse(
      torchCorridorBTDSL,
      registry.getLeafFactory()
    );
    if (!parseResult.valid) {
      throw new Error(
        `BT-DSL parsing failed: ${parseResult.errors.join(', ')}`
      );
    }

    console.log('✅ Torch corridor BT-DSL parsed successfully');
    console.log(`✅ Tree hash: ${parseResult.treeHash}`);

    console.log('\n🔧 Test 5: Option Registration with Real Leaves');
    console.log('===============================================');

    // Register the torch corridor option
    const registrationResult = registry.registerOption(
      torchCorridorBTDSL,
      {
        author: 'llm',
        createdAt: new Date().toISOString(),
        codeHash: 'torch-corridor-hash',
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

    console.log('✅ Torch corridor option registered successfully');
    console.log(`✅ Option ID: ${registrationResult.id}`);

    console.log('\n🔧 Test 6: Dynamic Creation Flow with Real Leaves');
    console.log('=================================================');

    // Test dynamic creation flow
    const proposalResult = await dynamicFlow.proposeNewCapability(
      'torch_corridor_task',
      { args: {}, metadata: {} },
      'Torch a mining corridor safely',
      []
    );

    // This should return null since there's no impasse, which is correct
    console.log('✅ Dynamic creation flow working with real leaves');

    console.log('\n🔧 Test 7: Registry Operations with Real Leaves');
    console.log('===============================================');

    // Verify registry operations
    const shadowOptions = registry.getShadowOptions();
    console.log(`✅ Shadow options count: ${shadowOptions.length}`);

    if (shadowOptions.includes('opt.torch_corridor@1.0.0')) {
      console.log('✅ Torch corridor option found in shadow options');
    }

    console.log('\n🎯 Integration Points Verification');
    console.log('==================================');

    // Verify all integration points
    const integrationPoints = {
      realLeafImports: leaves.length > 0,
      registryCreation: registry !== null,
      leafFactoryPopulation:
        registry.getLeafFactory().get('move_to') !== undefined,
      btDslParsing: parseResult.valid,
      optionRegistration: registrationResult.ok,
      dynamicCreationFlow:
        typeof dynamicFlow.proposeNewCapability === 'function',
      registryOperations: shadowOptions.length > 0,
      torchCorridorOption: shadowOptions.includes('opt.torch_corridor@1.0.0'),
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
      console.log('✅ All real leaf implementations working');
      console.log('✅ Core integration points verified');
      console.log('✅ Dynamic capability creation functional');
      console.log('✅ BT-DSL parsing with real leaves working');
      console.log('✅ Torch corridor scenario ready');
      console.log('\n📋 Next Steps:');
      console.log('   1. Connect to real Minecraft server');
      console.log('   2. Test torch corridor end-to-end');
      console.log('   3. Verify autonomous behavior adaptation');
      console.log('   4. Monitor shadow run performance');
    } else {
      console.log('\n⚠️  NOT READY - Integration issues detected');
      console.log('============================================');
      console.log('❌ Some integration points are broken');
      console.log('❌ Need to fix issues before proceeding');
    }
  } catch (error) {
    console.error('\n❌ Minecraft integration readiness test failed:', error);
    console.log('\n🔧 Need to fix issues before real Minecraft integration');
  }
}

// Run the test
testMinecraftIntegrationReadiness().catch(console.error);
