/**
 * Memory-Aware LLM Interface
 *
 * Extends the base LLM interface with memory integration capabilities,
 * allowing the LLM to retrieve relevant memories, store new experiences,
 * and trigger memory recall for enhanced cognitive processing.
 *
 * @author @darianrosebrook
 */

import { LLMInterface, LLMContext, LLMResponse } from './llm-interface';
import { LLMConfig } from '../types';

interface EnhancedMemorySystem {
  initialize(): Promise<void>;
  searchMemories(params: any): Promise<any>;
  ingestMemory(params: any): Promise<any>;
  recordCognitivePattern(
    _thoughtType: string,
    _context: any,
    _processing: any,
    _outcome: any,
    _patterns: any
  ): Promise<any>;
  close(): Promise<void>;
  // Add other methods as needed
}

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface MemoryEnhancedLLMContext extends LLMContext {
  /** Enable memory retrieval for this request */
  enableMemoryRetrieval?: boolean;

  /** Enable memory storage after processing */
  enableMemoryStorage?: boolean;

  /** Memory retrieval query if different from main prompt */
  memoryQuery?: string;

  /** Maximum memories to retrieve */
  maxMemories?: number;

  /** Memory types to retrieve */
  memoryTypes?: Array<
    'episodic' | 'semantic' | 'procedural' | 'emotional' | 'spatial'
  >;

  /** Context for memory retrieval */
  memoryContext?: {
    taskType?: string;
    emotionalState?: string;
    location?: any;
    recentEvents?: any[];
  };
}

export interface MemoryEnhancedResponse extends LLMResponse {
  /** Retrieved memories used for this response */
  memoriesUsed?: Array<{
    id: string;
    type: string;
    content: string;
    relevance: number;
    timestamp: number;
  }>;

  /** Memory operations performed */
  memoryOperations?: Array<{
    type: 'store' | 'update' | 'consolidate';
    memoryType: string;
    content: string;
    metadata: any;
    success: boolean;
  }>;

  /** Memory recommendations */
  memoryRecommendations?: Array<{
    action: 'recall' | 'store' | 'consolidate' | 'decay';
    reason: string;
    priority: number;
  }>;

  /** Cognitive insights */
  cognitiveInsights?: {
    thoughtPatterns?: string[];
    decisionQuality?: number;
    confidenceFactors?: string[];
    learningOpportunities?: string[];
  };
}

export interface MemoryAwareLLMConfig extends LLMConfig {
  /** Memory system endpoint */
  memoryEndpoint?: string;

  /** Enable automatic memory integration */
  enableAutoMemoryIntegration?: boolean;

  /** Enable memory-based prompt enhancement */
  enableMemoryEnhancedPrompts?: boolean;

  /** Enable post-response memory storage */
  enablePostResponseMemoryStorage?: boolean;

  /** Default max memories to retrieve */
  defaultMaxMemories?: number;

  /** Enable memory-based confidence adjustment */
  enableMemoryBasedConfidence?: boolean;

  /** Enable memory quality assessment */
  enableMemoryQualityAssessment?: boolean;
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_MEMORY_AWARE_CONFIG: Partial<MemoryAwareLLMConfig> = {
  memoryEndpoint: 'http://localhost:3001',
  enableAutoMemoryIntegration: true,
  enableMemoryEnhancedPrompts: true,
  enablePostResponseMemoryStorage: true,
  defaultMaxMemories: 5,
  enableMemoryBasedConfidence: true,
  enableMemoryQualityAssessment: true,
};

// ============================================================================
// Memory-Aware LLM Interface
// ============================================================================

/**
 * LLM Interface with integrated memory capabilities
 */
export class MemoryAwareLLMInterface extends LLMInterface {
  private memorySystem?: EnhancedMemorySystem;
  private memoryConfig: Required<MemoryAwareLLMConfig>;

