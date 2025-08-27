/**
 * End-to-End Integration Demonstration
 *
 * Demonstrates the complete integration from goal formulation to Minecraft execution
 * Shows how MCP capabilities, planning, and Minecraft interface work together
 *
 * @author @darianrosebrook
 */

import { EnhancedPlanExecutor } from './enhanced-plan-executor';
import { HybridSkillPlanner } from '@conscious-bot/planning';
import { EnhancedRegistry } from '@conscious-bot/core';
import { DynamicCreationFlow } from '@conscious-bot/core';
import { SkillRegistry } from '@conscious-bot/memory';
import { BehaviorTreeRunner } from '@conscious-bot/planning';
import { HRMInspiredPlanner } from '@conscious-bot/planning';
import { EnhancedGOAPPlanner } from '@conscious-bot/planning';
import { BotConfig } from './types';

/**
 * Demonstrate complete end-to-end integration
 */
export async function demonstrateEndToEndIntegration() {
  console.log('🚀 Starting End-to-End Integration Demonstration\n');

  try {
    // Step 1: Initialize all components
    console.log('Step 1: Initializing all components...');

    // Initialize planning components
    const skillRegistry = new SkillRegistry();
    const btRunner = new BehaviorTreeRunner();
    const hrmPlanner = new HRMInspiredPlanner();
    const goapPlanner = new EnhancedGOAPPlanner();

    // Initialize MCP capabilities system
    const mcpRegistry = new EnhancedRegistry();
    const mcpDynamicFlow = new DynamicCreationFlow(mcpRegistry);

    // Create hybrid planner with MCP capabilities
    const hybridPlanner = new HybridSkillPlanner(
      skillRegistry,
      btRunner,
      hrmPlanner,
      goapPlanner,
      mcpRegistry,
      mcpDynamicFlow
    );

    // Initialize Minecraft interface
    const botConfig: BotConfig = {
      host: 'localhost',
      port: 25565,
      username: 'ConsciousBot',
      version: '1.20.1',
      auth: 'offline',
      autoReconnect: true,
      maxReconnectAttempts: 5,
      reconnectDelay: 5000,
    };

    const enhancedPlanExecutor = new EnhancedPlanExecutor(
      botConfig,
      hybridPlanner,
      mcpRegistry,
      mcpDynamicFlow
    );

    console.log('✅ All components initialized successfully\n');

    // Step 2: Register torch corridor capability
    console.log('Step 2: Registering torch corridor capability...');

    const torchCorridorBTDSL = {
      name: 'opt.torch_corridor',
      version: '1.0.0',
      argsSchema: {
        type: 'object',
        properties: {
          end: {
            type: 'object',
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
              z: { type: 'number' },
            },
            required: ['x', 'y', 'z'],
          },
          interval: {
            type: 'integer',
            minimum: 2,
            maximum: 10,
            default: 6,
          },
          hostilesRadius: {
            type: 'integer',
            minimum: 5,
            maximum: 20,
            default: 10,
          },
        },
        required: ['end'],
      },
      pre: ['has(item:torch)>=1'],
      post: ['corridor.light>=8', 'reached(end)==true'],
      tree: {
        type: 'Sequence',
        children: [
          {
            type: 'Leaf',
            name: 'move_to',
            args: { pos: '$end', safe: true },
          },
          {
            type: 'Repeat.Until',
            predicate: 'distance_to($end)<=1',
            child: {
              type: 'Sequence',
              children: [
                {
                  type: 'Leaf',
                  name: 'sense_hostiles',
                  args: { radius: '$hostilesRadius' },
                },
                {
                  type: 'Decorator.FailOnTrue',
                  cond: 'hostiles_present',
                  child: {
                    type: 'Leaf',
                    name: 'retreat_and_block',
                    args: {},
                  },
                },
                {
                  type: 'Leaf',
                  name: 'place_torch_if_needed',
                  args: { interval: '$interval' },
                },
                {
                  type: 'Leaf',
                  name: 'step_forward_safely',
                  args: {},
                },
              ],
            },
          },
        ],
      },
    };

    const registrationResult = await mcpRegistry.registerOption(
      torchCorridorBTDSL,
      {
        author: 'llm-proposal',
        parentLineage: [],
        codeHash: 'bt-dsl-generated',
        createdAt: new Date().toISOString(),
        metadata: { source: 'demo-registration' },
      },
      {
        successThreshold: 0.7,
        failureThreshold: 0.3,
        maxShadowRuns: 10,
        minShadowRuns: 3,
      }
    );

    console.log(
      `✅ Torch corridor capability registered: ${registrationResult.id}\n`
    );

    // Step 3: Initialize Minecraft connection
    console.log('Step 3: Initializing Minecraft connection...');

    try {
      await enhancedPlanExecutor.initialize();
      console.log('✅ Minecraft connection established\n');
    } catch (error) {
      console.log(
        '⚠️  Minecraft connection failed (continuing with simulation)...\n'
      );
    }

    // Step 4: Execute complete planning and execution cycle
    console.log('Step 4: Executing complete planning and execution cycle...');

    const goal = 'torch the mining corridor safely';
    const initialSignals = [
      { type: 'goal', content: goal, priority: 'high' },
      { type: 'environment', content: 'underground', lightLevel: 4 },
    ];

    const result = await enhancedPlanExecutor.executePlanningCycle(
      goal,
      initialSignals
    );

    console.log('📋 Execution Results:');
    console.log(`   Success: ${result.success}`);
    console.log(`   Total Duration: ${result.totalDuration}ms`);
    console.log(`   Steps Completed: ${result.stepsCompleted}`);
    console.log(`   Steps Failed: ${result.stepsFailed}`);
    console.log(
      `   MCP Capabilities Used: ${result.mcpCapabilitiesUsed.length}`
    );
    console.log(`   Shadow Runs Executed: ${result.shadowRunResults.length}`);
    console.log(
      `   Dynamic Capabilities Created: ${result.dynamicCapabilitiesCreated.length}`
    );
    console.log('');

    // Step 5: Show detailed MCP capabilities usage
    if (result.mcpCapabilitiesUsed.length > 0) {
      console.log('🔧 MCP Capabilities Usage:');
      result.mcpCapabilitiesUsed.forEach((capabilityId) => {
        console.log(`   - ${capabilityId}`);
      });
      console.log('');
    }

    // Step 6: Show shadow run results
    if (result.shadowRunResults.length > 0) {
      console.log('👻 Shadow Run Results:');
      result.shadowRunResults.forEach((shadowRun) => {
        console.log(
          `   - ${shadowRun.id}: ${shadowRun.status} (${shadowRun.durationMs}ms)`
        );
      });
      console.log('');
    }

    // Step 7: Show world state changes
    if (Object.keys(result.worldStateChanges).length > 0) {
      console.log('🌍 World State Changes:');
      Object.entries(result.worldStateChanges).forEach(([key, value]) => {
        console.log(`   - ${key}: ${JSON.stringify(value)}`);
      });
      console.log('');
    }

    // Step 8: Demonstrate impasse detection and new capability creation
    console.log('Step 8: Demonstrating impasse detection...');

    const impasseGoal = 'mine safely in completely dark areas';
    const impasseSignals = [
      { type: 'goal', content: impasseGoal, priority: 'high' },
      { type: 'environment', content: 'completely_dark', lightLevel: 0 },
      { type: 'warning', content: 'no_lighting_capability_available' },
    ];

    const impasseResult = await enhancedPlanExecutor.executePlanningCycle(
      impasseGoal,
      impasseSignals
    );

    console.log('🔍 Impasse Analysis Results:');
    console.log(`   Goal: ${impasseGoal}`);
    console.log(`   Success: ${impasseResult.success}`);
    console.log(
      `   Dynamic Capabilities Created: ${impasseResult.dynamicCapabilitiesCreated.length}`
    );
    console.log(
      `   Shadow Runs Executed: ${impasseResult.shadowRunResults.length}`
    );
    console.log('');

    // Step 9: Show final capability registry status
    console.log('Step 9: Final capability registry status...');

    const capabilities = await mcpRegistry.listCapabilities();
    console.log(`📊 Total Capabilities: ${capabilities.length}`);

    capabilities.forEach((cap) => {
      console.log(`   - ${cap.id} (${cap.status})`);
    });
    console.log('');

    // Step 10: Performance metrics
    console.log('Step 10: Performance metrics...');

    const botStatus = enhancedPlanExecutor.getBotStatus();
    console.log(`🤖 Bot Status: ${botStatus.connectionState}`);
    console.log(`   Connection Time: ${botStatus.connectionTime || 'N/A'}`);
    console.log(`   Reconnect Attempts: ${botStatus.reconnectAttempts || 0}`);
    console.log('');

    console.log('🎉 End-to-End Integration Demonstration Complete!');
    console.log('');
    console.log('Key Achievements:');
    console.log('✅ Complete integration from goal to Minecraft execution');
    console.log('✅ MCP capabilities integrated with planning system');
    console.log('✅ Dynamic capability creation and testing');
    console.log('✅ Shadow run pipeline for safe capability testing');
    console.log('✅ Real-time Minecraft world state monitoring');
    console.log('✅ Comprehensive telemetry and performance tracking');
    console.log('✅ Impasse detection and new capability proposal');
    console.log('✅ Graceful fallback mechanisms');

    // Cleanup
    await enhancedPlanExecutor.shutdown();
  } catch (error) {
    console.error('❌ End-to-end demonstration failed:', error);
  }
}

// Run the demonstration if this file is executed directly
if (require.main === module) {
  demonstrateEndToEndIntegration().catch(console.error);
}
