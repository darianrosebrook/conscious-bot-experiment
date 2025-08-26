/**
 * LLM Integration System - Real Ollama integration with HRM principles
 *
 * Implements real LLM integration with Ollama, incorporating HRM's dual-system
 * architecture for hierarchical reasoning and option proposal generation.
 *
 * @author @darianrosebrook
 */
import { LeafContext, ExecError } from './leaf-contracts';
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
export type LLMCapability = 'language_understanding' | 'logical_reasoning' | 'creative_generation' | 'code_generation' | 'mathematical_reasoning' | 'spatial_reasoning' | 'planning_optimization' | 'narrative_construction';
/**
 * HRM-inspired dual-system reasoning configuration
 */
export interface HRMReasoningConfig {
    abstractPlanner: {
        model: string;
        maxTokens: number;
        temperature: number;
        purpose: string;
        latency: string;
    };
    detailedExecutor: {
        model: string;
        maxTokens: number;
        temperature: number;
        purpose: string;
        latency: string;
    };
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
/**
 * Pre-configured models for different reasoning tasks
 */
export declare const AVAILABLE_MODELS: LLMModel[];
/**
 * Default HRM reasoning configuration
 */
export declare const DEFAULT_HRM_CONFIG: HRMReasoningConfig;
/**
 * Ollama API client for model interaction
 */
export declare class OllamaClient {
    private baseUrl;
    private timeout;
    constructor(baseUrl?: string, timeout?: number);
    /**
     * Generate response from Ollama model
     */
    generate(model: string, prompt: string, options?: {
        temperature?: number;
        maxTokens?: number;
        systemPrompt?: string;
        timeout?: number;
    }): Promise<OllamaResponse>;
    /**
     * List available models
     */
    listModels(): Promise<{
        models: Array<{
            name: string;
            size: number;
            modified_at: string;
        }>;
    }>;
    /**
     * Check if model is available
     */
    isModelAvailable(modelName: string): Promise<boolean>;
}
/**
 * HRM-inspired LLM interface with dual-system reasoning
 */
export declare class HRMLLMInterface {
    private ollamaClient;
    private config;
    private availableModels;
    constructor(config?: HRMReasoningConfig, availableModels?: LLMModel[]);
    /**
     * Propose new options using HRM dual-system reasoning
     */
    proposeOption(request: {
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
    } | null>;
    /**
     * High-level abstract planning (System 2)
     */
    private generateAbstractPlan;
    /**
     * Low-level detailed execution planning (System 1)
     */
    private generateDetailedPlan;
    /**
     * Iterative refinement loop
     */
    private iterativeRefinement;
    /**
     * Check if refinement should halt
     */
    private shouldHalt;
    /**
     * Refine the current plan
     */
    private refinePlan;
    /**
     * Generate BT-DSL from refined plan
     */
    private generateBTDSL;
    /**
     * Generate option name from task description
     */
    private generateOptionName;
    /**
     * Get available models
     */
    getAvailableModels(): string[];
    /**
     * Update configuration
     */
    updateConfig(config: Partial<HRMReasoningConfig>): void;
    /**
     * Test model availability
     */
    testModelAvailability(modelName: string): Promise<boolean>;
}
//# sourceMappingURL=llm-integration.d.ts.map