  constructor(
    llmConfig: Partial<LLMConfig> = {},
    memoryConfig: Partial<MemoryAwareLLMConfig> = {}
  ) {
    super(llmConfig);

    this.memoryConfig = {
      ...DEFAULT_MEMORY_AWARE_CONFIG,
      ...memoryConfig,
    } as Required<MemoryAwareLLMConfig>;

    // Initialize memory system if auto-integration is enabled
    if (this.memoryConfig.enableAutoMemoryIntegration) {
      this.initializeMemorySystem();
    }
  }

  /**
   * Initialize the memory-aware LLM interface
   */
  async initialize(): Promise<void> {
    if (this.memoryConfig.enableAutoMemoryIntegration) {
      await this.initializeMemorySystem();
    }
  }

  /**
   * Initialize the memory system connection
   */
  private async initializeMemorySystem(): Promise<void> {
    try {
      // Import dynamically to avoid circular dependencies
      const { createEnhancedMemorySystem } = await import(
        '@conscious-bot/memory'
      );

      this.memorySystem = createEnhancedMemorySystem({
        host: 'localhost',
        port: 5432,
        user: process.env.PG_USER || 'postgres',
        password: process.env.PG_PASSWORD || 'password',
        database: process.env.PG_DATABASE || 'conscious_bot',
        enableToolEfficiencyTracking: true,
        enableBehaviorTreeLearning: true,
        enableCognitivePatternTracking: true,
      } as any);

      await this.memorySystem.initialize();
      console.log('✅ Memory system initialized for LLM integration');
    } catch (error) {
      console.warn(
        '⚠️ Could not initialize memory system:',
        error instanceof Error ? error.message : String(error)
      );
      console.warn('⚠️ LLM will operate without memory integration');
      this.memorySystem = undefined; // Ensure it's undefined on error
    }
  }

  /**
   * Enhanced response generation with memory integration
   */
  async generateMemoryEnhancedResponse(
    prompt: string,
    context: MemoryEnhancedLLMContext = {},
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      systemPrompt?: string;
    }
  ): Promise<MemoryEnhancedResponse> {
    const startTime = performance.now();

    // Step 1: Retrieve relevant memories
    const memories = await this.retrieveRelevantMemories(prompt, context);

    // Step 2: Enhance prompt with memory context
    const enhancedPrompt = this.enhancePromptWithMemories(
      prompt,
      memories,
      context
    );

    // Step 3: Generate LLM response
    const baseResponse = await this.generateResponse(
      enhancedPrompt,
      context,
      options
    );

    // Step 4: Store response and related memories
    const memoryOperations = await this.storeResponseAndMemories(
      prompt,
      baseResponse,
      context,
      memories
    );

    // Step 5: Calculate memory confidence
    const enhancedConfidence = this.calculateMemoryEnhancedConfidence(
      baseResponse,
      memories,
      context
    );

    const endTime = performance.now();

    return {
      ...baseResponse,
      latency: endTime - startTime,
      confidence: enhancedConfidence,
      memoriesUsed: memories.map((m) => ({
        id: m.id,
        type: m.type || 'unknown',
        content: m.content,
        relevance: m.relevance || 0.5,
        timestamp: m.timestamp || Date.now(),
      })),
      memoryOperations,
      memoryRecommendations: await this.generateMemoryRecommendations(
        prompt,
        baseResponse,
        context
      ),
      cognitiveInsights: await this.analyzeCognitiveInsights(
        prompt,
        baseResponse,
        context
      ),
    };
  }

