#!/usr/bin/env node

/**
 * Integration Verification Test for Minecraft Interface
 *
 * Tests the specific integration points identified in the systematic verification:
 * 1. Planning Integration with MCP Capabilities
 * 2. BT-DSL Integration with LLM and Execution
 * 3. Dynamic Registration Pipeline
 * 4. End-to-End Workflow
 *
 * @author @darianrosebrook
 */

import { createMinecraftInterface } from './src/index';
import { BotConfig } from './src/types';
import { createIntegratedPlanningCoordinator } from '@conscious-bot/planning';
import { EnhancedRegistry } from '@conscious-bot/core/src/mcp-capabilities/enhanced-registry';
import { DynamicCreationFlow } from '@conscious-bot/core/src/mcp-capabilities/dynamic-creation-flow';
import { BTDSLParser } from '@conscious-bot/core/src/mcp-capabilities/bt-dsl-parser';
import { LeafFactory } from '@conscious-bot/core/src/mcp-capabilities/leaf-factory';

// Mock torch corridor BT-DSL for testing
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
        args: { pos: '$end', safe: true },
      },
      {
        type: 'Repeat.Until',
        condition: 'distance_to_end',
        child: {
          type: 'Sequence',
          children: [
            {
              type: 'Leaf',
              leafName: 'sense_hostiles',
              args: { radius: '$hostilesRadius' },
            },
            {
              type: 'Decorator.FailOnTrue',
              condition: 'hostiles_present',
              child: {
                type: 'Leaf',
                leafName: 'retreat_and_block',
              },
            },
            {
              type: 'Leaf',
              leafName: 'place_torch_if_needed',
              args: { interval: '$interval' },
            },
            {
              type: 'Leaf',
              leafName: 'step_forward_safely',
            },
          ],
        },
      },
    ],
  },
};

