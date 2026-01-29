/**
 * LLM Integration System - Real Ollama integration with HRM principles
 *
 * Implements real LLM integration with Ollama, incorporating HRM's dual-system
 * architecture for hierarchical reasoning and option proposal generation.
 *
 * @author @darianrosebrook
 */

import { LeafContext, ExecError } from './leaf-contracts';

// ============================================================================
// LLM Configuration and Types
// ============================================================================

/**
 * Available LLM models for different reasoning tasks
 */
export interface LLMModel {
  name: string;
  size: string;
  memoryGB: number;
  latency: string;
  capabilities: LLMCapability[];
  recommendedFor: string[];
}

/**
 * LLM capabilities for task routing
 */
export type LLMCapability =
  | 'language_understanding'
  | 'logical_reasoning'
  | 'creative_generation'
  | 'code_generation'
  | 'mathematical_reasoning'
  | 'spatial_reasoning'
  | 'planning_optimization'
  | 'narrative_construction';

/**
 * HRM-inspired dual-system reasoning configuration
 */
export interface HRMReasoningConfig {
  // High-level abstract planning (System 2)
  abstractPlanner: {
    model: string;
    maxTokens: number;
    temperature: number;
    purpose: string;
    latency: string;
  };

  // Low-level detailed execution (System 1)
  detailedExecutor: {
    model: string;
    maxTokens: number;
    temperature: number;
    purpose: string;
    latency: string;
  };

  // Iterative refinement loop
  refinementLoop: {
    maxIterations: number;
    haltCondition: 'confidence_threshold' | 'time_budget' | 'solution_quality';
    confidenceThreshold: number;
    timeBudgetMs: number;
  };
}

/**
 * Ollama API response structure
 */
export interface OllamaResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_duration?: number;
  eval_duration?: number;
}

/**
 * LLM reasoning result with HRM structure
 */
export interface LLMReasoningResult {
  abstractPlan?: string;
  detailedPlan?: string;
  confidence: number;
  reasoning: string[];
  iterations: number;
  durationMs: number;
  modelUsed: string;
}

// ============================================================================
// Available Models Configuration
// ============================================================================

/**
 * Pre-configured models for different reasoning tasks
 */
export const AVAILABLE_MODELS: LLMModel[] = [
  {
    name: 'deepseek-r1:14b',
    size: '14B',
    memoryGB: 9.0,
    latency: '200-500ms',
    capabilities: [
      'logical_reasoning',
      'planning_optimization',
      'code_generation',
    ],
    recommendedFor: [
      'complex_planning',
      'algorithmic_reasoning',
      'optimization_tasks',
    ],
  },
  {
    name: 'deepseek-r1:8b',
    size: '8B',
    memoryGB: 5.2,
    latency: '100-300ms',
    capabilities: ['logical_reasoning', 'planning_optimization'],
    recommendedFor: ['moderate_planning', 'tactical_reasoning'],
  },
  {
    name: 'qwen3:14b',
    size: '14B',
    memoryGB: 9.3,
    latency: '150-400ms',
    capabilities: [
      'language_understanding',
      'creative_generation',
      'narrative_construction',
    ],
    recommendedFor: [
      'narrative_tasks',
      'creative_problem_solving',
      'social_interaction',
    ],
  },
  {
    name: 'qwen3:8b',
    size: '8B',
    memoryGB: 5.2,
    latency: '80-250ms',
    capabilities: ['language_understanding', 'creative_generation'],
    recommendedFor: ['general_reasoning', 'conversation'],
  },
  {
    name: 'llama3.3:70b',
    size: '70B',
    memoryGB: 42,
    latency: '500-1500ms',
    capabilities: [
      'language_understanding',
      'logical_reasoning',
      'creative_generation',
      'mathematical_reasoning',
    ],
    recommendedFor: [
      'complex_reasoning',
      'research_tasks',
      'high_accuracy_required',
    ],
  },
];

/**
 * Default HRM reasoning configuration
 */
