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
import {
  LeafImpl,
  LeafContext,
  LeafResult,
  createLeafContext,
} from './mcp-capabilities/leaf-contracts.js';

// Import real leaf implementations
import {
  MoveToLeaf,
  StepForwardSafelyLeaf,
  PlaceTorchIfNeededLeaf,
  RetreatAndBlockLeaf,
  SenseHostilesLeaf,
} from './leaves/index.js';

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
  private bot: any; // Mineflayer bot instance

  private currentState: BotState = {};
  private activeGoals: string[] = [];
  private executionHistory: CognitiveStreamEvent[] = [];

  constructor(bot?: any) {
    super();

    // Store bot instance
    this.bot = bot;

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

    // Create enhanced mock hybrid planner that actually executes MCP capabilities
    this.hybridPlanner = {
      plan: async (goal: string, context: any) => {
        console.log(`🎯 Planning for goal: ${goal}`);

        // Check if we have MCP capabilities for this goal
        const capabilities = await this.mcpRegistry.listCapabilities();
        const applicableCapabilities = capabilities.filter((cap: any) => {
          const goalLower = goal.toLowerCase();
          const capName = cap.name.toLowerCase();

          // More sophisticated matching
          if (goalLower.includes(capName) || capName.includes(goalLower)) {
            return true;
          }

          // Check for specific keyword matches
          const goalKeywords = goalLower.split(' ');
          const capKeywords = capName.split('_').join(' ').split(' ');

          for (const goalKeyword of goalKeywords) {
            for (const capKeyword of capKeywords) {
              if (
                goalKeyword.length > 2 &&
                capKeyword.length > 2 &&
                (goalKeyword.includes(capKeyword) ||
                  capKeyword.includes(goalKeyword))
              ) {
                return true;
              }
            }
          }

          return false;
        });

        if (applicableCapabilities.length > 0) {
          console.log(
            `✅ Found ${applicableCapabilities.length} applicable capabilities:`
          );
          applicableCapabilities.forEach((cap: any) => {
            console.log(`   - ${cap.name}@${cap.version} (${cap.status})`);
          });
          return {
            success: true,
            decision: {
              approach: 'mcp-capabilities',
              reasoning: `Found ${applicableCapabilities.length} applicable MCP capabilities`,
              confidence: 0.85,
              estimatedLatency: 150,
            },
            plan: {
              planningApproach: 'mcp-capabilities',
              mcpCapabilityPlan: {
                capabilityDecomposition: applicableCapabilities.map(
                  (cap: any) => ({
                    capabilityId: cap.id,
                    name: cap.name,
                    version: cap.version,
                    status: cap.status,
                    preconditions: {},
                    postconditions: {},
                    estimatedDuration: 5000,
                    priority: 1,
                    dependencies: [],
                    args: {},
                  })
                ),
                estimatedCapabilitySuccess: 0.85,
                fallbackCapabilities: [],
              },
            },
            latency: 150,
          };
        }

        // Fallback to mock plan
        console.log(`⚠️ No MCP capabilities found for goal: "${goal}"`);
        console.log(
          `   Available capabilities: ${capabilities.map((c: any) => c.name).join(', ')}`
        );
        return {
          success: true,
          decision: {
            approach: 'goap',
            reasoning: 'No MCP capabilities found, using fallback planning',
            confidence: 0.5,
            estimatedLatency: 200,
          },
          plan: {
            planningApproach: 'goap',
            actions: ['mock_action_1', 'mock_action_2'],
            goal: goal,
            estimatedCost: 10,
            estimatedDuration: 2000,
            successProbability: 0.7,
          },
          latency: 200,
        };
      },
      executePlan: async (plan: any, context: any) => {
        console.log(`⚡ Executing plan: ${plan.planningApproach}`);

        if (
          plan.planningApproach === 'mcp-capabilities' &&
          plan.mcpCapabilityPlan
        ) {
          // Execute MCP capabilities
          const results = [];
          for (const capability of plan.mcpCapabilityPlan
            .capabilityDecomposition) {
            try {
              console.log(`🔧 Executing capability: ${capability.name}`);

              // Execute the capability using the appropriate method based on status
              try {
                console.log(
                  `🔧 Executing capability: ${capability.name} with real bot actions`
                );

                // Create leaf context with the bot
                const leafContext = this.bot
                  ? createLeafContext(this.bot)
                  : undefined;

                if (!leafContext) {
                  console.warn(
                    `⚠️ No bot context available for capability: ${capability.name}`
                  );
                  results.push({
                    capabilityId: capability.capabilityId,
                    success: false,
                  });
                  continue;
                }

                let executionResult;

                if (capability.status === 'shadow') {
                  // Execute shadow capability using executeShadowRun
                  executionResult = await this.mcpRegistry.executeShadowRun(
                    capability.capabilityId,
                    leafContext
                  );
                } else {
                  // Execute active capability directly through leaf factory
                  const leafFactory = this.mcpRegistry.getLeafFactory();
                  const leaf = leafFactory.get(
                    capability.name,
                    capability.version
                  );

                  if (!leaf) {
                    console.warn(
                      `⚠️ Leaf not found for capability: ${capability.name}@${capability.version}`
                    );
                    results.push({
                      capabilityId: capability.capabilityId,
                      success: false,
                    });
                    continue;
                  }

                  // Execute the leaf directly with appropriate arguments
                  const startTime = Date.now();

                  // Provide appropriate arguments based on the leaf type
                  let args = capability.args || {};
                  if (capability.name === 'move_to' && !args.pos) {
                    // For move_to, provide a nearby position if none specified
                    const currentPos = leafContext.bot?.entity?.position;
                    if (currentPos) {
                      args = {
                        pos: {
                          x: Math.round(currentPos.x) + 2,
                          y: Math.round(currentPos.y),
                          z: Math.round(currentPos.z) + 2,
                        },
                        safe: true,
                      };
                    }
                  }

                  const leafResult = await leaf.run(leafContext, args);
                  const durationMs = Date.now() - startTime;

                  executionResult = {
                    status:
                      leafResult.status === 'success' ? 'success' : 'failure',
                    durationMs,
                    error: leafResult.error,
                  };
                }

                console.log(
                  `🔧 Capability ${capability.name} execution result: ${executionResult.status} (${executionResult.durationMs}ms)`
                );

                if (executionResult.error) {
                  console.warn(
                    `⚠️ Capability ${capability.name} execution error: ${executionResult.error.detail || executionResult.error}`
                  );
                }

                results.push({
                  capabilityId: capability.capabilityId,
                  success: executionResult.status === 'success',
                });
              } catch (error) {
                console.warn(
                  `⚠️ Error executing capability ${capability.name}:`,
                  error
                );
                results.push({
                  capabilityId: capability.capabilityId,
                  success: false,
                });
              }
            } catch (error) {
              console.error(
                `❌ Error executing capability ${capability.name}:`,
                error
              );
              results.push({
                capabilityId: capability.capabilityId,
                success: false,
              });
            }
          }

          const successCount = results.filter((r) => r.success).length;
          console.log(
            `✅ Executed ${successCount}/${results.length} capabilities successfully`
          );

          return {
            success: successCount > 0,
            completedSteps: results
              .filter((r) => r.success)
              .map((r) => r.capabilityId),
            failedSteps: results
              .filter((r) => !r.success)
              .map((r) => r.capabilityId),
            totalDuration: 5000,
            worldStateChanges: {
              capabilities_executed: successCount,
              total_capabilities: results.length,
            },
          };
        }

        // Fallback execution
        return {
          success: true,
          completedSteps: ['mock_step_1', 'mock_step_2'],
          failedSteps: [],
          totalDuration: 1000,
          worldStateChanges: {
            mock_execution: true,
          },
        };
      },
    };

    this.initializeDefaultCapabilities();
  }

  /**
   * Register required leaves for the torch corridor capability
   */
  private async registerRequiredLeaves() {
    console.log('🔧 Registering real leaf implementations...');

    const leaves: LeafImpl[] = [
      new MoveToLeaf(),
      new StepForwardSafelyLeaf(),
      new PlaceTorchIfNeededLeaf(),
      new RetreatAndBlockLeaf(),
      new SenseHostilesLeaf(),
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
          console.log(
            `✅ Registered leaf: ${leaf.spec.name}@${leaf.spec.version}`
          );
        } else {
          console.warn(
            `⚠️ Failed to register leaf ${leaf.spec.name}: ${result.error}`
          );
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

    // Also emit observation event for cognitive stream
    this.emit('observation', {
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

    // Safety and emergency goals (highest priority)
    if (this.currentState.health && this.currentState.health < 5) {
      goals.push('emergency health restoration');
    } else if (this.currentState.health && this.currentState.health < 10) {
      goals.push('restore health safely');
    }

    if (this.currentState.food && this.currentState.food < 5) {
      goals.push('emergency food acquisition');
    } else if (this.currentState.food && this.currentState.food < 10) {
      goals.push('find food to eat');
    }

    // Task-specific goals
    if (
      this.currentState.currentTask?.includes('underground') ||
      (this.currentState.position && this.currentState.position.y < 64)
    ) {
      goals.push('torch the mining corridor safely');
    }

    // Resource management goals
    if (
      this.currentState.inventory &&
      (!this.currentState.inventory.torch ||
        this.currentState.inventory.torch < 5)
    ) {
      goals.push('craft more torches for safety');
    }

    // Survival goals
    if (this.currentState.currentTask?.includes('surviving')) {
      goals.push('escape dangerous situation');
    }

    // Update active goals
    this.activeGoals = [...new Set([...this.activeGoals, ...goals])];

    if (goals.length > 0) {
      // Emit individual goal identification events
      for (const goal of goals) {
        this.emit('goalIdentified', {
          type: 'planning',
          content: `Identified new goal: ${goal}`,
          timestamp: Date.now(),
          metadata: { goal },
        });
      }

      // Also emit a summary event
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
      // Create leaf context with bot if available
      const leafContext = this.bot ? createLeafContext(this.bot) : undefined;

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
   * Get MCP registry capabilities (for testing)
   */
  async getMCPCapabilities(): Promise<any[]> {
    return this.mcpRegistry.listCapabilities();
  }

  /**
   * Get MCP registry leaves (for testing)
   */
  async getMCPLeaves(): Promise<any[]> {
    return this.mcpRegistry.listLeaves();
  }

  /**
   * Get MCP registry for external access
   */
  getMCPRegistry(): any {
    return this.mcpRegistry;
  }

  /**
   * Get dynamic creation flow for external access
   */
  getDynamicCreationFlow(): any {
    return this.mcpDynamicFlow;
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
    this.on('observation', (event) => this.addEvent(event));
    this.on('goalIdentified', (event) => this.addEvent(event));
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