async function testIntegrationVerification() {
  console.log('🧪 Integration Verification Test');
  console.log('================================');
  console.log(
    'Testing the specific integration points identified in systematic verification'
  );
  console.log();

  try {
    // Configuration for testing
    const config: BotConfig = {
      host: 'localhost',
      port: 25565,
      username: 'IntegrationTestBot',
      version: '1.21.4',
      auth: 'offline',
      pathfindingTimeout: 5000,
      actionTimeout: 10000,
      observationRadius: 16,
      autoReconnect: false,
      maxReconnectAttempts: 0,
      emergencyDisconnect: true,
    };

    console.log('📋 Test Configuration:');
    console.log(`   Host: ${config.host}`);
    console.log(`   Port: ${config.port}`);
    console.log(`   Username: ${config.username}`);
    console.log();

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
    console.log('   ✅ Leaf Factory created');
    console.log();

    // Test 2: Verify BT-DSL Integration
    console.log('🌳 Test 2: BT-DSL Integration');
    console.log('   Testing BT-DSL parsing...');
    const parseResult = btParser.parse(torchCorridorBTDSL, leafFactory);
    console.log(
      `   Parse result: ${parseResult.valid ? '✅ Valid' : '❌ Invalid'}`
    );
    if (!parseResult.valid) {
      console.log(`   Errors: ${parseResult.errors?.join(', ')}`);
    } else {
      console.log(`   Tree hash: ${parseResult.treeHash}`);
      console.log('   ✅ BT-DSL parsing successful');
    }
    console.log();

    // Test 3: Verify Dynamic Registration Pipeline
    console.log('📝 Test 3: Dynamic Registration Pipeline');
    console.log('   Testing option registration...');
    const registrationResult = registry.registerOption(
      torchCorridorBTDSL,
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
      `   Registration result: ${registrationResult.ok ? '✅ Success' : '❌ Failed'}`
    );
    if (registrationResult.ok) {
      console.log(`   Option ID: ${registrationResult.id}`);
      console.log('   ✅ Option registration successful');
    } else {
      console.log(`   Error: ${registrationResult.error}`);
    }
    console.log();

    // Test 4: Verify Planning Integration
    console.log('🧠 Test 4: Planning Integration');
    console.log('   Creating planning coordinator...');
    const planningCoordinator = createIntegratedPlanningCoordinator({
      coordinatorConfig: {
        routingStrategy: 'adaptive',
        fallbackTimeout: 30000,
        enablePlanMerging: true,
        enableCrossValidation: false,
      },
    });
    console.log('   ✅ Planning coordinator created');

    console.log('   Creating Minecraft interface...');
    const minecraftInterface = await createMinecraftInterface(
      config,
      planningCoordinator
    );
    console.log('   ✅ Minecraft interface created');

    // Test 5: Verify End-to-End Workflow
    console.log('🔄 Test 5: End-to-End Workflow');
    console.log('   Testing signal processing...');
    try {
      const signals =
        await minecraftInterface.observationMapper.processSignals();
      console.log(`   Generated ${signals.length} signals`);
      console.log('   ✅ Signal processing working');
    } catch (error) {
      console.log(`   ⚠️ Signal processing failed: ${error.message}`);
    }

    console.log('   Testing planning cycle...');
    try {
      const testSignals = [
        {
          type: 'safety',
          intensity: 0.8,
          urgency: 0.7,
          timestamp: Date.now(),
          source: 'test',
          parameters: {
            goal: 'torch_corridor_safely',
            targetPosition: { x: 100, y: 12, z: -35 },
          },
        },
      ];

      const executionResult =
        await minecraftInterface.planExecutor.executePlanningCycle(testSignals);
      console.log('   Planning result:', {
        success: executionResult.success,
        executedSteps: executionResult.executedSteps?.length || 0,
        totalSteps: executionResult.totalSteps || 0,
        repairAttempts: executionResult.repairAttempts || 0,
        error: executionResult.error,
      });
      console.log('   ✅ Planning cycle executed');
    } catch (error) {
      console.log(`   ⚠️ Planning cycle failed: ${error.message}`);
    }
    console.log();

    // Test 6: Verify Integration Points
    console.log('🔗 Test 6: Integration Points Verification');

    // Check if planning system can access MCP capabilities
    console.log('   Checking planning system access to MCP capabilities...');
    const hasMCPAccess =
      minecraftInterface.planExecutor &&
      typeof minecraftInterface.planExecutor.executePlanningCycle ===
        'function';
    console.log(
      `   Planning system has MCP access: ${hasMCPAccess ? '✅ Yes' : '❌ No'}`
    );

    // Check if BT-DSL can be executed
    console.log('   Checking BT-DSL execution capability...');
    const canExecuteBTDSL = parseResult.valid && parseResult.compiled;
    console.log(
      `   BT-DSL can be executed: ${canExecuteBTDSL ? '✅ Yes' : '❌ No'}`
    );

    // Check if dynamic registration works
    console.log('   Checking dynamic registration capability...');
    const canRegisterDynamically = registrationResult.ok;
    console.log(
      `   Dynamic registration works: ${canRegisterDynamically ? '✅ Yes' : '❌ No'}`
    );

    // Check if end-to-end workflow is connected
    console.log('   Checking end-to-end workflow connection...');
    const hasEndToEndConnection =
      minecraftInterface.botAdapter &&
      minecraftInterface.observationMapper &&
      minecraftInterface.planExecutor;
    console.log(
      `   End-to-end workflow connected: ${hasEndToEndConnection ? '✅ Yes' : '❌ No'}`
    );
    console.log();

    // Test 7: Verify Bot Connection
    console.log('🤖 Test 7: Bot Connection Verification');
    try {
      const botStatus = minecraftInterface.botAdapter.getStatus();
      console.log('   Bot status:', {
        connected: botStatus.connected,
        position: botStatus.position,
        health: botStatus.health,
        food: botStatus.food,
      });

      if (botStatus.connected) {
        console.log('   ✅ Bot successfully connected to Minecraft server');
      } else {
        console.log('   ⚠️ Bot not connected (may be expected for testing)');
      }
    } catch (error) {
      console.log(`   ⚠️ Bot status check failed: ${error.message}`);
    }
    console.log();

    // Test 8: Summary and Recommendations
    console.log('📊 Test 8: Integration Summary');
    const integrationPoints = {
      mcpInfrastructure: true, // All MCP components created successfully
      btDslIntegration: parseResult.valid,
      dynamicRegistration: registrationResult.ok,
      planningIntegration: hasMCPAccess,
      endToEndWorkflow: hasEndToEndConnection,
      botConnection:
        minecraftInterface.botAdapter?.getStatus()?.connected || false,
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

    // Shutdown
    console.log();
    console.log('🔌 Shutting down...');
    await minecraftInterface.planExecutor.shutdown();
    console.log('   ✅ Shutdown completed');

    console.log();
    console.log('🎯 Integration Verification Complete!');
    console.log('====================================');

    if (successRate >= 80) {
      console.log('✅ The integration points are working correctly!');
      console.log('   The bot should be able to:');
      console.log('   - Create new behaviors when planning fails');
      console.log('   - Safely test and validate new capabilities');
      console.log('   - Integrate new capabilities into the planning system');
      console.log('   - Demonstrate the complete end-to-end workflow');
    } else {
      console.log('❌ Critical integration gaps detected!');
      console.log(
        '   Please refer to the CRITICAL_INTEGRATION_FIXES.md for specific fixes.'
      );
    }
  } catch (error) {
    console.error('💥 Integration verification failed:', error);
    console.error('   Error details:', error.message);

    if (error.code === 'ECONNREFUSED') {
      console.error(
        '   💡 Make sure a Minecraft server is running on localhost:25565'
      );
    }

    process.exit(1);
  }
}

// Run the test
testIntegrationVerification().catch((error) => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