export const DEFAULT_HRM_CONFIG: HRMReasoningConfig = {
  abstractPlanner: {
    model: 'qwen3:4b', // Fastest for abstract planning based on benchmarks (2.6s avg)
    maxTokens: 1024, // Reduced for faster response
    temperature: 0.1,
    purpose: 'High-level strategic planning and goal decomposition',
    latency: '100-300ms',
  },
  detailedExecutor: {
    model: 'qwen3:4b', // Fastest for detailed execution based on benchmarks (2.6s avg)
    maxTokens: 1024,
    temperature: 0.3,
    purpose: 'Detailed tactical execution and immediate responses',
    latency: '100-300ms',
  },
  refinementLoop: {
    maxIterations: 2, // Reduced for faster response
    haltCondition: 'confidence_threshold',
    confidenceThreshold: 0.8,
    timeBudgetMs: 5000, // Increased to 5s for better quality
  },
};

// ============================================================================
// Ollama Client
// ============================================================================

/**
 * Ollama API client for model interaction
 */
export class OllamaClient {
  private baseUrl: string;
  private timeout: number;

  constructor(
    baseUrl: string = 'http://localhost:5002',
    timeout: number = 10000
  ) {
    this.baseUrl = baseUrl;
    this.timeout = timeout;
  }

  /**
   * Generate response from Ollama model
   */
  async generate(
    model: string,
    prompt: string,
    options: {
      temperature?: number;
      maxTokens?: number;
      systemPrompt?: string;
      timeout?: number;
    } = {}
  ): Promise<OllamaResponse> {
    const {
      temperature = 0.7,
      maxTokens = 2048,
      systemPrompt,
      timeout = this.timeout,
    } = options;

    const requestBody = {
      model,
      prompt,
      system: systemPrompt,
      options: {
        temperature,
        num_predict: maxTokens,
      },
      stream: false,
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(
          `Ollama API error: ${response.status} ${response.statusText}`
        );
      }

      return (await response.json()) as OllamaResponse;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Ollama request timed out after ${timeout}ms`);
      }
      throw error;
    }
  }

  /**
   * List available models
   */
  async listModels(): Promise<{
    models: Array<{ name: string; size: number; modified_at: string }>;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) {
        throw new Error(
          `Ollama API error: ${response.status} ${response.statusText}`
        );
      }
      return (await response.json()) as {
        models: Array<{ name: string; size: number; modified_at: string }>;
      };
    } catch (error) {
      throw new Error(`Failed to list models: ${error}`);
    }
  }

  /**
   * Check if model is available
   */
  async isModelAvailable(modelName: string): Promise<boolean> {
    try {
      const models = await this.listModels();
      return models.models.some((model) => model.name === modelName);
    } catch (error) {
      console.warn(`Failed to check model availability: ${error}`);
      return false;
    }
  }
}

// ============================================================================
// HRM-Inspired LLM Interface
// ============================================================================

/**
 * HRM-inspired LLM interface with dual-system reasoning
 */
export class HRMLLMInterface {
  private ollamaClient: OllamaClient;
  private config: HRMReasoningConfig;
  private availableModels: LLMModel[];

  constructor(
    config: HRMReasoningConfig = DEFAULT_HRM_CONFIG,
    availableModels: LLMModel[] = AVAILABLE_MODELS
  ) {
    this.ollamaClient = new OllamaClient();
    this.config = config;
    this.availableModels = availableModels;
  }

  /**
   * Propose new options using HRM dual-system reasoning
   */
  async proposeOption(request: {
    taskId: string;
    context: LeafContext;
    currentTask: string;
    recentFailures: ExecError[];
  }): Promise<{
    name: string;
    version: string;
    btDsl: any;
    confidence: number;
    estimatedSuccessRate: number;
    reasoning: string;
  } | null> {
    const startTime = performance.now();

    try {
      // Step 1: High-level abstract planning (System 2)
      const abstractPlan = await this.generateAbstractPlan(request);

      // Step 2: Low-level detailed execution planning (System 1)
      const detailedPlan = await this.generateDetailedPlan(
        abstractPlan,
        request
      );

      // Step 3: Iterative refinement loop
      const refinedPlan = await this.iterativeRefinement(detailedPlan, request);

      // Step 4: Generate BT-DSL from refined plan
      const btDsl = await this.generateBTDSL(refinedPlan, request);

      const durationMs = performance.now() - startTime;

      return {
        name: `opt.${this.generateOptionName(request.currentTask)}`,
        version: '1.0.0',
        btDsl,
        confidence: refinedPlan.confidence,
        estimatedSuccessRate: refinedPlan.estimatedSuccessRate,
        reasoning: refinedPlan.reasoning.join('\n'),
      };
    } catch (error) {
      console.error('Failed to propose option:', error);
      return null;
    }
  }

  /**
   * High-level abstract planning (System 2)
   */
  private async generateAbstractPlan(request: any): Promise<any> {
    const systemPrompt = `You are an expert Minecraft AI planner. Your role is to generate high-level strategic plans for solving complex problems.

Focus on:
- Breaking down complex tasks into manageable sub-goals
- Identifying key resources and constraints
- Considering multiple solution approaches
- Planning for contingencies and failure modes

Current context:
- Task: ${request.currentTask}
- Recent failures: ${request.recentFailures.map((f: ExecError) => f.detail).join(', ')}
- Available capabilities: movement, sensing, interaction, crafting
- Bot position: ${request.context?.bot?.entity?.position ? `(${request.context.bot.entity.position.x.toFixed(1)}, ${request.context.bot.entity.position.y.toFixed(1)}, ${request.context.bot.entity.position.z.toFixed(1)})` : 'Unknown'}
- Bot health: ${request.context?.bot?.health || 'Unknown'}
- Bot food: ${request.context?.bot?.food || 'Unknown'}

Generate a high-level strategic plan that addresses the core problem.`;

    const userPrompt = `Analyze the current situation and create a high-level strategic plan for: ${request.currentTask}

Consider the recent failures and design a robust approach that can handle similar challenges.`;

    const response = await this.ollamaClient.generate(
      this.config.abstractPlanner.model,
      userPrompt,
      {
        systemPrompt,
        temperature: this.config.abstractPlanner.temperature,
        maxTokens: this.config.abstractPlanner.maxTokens,
        timeout: 40000, // 15 seconds for demo
      }
    );

    return {
      abstractPlan: response.response,
      confidence: 0.7, // Initial confidence
      reasoning: ['Generated high-level strategic plan'],
    };
  }

  /**
   * Low-level detailed execution planning (System 1)
   */
  private async generateDetailedPlan(
    abstractPlan: any,
    request: any
  ): Promise<any> {
    const systemPrompt = `You are an expert Minecraft AI executor. Your role is to convert high-level strategic plans into detailed tactical execution steps.

Focus on:
- Concrete action sequences
- Resource requirements and availability
- Timing and coordination
- Error handling and recovery
- Performance optimization

Work with the provided abstract plan and create specific, actionable steps.`;

    const userPrompt = `Convert this high-level plan into detailed execution steps:

Abstract Plan:
${abstractPlan.abstractPlan}

Current context:
- Task: ${request.currentTask}
- Recent failures: ${request.recentFailures.map((f: ExecError) => f.detail).join(', ')}
- Bot position: ${request.context?.bot?.entity?.position ? `(${request.context.bot.entity.position.x.toFixed(1)}, ${request.context.bot.entity.position.y.toFixed(1)}, ${request.context.bot.entity.position.z.toFixed(1)})` : 'Unknown'}
- Bot health: ${request.context?.bot?.health || 'Unknown'}
- Bot food: ${request.context?.bot?.food || 'Unknown'}

Generate specific, actionable steps that implement the abstract plan.`;

    const response = await this.ollamaClient.generate(
      this.config.detailedExecutor.model,
      userPrompt,
      {
        systemPrompt,
        temperature: this.config.detailedExecutor.temperature,
        maxTokens: this.config.detailedExecutor.maxTokens,
        timeout: 5000, // 5 seconds for faster response
      }
    );

    return {
      ...abstractPlan,
      detailedPlan: response.response,
      confidence: Math.min(abstractPlan.confidence + 0.1, 0.9),
      reasoning: [
        ...abstractPlan.reasoning,
        'Generated detailed execution plan',
      ],
    };
  }

  /**
   * Iterative refinement loop
   */
  private async iterativeRefinement(plan: any, request: any): Promise<any> {
    let currentPlan = plan;
    let iteration = 0;

    while (iteration < this.config.refinementLoop.maxIterations) {
      // Check halt conditions
      if (this.shouldHalt(currentPlan, iteration)) {
        break;
      }

      // Refine the plan
      currentPlan = await this.refinePlan(currentPlan, request);
      iteration++;
    }

    return {
      ...currentPlan,
      iterations: iteration,
      reasoning: [
        ...currentPlan.reasoning,
        `Completed ${iteration} refinement iterations`,
      ],
    };
  }

  /**
   * Check if refinement should halt
   */
  private shouldHalt(plan: any, iteration: number): boolean {
    const { haltCondition, confidenceThreshold, timeBudgetMs } =
      this.config.refinementLoop;

    switch (haltCondition) {
      case 'confidence_threshold':
        return plan.confidence >= confidenceThreshold;
      case 'time_budget':
        return iteration >= 3; // Simplified time budget check
      case 'solution_quality':
        return plan.confidence >= 0.85;
      default:
        return iteration >= this.config.refinementLoop.maxIterations;
    }
  }

  /**
   * Refine the current plan
   */
  private async refinePlan(plan: any, request: any): Promise<any> {
    const systemPrompt = `You are an expert Minecraft AI plan refiner. Your role is to improve and optimize existing plans based on feedback and analysis.

Focus on:
- Identifying potential issues or weaknesses
- Suggesting improvements and optimizations
- Adding robustness and error handling
- Improving efficiency and success probability

Analyze the current plan and provide refined improvements.`;

    const userPrompt = `Refine and improve this plan:

Current Plan:
${plan.detailedPlan}

Current confidence: ${plan.confidence}
Recent failures: ${request.recentFailures.map((f: ExecError) => f.detail).join(', ')}

Provide specific improvements to increase the plan's success probability and robustness.`;

    const response = await this.ollamaClient.generate(
      this.config.abstractPlanner.model, // Use abstract planner for refinement
      userPrompt,
      {
        systemPrompt,
        temperature: 0.2,
        maxTokens: 1024,
        timeout: 5000, // 5 seconds for faster response
      }
    );

    return {
      ...plan,
      detailedPlan: response.response,
      confidence: Math.min(plan.confidence + 0.05, 0.95),
      estimatedSuccessRate: Math.min(plan.confidence + 0.1, 0.9),
      reasoning: [...plan.reasoning, 'Refined plan based on analysis'],
    };
  }