  /**
   * Retrieve relevant memories for the current context
   */
  private async retrieveRelevantMemories(
    prompt: string,
    context: MemoryEnhancedLLMContext
  ): Promise<
    Array<{
      id: string;
      type: string;
      content: string;
      relevance: number;
      timestamp: number;
      metadata?: any;
    }>
  > {
    if (!this.memorySystem || !context.enableMemoryRetrieval) {
      return [];
    }

    try {
      const query = context.memoryQuery || prompt;
      const maxMemories =
        context.maxMemories || this.memoryConfig.defaultMaxMemories;

      // Search for relevant memories
      const searchResults = await this.memorySystem.searchMemories({
        query,
        type: context.memoryTypes || ['episodic', 'semantic', 'procedural'],
        limit: maxMemories,
        context: context.memoryContext,
      });

      return searchResults.results.map((result: any) => ({
        id: result.id,
        type: result.type,
        content: result.content,
        relevance: result.confidence || 0.5,
        timestamp: result.timestamp || Date.now(),
        metadata: result.metadata,
      }));
    } catch (error) {
      console.warn('⚠️ Memory retrieval failed:', error);
      return [];
    }
  }

  /**
   * Enhance prompt with relevant memory context
   */
  private enhancePromptWithMemories(
    prompt: string,
    memories: Array<{
      id: string;
      type: string;
      content: string;
      relevance: number;
      timestamp: number;
    }>,
    _context: MemoryEnhancedLLMContext
  ): string {
    if (
      !this.memoryConfig.enableMemoryEnhancedPrompts ||
      memories.length === 0
    ) {
      return prompt;
    }

    // Sort memories by relevance
    const sortedMemories = memories.sort((a, b) => b.relevance - a.relevance);

    const memoryContext = sortedMemories
      .slice(0, this.memoryConfig.defaultMaxMemories)
      .map((mem) => `[Memory: ${mem.type.toUpperCase()}] ${mem.content}`)
      .join('\n');

    const memoryPrompt = `You have access to the following relevant memories and experiences:

${memoryContext}

Please use these memories to inform your response to the following query:

${prompt}

If the memories are relevant, incorporate them naturally into your reasoning. If they are not relevant, you can disregard them.`;

    return memoryPrompt;
  }

  /**
   * Store response and related memories
   */
  private async storeResponseAndMemories(
    prompt: string,
    response: LLMResponse,
    context: MemoryEnhancedLLMContext,
    memories: Array<{
      id: string;
      type: string;
      content: string;
      relevance: number;
      timestamp: number;
    }>
  ): Promise<
    Array<{
      type: 'store' | 'update' | 'consolidate';
      memoryType: string;
      content: string;
      metadata: any;
      success: boolean;
    }>
  > {
    if (
      !this.memorySystem ||
      !this.memoryConfig.enablePostResponseMemoryStorage
    ) {
      return [];
    }

    const operations: Array<{
      type: 'store' | 'update' | 'consolidate';
      memoryType: string;
      content: string;
      metadata: any;
      success: boolean;
    }> = [];

    try {
      // Store the conversation as an episodic memory
      if (context.enableMemoryStorage !== false) {
        const conversationMemory = await this.memorySystem.ingestMemory({
          content: `Conversation: User asked: "${prompt.substring(0, 200)}...". Bot responded: "${response.text.substring(0, 200)}..."`,
          type: 'dialogue',
          source: 'llm_conversation',
          metadata: {
            conversationId: response.id,
            promptLength: prompt.length,
            responseLength: response.text.length,
            model: response.model,
            confidence: response.confidence,
            memoriesUsed: memories.length,
          },
        });

        operations.push({
          type: 'store',
          memoryType: 'dialogue',
          content: conversationMemory.content,
          metadata: conversationMemory.metadata,
          success: true,
        });
      }

      // Store cognitive processing pattern if tracking is enabled
      if ((this.memoryConfig as any).enableCognitivePatternTracking) {
        await this.memorySystem.recordCognitivePattern(
          'decision',
          {
            taskComplexity: this.estimateTaskComplexity(prompt),
            timePressure: context.memoryContext?.emotionalState?.includes(
              'stressed'
            )
              ? 0.8
              : 0.3,
            emotionalState: context.memoryContext?.emotionalState || 'neutral',
            cognitiveLoad: this.estimateCognitiveLoad(prompt, response),
            socialContext: context.socialContext ? true : false,
          },
          {
            approach: this.analyzeApproach(prompt, response),
            reasoning: response.metadata?.reasoning || [],
            confidence: response.confidence,
            processingTime: response.latency,
          },
          {
            success: response.confidence > 0.7,
            quality: this.assessResponseQuality(prompt, response),
            followThrough: true, // Assume LLM responses are followed through
            longTermImpact: this.assessLongTermImpact(prompt, response),
          },
          {
            commonBiases: this.detectBiases(prompt, response),
            effectiveStrategies: this.extractEffectiveStrategies(
              prompt,
              response
            ),
            failureModes: this.identifyFailureModes(prompt, response),
          }
        );
      }
    } catch (error) {
      console.warn(
        '⚠️ Memory storage failed:',
        error instanceof Error ? error.message : String(error)
      );
      operations.push({
        type: 'store',
        memoryType: 'dialogue',
        content: 'Failed to store memory',
        metadata: {
          error: error instanceof Error ? error.message : String(error),
        },
        success: false,
      });
    }

    return operations;
  }

