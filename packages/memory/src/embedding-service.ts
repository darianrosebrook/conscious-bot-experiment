/**
 * Embedding Service
 *
 * Provides text embedding generation using Ollama with embeddinggemma model.
 * Supports strategic embedding selection and query expansion for better retrieval.
 *
 * @author @darianrosebrook
 */

import { z } from 'zod';

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface EmbeddingModel {
  name: string;
  dimension: number;
  contextWindow: number;
  type: 'text' | 'code' | 'multimodal';
}

export interface EmbeddingResult {
  embedding: number[];
  model: EmbeddingModel;
  confidence: number;
  tokens: number;
}

export interface EmbeddingServiceConfig {
  ollamaHost: string;
  embeddingModel: string;
  dimension: number;
  maxRetries: number;
  timeout: number;
  batchSize: number;
}

const DEFAULT_CONFIG: Required<EmbeddingServiceConfig> = {
  ollamaHost: 'http://localhost:11434',
  embeddingModel: 'embeddinggemma',
  dimension: 768,
  maxRetries: 3,
  timeout: 30000,
  batchSize: 5,
};

// Available embedding models with their specifications
const EMBEDDING_MODELS: Record<string, EmbeddingModel> = {
  embeddinggemma: {
    name: 'embeddinggemma',
    dimension: 768,
    contextWindow: 8192,
    type: 'text',
  },
  'all-minilm': {
    name: 'all-minilm',
    dimension: 384,
    contextWindow: 512,
    type: 'text',
  },
  'code-embeddings': {
    name: 'code-embeddings',
    dimension: 768,
    contextWindow: 2048,
    type: 'code',
  },
};

// ============================================================================
// Embedding Service Implementation
// ============================================================================

export class EmbeddingService {
  private config: Required<EmbeddingServiceConfig>;
  private cache: Map<string, { embedding: number[]; expiresAt: number }> =
    new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(config: Partial<EmbeddingServiceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate embedding for text using Ollama
   */
  async embed(text: string): Promise<EmbeddingResult> {
    // Check cache first
    const cacheKey = this.getCacheKey(text);
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      const model = EMBEDDING_MODELS[this.config.embeddingModel];
      return {
        embedding: cached.embedding,
        model,
        confidence: 0.95, // Cached results have high confidence
        tokens: this.estimateTokens(text),
      };
    }

    // Select appropriate model based on content type
    const model = this.selectModel(text);

    try {
      const response = await this.callOllama(text, model.name);

      // Validate embedding dimensions
      if (response.embedding.length !== model.dimension) {
        throw new Error(
          `Embedding dimension mismatch: expected ${model.dimension}, got ${response.embedding.length}`
        );
      }

      // Cache the result
      this.cache.set(cacheKey, {
        embedding: response.embedding,
        expiresAt: Date.now() + this.CACHE_TTL,
      });

      return {
        embedding: response.embedding,
        model,
        confidence: this.calculateConfidence(text, response),
        tokens: response.tokens || this.estimateTokens(text),
      };
    } catch (error) {
      console.error(`Embedding generation failed: ${error}`);
      throw new Error(`Failed to generate embedding: ${error}`);
    }
  }

  /**
   * Strategic embedding with model selection based on content
   */
  async embedWithStrategy(
    text: string,
    contentType?: string,
    domainHint?: string
  ): Promise<EmbeddingResult> {
    // Select model based on content analysis
    const model = this.selectStrategicModel(text, contentType, domainHint);

    // Add domain context if available
    const enhancedText = domainHint ? `${domainHint}: ${text}` : text;

    return this.embed(enhancedText);
  }

  /**
   * Batch embedding generation
   */
  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    const results: EmbeddingResult[] = [];

