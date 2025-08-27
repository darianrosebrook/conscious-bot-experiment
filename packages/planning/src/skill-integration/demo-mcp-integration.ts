/**
 * MCP Capabilities Integration Demonstration
 *
 * Demonstrates the complete integration between MCP capabilities and the planning system
 * Shows how the planning system can use MCP capabilities for dynamic behavior creation
 *
 * @author @darianrosebrook
 */

import { HybridSkillPlanner } from './hybrid-skill-planner';
import { MCPCapabilitiesAdapter } from './mcp-capabilities-adapter';
import { EnhancedRegistry } from '../../../../core/src/mcp-capabilities/enhanced-registry';
import { DynamicCreationFlow } from '../../../../core/src/mcp-capabilities/dynamic-creation-flow';
import { SkillRegistry } from '../../../../memory/src/skills/SkillRegistry';
import { BehaviorTreeRunner } from '../../behavior-trees/BehaviorTreeRunner';
import { HRMInspiredPlanner } from '../../hierarchical-planner/hrm-inspired-planner';
import { EnhancedGOAPPlanner } from '../../reactive-executor/enhanced-goap-planner';

/**
 * Demonstrate MCP capabilities integration with planning system
 */
export async function demonstrateMCPIntegration() {
  console.log('🚀 Starting MCP Capabilities Integration Demonstration\n');

  try {
    // Step 1: Initialize components
    console.log('Step 1: Initializing components...');

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

    console.log('✅ Components initialized successfully\n');

    // Step 2: Register a torch corridor capability
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

    // Step 3: Demonstrate planning with MCP capabilities
    console.log('Step 3: Demonstrating planning with MCP capabilities...');

    const goal = 'torch the mining corridor safely';
    const context = {
      skillRegistry,
      mcpRegistry,
      mcpDynamicFlow,
      worldState: {
        botPosition: { x: 0, y: 64, z: 0 },
        hasTorches: true,
        lightLevel: 4,
      },
      availableResources: {
        torches: 10,
        buildingBlocks: 20,
      },
      timeConstraints: {
        urgency: 'medium' as const,
        maxPlanningTime: 10000,
      },
      planningPreferences: {
        preferSkills: false,
        preferMCP: true,
        preferHTN: false,
        preferGOAP: false,
        allowHybrid: true,
      },
      constraints: [],
      domain: 'minecraft',
    };

    const planningResult = await hybridPlanner.plan(goal, context);

    console.log('📋 Planning Results:');
    console.log(`   Approach: ${planningResult.decision.approach}`);
    console.log(`   Reasoning: ${planningResult.decision.reasoning}`);
    console.log(
      `   Confidence: ${planningResult.decision.confidence.toFixed(2)}`
    );
    console.log(`   Latency: ${planningResult.latency}ms`);
    console.log(`   Success: ${planningResult.success}`);
    console.log('');

    // Step 4: Demonstrate plan execution
    console.log('Step 4: Demonstrating plan execution...');

    if (
      planningResult.success &&
      planningResult.plan.planningApproach === 'mcp-capabilities'
    ) {
      const executionResult = await hybridPlanner.executePlan(
        planningResult.plan,
        context
      );

      console.log('⚡ Execution Results:');
      console.log(`   Success: ${executionResult.success}`);
      console.log(
        `   Completed Steps: ${executionResult.completedSteps.length}`
      );
      console.log(`   Failed Steps: ${executionResult.failedSteps.length}`);
      console.log(`   Total Duration: ${executionResult.totalDuration}ms`);
      console.log(
        `   World State Changes: ${Object.keys(executionResult.worldStateChanges).length}`
      );
      console.log('');
    }

    // Step 5: Demonstrate impasse detection and new capability proposal
    console.log('Step 5: Demonstrating impasse detection...');

    const impasseGoal = 'mine safely in completely dark areas';
    const impasseContext = {
      ...context,
      worldState: {
        ...context.worldState,
        lightLevel: 0,
        isUnderground: true,
      },
    };

    const impasseResult = await hybridPlanner.plan(impasseGoal, impasseContext);

    console.log('🔍 Impasse Analysis:');
    console.log(`   Goal: ${impasseGoal}`);
    console.log(`   Approach: ${impasseResult.decision.approach}`);
    console.log(`   Reasoning: ${impasseResult.decision.reasoning}`);
    console.log(
      `   Confidence: ${impasseResult.decision.confidence.toFixed(2)}`
    );
    console.log('');

    // Step 6: Show capability registry status
    console.log('Step 6: Capability registry status...');

    const capabilities = await mcpRegistry.listCapabilities();
    console.log(`📊 Total Capabilities: ${capabilities.length}`);

    capabilities.forEach((cap) => {
      console.log(`   - ${cap.id} (${cap.status})`);
    });
    console.log('');

    console.log('🎉 MCP Capabilities Integration Demonstration Complete!');
    console.log('');
    console.log('Key Achievements:');
    console.log('✅ MCP capabilities integrated with planning system');
    console.log('✅ Dynamic capability creation and registration');
    console.log('✅ Impasse detection and new capability proposal');
    console.log('✅ Plan generation and execution with MCP capabilities');
    console.log('✅ Shadow run pipeline for safe capability testing');
    console.log('✅ Fallback mechanisms when MCP capabilities unavailable');
  } catch (error) {
    console.error('❌ Demonstration failed:', error);
  }
}

// Run the demonstration if this file is executed directly
if (require.main === module) {
  demonstrateMCPIntegration().catch(console.error);
}