  /**
   * Generate BT-DSL from refined plan
   */
  private async generateBTDSL(plan: any, request: any): Promise<any> {
    const systemPrompt = `You are an expert in Behavior Tree Domain Specific Language (BT-DSL). Your role is to convert detailed execution plans into structured BT-DSL JSON.

Available node types:
- Sequence: Execute children in order, fail if any child fails
- Selector: Execute children until one succeeds
- Repeat.Until: Repeat child until condition is met
- Decorator.Timeout: Add timeout to child execution
- Decorator.FailOnTrue: Fail if child returns true
- Leaf: Execute specific action

Available sensor predicates:
- distance_to, hostiles_present, light_level_safe, inventory_has_item, etc.

Generate valid BT-DSL JSON that implements the provided plan.`;

    const userPrompt = `Convert this detailed plan into BT-DSL JSON:

Plan:
${plan.detailedPlan}

Task: ${request.currentTask}
Recent failures: ${request.recentFailures.map((f: ExecError) => f.detail).join(', ')}

Generate a BT-DSL JSON structure that implements this plan using the available node types and sensor predicates.`;

    const response = await this.ollamaClient.generate(
      this.config.detailedExecutor.model,
      userPrompt,
      {
        systemPrompt,
        temperature: 0.1,
        maxTokens: 2048,
        timeout: 5000, // 5 seconds for faster response
      }
    );

    try {
      // Extract JSON from response
      const jsonMatch = response.response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      } else {
        // Fallback to a simple sequence
        return {
          type: 'sequence',
          children: [
            {
              type: 'leaf',
              name: 'wait',
              args: { durationMs: 1000 },
            },
          ],
        };
      }
    } catch (error) {
      console.warn('Failed to parse BT-DSL JSON, using fallback:', error);
      return {
        type: 'sequence',
        children: [
          {
            type: 'leaf',
            name: 'wait',
            args: { durationMs: 1000 },
          },
        ],
      };
    }
  }

  /**
   * Generate option name from task description
   */
  private generateOptionName(task: string): string {
    // Convert task description to camelCase option name
    return task
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+(\w)/g, (_, char) => char.toUpperCase())
      .replace(/^(\w)/, (char) => char.toLowerCase())
      .substring(0, 30); // Limit length
  }

  /**
   * Get available models
   */
  getAvailableModels(): string[] {
    return this.availableModels.map((model) => model.name);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<HRMReasoningConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Test model availability
   */
  async testModelAvailability(modelName: string): Promise<boolean> {
    return await this.ollamaClient.isModelAvailable(modelName);
  }
}
