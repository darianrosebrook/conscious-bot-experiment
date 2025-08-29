/**
 * Cognitive Stream Integration
 *
 * Connects the cognitive stream to our new MCP capabilities and planning integration,
 * enabling the bot to use dynamic capability creation and sophisticated planning.
 * Now includes LLM-based narrative thought generation for rich internal dialogue.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import { EnhancedRegistry } from './mcp-capabilities/enhanced-registry';
import { DynamicCreationFlow } from './mcp-capabilities/dynamic-creation-flow';
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
  DigBlockLeaf,
  PlaceBlockLeaf,
  ConsumeFoodLeaf,
  GetLightLevelLeaf,
  CraftRecipeLeaf,
} from './leaves/index.js';

// ============================================================================
// LLM Integration for Narrative Thoughts
// ============================================================================

/**
 * Simple LLM interface for generating narrative thoughts
 */
class NarrativeLLMInterface {
  private baseUrl: string;
  private isAvailable: boolean = false;

  constructor(baseUrl: string = 'http://localhost:3003') {
    this.baseUrl = baseUrl;
    this.checkAvailability();
  }

  private async checkAvailability(): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      });
      this.isAvailable = response.ok;
    } catch (error) {
      this.isAvailable = false;
      console.log('⚠️ LLM service not available, using fallback thoughts');
    }
  }

  /**
   * Generate a narrative thought based on current context
   */
  async generateNarrativeThought(
    situation: string,
    context: {
      currentGoals?: string[];
      currentState?: any;
      recentEvents?: string[];
      emotionalState?: string;
    }
  ): Promise<string | null> {
    if (!this.isAvailable) {
      return this.generateFallbackThought(situation, context);
    }

    try {
      const response = await fetch(`${this.baseUrl}/generate-thoughts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          situation,
          context,
          thoughtTypes: ['reflection', 'observation', 'planning'],
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        return this.generateFallbackThought(situation, context);
      }

      const data = (await response.json()) as any;
      const thoughts = data.thoughts || [];

      if (thoughts.length > 0) {
        return thoughts[0].content;
      }

      return this.generateFallbackThought(situation, context);
    } catch (error) {
      console.log('⚠️ LLM thought generation failed, using fallback:', error);
      return this.generateFallbackThought(situation, context);
    }
  }

  /**
   * Generate fallback thoughts when LLM is not available
   */
  private generateFallbackThought(
    situation: string,
    context: {
      currentGoals?: string[];
      currentState?: any;
      recentEvents?: string[];
      emotionalState?: string;
      [key: string]: any; // Allow additional properties
    }
  ): string {
    const currentGoal = context.currentGoals?.[0] || 'surviving';
    const health = context.currentState?.health || 20;
    const food = context.currentState?.food || 20;
    const position = context.currentState?.position;
    const inventory = context.currentState?.inventory || {};

    // Generate contextual thoughts based on situation
    if (situation.includes('state_update')) {
      if (health < 10) {
        return `I notice my health has dropped to ${health}/20. I should be more cautious and look for healing resources.`;
      } else if (food < 10) {
        return `My food level is getting low (${food}/20). I need to find sustenance soon to maintain my energy.`;
      } else {
        return `My current status looks stable - health at ${health}/20, food at ${food}/20. I can continue with my objectives.`;
      }
    }

    if (situation.includes('goal_identification')) {
      const newGoals =
        context.currentGoals?.filter((g) => g !== currentGoal) || [];
      if (newGoals.length > 0) {
        return `I've identified new priorities: ${newGoals.join(', ')}. These align with my survival needs and current situation.`;
      } else {
        return `My current goal of ${currentGoal} remains appropriate for my situation.`;
      }
    }

    if (situation.includes('planning_initiation')) {
      return `I'm starting to plan how to achieve my goal: ${currentGoal}. Let me consider the best approach given my current resources and situation.`;
    }

    if (situation.includes('plan_generation')) {
      const approach = context.approach || 'standard';
      return `I've formulated a plan using ${approach} approach. This should help me progress toward ${currentGoal} effectively.`;
    }

    if (situation.includes('plan_execution')) {
      return `I'm now executing my plan to achieve ${currentGoal}. I'll monitor the results and adjust if needed.`;
    }

    if (situation.includes('execution_completion')) {
      const success = context.success;
      if (success) {
        return `Successfully completed my plan! I've made progress toward ${currentGoal}.`;
      } else {
        return `The plan didn't work as expected. I need to reconsider my approach to ${currentGoal}.`;
      }
    }

    if (situation.includes('planning_failure')) {
      return `My planning for ${currentGoal} encountered difficulties. I'll need to try a different strategy.`;
    }

    if (situation.includes('planning_error')) {
      return `There was an error in my planning process. I need to reassess my approach to ${currentGoal}.`;
    }

    if (situation.includes('execution_error')) {
      return `Something went wrong during execution. I need to be more careful and perhaps try a simpler approach.`;
    }

    // Default reflective thought based on current state
    if (health < 10) {
      return `I'm concerned about my health (${health}/20). I should prioritize finding healing resources.`;
    } else if (food < 10) {
      return `I'm getting hungry (${food}/20). Finding food should be my next priority.`;
    } else if (Object.keys(inventory).length === 0) {
      return `My inventory is empty. I should gather some basic resources to be prepared.`;
    } else {
      return `I'm in a stable condition. My health is ${health}/20, food is ${food}/20, and I'm working toward ${currentGoal}. I can continue with my current objectives.`;
    }
  }
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
  leafContext?: LeafContext;
  worldState?: any;
  constraints?: any[];
  domain?: string;
}

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
// Main Cognitive Stream Integration Class
// ============================================================================

