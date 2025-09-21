/**
 * Enhanced MCP Integration - Advanced MCP Capabilities with LLM Enhancement
 *
 * This enhanced MCP integration provides:
 * - Dynamic capability discovery and registration
 * - LLM-enhanced capability planning
 * - Integration with skill composition system
 * - Adaptive capability selection and execution
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
// Temporary local type definitions until @conscious-bot/core is available
export class EnhancedRegistry {
  constructor() {}
  register(name: string, handler: any): void {
    console.log(`Registered: ${name}`);
  }
  listCapabilities(): any[] {
    return [];
  }
}

export interface ShadowRunResult {
  success: boolean;
  data?: any;
}

export class DynamicCreationFlow {
  constructor() {}
  create(config: any): any {
    return { created: true, config };
  }
}
import { LLMEnhancedSkillComposer } from './llm-enhanced-skill-composer';
import { Goal, GoalType, GoalStatus } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface EnhancedMCPConfig {
  enableDynamicDiscovery: boolean;
  enableLLMEnhancement: boolean;
  enableCapabilityComposition: boolean;
  enableAdaptiveSelection: boolean;
  maxDiscoveryDepth: number;
  capabilityCacheSize: number;
  llmEndpoint?: string;
}

export interface MCPCapability {
  id: string;
  name: string;
  description: string;
  version: string;
  status: 'active' | 'shadow' | 'retired' | 'revoked';
  category: string;
  complexity: 'simple' | 'moderate' | 'complex';
  prerequisites: string[];
  inputs: Record<string, any>;
  outputs: Record<string, any>;
  estimatedDuration: number;
  successRate: number;
  tags: string[];
  metadata: Record<string, any>;
}

export interface CapabilityDiscoveryRequest {
  goal: Goal;
  context: Record<string, any>;
  depth: number;
  maxResults: number;
  filters?: {
    categories?: string[];
    complexity?: string[];
    minSuccessRate?: number;
    maxDuration?: number;
  };
}

export interface CapabilityDiscoveryResult {
  success: boolean;
  capabilities: MCPCapability[];
  reasoning: string;
  confidence: number;
  metadata: {
    totalDiscovered: number;
    filteredCount: number;
    discoveryDepth: number;
    discoveryTime: number;
  };
}

export interface CapabilityCompositionRequest {
  goal: Goal;
  availableCapabilities: MCPCapability[];
  context: Record<string, any>;
  preferences?: {
    maxComplexity?: number;
    preferEfficiency?: boolean;
    allowFallbacks?: boolean;
    style?: 'conservative' | 'balanced' | 'innovative';
  };
}

export interface CapabilityCompositionResult {
  success: boolean;
  composedCapabilities: ComposedCapability[];
  reasoning: string;
  confidence: number;
  executionPlan: ExecutionStep[];
  fallbackOptions: string[];
}

export interface ComposedCapability {
  id: string;
  name: string;
  description: string;
  capabilities: MCPCapability[];
  composition: 'sequence' | 'parallel' | 'selector' | 'fallback';
  estimatedDuration: number;
  successRate: number;
  complexity: 'simple' | 'moderate' | 'complex';
  dependencies: string[];
  metadata: Record<string, any>;
}

export interface ExecutionStep {
  stepId: string;
  capabilityId: string;
  inputs: Record<string, any>;
  expectedOutputs: string[];
  dependencies: string[];
  fallbackStrategy?: string;
  estimatedDuration: number;
}

export interface AdaptiveCapabilitySelector {
  selectCapabilities(
    goal: Goal,
    availableCapabilities: MCPCapability[],
    context: Record<string, any>
  ): MCPCapability[];

  rankCapabilities(
    capabilities: MCPCapability[],
    goal: Goal,
    context: Record<string, any>
  ): MCPCapability[];

  adaptSelection(
    previousSelections: MCPCapability[],
    outcomes: Record<string, any>,
    context: Record<string, any>
  ): void;
}

// ============================================================================
// Enhanced MCP Integration Implementation
// ============================================================================

export class EnhancedMCPIntegration extends EventEmitter {
  private registry: EnhancedRegistry;
  private dynamicFlow: DynamicCreationFlow;
  private llmSkillComposer: LLMEnhancedSkillComposer;
  private config: EnhancedMCPConfig;
  private capabilityCache: Map<string, MCPCapability> = new Map();
  private discoveryHistory: Map<string, CapabilityDiscoveryResult[]> =
    new Map();
  private compositionHistory: Map<string, CapabilityCompositionResult[]> =
    new Map();
  private adaptiveSelector: AdaptiveCapabilitySelector;

  constructor(
    registry: EnhancedRegistry,
    dynamicFlow: DynamicCreationFlow,
    llmSkillComposer: LLMEnhancedSkillComposer,
    config: Partial<EnhancedMCPConfig> = {}
  ) {
    super();
    this.registry = registry;
    this.dynamicFlow = dynamicFlow;
    this.llmSkillComposer = llmSkillComposer;
    this.config = {
      enableDynamicDiscovery: true,
      enableLLMEnhancement: true,
      enableCapabilityComposition: true,
      enableAdaptiveSelection: true,
      maxDiscoveryDepth: 3,
      capabilityCacheSize: 100,
      llmEndpoint: process.env.LLM_ENDPOINT || 'http://localhost:3004',
      ...config,
    };

    this.adaptiveSelector = new DefaultAdaptiveCapabilitySelector();
    this.setupEventHandlers();
  }

  /**
   * Set up event handlers for monitoring and debugging
   */
  private setupEventHandlers(): void {
    this.llmSkillComposer.on('skillComposed', (skill) => {
      this.emit('skillComposed', skill);
      console.log(`🎯 LLM skill composed via MCP integration: ${skill.name}`);
    });

    this.llmSkillComposer.on('goalRefined', (data) => {
      this.emit('goalRefined', data);
      console.log(`✨ Goal refined via MCP integration: ${data.reasoning}`);
    });

    this.llmSkillComposer.on('skillsGenerated', (data) => {
      this.emit('skillsGenerated', data);
      console.log(
        `🎨 Skills generated via MCP integration: ${data.result.generatedSkills.length} skills`
      );
    });
  }

  /**
   * Discover capabilities for a given goal
   */
  async discoverCapabilities(
    request: CapabilityDiscoveryRequest
  ): Promise<CapabilityDiscoveryResult> {
    try {
      console.log(
        `🔍 Discovering capabilities for goal: ${request.goal.description}`
      );

      const startTime = Date.now();
      let discoveredCapabilities: MCPCapability[] = [];

      // 1. Check cache first
      const cachedCapabilities = this.getCachedCapabilities(
        request.goal,
        request.filters
      );
      if (cachedCapabilities.length > 0) {
        console.log(
          `📦 Found ${cachedCapabilities.length} cached capabilities`
        );
        discoveredCapabilities.push(...cachedCapabilities);
      }

      // 2. Dynamic discovery if enabled
      if (
        this.config.enableDynamicDiscovery &&
        request.depth < this.config.maxDiscoveryDepth
      ) {
        const dynamicCapabilities = await this.performDynamicDiscovery(request);
        discoveredCapabilities.push(...dynamicCapabilities);
        console.log(
          `🚀 Discovered ${dynamicCapabilities.length} dynamic capabilities`
        );
      }

      // 3. Registry-based discovery
      const registryCapabilities = await this.discoverFromRegistry(request);
      discoveredCapabilities.push(...registryCapabilities);
      console.log(
        `📚 Found ${registryCapabilities.length} registry capabilities`
      );

      // 4. Filter and rank capabilities
      const filteredCapabilities = this.filterCapabilities(
        discoveredCapabilities,
        request.filters
      );
      const rankedCapabilities = this.adaptiveSelector.rankCapabilities(
        filteredCapabilities,
        request.goal,
        request.context
      );

      // 5. Limit results
      const finalCapabilities = rankedCapabilities.slice(0, request.maxResults);

      // 6. Cache discovered capabilities
      this.cacheCapabilities(finalCapabilities);

      const discoveryTime = Date.now() - startTime;
      const result: CapabilityDiscoveryResult = {
        success: true,
        capabilities: finalCapabilities,
        reasoning: `Discovered ${finalCapabilities.length} capabilities in ${discoveryTime}ms`,
        confidence: this.calculateDiscoveryConfidence(
          finalCapabilities,
          request
        ),
        metadata: {
          totalDiscovered: discoveredCapabilities.length,
          filteredCount: finalCapabilities.length,
          discoveryDepth: request.depth,
          discoveryTime,
        },
      };

      // Store in history
      this.storeDiscoveryResult(request.goal.id, result);

      this.emit('capabilitiesDiscovered', { request, result });
      return result;
    } catch (error) {
      console.error('Error in capability discovery:', error);
      return {
        success: false,
        capabilities: [],
        reasoning: `Discovery failed: ${error}`,
        confidence: 0,
        metadata: {
          totalDiscovered: 0,
          filteredCount: 0,
          discoveryDepth: request.depth,
          discoveryTime: 0,
        },
      };
    }
  }

  /**
   * Compose capabilities for a goal
   */
  async composeCapabilities(
    request: CapabilityCompositionRequest
  ): Promise<CapabilityCompositionResult> {
    try {
      console.log(
        `🔧 Composing capabilities for goal: ${request.goal.description}`
      );

      // 1. Select appropriate capabilities
      const selectedCapabilities = this.adaptiveSelector.selectCapabilities(
        request.goal,
        request.availableCapabilities,
        request.context
      );

      if (selectedCapabilities.length === 0) {
        return {
          success: false,
          composedCapabilities: [],
          reasoning: 'No suitable capabilities found',
          confidence: 0,
          executionPlan: [],
          fallbackOptions: [],
        };
      }

      // 2. Generate composition strategies
      const compositionStrategies = this.generateCompositionStrategies(
        selectedCapabilities,
        request.goal,
        request.preferences
      );

      // 3. Evaluate and select best strategy
      const bestStrategy = this.evaluateCompositionStrategies(
        compositionStrategies,
        request.goal,
        request.context
      );

      // 4. Create execution plan
      const executionPlan = this.createExecutionPlan(
        bestStrategy,
        request.context
      );

      // 5. Generate fallback options
      const fallbackOptions = this.generateFallbackOptions(
        selectedCapabilities,
        request.goal
      );

      const result: CapabilityCompositionResult = {
        success: true,
        composedCapabilities: [bestStrategy],
        reasoning: `Successfully composed ${bestStrategy.capabilities.length} capabilities`,
        confidence: this.calculateCompositionConfidence(
          bestStrategy,
          request.context
        ),
        executionPlan,
        fallbackOptions,
      };

      // Store in history
      this.storeCompositionResult(request.goal.id, result);

      this.emit('capabilitiesComposed', { request, result });
      return result;
    } catch (error) {
      console.error('Error in capability composition:', error);
      return {
        success: false,
        composedCapabilities: [],
        reasoning: `Composition failed: ${error}`,
        confidence: 0,
        executionPlan: [],
        fallbackOptions: [],
      };
    }
  }

  /**
   * Execute a composed capability
   */
  async executeComposedCapability(
    composedCapability: ComposedCapability,
    context: Record<string, any>
  ): Promise<{
    success: boolean;
    results: Record<string, any>;
    duration: number;
    errors: string[];
  }> {
    try {
      console.log(
        `▶️ Executing composed capability: ${composedCapability.name}`
      );

      const startTime = Date.now();
      const results: Record<string, any> = {};
      const errors: string[] = [];

      // Execute capabilities based on composition type
      switch (composedCapability.composition) {
        case 'sequence':
          await this.executeSequentialCapabilities(
            composedCapability,
            context,
            results,
            errors
          );
          break;
        case 'parallel':
          await this.executeParallelCapabilities(
            composedCapability,
            context,
            results,
            errors
          );
          break;
        case 'selector':
          await this.executeSelectorCapabilities(
            composedCapability,
            context,
            results,
            errors
          );
          break;
        case 'fallback':
          await this.executeFallbackCapabilities(
            composedCapability,
            context,
            results,
            errors
          );
          break;
        default:
          throw new Error(
            `Unknown composition type: ${composedCapability.composition}`
          );
      }

      const duration = Date.now() - startTime;
      const success = errors.length === 0;

      console.log(
        `✅ Execution completed: ${success ? 'SUCCESS' : 'FAILED'} in ${duration}ms`
      );

      this.emit('capabilityExecuted', {
        composedCapability,
        success,
        results,
        duration,
        errors,
      });

      return { success, results, duration, errors };
    } catch (error) {
      console.error('Error executing composed capability:', error);
      return {
        success: false,
        results: {},
        duration: 0,
        errors: [`Execution error: ${error}`],
      };
    }
  }

  /**
   * Integrate with LLM-enhanced skill composer
   */
  async integrateWithLLMComposer(
    goal: Goal,
    context: Record<string, any>
  ): Promise<{
    success: boolean;
    mcpCapabilities?: MCPCapability[];
    llmSkills?: any;
    integrationStrategy: string;
  }> {
    try {
      console.log(
        `🧠 Integrating MCP with LLM-enhanced skill composer for goal: ${goal.description}`
      );

      // 1. Discover MCP capabilities
      const discoveryResult = await this.discoverCapabilities({
        goal,
        context,
        depth: 0,
        maxResults: 10,
      });

      // 2. Attempt LLM-enhanced skill composition
      const llmContext = this.convertToLLMContext(context);
      const llmResult = await this.llmSkillComposer.composeLeavesWithLLM(
        goal,
        llmContext,
        {
          enableRefinement: true,
          enableGeneration: true,
          maxIterations: 3,
        }
      );

      // 3. Determine integration strategy
      let integrationStrategy = 'fallback';
      if (
        discoveryResult.success &&
        discoveryResult.capabilities.length > 0 &&
        llmResult
      ) {
        integrationStrategy = 'hybrid';
      } else if (
        discoveryResult.success &&
        discoveryResult.capabilities.length > 0
      ) {
        integrationStrategy = 'mcp_only';
      } else if (llmResult) {
        integrationStrategy = 'llm_only';
      }

      const result = {
        success: discoveryResult.success || !!llmResult,
        mcpCapabilities: discoveryResult.success
          ? discoveryResult.capabilities
          : undefined,
        llmSkills: llmResult || undefined,
        integrationStrategy,
      };

      console.log(`🔗 Integration strategy: ${integrationStrategy}`);
      this.emit('integrationCompleted', { goal, result });

      return result;
    } catch (error) {
      console.error('Error in LLM integration:', error);
      return {
        success: false,
        integrationStrategy: 'error',
      };
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Perform dynamic capability discovery
   */
  private async performDynamicDiscovery(
    request: CapabilityDiscoveryRequest
  ): Promise<MCPCapability[]> {
    try {
      // Use dynamic flow to discover new capabilities
      // Note: DynamicCreationFlow doesn't have discoverCapabilities method
      // Using empty array as fallback
      const discoveryResult: any[] = [];

      // Convert to MCP capability format
      return discoveryResult.map((cap: any) => ({
        id: cap.id || 'unknown',
        name: cap.name || 'Unknown Capability',
        description: cap.description || 'No description available',
        version: cap.version || '1.0.0',
        status: 'active',
        category: cap.category || 'dynamic',
        complexity: this.mapComplexity(cap.complexity || 5),
        prerequisites: cap.prerequisites || [],
        inputs: cap.inputs || {},
        outputs: cap.outputs || {},
        estimatedDuration: cap.estimatedDuration || 5000,
        successRate: cap.successRate || 0.8,
        tags: cap.tags || [],
        metadata: cap.metadata || {},
      }));
    } catch (error) {
      console.error('Error in dynamic discovery:', error);
      return [];
    }
  }

  /**
   * Discover capabilities from registry
   */
  private async discoverFromRegistry(
    request: CapabilityDiscoveryRequest
  ): Promise<MCPCapability[]> {
    try {
      // Query the enhanced registry for capabilities
      const registryCapabilities = await this.registry.listCapabilities();

      // Convert to MCP capability format
      return registryCapabilities.map((cap: any) => ({
        id: cap.id || 'unknown',
        name: cap.name || 'Unknown Capability',
        description: cap.description || 'No description available',
        version: cap.version || '1.0.0',
        status: cap.status || 'active',
        category: cap.category || 'registry',
        complexity: this.mapComplexity(cap.complexity || 5),
        prerequisites: cap.prerequisites || [],
        inputs: cap.inputs || {},
        outputs: cap.outputs || {},
        estimatedDuration: cap.estimatedDuration || 5000,
        successRate: cap.successRate || 0.8,
        tags: cap.tags || [],
        metadata: cap.metadata || {},
      }));
    } catch (error) {
      console.error('Error in registry discovery:', error);
      return [];
    }
  }

  /**
   * Filter capabilities based on criteria
   */
  private filterCapabilities(
    capabilities: MCPCapability[],
    filters?: CapabilityDiscoveryRequest['filters']
  ): MCPCapability[] {
    if (!filters) return capabilities;

    return capabilities.filter((cap) => {
      if (filters.categories && !filters.categories.includes(cap.category))
        return false;
      if (filters.complexity && !filters.complexity.includes(cap.complexity))
        return false;
      if (filters.minSuccessRate && cap.successRate < filters.minSuccessRate)
        return false;
      if (filters.maxDuration && cap.estimatedDuration > filters.maxDuration)
        return false;
      return true;
    });
  }

  /**
   * Generate composition strategies
   */
  private generateCompositionStrategies(
    capabilities: MCPCapability[],
    goal: Goal,
    preferences?: CapabilityCompositionRequest['preferences']
  ): ComposedCapability[] {
    const strategies: ComposedCapability[] = [];

    // 1. Sequential composition
    if (capabilities.length > 1) {
      strategies.push({
        id: `seq_${Date.now()}`,
        name: `Sequential: ${capabilities.map((c) => c.name).join(' → ')}`,
        description: `Execute capabilities in sequence to achieve: ${goal.description}`,
        capabilities,
        composition: 'sequence',
        estimatedDuration: capabilities.reduce(
          (sum, cap) => sum + cap.estimatedDuration,
          0
        ),
        successRate: capabilities.reduce(
          (prod, cap) => prod * cap.successRate,
          1
        ),
        complexity: this.calculateComposedComplexity(capabilities),
        dependencies: [],
        metadata: { strategy: 'sequential' },
      });
    }

    // 2. Parallel composition
    if (capabilities.length > 1) {
      strategies.push({
        id: `par_${Date.now()}`,
        name: `Parallel: ${capabilities.map((c) => c.name).join(' || ')}`,
        description: `Execute capabilities in parallel to achieve: ${goal.description}`,
        capabilities,
        composition: 'parallel',
        estimatedDuration: Math.max(
          ...capabilities.map((c) => c.estimatedDuration)
        ),
        successRate: capabilities.reduce(
          (prod, cap) => prod * cap.successRate,
          1
        ),
        complexity: this.calculateComposedComplexity(capabilities),
        dependencies: [],
        metadata: { strategy: 'parallel' },
      });
    }

    // 3. Selector composition
    if (capabilities.length > 1) {
      strategies.push({
        id: `sel_${Date.now()}`,
        name: `Selector: ${capabilities.map((c) => c.name).join(' | ')}`,
        description: `Try capabilities in order until one succeeds: ${goal.description}`,
        capabilities,
        composition: 'selector',
        estimatedDuration:
          capabilities.reduce((sum, cap) => sum + cap.estimatedDuration, 0) /
          capabilities.length,
        successRate:
          1 -
          capabilities.reduce((prod, cap) => prod * (1 - cap.successRate), 1),
        complexity: this.calculateComposedComplexity(capabilities),
        dependencies: [],
        metadata: { strategy: 'selector' },
      });
    }

    return strategies;
  }

  /**
   * Evaluate composition strategies
   */
  private evaluateCompositionStrategies(
    strategies: ComposedCapability[],
    goal: Goal,
    context: Record<string, any>
  ): ComposedCapability {
    // Simple scoring based on multiple factors
    const scoredStrategies = strategies.map((strategy) => {
      let score = 0;

      // Prefer higher success rate
      score += strategy.successRate * 10;

      // Prefer lower duration for urgent goals
      if (goal.urgency > 7) {
        score += (10000 - strategy.estimatedDuration) / 1000;
      } else {
        score += (10000 - strategy.estimatedDuration) / 2000;
      }

      // Prefer appropriate complexity
      if (goal.priority <= 3 && strategy.complexity === 'simple') score += 2;
      if (goal.priority > 7 && strategy.complexity === 'complex') score += 1;

      return { strategy, score };
    });

    // Return the strategy with the highest score
    scoredStrategies.sort((a, b) => b.score - a.score);
    return scoredStrategies[0].strategy;
  }

  /**
   * Create execution plan for a composed capability
   */
  private createExecutionPlan(
    composedCapability: ComposedCapability,
    context: Record<string, any>
  ): ExecutionStep[] {
    const executionPlan: ExecutionStep[] = [];

    switch (composedCapability.composition) {
      case 'sequence':
        for (let i = 0; i < composedCapability.capabilities.length; i++) {
          const capability = composedCapability.capabilities[i];
          executionPlan.push({
            stepId: `step_${capability.id}`,
            capabilityId: capability.id,
            inputs: this.determineInputs(
              capability,
              context,
              i > 0 ? executionPlan[i - 1] : undefined
            ),
            expectedOutputs: Object.keys(capability.outputs),
            dependencies:
              i > 0
                ? [`step_${composedCapability.capabilities[i - 1].id}`]
                : [],
            estimatedDuration: capability.estimatedDuration,
          });
        }
        break;

      case 'parallel':
        for (const capability of composedCapability.capabilities) {
          executionPlan.push({
            stepId: `step_${capability.id}`,
            capabilityId: capability.id,
            inputs: this.determineInputs(capability, context),
            expectedOutputs: Object.keys(capability.outputs),
            dependencies: [],
            estimatedDuration: capability.estimatedDuration,
          });
        }
        break;

      case 'selector':
        for (const capability of composedCapability.capabilities) {
          executionPlan.push({
            stepId: `step_${capability.id}`,
            capabilityId: capability.id,
            inputs: this.determineInputs(capability, context),
            expectedOutputs: Object.keys(capability.outputs),
            dependencies: [],
            fallbackStrategy: 'try_next',
            estimatedDuration: capability.estimatedDuration,
          });
        }
        break;

      case 'fallback':
        for (const capability of composedCapability.capabilities) {
          executionPlan.push({
            stepId: `step_${capability.id}`,
            capabilityId: capability.id,
            inputs: this.determineInputs(capability, context),
            expectedOutputs: Object.keys(capability.outputs),
            dependencies: [],
            fallbackStrategy: 'try_next',
            estimatedDuration: capability.estimatedDuration,
          });
        }
        break;
    }

    return executionPlan;
  }

  /**
   * Execute capabilities sequentially
   */
  private async executeSequentialCapabilities(
    composedCapability: ComposedCapability,
    context: Record<string, any>,
    results: Record<string, any>,
    errors: string[]
  ): Promise<void> {
    for (const capability of composedCapability.capabilities) {
      try {
        console.log(`▶️ Executing sequential capability: ${capability.name}`);

        // Execute capability (mock implementation)
        const result = await this.executeCapability(capability, context);
        results[capability.id] = result;

        // Update context with outputs
        Object.assign(context, result.outputs);
      } catch (error) {
        const errorMsg = `Failed to execute ${capability.name}: ${error}`;
        console.error(errorMsg);
        errors.push(errorMsg);
        break; // Stop sequence on error
      }
    }
  }

  /**
   * Execute capabilities in parallel
   */
  private async executeParallelCapabilities(
    composedCapability: ComposedCapability,
    context: Record<string, any>,
    results: Record<string, any>,
    errors: string[]
  ): Promise<void> {
    const executionPromises = composedCapability.capabilities.map(
      async (capability) => {
        try {
          console.log(`▶️ Executing parallel capability: ${capability.name}`);

          const result = await this.executeCapability(capability, context);
          results[capability.id] = result;

          return result;
        } catch (error) {
          const errorMsg = `Failed to execute ${capability.name}: ${error}`;
          console.error(errorMsg);
          errors.push(errorMsg);
          return null;
        }
      }
    );

    await Promise.all(executionPromises);
  }

  /**
   * Execute capabilities with selector strategy
   */
  private async executeSelectorCapabilities(
    composedCapability: ComposedCapability,
    context: Record<string, any>,
    results: Record<string, any>,
    errors: string[]
  ): Promise<void> {
    for (const capability of composedCapability.capabilities) {
      try {
        console.log(`▶️ Trying selector capability: ${capability.name}`);

        const result = await this.executeCapability(capability, context);
        results[capability.id] = result;

        // If successful, stop trying
        if (result.success) {
          console.log(`✅ Selector capability succeeded: ${capability.name}`);
          break;
        }
      } catch (error) {
        const errorMsg = `Failed to execute ${capability.name}: ${error}`;
        console.error(errorMsg);
        errors.push(errorMsg);
        // Continue to next capability
      }
    }
  }

  /**
   * Execute capabilities with fallback strategy
   */
  private async executeFallbackCapabilities(
    composedCapability: ComposedCapability,
    context: Record<string, any>,
    results: Record<string, any>,
    errors: string[]
  ): Promise<void> {
    // Similar to selector but with different logic
    await this.executeSelectorCapabilities(
      composedCapability,
      context,
      results,
      errors
    );
  }

  /**
   * Execute a single capability
   */
  private async executeCapability(
    capability: MCPCapability,
    context: Record<string, any>
  ): Promise<{
    success: boolean;
    outputs: Record<string, any>;
    duration: number;
    error?: string;
  }> {
    // Mock capability execution
    const startTime = Date.now();

    // Simulate execution time
    await new Promise((resolve) =>
      setTimeout(resolve, capability.estimatedDuration)
    );

    const duration = Date.now() - startTime;
    const success = Math.random() < capability.successRate;

    if (success) {
      return {
        success: true,
        outputs: capability.outputs,
        duration,
      };
    } else {
      return {
        success: false,
        outputs: {},
        duration,
        error: 'Capability execution failed',
      };
    }
  }

  /**
   * Generate fallback options
   */
  private generateFallbackOptions(
    capabilities: MCPCapability[],
    goal: Goal
  ): string[] {
    return capabilities
      .filter((cap) => cap.successRate > 0.5)
      .map((cap) => cap.name)
      .slice(0, 3);
  }

  /**
   * Convert context to LLM context format
   */
  private convertToLLMContext(context: Record<string, any>): any {
    return {
      worldState: context.worldState || {},
      availableResources: context.availableResources || {},
      timeConstraints: context.timeConstraints || {
        urgency: 'medium',
        maxPlanningTime: 5000,
      },
      botCapabilities: context.botCapabilities || {
        availableLeaves: [],
        currentHealth: 100,
        currentPosition: [0, 0, 0],
      },
    };
  }

  /**
   * Map complexity from numeric to categorical
   */
  private mapComplexity(complexity: number): 'simple' | 'moderate' | 'complex' {
    if (complexity <= 3) return 'simple';
    if (complexity <= 6) return 'moderate';
    return 'complex';
  }

  /**
   * Calculate composed complexity
   */
  private calculateComposedComplexity(
    capabilities: MCPCapability[]
  ): 'simple' | 'moderate' | 'complex' {
    const avgComplexity =
      capabilities.reduce((sum, cap) => {
        const numComplexity =
          cap.complexity === 'simple'
            ? 2
            : cap.complexity === 'moderate'
              ? 5
              : 8;
        return sum + numComplexity;
      }, 0) / capabilities.length;

    return this.mapComplexity(avgComplexity);
  }

  /**
   * Determine inputs for a capability
   */
  private determineInputs(
    capability: MCPCapability,
    context: Record<string, any>,
    previousStep?: ExecutionStep
  ): Record<string, any> {
    const inputs: Record<string, any> = {};

    // Add context-based inputs
    for (const [inputName, inputType] of Object.entries(capability.inputs)) {
      if (context[inputName] !== undefined) {
        inputs[inputName] = context[inputName];
      }
    }

    // Add outputs from previous step if available
    if (previousStep) {
      for (const output of previousStep.expectedOutputs) {
        if (capability.inputs[output] !== undefined) {
          inputs[output] = `output_from_${previousStep.capabilityId}`;
        }
      }
    }

    return inputs;
  }

  /**
   * Calculate discovery confidence
   */
  private calculateDiscoveryConfidence(
    capabilities: MCPCapability[],
    request: CapabilityDiscoveryRequest
  ): number {
    if (capabilities.length === 0) return 0;

    const avgSuccessRate =
      capabilities.reduce((sum, cap) => sum + cap.successRate, 0) /
      capabilities.length;
    const complexityMatch = capabilities.some(
      (cap) => cap.complexity === 'simple'
    )
      ? 0.2
      : 0;

    return Math.min(0.9, avgSuccessRate + complexityMatch);
  }

  /**
   * Calculate composition confidence
   */
  private calculateCompositionConfidence(
    composedCapability: ComposedCapability,
    context: Record<string, any>
  ): number {
    return composedCapability.successRate * 0.8 + 0.1;
  }

  /**
   * Get cached capabilities
   */
  private getCachedCapabilities(
    goal: Goal,
    filters?: CapabilityDiscoveryRequest['filters']
  ): MCPCapability[] {
    const cached = Array.from(this.capabilityCache.values());
    return this.filterCapabilities(cached, filters);
  }

  /**
   * Cache capabilities
   */
  private cacheCapabilities(capabilities: MCPCapability[]): void {
    for (const capability of capabilities) {
      this.capabilityCache.set(capability.id, capability);
    }

    // Maintain cache size
    if (this.capabilityCache.size > this.config.capabilityCacheSize) {
      const entries = Array.from(this.capabilityCache.entries());
      const toRemove = entries.slice(
        0,
        entries.length - this.config.capabilityCacheSize
      );
      for (const [key] of toRemove) {
        this.capabilityCache.delete(key);
      }
    }
  }

  /**
   * Store discovery result in history
   */
  private storeDiscoveryResult(
    goalId: string,
    result: CapabilityDiscoveryResult
  ): void {
    if (!this.discoveryHistory.has(goalId)) {
      this.discoveryHistory.set(goalId, []);
    }
    this.discoveryHistory.get(goalId)!.push(result);
  }

  /**
   * Store composition result in history
   */
  private storeCompositionResult(
    goalId: string,
    result: CapabilityCompositionResult
  ): void {
    if (!this.compositionHistory.has(goalId)) {
      this.compositionHistory.set(goalId, []);
    }
    this.compositionHistory.get(goalId)!.push(result);
  }

  /**
   * Get discovery history for a goal
   */
  getDiscoveryHistory(goalId: string): CapabilityDiscoveryResult[] {
    return this.discoveryHistory.get(goalId) || [];
  }

  /**
   * Get composition history for a goal
   */
  getCompositionHistory(goalId: string): CapabilityCompositionResult[] {
    return this.compositionHistory.get(goalId) || [];
  }

  /**
   * Clear all history and cache
   */
  clearHistory(): void {
    this.discoveryHistory.clear();
    this.compositionHistory.clear();
    this.capabilityCache.clear();
    this.emit('historyCleared');
  }
}

// ============================================================================
// Default Adaptive Capability Selector
// ============================================================================

class DefaultAdaptiveCapabilitySelector implements AdaptiveCapabilitySelector {
  private selectionHistory: Map<string, MCPCapability[]> = new Map();
  private outcomeHistory: Map<string, Record<string, any>[]> = new Map();

  selectCapabilities(
    goal: Goal,
    availableCapabilities: MCPCapability[],
    context: Record<string, any>
  ): MCPCapability[] {
    // Simple selection based on goal type and capability category
    const relevantCapabilities = availableCapabilities.filter((cap) => {
      // Check if capability category matches goal type
      const categoryMatch = this.matchesGoalType(cap.category, goal.type);

      // Check if capability complexity matches goal priority
      const complexityMatch = this.matchesGoalPriority(
        cap.complexity,
        goal.priority
      );

      return categoryMatch && complexityMatch;
    });

    // Return top 3 most relevant capabilities
    return this.rankCapabilities(relevantCapabilities, goal, context).slice(
      0,
      3
    );
  }

  rankCapabilities(
    capabilities: MCPCapability[],
    goal: Goal,
    context: Record<string, any>
  ): MCPCapability[] {
    return capabilities.sort((a, b) => {
      let scoreA = 0;
      let scoreB = 0;

      // Success rate (higher is better)
      scoreA += a.successRate * 10;
      scoreB += b.successRate * 10;

      // Duration (lower is better for urgent goals)
      if (goal.urgency > 7) {
        scoreA += (10000 - a.estimatedDuration) / 1000;
        scoreB += (10000 - b.estimatedDuration) / 1000;
      }

      // Complexity match with priority
      if (goal.priority <= 3 && a.complexity === 'simple') scoreA += 2;
      if (goal.priority <= 3 && b.complexity === 'simple') scoreB += 2;
      if (goal.priority > 7 && a.complexity === 'complex') scoreA += 1;
      if (goal.priority > 7 && b.complexity === 'complex') scoreB += 1;

      return scoreB - scoreA;
    });
  }

  adaptSelection(
    previousSelections: MCPCapability[],
    outcomes: Record<string, any>,
    context: Record<string, any>
  ): void {
    // Store selection history for learning
    const selectionKey = `${context.goalId || 'unknown'}_${Date.now()}`;
    this.selectionHistory.set(selectionKey, previousSelections);
    this.outcomeHistory.set(selectionKey, [outcomes]);

    // Simple adaptation: prefer capabilities that succeeded
    // In a more sophisticated implementation, this would use machine learning
    console.log(`📊 Stored selection history for adaptation: ${selectionKey}`);
  }

  private matchesGoalType(category: string, goalType: GoalType): boolean {
    const categoryMappings: Record<string, GoalType[]> = {
      movement: [GoalType.EXPLORATION, GoalType.REACH_LOCATION],
      safety: [GoalType.SAFETY, GoalType.SURVIVAL, GoalType.SURVIVE_THREAT],
      resource: [GoalType.ACQUIRE_ITEM, GoalType.RESOURCE_GATHERING],
      crafting: [GoalType.CREATIVITY, GoalType.ACHIEVEMENT],
      social: [GoalType.SOCIAL],
      exploration: [GoalType.EXPLORATION, GoalType.CURIOSITY],
    };

    for (const [cat, types] of Object.entries(categoryMappings)) {
      if (category.toLowerCase().includes(cat) && types.includes(goalType)) {
        return true;
      }
    }

    return false;
  }

  private matchesGoalPriority(complexity: string, priority: number): boolean {
    if (priority <= 3 && complexity === 'simple') return true;
    if (priority > 7 && complexity === 'complex') return true;
    if (priority > 3 && priority <= 7 && complexity === 'moderate') return true;
    return false;
  }
}
