#!/usr/bin/env tsx
/**
 * Hybrid HRM Integration
 *
 * Implements the documented three-system architecture:
 * - LLM: Language/narrative/social reasoning
 * - Python HRM: Structured and quick logistical reasoning (27M parameters)
 * - GOAP: Quick reactive responses (combat, survival, emergencies)
 */
import { LeafContext } from './leaf-contracts';
export interface PythonHRMConfig {
    modelPath: string;
    device: 'cpu' | 'cuda' | 'mps';
    maxSteps: number;
    confidenceThreshold: number;
}
export interface PythonHRMInput {
    task: string;
    context: Record<string, any>;
    constraints?: Record<string, any>;
    objective?: string;
}
export interface PythonHRMOutput {
    solution: any;
    confidence: number;
    reasoningSteps: number;
    executionTime: number;
    error?: string;
}
export interface PythonHRMInterface {
    initialize(): Promise<boolean>;
    infer(input: PythonHRMInput): Promise<PythonHRMOutput>;
    isAvailable(): boolean;
}
export interface LLMConfig {
    model: string;
    maxTokens: number;
    temperature: number;
    timeout?: number;
}
export interface LLMInput {
    prompt: string;
    context: Record<string, any>;
    systemMessage?: string;
}
export interface LLMOutput {
    response: string;
    confidence: number;
    executionTime: number;
    error?: string;
}
export interface LLMInterface {
    generate(input: LLMInput): Promise<LLMOutput>;
    isAvailable(): boolean;
}
export interface GOAPInput {
    goal: string;
    context: Record<string, any>;
    urgency: 'low' | 'medium' | 'high' | 'emergency';
}
export interface GOAPOutput {
    actions: string[];
    confidence: number;
    executionTime: number;
    error?: string;
}
export interface GOAPInterface {
    plan(input: GOAPInput): Promise<GOAPOutput>;
    isAvailable(): boolean;
}
export interface TaskSignature {
    structuredReasoning: number;
    narrativeReasoning: number;
    reactiveResponse: number;
    complexity: number;
    timeCritical: boolean;
    safetyCritical: boolean;
}
export interface HybridReasoningResult {
    primarySystem: 'python-hrm' | 'llm' | 'goap';
    result: any;
    confidence: number;
    reasoningTrace: string[];
    executionTime: number;
    fallbackUsed: boolean;
    collaboration?: {
        pythonHRM?: PythonHRMOutput;
        llm?: LLMOutput;
        goap?: GOAPOutput;
        consensus: 'agreement' | 'disagreement' | 'complementary';
    };
}
/**
 * Hybrid HRM Router
 *
 * Routes tasks to the most appropriate reasoning system according to our documented architecture:
 * - Python HRM: Structured and quick logistical reasoning (puzzles, optimization, pathfinding)
 * - LLM: Language/narrative/social reasoning (explanations, creative tasks, social interaction)
 * - GOAP: Quick reactive responses (combat, survival, emergency responses)
 */
export declare class HybridHRMRouter {
    private pythonHRM;
    private llm;
    private goap;
    private isInitialized;
    constructor(pythonHRMConfig: PythonHRMConfig, llmConfig?: LLMConfig, goapConfig?: any);
    /**
     * Initialize all three reasoning systems
     */
    initialize(): Promise<boolean>;
    /**
     * Route and execute reasoning task according to documented architecture
     */
    reason(task: string, context: LeafContext, budget: {
        maxTimeMs: number;
        maxComplexity: number;
    }): Promise<HybridReasoningResult>;
    /**
     * Analyze task to determine optimal routing
     */
    private analyzeTaskSignature;
    /**
     * Determine if task should use GOAP (reactive responses)
     */
    private shouldUseGOAP;
    /**
     * Determine if task should use Python HRM (structured reasoning)
     */
    private shouldUsePythonHRM;
    /**
     * Determine if task should use LLM (language/narrative)
     */
    private shouldUseLLM;
    /**
     * Check if task is a simple signal that should go to GOAP
     */
    private isSimpleSignal;
    /**
     * Execute task using GOAP (reactive responses)
     */
    private executeGOAP;
    /**
     * Execute task using Python HRM (structured reasoning)
     */
    private executePythonHRM;
    /**
     * Execute LLM reasoning
     */
    private executeLLM;
    /**
     * Determine urgency level for GOAP
     */
    private determineUrgency;
    /**
     * Create Python HRM interface
     */
    private createPythonHRMInterface;
    /**
     * Create LLM interface
     */
    private createLLMInterface;
    /**
     * Create GOAP interface
     */
    private createGOAPInterface;
}
//# sourceMappingURL=hybrid-hrm-integration.d.ts.map