export class CognitiveStreamIntegration extends EventEmitter {
  private mcpRegistry: EnhancedRegistry;
  private mcpDynamicFlow: DynamicCreationFlow;
  private skillRegistry: SkillRegistryInterface;
  private hybridPlanner: any;
  private currentState: BotState = {};
  private activeGoals: string[] = [];
  private recentEvents: string[] = [];
  private bot: any;
  private narrativeLLM: NarrativeLLMInterface;
  private lastThoughtTime: number = 0;
  private thoughtInterval: number = 1000; // 1 second between thoughts for testing
  private cognitiveEvents: CognitiveStreamEvent[] = []; // Store cognitive events

  constructor(bot?: any) {
    super();
    this.bot = bot;
    this.narrativeLLM = new NarrativeLLMInterface();

    // Initialize registries
    this.mcpRegistry = new EnhancedRegistry();
    this.mcpDynamicFlow = new DynamicCreationFlow(this.mcpRegistry);
    this.skillRegistry = {
      getSkill: () => null,
      getAllSkills: () => [],
      registerSkill: () => ({ ok: true }),
    };

    // Initialize hybrid planner with enhanced capabilities
    this.hybridPlanner = {
      plan: async (goal: string, context: any) => {
        console.log(`🎯 Planning for goal: ${goal}`);

        // Get all available capabilities
        const capabilities = await this.mcpRegistry.listCapabilities();

        // Find applicable capabilities for the goal
        const applicableCapabilities = capabilities.filter((cap: any) => {
          const goalLower = goal.toLowerCase();
          const capName = cap.name.toLowerCase();

          // Simple keyword matching
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
                      // Use a more conservative nearby position
                      args = {
                        pos: {
                          x: Math.round(currentPos.x) + 1,
                          y: Math.round(currentPos.y),
                          z: Math.round(currentPos.z) + 1,
                        },
                        goal: 'GoalNear',
                        safe: true,
                        timeout: 10000, // Shorter timeout for testing
                      };
                    } else {
                      console.warn(
                        '⚠️ No current position available for move_to'
                      );
                      results.push({
                        capabilityId: capability.capabilityId,
                        success: false,
                      });
                      continue;
                    }
                  }

                  // Handle other capability-specific arguments
                  if (capability.name === 'dig_block' && !args.pos) {
                    const currentPos = leafContext.bot?.entity?.position;
                    if (currentPos) {
                      // Dig a block in front of the bot
                      args = {
                        pos: {
                          x: Math.round(currentPos.x),
                          y: Math.round(currentPos.y),
                          z: Math.round(currentPos.z) + 1,
                        },
                      };
                    }
                  }

                  if (capability.name === 'place_block' && !args.item) {
                    // Try to place a common block
                    const inventory = leafContext.bot?.inventory?.items();
                    const placeableItems = inventory?.filter(
                      (item: any) =>
                        item.name.includes('stone') ||
                        item.name.includes('dirt') ||
                        item.name.includes('cobblestone') ||
                        item.name.includes('wood')
                    );
                    if (placeableItems && placeableItems.length > 0) {
                      args = {
                        item: placeableItems[0].name,
                        pos: {
                          x: Math.round(leafContext.bot.entity.position.x),
                          y: Math.round(leafContext.bot.entity.position.y),
                          z: Math.round(leafContext.bot.entity.position.z) + 1,
                        },
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

                if (executionResult.status === 'failure') {
                  console.warn(
                    `⚠️ Capability ${capability.name} execution error: ${executionResult.error}`
                  );
                }

                results.push({
                  capabilityId: capability.capabilityId,
                  success: executionResult.status === 'success',
                  duration: executionResult.durationMs,
                  error: executionResult.error,
                });
              } catch (error) {
                console.error(
                  `❌ Error executing capability ${capability.name}:`,
                  error
                );
                results.push({
                  capabilityId: capability.capabilityId,
                  success: false,
                  error: String(error),
                });
              }
            } catch (error) {
              console.error(
                `❌ Error in capability execution loop for ${capability.name}:`,
                error
              );
              results.push({
                capabilityId: capability.capabilityId,
                success: false,
                error: String(error),
              });
            }
          }

          const successfulResults = results.filter((r) => r.success);
          console.log(
            `✅ Executed ${successfulResults.length}/${results.length} capabilities successfully`
          );

          return {
            success: successfulResults.length > 0,
            completedSteps: successfulResults,
            failedSteps: results.filter((r) => !r.success),
            totalDuration: results.reduce(
              (sum, r) => sum + (r.duration || 0),
              0
            ),
          };
        }

        // Handle other planning approaches with proper error handling
        console.warn(
          `⚠️ Unsupported planning approach: ${plan.planningApproach}`
        );
        return {
          success: false,
          completedSteps: [],
          failedSteps: [
            {
              stepId: 'unsupported-approach',
              error: `Planning approach '${plan.planningApproach}' not implemented`,
              duration: 0,
            },
          ],
          totalDuration: 0,
          error: `Planning approach '${plan.planningApproach}' not implemented`,
        };
      },
    };

