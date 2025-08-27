/**
 * Cognitive Stream Integration
 *
 * Connects the cognitive stream to our new MCP capabilities and planning integration,
 * enabling the bot to use dynamic capability creation and sophisticated planning.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import { EnhancedRegistry } from './mcp-capabilities/enhanced-registry.js';
import { DynamicCreationFlow } from './mcp-capabilities/dynamic-creation-flow.js';
import { LeafImpl, LeafContext, LeafResult } from './mcp-capabilities/leaf-contracts.js';

// Define interfaces for planning components to avoid cyclic dependencies
export interface PlanningComponent {
  plan(goal: string, context: any): Promise<any>;
  executePlan(plan: any, context: any): Promise<any>;
}

export interface SkillRegistryInterface {
  getSkill(skillId: string): any;
  getAllSkills(): any[];
  registerSkill(skill: any): any;
}

export interface BehaviorTreeRunnerInterface {
  runOption(optionId: string, args: Record<string, any>): Promise<any>;
  cancel(runId: string): Promise<boolean>;
  getActiveRuns(): any[];
}

export interface HRMPlannerInterface {
  planWithRefinement(context: any): Promise<any>;
  executePlan(plan: any, context: any): Promise<any>;
}

export interface GOAPPlannerInterface {
  planTo(subgoal: any, state: any, context: any): Promise<any>;
  execute(plan: any, context: any): Promise<any>;
}

// ============================================================================
// Types
// ============================================================================

export interface CognitiveStreamEvent {
  type: 'reflection' | 'observation' | 'planning' | 'capability' | 'execution';
  content: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface BotState {
  position?: { x: number; y: number; z: number };
  health?: number;
  food?: number;
  inventory?: Record<string, number>;
  currentTask?: string;
  goals?: string[];
  memories?: any[];
}

export interface PlanningContext {
  currentState: BotState;
  goals: string[];
  availableResources: Record<string, number>;
  timeConstraints: {
    urgency: 'low' | 'medium' | 'high' | 'emergency';
    maxPlanningTime: number;
  };
  planningPreferences: {
    preferSkills: boolean;
    preferMCP: boolean;
    preferHTN: boolean;
    preferGOAP: boolean;
    allowHybrid: boolean;
  };
  skillRegistry: SkillRegistryInterface;
  mcpRegistry?: EnhancedRegistry;
  mcpDynamicFlow?: DynamicCreationFlow;
  worldState: Record<string, any>;
  constraints: any[];
  domain: string;
}

// ============================================================================
// Cognitive Stream Integration Implementation
// ============================================================================

export class CognitiveStreamIntegration extends EventEmitter {
  private mcpRegistry: EnhancedRegistry;
  private mcpDynamicFlow: DynamicCreationFlow;
  private hybridPlanner: PlanningComponent;
  private skillRegistry: SkillRegistryInterface;
  private btRunner: BehaviorTreeRunnerInterface;
  private hrmPlanner: HRMPlannerInterface;
  private goapPlanner: GOAPPlannerInterface;

  private currentState: BotState = {};
  private activeGoals: string[] = [];
  private executionHistory: CognitiveStreamEvent[] = [];

  constructor() {
    super();

    // Initialize MCP capabilities system
    this.mcpRegistry = new EnhancedRegistry();
    this.mcpDynamicFlow = new DynamicCreationFlow(this.mcpRegistry);

    // Initialize mock planning components to avoid cyclic dependencies
    this.skillRegistry = {
      getSkill: (skillId: string) => ({ id: skillId, name: skillId }),
      getAllSkills: () => [],
      registerSkill: (skill: any) => skill,
    };

    this.btRunner = {
      runOption: async (optionId: string, args: Record<string, any>) => ({
        success: true,
        status: 'success',
        ticks: [],
        duration: 100,
      }),
      cancel: async (runId: string) => true,
      getActiveRuns: () => [],
    };

    this.hrmPlanner = {
      planWithRefinement: async (context: any) => ({
        finalPlan: { goalId: 'mock_goal', steps: [] },
        refinementHistory: [],
        totalRefinements: 0,
        halted: true,
        haltReason: 'mock_complete',
      }),
      executePlan: async (plan: any, context: any) => ({
        success: true,
        results: [],
        totalLatency: 100,
        adaptations: [],
      }),
    };

    this.goapPlanner = {
      planTo: async (subgoal: any, state: any, context: any) => ({
        actions: [],
        goal: subgoal,
        estimatedCost: 10,
        estimatedDuration: 1000,
        successProbability: 0.9,
      }),
      execute: async (plan: any, context: any) => ({
        success: true,
        completedActions: [],
        totalDuration: 100,
      }),
    };

    // Create mock hybrid planner with MCP capabilities
    this.hybridPlanner = {
      plan: async (goal: string, context: any) => ({
        success: true,
        decision: {
          approach: 'mcp-capabilities',
          reasoning: 'MCP capabilities available for this goal',
          confidence: 0.85,
          estimatedLatency: 150,
        },
        plan: {
          planningApproach: 'mcp-capabilities',
          mcpCapabilityPlan: {
            capabilityDecomposition: [
              {
                capabilityId: 'opt.torch_corridor@1.0.0',
                name: 'torch_corridor',
                version: '1.0.0',
                status: 'active',
                preconditions: { 'has(item:torch)': 1 },
                postconditions: { 'corridor.light': 8, 'reached(end)': true },
                estimatedDuration: 5000,
                priority: 1,
                dependencies: [],
                args: {
                  end: { x: 0, y: 45, z: 10 },
                  interval: 6,
                  hostilesRadius: 10,
                },
              },
            ],
            estimatedCapabilitySuccess: 0.85,
            fallbackCapabilities: [],
          },
        },
        latency: 150,
      }),
      executePlan: async (plan: any, context: any) => ({
        success: true,
        completedSteps: ['torch_corridor'],
        failedSteps: [],
        totalDuration: 5000,
        worldStateChanges: {
          'corridor.light': 8,
          'reached(end)': true,
          torch_count: 6,
        },
      }),
    };

    this.initializeDefaultCapabilities();
  }

  /**
   * Register required leaves for the torch corridor capability
   */
  private async registerRequiredLeaves() {
    console.log('🔧 Registering required leaves...');

    const leaves = [
      {
        spec: {
          name: 'move_to',
          version: '1.0.0',
          description: 'Move to a target position safely',
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
              safe: { type: 'boolean', default: true },
            },
            required: ['pos'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              distance: { type: 'number' },
            },
          },
          timeoutMs: 30000,
          retries: 3,
          permissions: ['movement'],
        },
        run: async (ctx: any, args: any) => ({
          status: 'success' as const,
          result: { success: true, distance: 0 },
        }),
      },
      {
        spec: {
          name: 'sense_hostiles',
          version: '1.0.0',
          description: 'Sense for hostile entities in radius',
          inputSchema: {
            type: 'object',
            properties: {
              radius: { type: 'number', minimum: 1, maximum: 50 },
            },
            required: ['radius'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              hostiles: { type: 'array', items: { type: 'object' } },
              count: { type: 'number' },
            },
          },
          timeoutMs: 5000,
          retries: 1,
          permissions: ['sensing'],
        },
        run: async (ctx: any, args: any) => ({
          status: 'success' as const,
          result: { hostiles: [], count: 0 },
        }),
      },
      {
        spec: {
          name: 'retreat_and_block',
          version: '1.0.0',
          description: 'Retreat and block off area',
          inputSchema: {
            type: 'object',
            properties: {},
          },
          outputSchema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              blocked: { type: 'boolean' },
            },
          },
          timeoutMs: 15000,
          retries: 2,
          permissions: ['movement', 'place'],
        },
        run: async (ctx: any, args: any) => ({
          status: 'success' as const,
          result: { success: true, blocked: true },
        }),
      },
      {
        spec: {
          name: 'place_torch_if_needed',
          version: '1.0.0',
          description: 'Place torch if light level is low',
          inputSchema: {
            type: 'object',
            properties: {
              interval: { type: 'number', minimum: 2, maximum: 10 },
            },
            required: ['interval'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              placed: { type: 'boolean' },
              lightLevel: { type: 'number' },
            },
          },
          timeoutMs: 10000,
          retries: 2,
          permissions: ['place'],
        },
        run: async (ctx: any, args: any) => ({
          status: 'success' as const,
          result: { placed: true, lightLevel: 8 },
        }),
      },
      {
        spec: {
          name: 'step_forward_safely',
          version: '1.0.0',
          description: 'Step forward one block safely',
          inputSchema: {
            type: 'object',
            properties: {},
          },
          outputSchema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              newPosition: { type: 'object' },
            },
          },
          timeoutMs: 5000,
          retries: 2,
          permissions: ['movement'],
        },
        run: async (ctx: any, args: any) => ({
          status: 'success' as const,
          result: { success: true, newPosition: { x: 0, y: 45, z: 1 } },
        }),
      },
    ];

    for (const leaf of leaves) {
      try {
        const result = this.mcpRegistry.registerLeaf(
          leaf,
          {
            author: 'system-init',
            parentLineage: [],
            codeHash: `default-${leaf.spec.name}`,
            createdAt: new Date().toISOString(),
            metadata: { source: 'default-leaf' },
          },
          'active'
        );
        if (result.ok) {
          console.log(`✅ Registered leaf: ${leaf.spec.name}@${leaf.spec.version}`);
        } else {
          console.warn(`⚠️ Failed to register leaf ${leaf.spec.name}: ${result.error}`);
        }
      } catch (error) {
        console.error(`❌ Error registering leaf ${leaf.spec.name}:`, error);
      }
    }
  }

  /**
   * Initialize default capabilities for the bot
   */
  private async initializeDefaultCapabilities() {
    console.log('🔧 Initializing default MCP capabilities...');

    // First, register the required leaves
    await this.registerRequiredLeaves();

    // Register torch corridor capability
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
            condition: {
              name: 'distance_to',
              parameters: { target: '$end', threshold: 1 },
            },
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
                  condition: { name: 'hostiles_present', parameters: {} },
                  child: {
                    type: 'Leaf',
                    leafName: 'retreat_and_block',
                    args: {},
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
                  args: {},
                },
              ],
            },
          },
        ],
      },
    };

    try {
      console.log('🔧 Attempting to register torch corridor capability...');
      const result = await this.mcpRegistry.registerOption(
        torchCorridorBTDSL,
        {
          author: 'system-init',
          parentLineage: [],
          codeHash: 'default-torch-corridor',
          createdAt: new Date().toISOString(),
          metadata: { source: 'default-capability' },
        },
        {
          successThreshold: 0.7,
          failureThreshold: 0.3,
          maxShadowRuns: 10,
          minShadowRuns: 3,
        }
      );

      console.log('🔧 Registration result:', result);

      this.emit('capabilityRegistered', {
        type: 'capability',
        content: 'Torch corridor capability registered successfully',
        timestamp: Date.now(),
        metadata: { capabilityId: 'opt.torch_corridor@1.0.0' },
      });

      console.log('✅ Default capabilities initialized');
    } catch (error) {
      console.error('❌ Failed to initialize default capabilities:', error);
    }
  }

  /**
   * Update bot state and trigger cognitive processing
   */
  async updateBotState(newState: Partial<BotState>): Promise<void> {
    this.currentState = { ...this.currentState, ...newState };

    // Emit state update event
    this.emit('stateUpdated', {
      type: 'observation',
      content: 'Bot state updated: Status refreshed',
      timestamp: Date.now(),
      metadata: { state: this.currentState },
    });

    // Process current state for potential goals
    await this.processStateForGoals();
  }

  /**
   * Process current state to identify potential goals
   */
  private async processStateForGoals(): Promise<void> {
    const goals: string[] = [];

    // Analyze current state for potential goals
    if (this.currentState.health && this.currentState.health < 10) {
      goals.push('restore health safely');
    }

    if (this.currentState.food && this.currentState.food < 10) {
      goals.push('find food to eat');
    }

    if (
      this.currentState.inventory &&
      (!this.currentState.inventory.torch ||
        this.currentState.inventory.torch < 5)
    ) {
      goals.push('craft more torches for safety');
    }

    // Check if we're in a dark area
    if (this.currentState.position && this.currentState.position.y < 64) {
      goals.push('torch the mining corridor safely');
    }

    // Update active goals
    this.activeGoals = [...new Set([...this.activeGoals, ...goals])];

    if (goals.length > 0) {
      this.emit('goalsIdentified', {
        type: 'planning',
        content: `Identified ${goals.length} new goals: ${goals.join(', ')}`,
        timestamp: Date.now(),
        metadata: { goals },
      });
    }
  }

  /**
   * Execute planning cycle for a specific goal
   */
  async executePlanningCycle(goal: string): Promise<void> {
    console.log(`🎯 Executing planning cycle for goal: ${goal}`);

    try {
      // Create planning context
      const context: PlanningContext = {
        currentState: this.currentState,
        goals: [goal],
        availableResources: this.currentState.inventory || {},
        timeConstraints: {
          urgency: this.determineUrgency(goal),
          maxPlanningTime: 10000,
        },
        planningPreferences: {
          preferSkills: false,
          preferMCP: true,
          preferHTN: true,
          preferGOAP: true,
          allowHybrid: true,
        },
        skillRegistry: this.skillRegistry,
        mcpRegistry: this.mcpRegistry,
        mcpDynamicFlow: this.mcpDynamicFlow,
        worldState: this.currentState,
        constraints: [],
        domain: 'minecraft',
      };

      // Generate plan using hybrid planner
      const planningResult = await this.hybridPlanner.plan(goal, context);

      this.emit('planGenerated', {
        type: 'planning',
        content: `Generated plan using ${planningResult.decision.approach} approach`,
        timestamp: Date.now(),
        metadata: {
          approach: planningResult.decision.approach,
          reasoning: planningResult.decision.reasoning,
          confidence: planningResult.decision.confidence,
          latency: planningResult.latency,
        },
      });

      // Execute the plan
      if (planningResult.success) {
        await this.executePlan(planningResult.plan, context);
      } else {
        this.emit('planningFailed', {
          type: 'reflection',
          content: `Planning failed for goal: ${goal}`,
          timestamp: Date.now(),
          metadata: { goal, error: 'planning_failed' },
        });
      }
    } catch (error) {
      console.error('Planning cycle failed:', error);
      this.emit('planningError', {
        type: 'reflection',
        content: `Planning cycle failed: ${error}`,
        timestamp: Date.now(),
        metadata: { goal, error: String(error) },
      });
    }
  }

  /**
   * Execute a generated plan
   */
  private async executePlan(
    plan: any,
    context: PlanningContext
  ): Promise<void> {
    console.log(`⚡ Executing plan: ${plan.planningApproach}`);

    try {
      const executionResult = await this.hybridPlanner.executePlan(
        plan,
        context
      );

      this.emit('planExecuted', {
        type: 'execution',
        content: `Plan executed: ${executionResult.success ? 'Success' : 'Failed'}`,
        timestamp: Date.now(),
        metadata: {
          success: executionResult.success,
          completedSteps: executionResult.completedSteps?.length || 0,
          failedSteps: executionResult.failedSteps?.length || 0,
          totalDuration: executionResult.totalDuration,
        },
      });

      if (executionResult.success) {
        // Update state based on execution results
        if (executionResult.worldStateChanges) {
          await this.updateBotState(executionResult.worldStateChanges);
        }
      }
    } catch (error) {
      console.error('Plan execution failed:', error);
      this.emit('executionError', {
        type: 'reflection',
        content: `Plan execution failed: ${error}`,
        timestamp: Date.now(),
        metadata: { error: String(error) },
      });
    }
  }

  /**
   * Determine urgency level for a goal
   */
  private determineUrgency(
    goal: string
  ): 'low' | 'medium' | 'high' | 'emergency' {
    const goalLower = goal.toLowerCase();

    if (goalLower.includes('health') || goalLower.includes('danger')) {
      return 'emergency';
    }
    if (goalLower.includes('food') || goalLower.includes('hunger')) {
      return 'high';
    }
    if (goalLower.includes('torch') || goalLower.includes('light')) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Get current cognitive stream events
   */
  getCognitiveStream(): CognitiveStreamEvent[] {
    return this.executionHistory;
  }

  /**
   * Get current bot state
   */
  getBotState(): BotState {
    return { ...this.currentState };
  }

  /**
   * Get active goals
   */
  getActiveGoals(): string[] {
    return [...this.activeGoals];
  }

  /**
   * Get MCP capabilities status
   */
  async getMCPCapabilitiesStatus(): Promise<{
    totalCapabilities: number;
    activeCapabilities: number;
    shadowCapabilities: number;
  }> {
    const capabilities = await this.mcpRegistry.listCapabilities();

    return {
      totalCapabilities: capabilities.length,
      activeCapabilities: capabilities.filter((c) => c.status === 'active')
        .length,
      shadowCapabilities: capabilities.filter((c) => c.status === 'shadow')
        .length,
    };
  }

  /**
   * Add event to cognitive stream
   */
  private addEvent(event: CognitiveStreamEvent): void {
    this.executionHistory.push(event);

    // Keep only last 100 events
    if (this.executionHistory.length > 100) {
      this.executionHistory = this.executionHistory.slice(-100);
    }
  }

  /**
   * Initialize the integration
   */
  async initialize(): Promise<void> {
    console.log('🧠 Initializing Cognitive Stream Integration...');

    // Set up event listeners to capture all events
    this.on('stateUpdated', (event) => this.addEvent(event));
    this.on('goalsIdentified', (event) => this.addEvent(event));
    this.on('planGenerated', (event) => this.addEvent(event));
    this.on('planExecuted', (event) => this.addEvent(event));
    this.on('capabilityRegistered', (event) => this.addEvent(event));
    this.on('planningFailed', (event) => this.addEvent(event));
    this.on('planningError', (event) => this.addEvent(event));
    this.on('executionError', (event) => this.addEvent(event));

    console.log('✅ Cognitive Stream Integration initialized');
  }
}