  /**
   * Calculate memory confidence
   */
  private calculateMemoryEnhancedConfidence(
    response: LLMResponse,
    memories: Array<{ relevance: number }>,
    _context: MemoryEnhancedLLMContext
  ): number {
    if (!this.memoryConfig.enableMemoryBasedConfidence) {
      return response.confidence;
    }

    let baseConfidence = response.confidence;
    const memoryRelevance =
      memories.length > 0
        ? memories.reduce((sum, m) => sum + m.relevance, 0) / memories.length
        : 0;

    // Boost confidence if relevant memories were found and used
    if (memoryRelevance > 0.5) {
      baseConfidence = Math.min(1.0, baseConfidence + memoryRelevance * 0.1);
    }

    return baseConfidence;
  }

  /**
   * Generate memory recommendations
   */
  private async generateMemoryRecommendations(
    prompt: string,
    response: LLMResponse,
    _context: MemoryEnhancedLLMContext
  ): Promise<
    Array<{
      action: 'recall' | 'store' | 'consolidate' | 'decay';
      reason: string;
      priority: number;
    }>
  > {
    if (
      !this.memorySystem ||
      !this.memoryConfig.enableMemoryQualityAssessment
    ) {
      return [];
    }

    const recommendations: Array<{
      action: 'recall' | 'store' | 'consolidate' | 'decay';
      reason: string;
      priority: number;
    }> = [];

    try {
      // Recommend memory consolidation if many related memories exist
      const searchResults = await this.memorySystem.searchMemories({
        query: prompt,
        limit: 10,
      });

      if (searchResults.results.length > 5) {
        recommendations.push({
          action: 'consolidate',
          reason: `Found ${searchResults.results.length} related memories that could be consolidated`,
          priority: 0.7,
        });
      }

      // Recommend memory storage if response is high quality
      if (response.confidence > 0.8 && response.text.length > 100) {
        recommendations.push({
          action: 'store',
          reason:
            'High-confidence, detailed response worth storing for future reference',
          priority: 0.8,
        });
      }

      // Recommend decay check for old memories
      if (Math.random() < 0.1) {
        // 10% chance to check memory decay
        recommendations.push({
          action: 'decay',
          reason: 'Periodic check for memory consolidation and cleanup',
          priority: 0.5,
        });
      }
    } catch (error) {
      console.warn('⚠️ Memory recommendations generation failed:', error);
    }

    return recommendations.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Analyze cognitive insights from the interaction
   */
  private async analyzeCognitiveInsights(
    prompt: string,
    response: LLMResponse,
    _context: MemoryEnhancedLLMContext
  ): Promise<{
    thoughtPatterns?: string[];
    decisionQuality?: number;
    confidenceFactors?: string[];
    learningOpportunities?: string[];
  }> {
    if (
      !this.memorySystem ||
      !this.memoryConfig.enableMemoryQualityAssessment
    ) {
      return {};
    }

    return {
      thoughtPatterns: this.identifyThoughtPatterns(prompt, response),
      decisionQuality: this.assessDecisionQuality(prompt, response),
      confidenceFactors: this.identifyConfidenceFactors(prompt, response),
      learningOpportunities: this.identifyLearningOpportunities(
        prompt,
        response
      ),
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private estimateTaskComplexity(
    prompt: string
  ): 'simple' | 'medium' | 'complex' {
    const length = prompt.length;
    const hasQuestions = prompt.includes('?');
    const hasMultipleSteps = prompt.includes(',') || prompt.includes(' and ');

    if (length < 50 && !hasQuestions && !hasMultipleSteps) return 'simple';
    if (length < 200 && (hasQuestions || hasMultipleSteps)) return 'medium';
    return 'complex';
  }

  private estimateCognitiveLoad(prompt: string, response: LLMResponse): number {
    const promptComplexity = prompt.length / 1000; // Normalize by length
    const responseLength = response.text.length / 1000;
    const processingTime = response.latency / 10000; // Normalize by time

    return Math.min(
      1.0,
      (promptComplexity + responseLength + processingTime) / 3
    );
  }

  private analyzeApproach(prompt: string, response: LLMResponse): string {
    const text = response.text.toLowerCase();

    if (
      text.includes('step by step') ||
      text.includes('first') ||
      text.includes('then')
    ) {
      return 'step_by_step_reasoning';
    }
    if (
      text.includes('however') ||
      text.includes('alternatively') ||
      text.includes('option')
    ) {
      return 'alternative_analysis';
    }
    if (
      text.includes('based on') ||
      text.includes('considering') ||
      text.includes('given that')
    ) {
      return 'evidence_based_reasoning';
    }
    return 'general_reasoning';
  }

  private assessResponseQuality(prompt: string, response: LLMResponse): number {
    const text = response.text;
    const hasStructure =
      text.includes('\n') || text.includes('•') || text.includes('1.');
    const hasDetails = text.length > 50;
    const isRelevant = text
      .toLowerCase()
      .includes(prompt.toLowerCase().substring(0, 20));

    let quality = 0.5; // Base quality
    if (hasStructure) quality += 0.2;
    if (hasDetails) quality += 0.2;
    if (isRelevant) quality += 0.1;

    return Math.min(1.0, quality);
  }

  private assessLongTermImpact(prompt: string, response: LLMResponse): number {
    const text = response.text.toLowerCase();
    const hasLearning =
      text.includes('learn') ||
      text.includes('remember') ||
      text.includes('future');
    const hasActionable =
      text.includes('should') || text.includes('can') || text.includes('will');
    const hasSpecific =
      text.includes('specific') ||
      text.includes('example') ||
      text.includes('case');

    let impact = 0.3; // Base impact
    if (hasLearning) impact += 0.3;
    if (hasActionable) impact += 0.2;
    if (hasSpecific) impact += 0.2;

    return Math.min(1.0, impact);
  }

  private detectBiases(prompt: string, response: LLMResponse): string[] {
    const text = response.text.toLowerCase();
    const biases: string[] = [];

    if (
      text.includes('obviously') ||
      text.includes('clearly') ||
      text.includes('everyone knows')
    ) {
      biases.push('overconfidence_bias');
    }
    if (
      text.includes('always') ||
      text.includes('never') ||
      text.includes('all')
    ) {
      biases.push('all_or_nothing_thinking');
    }
    if (
      text.includes('best') ||
      text.includes('perfect') ||
      text.includes('ideal')
    ) {
      biases.push('perfectionism_bias');
    }

    return biases;
  }

  private extractEffectiveStrategies(
    prompt: string,
    response: LLMResponse
  ): string[] {
    const text = response.text.toLowerCase();
    const strategies: string[] = [];

    if (text.includes('step by step'))
      strategies.push('step_by_step_reasoning');
    if (text.includes('consider') || text.includes('think about'))
      strategies.push('deliberate_analysis');
    if (text.includes('alternative') || text.includes('option'))
      strategies.push('alternative_consideration');
    if (text.includes('evidence') || text.includes('based on'))
      strategies.push('evidence_based_decision');

    return strategies;
  }

  private identifyFailureModes(
    prompt: string,
    response: LLMResponse
  ): string[] {
    const text = response.text.toLowerCase();
    const failureModes: string[] = [];

    if (text.includes("i don't know") || text.includes('uncertain')) {
      failureModes.push('knowledge_gap');
    }
    if (
      text.includes('maybe') ||
      (text.includes('possibly') && text.length < 100)
    ) {
      failureModes.push('vague_response');
    }
    if (
      text.includes('but') &&
      text.includes('however') &&
      text.split(' ').length > 500
    ) {
      failureModes.push('overthinking');
    }

    return failureModes;
  }

  private identifyThoughtPatterns(
    prompt: string,
    response: LLMResponse
  ): string[] {
    const patterns: string[] = [];
    const text = response.text.toLowerCase();

    if (text.includes('therefore') || text.includes('consequently')) {
      patterns.push('logical_reasoning');
    }
    if (text.includes('imagine') || text.includes('consider')) {
      patterns.push('hypothetical_thinking');
    }
    if (text.includes('remember') || text.includes('recall')) {
      patterns.push('memory_based_reasoning');
    }
    if (
      text.includes('feel') ||
      text.includes('think') ||
      text.includes('believe')
    ) {
      patterns.push('perspective_taking');
    }

    return patterns;
  }

  private assessDecisionQuality(prompt: string, response: LLMResponse): number {
    const text = response.text;
    const hasReasoning =
      text.includes('because') || text.includes('since') || text.includes('as');
    const hasAlternatives =
      text.includes('option') ||
      text.includes('alternative') ||
      text.includes('choice');
    const hasEvidence =
      text.includes('based on') ||
      text.includes('according to') ||
      text.includes('evidence');
    const isBalanced = text.length > 100 && text.length < 2000;

    let quality = 0.5; // Base quality
    if (hasReasoning) quality += 0.2;
    if (hasAlternatives) quality += 0.15;
    if (hasEvidence) quality += 0.15;
    if (isBalanced) quality += 0.1;

    return Math.min(1.0, quality);
  }

  private identifyConfidenceFactors(
    prompt: string,
    response: LLMResponse
  ): string[] {
    const factors: string[] = [];
    const text = response.text.toLowerCase();

    if (
      text.includes('confident') ||
      text.includes('sure') ||
      text.includes('certain')
    ) {
      factors.push('explicit_confidence');
    }
    if (text.includes('based on') || text.includes('according to')) {
      factors.push('evidence_based');
    }
    if (text.includes('experience') || text.includes('knowledge')) {
      factors.push('experience_based');
    }
    if (text.includes('generally') || text.includes('typically')) {
      factors.push('pattern_based');
    }

    return factors;
  }

  private identifyLearningOpportunities(
    prompt: string,
    response: LLMResponse
  ): string[] {
    const opportunities: string[] = [];
    const text = response.text.toLowerCase();

    if (
      text.includes('learn') ||
      text.includes('remember') ||
      text.includes('note')
    ) {
      opportunities.push('knowledge_acquisition');
    }
    if (
      text.includes('practice') ||
      text.includes('try') ||
      text.includes('experiment')
    ) {
      opportunities.push('skill_development');
    }
    if (
      text.includes('understand') ||
      text.includes('comprehend') ||
      text.includes('grasp')
    ) {
      opportunities.push('conceptual_understanding');
    }
    if (
      text.includes('pattern') ||
      text.includes('trend') ||
      text.includes('connection')
    ) {
      opportunities.push('pattern_recognition');
    }

    return opportunities;
  }

  /**
   * Close the memory-aware LLM interface
   */
  async close(): Promise<void> {
    if (this.memorySystem) {
      await this.memorySystem.close();
    }
    await super.close();
  }
}