    this.initializeDefaultCapabilities();
  }

  /**
   * Generate and emit a narrative thought
   */
  private async generateAndEmitThought(
    situation: string,
    context: any = {}
  ): Promise<void> {
    const now = Date.now();

    // Prevent too frequent thoughts
    if (now - this.lastThoughtTime < this.thoughtInterval) {
      return;
    }

    try {
      const thoughtContent = await this.narrativeLLM.generateNarrativeThought(
        situation,
        {
          currentGoals: this.activeGoals,
          currentState: this.currentState,
          recentEvents: this.recentEvents.slice(-3), // Last 3 events
          emotionalState: this.determineEmotionalState(),
        }
      );

      if (thoughtContent) {
        this.lastThoughtTime = now;

        // Create the cognitive event
        const cognitiveEvent: CognitiveStreamEvent = {
          type: 'reflection',
          content: thoughtContent,
          timestamp: now,
          metadata: {
            situation,
            emotionalState: this.determineEmotionalState(),
            confidence: 0.8,
            source: 'narrative-llm',
          },
        };

        // Store the event
        this.cognitiveEvents.push(cognitiveEvent);

        // Keep only last 100 events to prevent memory leaks
        if (this.cognitiveEvents.length > 100) {
          this.cognitiveEvents = this.cognitiveEvents.slice(-100);
        }

        // Emit the narrative thought
        this.emit('reflection', cognitiveEvent);

        // Also emit as observation for dashboard compatibility
        this.emit('observation', cognitiveEvent);
      }
    } catch (error) {
      console.log('⚠️ Failed to generate narrative thought:', error);
    }
  }

  /**
   * Determine emotional state based on current situation
   */
  private determineEmotionalState(): string {
    const health = this.currentState.health || 20;
    const food = this.currentState.food || 20;
    const hasActiveGoals = this.activeGoals.length > 0;

    if (health < 5 || food < 5) {
      return 'anxious';
    } else if (health < 10 || food < 10) {
      return 'concerned';
    } else if (hasActiveGoals) {
      return 'focused';
    } else {
      return 'calm';
    }
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
      new DigBlockLeaf(),
      new PlaceBlockLeaf(),
      new ConsumeFoodLeaf(),
      new GetLightLevelLeaf(),
      new CraftRecipeLeaf(),
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

    // Generate narrative thought about state update
    await this.generateAndEmitThought('state_update', {
      previousState: { ...this.currentState, ...newState },
      newState: this.currentState,
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
      // Generate narrative thought about new goals
      await this.generateAndEmitThought('goal_identification', {
        newGoals: goals,
        totalGoals: this.activeGoals,
      });

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

    // Generate narrative thought about planning
    await this.generateAndEmitThought('planning_initiation', {
      goal,
      currentState: this.currentState,
    });

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

      // Generate narrative thought about plan generation
      await this.generateAndEmitThought('plan_generation', {
        goal,
        approach: planningResult.decision.approach,
        confidence: planningResult.decision.confidence,
        reasoning: planningResult.decision.reasoning,
      });

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
        await this.generateAndEmitThought('planning_failure', {
          goal,
          error: 'planning_failed',
        });

        this.emit('planningFailed', {
          type: 'reflection',
          content: `Planning failed for goal: ${goal}`,
          timestamp: Date.now(),
          metadata: { goal, error: 'planning_failed' },
        });
      }
    } catch (error) {
      console.error('Planning cycle failed:', error);

      await this.generateAndEmitThought('planning_error', {
        goal,
        error: String(error),
      });

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

    // Generate narrative thought about plan execution
    await this.generateAndEmitThought('plan_execution', {
      approach: plan.planningApproach,
      goal: context.goals[0],
    });

    try {
      const executionResult = await this.hybridPlanner.executePlan(
        plan,
        context
      );

      // Generate narrative thought about execution results
      await this.generateAndEmitThought('execution_completion', {
        success: executionResult.success,
        completedSteps: executionResult.completedSteps?.length || 0,
        failedSteps: executionResult.failedSteps?.length || 0,
        totalDuration: executionResult.totalDuration,
      });

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

      await this.generateAndEmitThought('execution_error', {
        error: String(error),
      });

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
    return [...this.cognitiveEvents];
  }

  /**
   * Get current bot state
   */
  getBotState(): BotState {
    return this.currentState;
  }

  /**
   * Get MCP registry for external access
   */
  getMCPRegistry(): EnhancedRegistry {
    return this.mcpRegistry;
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
   * Get dynamic creation flow for external access
   */
  getDynamicCreationFlow(): any {
    return this.mcpDynamicFlow;
  }

  /**
   * Initialize the integration
   */
  async initialize(): Promise<void> {
    console.log('🧠 Initializing Cognitive Stream Integration...');
    console.log('✅ Cognitive Stream Integration initialized');
  }
}
