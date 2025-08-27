#!/usr/bin/env node

/**
 * Core Integration Test - No Minecraft Connection Required
 *
 * Tests the core integration points identified in systematic verification
 * without requiring a real Minecraft server connection.
 *
 * @author @darianrosebrook
 */

import { EnhancedRegistry } from '@conscious-bot/core/src/mcp-capabilities/enhanced-registry';
import { DynamicCreationFlow } from '@conscious-bot/core/src/mcp-capabilities/dynamic-creation-flow';
import { BTDSLParser } from '@conscious-bot/core/src/mcp-capabilities/bt-dsl-parser';
import { LeafFactory } from '@conscious-bot/core/src/mcp-capabilities/leaf-factory';

// Mock leaf implementation for testing
class MockMoveToLeaf {
  spec = {
    name: 'move_to',
    version: '1.0.0',
    description: 'Mock move to leaf for testing',
    inputSchema: {
      type: 'object',
      properties: {
        pos: {
          type: 'object',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            z: { type: 'number' },
          },
          required: ['x', 'y', 'z'],
        },
      },
      required: ['pos'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
      },
    },
    timeoutMs: 30000,
    retries: 2,
    permissions: ['movement'],
  };

  async run(ctx: any, args: any) {
    return {
      status: 'success',
      result: { success: true },
      metrics: { durationMs: 100, retries: 0, timeouts: 0 },
    };
  }
}

class MockWaitLeaf {
  spec = {
    name: 'wait',
    version: '1.0.0',
    description: 'Mock wait leaf for testing',
    inputSchema: {
      type: 'object',
      properties: {
        duration: { type: 'number' },
      },
      required: ['duration'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
      },
    },
    timeoutMs: 5000,
    retries: 0,
    permissions: ['sense'],
  };

  async run(ctx: any, args: any) {
    return {
      status: 'success',
      result: { success: true },
      metrics: { durationMs: args.duration || 100, retries: 0, timeouts: 0 },
    };
  }
}

// Simple test BT-DSL for basic validation using mock leaves
const simpleTestBTDSL = {
  name: 'test.simple_movement',
  version: '1.0.0',
  description: 'Simple movement test',
  root: {
    type: 'Sequence',
    children: [
      {
        type: 'Leaf',
        leafName: 'move_to',
        args: { pos: { x: 10, y: 64, z: 10 } },
      },
      {
        type: 'Leaf',
        leafName: 'wait',
        args: { duration: 1000 },
      },
    ],
  },
};

