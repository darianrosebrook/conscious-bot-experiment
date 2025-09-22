/**
 * Context optimization system for advanced memory integration.
 *
 * Provides sophisticated context building, memory retrieval,
 * and token optimization for LLM interactions.
 *
 * @author @darianrosebrook
 */

import { LLMInterface } from './llm-interface';
import {
  LLMContext,
  OptimizedContext,
  RelevanceScore,
  MemoryRetrieval,
  ContextSynthesis,
} from '../types';

/**
 * Configuration for context optimization
 */
export interface ContextOptimizerConfig {
  maxContextTokens: number;
  maxMemoriesPerContext: number;
  relevanceThreshold: number;
  enableCrossModuleSynthesis: boolean;
  enableTokenOptimization: boolean;
  enableMemoryRetrieval: boolean;
  contextCompressionRatio: number; // 0-1, how much to compress context
  memoryTimeWindow: number; // milliseconds
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: ContextOptimizerConfig = {
  maxContextTokens: 4000,
  maxMemoriesPerContext: 10,
  relevanceThreshold: 0.6,
  enableCrossModuleSynthesis: true,
  enableTokenOptimization: true,
  enableMemoryRetrieval: true,
  contextCompressionRatio: 0.7,
  memoryTimeWindow: 86400000, // 24 hours
};

/**
 * Context optimization system
 */
export class ContextOptimizer {
  private llm: LLMInterface;
  private config: ContextOptimizerConfig;
  private memoryInterface?: any; // Would integrate with memory system
  private contextHistory: OptimizedContext[] = [];