    // Process in batches to avoid overwhelming Ollama
    for (let i = 0; i < texts.length; i += this.config.batchSize) {
      const batch = texts.slice(i, i + this.config.batchSize);
      const batchPromises = batch.map((text) => this.embed(text));
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Expand query with synonyms for better recall
   */
  async expandQuery(query: string): Promise<string> {
    const words = query.toLowerCase().split(/\s+/);
    const expandedWords: string[] = [];

    for (const word of words) {
      expandedWords.push(word);

      // Add synonyms for important terms
      const synonyms = this.getSynonyms(word);
      if (synonyms.length > 0) {
        // Limit to 2 synonyms per word to avoid query explosion
        expandedWords.push(...synonyms.slice(0, 2));
      }
    }

    // Remove duplicates and reconstruct query
    const uniqueWords = [...new Set(expandedWords)];
    return uniqueWords.join(' ');
  }

  /**
   * Calculate confidence score for embedding
   */
  private calculateConfidence(text: string, response: any): number {
    let confidence = 0.8; // Base confidence

    // Penalize for very short or very long texts
    const length = text.length;
    if (length < 10) {
      confidence -= 0.2;
    } else if (length > 2000) {
      confidence -= 0.1;
    }

    // Boost confidence for technical content
    if (this.containsTechnicalTerms(text)) {
      confidence += 0.1;
    }

    // Boost confidence for well-structured content
    if (this.isWellStructured(text)) {
      confidence += 0.05;
    }

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  /**
   * Select appropriate embedding model based on content
   */
  private selectModel(text: string): EmbeddingModel {
    // Check if we should use a specialized model
    if (this.isCodeContent(text)) {
      return EMBEDDING_MODELS['code-embeddings'];
    }

    if (this.isTechnicalContent(text)) {
      return EMBEDDING_MODELS['embeddinggemma'];
    }

    // Default to general text model
    return EMBEDDING_MODELS[this.config.embeddingModel];
  }

  /**
   * Strategic model selection with content analysis
   */
  private selectStrategicModel(
    text: string,
    contentType?: string,
    domainHint?: string
  ): EmbeddingModel {
    // Use content type hint if provided
    if (contentType === 'code') {
      return EMBEDDING_MODELS['code-embeddings'];
    }

    if (contentType === 'technical' || domainHint?.includes('minecraft')) {
      return EMBEDDING_MODELS['embeddinggemma'];
    }

    // Analyze content to make intelligent choice
    return this.selectModel(text);
  }

  /**
   * Call Ollama API for embedding generation
   */
  private async callOllama(
    text: string,
    modelName: string
  ): Promise<{
    embedding: number[];
    tokens: number;
  }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(`${this.config.ollamaHost}/api/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelName,
          prompt: text,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          `Ollama API error: ${response.status} ${response.statusText}`
        );
      }

      const data = (await response.json()) as {
        embedding: number[];
        tokens?: number;
      };

      return {
        embedding: data.embedding,
        tokens: data.tokens || this.estimateTokens(text),
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Get synonyms for a word (simplified implementation)
   */
  private getSynonyms(word: string): string[] {
    // Simple synonym mapping - in production, this would use a proper thesaurus
    const synonymMap: Record<string, string[]> = {
      craft: ['build', 'make', 'create'],
      mine: ['dig', 'excavate', 'extract'],
      tool: ['instrument', 'implement', 'device'],
      weapon: ['arm', 'armament', 'arms'],
      armor: ['armour', 'protection', 'defense'],
      build: ['construct', 'assemble', 'fabricate'],
      redstone: ['circuit', 'mechanism', 'automation'],
      farm: ['cultivate', 'grow', 'agriculture'],
      explore: ['investigate', 'discover', 'search'],
      survive: ['endure', 'persist', 'live'],
    };

    return synonymMap[word] || [];
  }

  /**
   * Check if text contains technical terms
   */
  private containsTechnicalTerms(text: string): boolean {
    const technicalTerms = [
      'algorithm',
      'function',
      'class',
      'method',
      'interface',
      'database',
      'api',
      'framework',
      'library',
      'component',
      'minecraft',
      'redstone',
      'crafting',
      'mining',
      'building',
      'survival',
      'creative',
      'mod',
      'plugin',
      'server',
    ];

    const lowerText = text.toLowerCase();
    return technicalTerms.some((term) => lowerText.includes(term));
  }

  /**
   * Check if text appears well-structured
   */
  private isWellStructured(text: string): boolean {
    // Simple heuristics for structure
    const hasPunctuation = /[.!?]/.test(text);
    const hasCapitalization = /[A-Z]/.test(text);
    const hasReasonableLength = text.length > 20 && text.length < 1000;

    return hasPunctuation && hasCapitalization && hasReasonableLength;
  }

  /**
   * Check if content appears to be code
   */
  private isCodeContent(text: string): boolean {
    const codePatterns = [
      /{[^{}]*}/, // Curly braces
      /\bfunction\b/,
      /\bclass\b/,
      /\bconst\b/,
      /\blet\b/,
      /\bvar\b/,
      /\/\/.*$/,
      /\/\*.*\*\//, // Comments
      /#[a-zA-Z_]/, // Python-style comments
      /\bimport\b/,
      /\bexport\b/,
      /\bfrom\b/, // Module imports
    ];

    return codePatterns.some((pattern) => pattern.test(text));
  }

  /**
   * Check if content is technical in nature
   */
  private isTechnicalContent(text: string): boolean {
    const technicalIndicators = [
      'implementation',
      'architecture',
      'design',
      'pattern',
      'algorithm',
      'performance',
      'optimization',
      'efficiency',
      'scalability',
      'minecraft',
      'gameplay',
      'mechanics',
      'strategy',
      'tactics',
    ];

    const lowerText = text.toLowerCase();
    const technicalCount = technicalIndicators.filter((term) =>
      lowerText.includes(term)
    ).length;

    return technicalCount >= 2 || this.containsTechnicalTerms(text);
  }

  /**
   * Generate cache key for text
   */
  private getCacheKey(text: string): string {
    // Simple hash for cache key - in production, use proper hashing
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `${hash}-${this.config.embeddingModel}`;
  }

  /**
   * Estimate token count (rough approximation)
   */
  private estimateTokens(text: string): number {
    // Rough approximation: 1 token ≈ 4 characters for English text
    return Math.ceil(text.length / 4);
  }

  /**
   * Clear embedding cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; hitRate: number; keys: string[] } {
    return {
      size: this.cache.size,
      hitRate: 0, // Would need tracking for actual hit rate
      keys: Array.from(this.cache.keys()),
    };
  }

  /**
   * Health check for embedding service
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    model: string;
    responseTime: number;
  }> {
    const startTime = Date.now();

    try {
      await this.embed('test query');
      const responseTime = Date.now() - startTime;

      return {
        status: 'healthy',
        model: this.config.embeddingModel,
        responseTime,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        model: this.config.embeddingModel,
        responseTime: Date.now() - startTime,
      };
    }
  }
}