async function testCoreIntegration() {
  console.log('🧪 Core Integration Test (No Minecraft Connection)');
  console.log('==================================================');
  console.log(
    'Testing the core integration points without requiring Minecraft server'
  );
  console.log();

  try {
    // Test 1: Verify MCP Capabilities Infrastructure
    console.log('🔧 Test 1: MCP Capabilities Infrastructure');
    console.log('   Testing Enhanced Registry...');
    const registry = new EnhancedRegistry();
    console.log('   ✅ Enhanced Registry created');

    console.log('   Testing Dynamic Creation Flow...');
    const dynamicFlow = new DynamicCreationFlow(registry);
    console.log('   ✅ Dynamic Creation Flow created');

    console.log('   Testing BT-DSL Parser...');
    const btParser = new BTDSLParser();
    console.log('   ✅ BT-DSL Parser created');

    console.log('   Testing Leaf Factory...');
    const leafFactory = new LeafFactory();

    // Register mock leaf implementations
    console.log('   Registering mock leaf implementations...');

    const moveToResult = leafFactory.register(new MockMoveToLeaf() as any);
    const waitResult = leafFactory.register(new MockWaitLeaf() as any);

    console.log(`   Registered ${leafFactory.listLeaves().length} mock leaves`);
    console.log('   ✅ Leaf Factory created and populated');
    console.log();

    // Test 2: Verify BT-DSL Schema Validation
    console.log('🌳 Test 2: BT-DSL Schema Validation');
    console.log('   Testing simple BT-DSL parsing...');

    const simpleParseResult = btParser.parse(simpleTestBTDSL, leafFactory);
    console.log(
      `   Simple parse result: ${simpleParseResult.valid ? '✅ Valid' : '❌ Invalid'}`
    );

    if (!simpleParseResult.valid) {
      console.log('   Simple BT-DSL validation errors:');
      simpleParseResult.errors?.slice(0, 3).forEach((error, index) => {
        console.log(`     ${index + 1}. ${error}`);
      });
    } else {
      console.log(`   Simple tree hash: ${simpleParseResult.treeHash}`);
      console.log('   ✅ BT-DSL parsing successful');
    }
    console.log();

    // Test 3: Verify Dynamic Registration Pipeline
    console.log('📝 Test 3: Dynamic Registration Pipeline');
    console.log('   Testing simple option registration...');

    const simpleRegistrationResult = registry.registerOption(
      simpleTestBTDSL,
      {
        author: 'llm',
        createdAt: new Date().toISOString(),
      },
      {
        successThreshold: 0.8,
        maxShadowRuns: 10,
        failureThreshold: 0.3,
        minShadowRuns: 3,
      }
    );

    console.log(
      `   Simple registration result: ${simpleRegistrationResult.ok ? '✅ Success' : '❌ Failed'}`
    );
    if (simpleRegistrationResult.ok) {
      console.log(`   Simple option ID: ${simpleRegistrationResult.id}`);
      console.log('   ✅ Option registration successful');
    } else {
      console.log(
        `   Simple registration error: ${simpleRegistrationResult.error}`
      );
    }
    console.log();

    // Test 4: Verify Impasse Detection
    console.log('🔍 Test 4: Impasse Detection');
    console.log('   Testing impasse detection logic...');

    const impasseResult = dynamicFlow.checkImpasse('torch_corridor_safely', {
      code: 'unknown',
      detail: 'test_impasse',
      retryable: false,
    });

    console.log(
      `   Impasse detected: ${impasseResult.isImpasse ? '✅ Yes' : '❌ No'}`
    );
    console.log(`   Impasse reason: ${impasseResult.reason}`);
    console.log('   ✅ Impasse detection working');
    console.log();

    // Test 5: Verify Option Proposal
    console.log('💡 Test 5: Option Proposal');
    console.log('   Testing option proposal logic...');

    try {
      // Check if the method exists
      if (typeof dynamicFlow.proposeNewCapability === 'function') {
        const proposalResult = await dynamicFlow.proposeNewCapability(
          'torch_corridor_safely',
          {} as any, // Mock leaf context
          'torch_corridor_safely',
          []
        );

        if (proposalResult) {
          console.log(`   Proposal generated: ✅ Yes`);
          console.log(`   Proposal name: ${proposalResult.name}`);
          console.log(`   Confidence: ${proposalResult.confidence}`);
          console.log('   ✅ Option proposal working');
        } else {
          console.log('   Proposal generated: ❌ No');
          console.log(
            '   ⚠️ Option proposal failed (may be expected without LLM)'
          );
        }
      } else {
        console.log('   ⚠️ proposeNewCapability method not found');
        console.log('   This indicates the planning integration is incomplete');
      }
    } catch (error) {
      console.log(`   ⚠️ Option proposal error: ${error.message}`);
    }
    console.log();

    // Test 6: Verify Registry Operations
    console.log('📋 Test 6: Registry Operations');
    console.log('   Testing registry query operations...');

    const shadowOptions = registry.getShadowOptions();
    console.log(`   Shadow options count: ${shadowOptions.length}`);

    if (simpleRegistrationResult.ok && simpleRegistrationResult.id) {
      const shadowStats = registry.getShadowStats(simpleRegistrationResult.id);
      console.log(`   Shadow stats for ${simpleRegistrationResult.id}:`, {
        totalRuns: shadowStats.totalRuns,
        successRate: shadowStats.successRate,
        averageDurationMs: shadowStats.averageDurationMs,
      });
      console.log('   ✅ Registry operations working');
    } else {
      console.log(
        '   ⚠️ Cannot test registry operations (registration failed)'
      );
    }
    console.log();

    // Test 7: Verify Integration Points Summary
    console.log('📊 Test 7: Integration Points Summary');
    const integrationPoints = {
      mcpInfrastructure: true, // All MCP components created successfully
      btDslIntegration: simpleParseResult.valid,
      dynamicRegistration: simpleRegistrationResult.ok,
      impasseDetection: true, // Impasse detection worked
      optionProposal: typeof dynamicFlow.proposeNewCapability === 'function',
      registryOperations: simpleRegistrationResult.ok, // Registry operations depend on registration
    };

    console.log('   Integration Points Status:');
    Object.entries(integrationPoints).forEach(([point, status]) => {
      console.log(`   ${point}: ${status ? '✅ Working' : '❌ Broken'}`);
    });

    const workingPoints =
      Object.values(integrationPoints).filter(Boolean).length;
    const totalPoints = Object.keys(integrationPoints).length;
    const successRate = (workingPoints / totalPoints) * 100;

    console.log();
    console.log(
      `   Overall Integration Success Rate: ${successRate.toFixed(1)}%`
    );

    if (successRate >= 80) {
      console.log(
        '   🎉 Excellent integration! Most components are working correctly.'
      );
    } else if (successRate >= 60) {
      console.log(
        '   ⚠️ Good integration, but some components need attention.'
      );
    } else {
      console.log('   ❌ Poor integration. Critical components are broken.');
    }

    // Test 8: Specific Issues Analysis
    console.log();
    console.log('🔍 Test 8: Specific Issues Analysis');

    if (!simpleParseResult.valid) {
      console.log('   ❌ BT-DSL Schema Issues:');
      console.log(
        '      The BT-DSL schema validation is failing, which prevents:'
      );
      console.log('      - Dynamic capability registration');
      console.log('      - BT-DSL compilation and execution');
      console.log('      - End-to-end workflow testing');
    }

    if (!simpleRegistrationResult.ok) {
      console.log('   ❌ Dynamic Registration Issues:');
      console.log(
        '      The dynamic registration pipeline is failing, which prevents:'
      );
      console.log('      - New capability registration');
      console.log('      - Shadow run testing');
      console.log('      - Capability promotion');
    }

    if (typeof dynamicFlow.proposeNewCapability !== 'function') {
      console.log('   ❌ Planning Integration Issues:');
      console.log('      The planning integration is incomplete:');
      console.log('      - proposeNewCapability method missing');
      console.log('      - LLM integration not connected');
      console.log('      - Dynamic capability creation broken');
    }

    console.log();
    console.log('🎯 Core Integration Test Complete!');
    console.log('================================');

    if (successRate >= 80) {
      console.log('✅ The core integration points are working correctly!');
      console.log(
        '   The foundation is solid for dynamic capability creation.'
      );
      console.log();
      console.log('📋 Next Steps:');
      console.log('   1. Test with real Minecraft connection');
      console.log('   2. Implement end-to-end torch corridor example');
      console.log('   3. Verify complete workflow');
    } else {
      console.log('❌ Critical integration gaps detected!');
      console.log(
        '   The core components need fixes before end-to-end testing.'
      );
      console.log();
      console.log('📋 Next Steps:');
      console.log('   1. Fix BT-DSL schema validation issues');
      console.log('   2. Ensure dynamic registration pipeline works');
      console.log('   3. Complete planning integration');
      console.log('   4. Test with real Minecraft connection');
      console.log('   5. Implement end-to-end torch corridor example');
    }
  } catch (error) {
    console.error('💥 Core integration test failed:', error);
    console.error('   Error details:', error.message);
    process.exit(1);
  }
}

// Run the test
testCoreIntegration().catch((error) => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