  constructor(llm: LLMInterface, config: Partial<ContextOptimizerConfig> = {}) {
    this.llm = llm;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Build comprehensive context for a specific task
   */
  async buildContextForTask(
    task: string,
    contextRequirements: ContextRequirements,
    baseContext?: LLMContext
  ): Promise<OptimizedContext> {
    let optimizedContext: OptimizedContext = {
      id: `context-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      task,
      originalContext: baseContext || {},
      retrievedMemories: [],
      synthesizedContext: {
        goals: [],
        plans: [],
        relationships: [],
        constraints: [],
        opportunities: [],
        risks: [],
      },
      tokenCount: 0,
      relevanceScore: 0,
      optimizationLevel: 0,
      timestamp: Date.now(),
    };

    // Retrieve relevant memories
    if (this.config.enableMemoryRetrieval) {
      const memories = await this.retrieveRelevantMemories(
        task,
        contextRequirements
      );
      optimizedContext.retrievedMemories = memories;
    }

    // Synthesize cross-module context
    if (this.config.enableCrossModuleSynthesis) {
      const synthesis = await this.synthesizeCrossModuleContext(
        task,
        optimizedContext
      );
      optimizedContext.synthesizedContext = synthesis;
    }

    // Optimize for token limits
    if (this.config.enableTokenOptimization) {
      optimizedContext = await this.optimizeForTokenLimits(optimizedContext);
    }

    // Calculate final metrics
    optimizedContext.tokenCount = this.estimateTokenCount(optimizedContext);
    optimizedContext.relevanceScore = this.calculateRelevanceScore(
      optimizedContext,
      task
    );

    this.contextHistory.push(optimizedContext);
    return optimizedContext;
  }

  /**
   * Retrieve memories relevant to current context
   */
  async retrieveRelevantMemories(
    query: string,
    requirements: ContextRequirements
  ): Promise<MemoryRetrieval[]> {
    if (!this.memoryInterface) {
      return this.simulateMemoryRetrieval(query, requirements);
    }

    try {
      // This would integrate with the actual memory system
      const memories = await this.memoryInterface.search(query, {
        limit: this.config.maxMemoriesPerContext,
        timeWindow: this.config.memoryTimeWindow,
        relevanceThreshold: this.config.relevanceThreshold,
      });

      return memories.map((memory: any) => ({
        id: memory.id,
        content: memory.content,
        type: memory.type,
        relevanceScore: memory.relevanceScore,
        timestamp: memory.timestamp,
        source: memory.source,
      }));
    } catch (error) {
      console.error('Error retrieving memories:', error);
      return this.simulateMemoryRetrieval(query, requirements);
    }
  }

  /**
   * Simulate memory retrieval for testing
   */
  private simulateMemoryRetrieval(
    query: string,
    _requirements: ContextRequirements
  ): MemoryRetrieval[] {
    const simulatedMemories: MemoryRetrieval[] = [];
    const keywords = query.toLowerCase().split(/\s+/);

    // Simulate different types of memories based on query
    if (keywords.some((k) => ['goal', 'objective', 'target'].includes(k))) {
      simulatedMemories.push({
        id: 'goal-memory-1',
        content: 'Previous goal: Complete building project successfully',
        type: 'goal',
        relevanceScore: 0.85,
        timestamp: Date.now() - 3600000,
        source: 'episodic',
      });
    }

    if (keywords.some((k) => ['problem', 'issue', 'error'].includes(k))) {
      simulatedMemories.push({
        id: 'problem-memory-1',
        content: 'Similar problem solved by using alternative approach',
        type: 'problem_solution',
        relevanceScore: 0.78,
        timestamp: Date.now() - 7200000,
        source: 'semantic',
      });
    }

    if (keywords.some((k) => ['decision', 'choice', 'option'].includes(k))) {
      simulatedMemories.push({
        id: 'decision-memory-1',
        content: 'Previous decision: Prioritized safety over efficiency',
        type: 'decision',
        relevanceScore: 0.72,
        timestamp: Date.now() - 1800000,
        source: 'episodic',
      });
    }

    return simulatedMemories
      .filter(
        (memory) => memory.relevanceScore >= this.config.relevanceThreshold
      )
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, this.config.maxMemoriesPerContext);
  }

  /**
   * Synthesize context from multiple modules
   */
  async synthesizeCrossModuleContext(
    task: string,
    currentContext: OptimizedContext
  ): Promise<ContextSynthesis> {
    const synthesis: ContextSynthesis = {
      goals: [],
      plans: [],
      relationships: [],
      constraints: [],
      opportunities: [],
      risks: [],
    };

    // Extract goals from context and memories
    const goalMemories = currentContext.retrievedMemories.filter(
      (m) => m.type === 'goal'
    );
    synthesis.goals = goalMemories.map((m) => m.content);

    // Extract problem solutions
    const problemMemories = currentContext.retrievedMemories.filter(
      (m) => m.type === 'problem_solution'
    );
    synthesis.opportunities = problemMemories.map((m) => m.content);

    // Extract decisions and their outcomes
    const decisionMemories = currentContext.retrievedMemories.filter(
      (m) => m.type === 'decision'
    );
    synthesis.constraints = decisionMemories.map((m) => m.content);

    // Generate additional context using LLM
    const prompt = `Task: ${task}

Current Context:
- Goals: ${synthesis.goals.join(', ')}
- Opportunities: ${synthesis.opportunities.join(', ')}
- Constraints: ${synthesis.constraints.join(', ')}

Synthesize additional context that would be helpful for this task:
1. Related plans or strategies
2. Important relationships to consider
3. Potential risks or challenges
4. Additional opportunities

Provide concise, relevant context.`;

    try {
      const response = await this.llm.generateResponse(
        prompt,
        {
          systemPrompt:
            'You are synthesizing context for task execution. Be concise and relevant.',
        },
        {
          temperature: 0.4,
          maxTokens: 512,
        }
      );

      const additionalContext = this.parseSynthesisResponse(response.text);
      return { ...synthesis, ...additionalContext };
    } catch (error) {
      console.error('Error synthesizing context:', error);
      return synthesis;
    }
  }

  /**
   * Parse synthesis response from LLM
   */
  private parseSynthesisResponse(response: string): Partial<ContextSynthesis> {
    const synthesis: Partial<ContextSynthesis> = {};
    const lines = response.split('\n').filter((line) => line.trim());

    let currentSection = '';

    lines.forEach((line) => {
      const lowerLine = line.toLowerCase();
      if (lowerLine.includes('plan')) currentSection = 'plans';
      else if (lowerLine.includes('relationship'))
        currentSection = 'relationships';
      else if (lowerLine.includes('risk') || lowerLine.includes('challenge'))
        currentSection = 'risks';
      else if (line.trim().startsWith('-') || line.trim().startsWith('•')) {
        const content = line.replace(/^[-•]\s*/, '').trim();
        switch (currentSection) {
          case 'plans':
            if (!synthesis.plans) synthesis.plans = [];
            synthesis.plans.push(content);
            break;
          case 'relationships':
            if (!synthesis.relationships) synthesis.relationships = [];
            synthesis.relationships.push(content);
            break;
          case 'risks':
            if (!synthesis.risks) synthesis.risks = [];
            synthesis.risks.push(content);
            break;
        }
      }
    });

    return synthesis;
  }

  /**
   * Optimize context to fit within token limitations
   */
  async optimizeForTokenLimits(
    context: OptimizedContext
  ): Promise<OptimizedContext> {
    const currentTokens = this.estimateTokenCount(context);

    if (currentTokens <= this.config.maxContextTokens) {
      return context;
    }

    // Calculate compression needed
    const compressionRatio = this.config.maxContextTokens / currentTokens;
    const targetCompression = Math.min(
      compressionRatio,
      this.config.contextCompressionRatio
    );

    // Compress memories by relevance
    const compressedMemories = context.retrievedMemories
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(
        0,
        Math.floor(context.retrievedMemories.length * targetCompression)
      );

    // Compress synthesized context
    const compressedSynthesis = await this.compressSynthesizedContext(
      context.synthesizedContext,
      targetCompression
    );

    return {
      ...context,
      retrievedMemories: compressedMemories,
      synthesizedContext: compressedSynthesis,
      optimizationLevel: 1 - targetCompression,
    };
  }

  /**
   * Compress synthesized context using LLM
   */
  private async compressSynthesizedContext(
    synthesis: ContextSynthesis,
    compressionRatio: number
  ): Promise<ContextSynthesis> {
    const prompt = `Compress this context to ${Math.round(compressionRatio * 100)}% of its current size while preserving the most important information:

Goals: ${synthesis.goals.join(', ')}
Plans: ${synthesis.plans.join(', ')}
Relationships: ${synthesis.relationships.join(', ')}
Constraints: ${synthesis.constraints.join(', ')}
Opportunities: ${synthesis.opportunities.join(', ')}
Risks: ${synthesis.risks.join(', ')}

Provide the compressed context in the same format.`;

    try {
      const response = await this.llm.generateResponse(
        prompt,
        {
          systemPrompt:
            'You are compressing context while preserving essential information.',
        },
        {
          temperature: 0.3,
          maxTokens: 256,
        }
      );

      if (!response.text) {
        return synthesis;
      }
      const parsedResponse = this.parseSynthesisResponse(response.text);
      return { ...synthesis, ...parsedResponse };
    } catch (error) {
      console.error('Error compressing context:', error);
      return synthesis;
    }
  }

  /**
   * Estimate token count for context
   */
  private estimateTokenCount(context: OptimizedContext): number {
    let tokenCount = 0;

    // Count tokens in memories
    context.retrievedMemories.forEach((memory) => {
      tokenCount += this.estimateTokens(memory.content);
    });

    // Count tokens in synthesized context
    Object.values(context.synthesizedContext).forEach((items) => {
      if (Array.isArray(items)) {
        items.forEach((item) => {
          tokenCount += this.estimateTokens(item);
        });
      }
    });

    // Count tokens in original context
    if (context.originalContext.currentGoals) {
      context.originalContext.currentGoals.forEach((goal) => {
        tokenCount += this.estimateTokens(goal);
      });
    }

    return tokenCount;
  }

  /**
   * Estimate tokens in text (simple approximation)
   */
  private estimateTokens(text: string): number {
    // Simple approximation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  /**
   * Calculate relevance score for context
   */
  private calculateRelevanceScore(
    context: OptimizedContext,
    task: string
  ): number {
    let totalScore = 0;
    let totalWeight = 0;

    // Score memories by relevance
    context.retrievedMemories.forEach((memory) => {
      totalScore += memory.relevanceScore;
      totalWeight += 1;
    });

    // Score synthesized context by task alignment
    const taskKeywords = task.toLowerCase().split(/\s+/);
    const synthesisItems = Object.values(context.synthesizedContext).flat();

    synthesisItems.forEach((item) => {
      const itemKeywords = item.toLowerCase().split(/\s+/);
      const overlap = taskKeywords.filter((k) =>
        itemKeywords.includes(k)
      ).length;
      const relevance =
        overlap / Math.max(taskKeywords.length, itemKeywords.length);
      totalScore += relevance;
      totalWeight += 1;
    });

    return totalWeight > 0 ? totalScore / totalWeight : 0;
  }

  /**
   * Score context relevance for a specific task
   */
  async scoreContextRelevance(
    context: OptimizedContext,
    task: string
  ): Promise<RelevanceScore> {
    const prompt = `Task: ${task}

Context:
- Memories: ${context.retrievedMemories.map((m) => m.content).join('; ')}
- Goals: ${context.synthesizedContext.goals?.join(', ') || 'None'}
- Plans: ${context.synthesizedContext.plans?.join(', ') || 'None'}
- Constraints: ${context.synthesizedContext.constraints?.join(', ') || 'None'}

Rate the relevance of this context to the task on a scale of 0.0 to 1.0.
Consider:
- How directly the context relates to the task
- Whether the context provides useful information
- If the context might be misleading or irrelevant

Provide a score and brief explanation.`;

    try {
      const response = await this.llm.generateResponse(
        prompt,
        {
          systemPrompt:
            'You are evaluating context relevance. Be objective and provide clear reasoning.',
        },
        {
          temperature: 0.3,
          maxTokens: 128,
        }
      );

      if (!response.text) {
        return {
          score: 0.5,
          reasoning: 'Evaluation failed - defaulting to moderate relevance',
          dimensions: {
            taskAlignment: 0.5,
            informationValue: 0.5,
            timeliness: 0.5,
          },
        };
      }
      return this.parseRelevanceScore(response.text);
    } catch (error) {
      console.error('Error scoring context relevance:', error);
      return {
        score: 0.5,
        reasoning: 'Evaluation failed - defaulting to moderate relevance',
        dimensions: {
          taskAlignment: 0.5,
          informationValue: 0.5,
          timeliness: 0.5,
        },
      };
    }
  }

  /**
   * Parse relevance score from LLM response
   */
  private parseRelevanceScore(response: string): RelevanceScore {
    const scoreMatch = response.match(/(\d+\.?\d*)/);
    const score = scoreMatch
      ? Math.min(1, Math.max(0, parseFloat(scoreMatch[1])))
      : 0.5;

    return {
      score,
      reasoning: response.trim(),
      dimensions: {
        taskAlignment: score * 0.8 + 0.1,
        informationValue: score * 0.7 + 0.2,
        timeliness: score * 0.6 + 0.3,
      },
    };
  }

  /**
   * Get context optimization statistics
   */
  getStats() {
    const contexts = this.contextHistory;

    return {
      totalContexts: contexts.length,
      averageTokenCount:
        contexts.length > 0
          ? contexts.reduce((sum, c) => sum + c.tokenCount, 0) / contexts.length
          : 0,
      averageRelevanceScore:
        contexts.length > 0
          ? contexts.reduce((sum, c) => sum + c.relevanceScore, 0) /
            contexts.length
          : 0,
      averageOptimizationLevel:
        contexts.length > 0
          ? contexts.reduce((sum, c) => sum + c.optimizationLevel, 0) /
            contexts.length
          : 0,
      averageMemoriesPerContext:
        contexts.length > 0
          ? contexts.reduce((sum, c) => sum + c.retrievedMemories.length, 0) /
            contexts.length
          : 0,
      config: this.config,
    };
  }

  /**
   * Set memory interface for integration
   */
  setMemoryInterface(memoryInterface: any): void {
    this.memoryInterface = memoryInterface;
  }

  /**
   * Clear context history
   */
  clearHistory(): void {
    this.contextHistory = [];
  }
}

/**
 * Context requirements for building optimized context
 */
export interface ContextRequirements {
  includeGoals: boolean;
  includePlans: boolean;
  includeRelationships: boolean;
  includeConstraints: boolean;
  includeOpportunities: boolean;
  includeRisks: boolean;
  memoryTypes: string[];
  timeWindow?: number;
  maxMemories?: number;
}
