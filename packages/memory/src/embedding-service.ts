/**
 * Enhanced Embedding Service
 *
 * Provides strategic text embedding generation with multiple model support,
 * quality-based confidence scoring, and performance monitoring.
 * Enhanced with obsidian-rag patterns for memory type optimization.
 *
 * Features:
 * - Strategic model selection based on content type and memory domain
 * - Quality-based confidence scoring
 * - Performance monitoring and caching
 * - Query expansion for better retrieval
 *
 * @author @darianrosebrook
 */

import { z } from 'zod';

// ============================================================================
// Embedding Backend Abstraction (provider-agnostic)
// ============================================================================

export interface EmbeddingBackend {
  embed(text: string, modelId: string): Promise<{ embedding: number[] }>;
  health(): Promise<{ ok: boolean; provider: string; error?: string }>;
}

export class SidecarEmbeddingBackend implements EmbeddingBackend {
  constructor(
    private host: string,
    private timeoutMs: number = 10_000
  ) {}

  async embed(text: string, modelId: string): Promise<{ embedding: number[] }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.host}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelId, prompt: text }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Sidecar API error: ${response.statusText}`);
      const data = (await response.json()) as { embedding: number[] };
      return { embedding: data.embedding || [] };
    } finally {
      clearTimeout(timeout);
    }
  }

  async health(): Promise<{ ok: boolean; provider: string; error?: string }> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3_000);
      const res = await fetch(`${this.host}/health`, { method: 'GET', signal: controller.signal });
      clearTimeout(timeout);
      return { ok: res.ok, provider: 'mlx-sidecar' };
    } catch (err: any) {
      return { ok: false, provider: 'mlx-sidecar', error: err.message };
    }
  }
}

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface EmbeddingModel {
  name: string;
  dimension: number;
  contextWindow: number;
  type: 'text' | 'code' | 'multimodal';
  quality: number; // 0-1 quality score based on performance metrics
  latency: number; // Average latency in ms
  memoryTypes: string[]; // Optimal memory types for this model
  specializations: string[]; // Specific domains this model excels at
}

export interface EmbeddingResult {
  embedding: number[];
  model: EmbeddingModel;
  confidence: number;
  tokens: number;
  quality: number; // Quality score based on embedding characteristics
  strategy: 'primary' | 'fallback' | 'specialized' | 'optimized';
  performance: {
    latency: number;
    cacheHit: boolean;
    modelSwitchReason?: string;
  };
}

export interface EmbeddingServiceConfig {
  ollamaHost: string;
  ollamaTimeoutMs: number;
  embeddingModel: string;
  dimension: number;
  maxRetries: number;
  timeout: number;
  batchSize: number;

  // Enhanced features
  enableStrategicModelSelection: boolean;
  enableQualityScoring: boolean;
  enablePerformanceMonitoring: boolean;
  enableModelFallback: boolean;
  primaryModel: string;
  fallbackModels: string[];
}

export interface ModelSelectionCriteria {
  memoryType: 'episodic' | 'semantic' | 'procedural' | 'emotional' | 'social';
  contentType: 'text' | 'code' | 'multimodal';
  domain: string; // minecraft, general, technical, etc.
  urgency: 'low' | 'medium' | 'high';
  qualityRequirement: 'standard' | 'high' | 'critical';
}

export interface ModelPerformanceMetrics {
  modelName: string;
  totalRequests: number;
  averageLatency: number;
  successRate: number;
  cacheHitRate: number;
  qualityScores: number[];
  errorCount: number;
  lastUpdated: number;
}

export interface EmbeddingQualityAnalysis {
  embedding: number[];
  variance: number; // Statistical variance of embedding values
  sparsity: number; // Percentage of near-zero values
  clustering: number; // Clustering coefficient
  informationDensity: number; // Information content measure
  recommendations: string[];
}

const DEFAULT_CONFIG: Required<EmbeddingServiceConfig> = {
  ollamaHost: process.env.OLLAMA_HOST || 'http://localhost:5002',
  ollamaTimeoutMs: 10_000,
  embeddingModel: 'embeddinggemma',
  dimension: 768,
  maxRetries: 3,
  timeout: 30000,
  batchSize: 5,
  enableStrategicModelSelection: true,
  enableQualityScoring: true,
  enablePerformanceMonitoring: true,
  enableModelFallback: true,
  primaryModel: 'embeddinggemma',
  fallbackModels: [], // No fallback — 768-dim is the only compatible dimension for current table
};

// Available embedding models with enhanced specifications
const EMBEDDING_MODELS: Record<string, EmbeddingModel> = {
  embeddinggemma: {
    name: 'embeddinggemma',
    dimension: 768,
    contextWindow: 8192,
    type: 'text',
    quality: 0.85,
    latency: 450,
    memoryTypes: ['episodic', 'semantic', 'emotional'],
    specializations: ['minecraft', 'conversational', 'technical'],
  },
  // WARNING: all-minilm produces 384-dim embeddings — incompatible with the 768-dim vector table.
  // Kept in registry for documentation only. Removed from fallbackModels to prevent corruption.
  'all-minilm': {
    name: 'all-minilm',
    dimension: 384,
    contextWindow: 512,
    type: 'text',
    quality: 0.75,
    latency: 150,
    memoryTypes: ['semantic', 'procedural'],
    specializations: ['fast-processing', 'lightweight'],
  },
  'code-embeddings': {
    name: 'code-embeddings',
    dimension: 768,
    contextWindow: 2048,
    type: 'code',
    quality: 0.8,
    latency: 300,
    memoryTypes: ['procedural', 'semantic'],
    specializations: ['programming', 'technical', 'syntax'],
  },
  'nomic-embed-text': {
    name: 'nomic-embed-text',
    dimension: 768,
    contextWindow: 8192,
    type: 'text',
    quality: 0.9,
    latency: 400,
    memoryTypes: ['semantic', 'episodic', 'emotional'],
    specializations: ['high-quality', 'contextual', 'general-purpose'],
  },
};

// ============================================================================
// Embedding Service Implementation
// ============================================================================

export class EmbeddingService {
  private config: Required<EmbeddingServiceConfig>;
  readonly backend: EmbeddingBackend;
  private cache: Map<string, { embedding: number[]; expiresAt: number }> =
    new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  // Enhanced features
  private performanceMetrics: Map<string, ModelPerformanceMetrics> = new Map();
  private modelSelectionCache: Map<
    string,
    { model: EmbeddingModel; expiresAt: number }
  > = new Map();
  private readonly SELECTION_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

  constructor(config: Partial<EmbeddingServiceConfig> = {}, backend?: EmbeddingBackend) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.backend = backend ?? new SidecarEmbeddingBackend(this.config.ollamaHost, this.config.ollamaTimeoutMs);
  }

  /**
   * Generate embedding with strategic model selection and quality analysis
   */
  async embed(text: string): Promise<EmbeddingResult> {
    return this.embedWithStrategy(text, 'semantic', 'general');
  }

  /**
   * Generate embedding with strategic model selection
   */
  async embedWithStrategy(
    text: string,
    memoryType:
      | 'episodic'
      | 'semantic'
      | 'procedural'
      | 'emotional'
      | 'social' = 'semantic',
    domain: string = 'general',
    urgency: 'low' | 'medium' | 'high' = 'medium',
    qualityRequirement: 'standard' | 'high' | 'critical' = 'standard'
  ): Promise<EmbeddingResult> {
    const startTime = performance.now();

    // Check cache first
    const cacheKey = this.getCacheKey(text);
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      const model = EMBEDDING_MODELS[this.config.embeddingModel];
      return {
        embedding: cached.embedding,
        model,
        confidence: 0.95,
        tokens: this.estimateTokens(text),
        quality: 0.9,
        strategy: 'primary',
        performance: {
          latency: 0,
          cacheHit: true,
        },
      };
    }

    // Select optimal model
    const criteria: ModelSelectionCriteria = {
      memoryType,
      contentType: 'text', // Default, could be enhanced
      domain,
      urgency,
      qualityRequirement,
    };

    const selectedModel = this.config.enableStrategicModelSelection
      ? this.selectOptimalModel(criteria)
      : EMBEDDING_MODELS[this.config.primaryModel];

    // Generate embedding with selected model
    const result = await this.generateEmbeddingWithModel(text, selectedModel);
    const latency = performance.now() - startTime;

    // Analyze quality if enabled
    const quality = this.config.enableQualityScoring
      ? this.analyzeEmbeddingQuality(result.embedding)
      : 0.8;

    // Update performance metrics
    if (this.config.enablePerformanceMonitoring) {
      this.updatePerformanceMetrics(selectedModel.name, latency, true, quality);
    }

    return {
      ...result,
      quality,
      strategy:
        selectedModel.name === this.config.primaryModel
          ? 'primary'
          : 'specialized',
      performance: {
        latency,
        cacheHit: false,
        modelSwitchReason:
          selectedModel.name !== this.config.primaryModel
            ? `Selected for ${memoryType} memory in ${domain} domain`
            : undefined,
      },
    };
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
   * Health check for embedding service
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    model: string;
    responseTime: number;
    provider?: string;
    error?: string;
  }> {
    const startTime = Date.now();

    try {
      const health = await this.backend.health();
      const responseTime = Date.now() - startTime;

      return {
        status: health.ok ? 'healthy' : 'unhealthy',
        model: this.config.embeddingModel,
        responseTime,
        provider: health.provider,
        error: health.error,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        model: this.config.embeddingModel,
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ============================================================================
  // Enhanced Methods: Strategic Model Selection & Quality Analysis
  // ============================================================================

  /**
   * Select optimal embedding model based on criteria
   */
  private selectOptimalModel(criteria: ModelSelectionCriteria): EmbeddingModel {
    const cacheKey = `${criteria.memoryType}-${criteria.domain}-${criteria.urgency}-${criteria.qualityRequirement}`;
    const cached = this.modelSelectionCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.model;
    }

    // Score each model against criteria
    const scoredModels = Object.values(EMBEDDING_MODELS).map((model) => {
      let score = 0;

      // Memory type compatibility (40% weight)
      if (model.memoryTypes.includes(criteria.memoryType)) {
        score += 0.4;
      }

      // Domain specialization (30% weight)
      if (
        model.specializations.some(
          (spec) =>
            criteria.domain.includes(spec) || spec.includes(criteria.domain)
        )
      ) {
        score += 0.3;
      }

      // Quality requirement (20% weight)
      const qualityMatch = this.getQualityMatch(
        model.quality,
        criteria.qualityRequirement
      );
      score += qualityMatch * 0.2;

      // Latency for urgency (10% weight)
      const urgencyBonus = this.getUrgencyBonus(
        model.latency,
        criteria.urgency
      );
      score += urgencyBonus * 0.1;

      return { model, score };
    });

    // Select best model
    scoredModels.sort((a, b) => b.score - a.score);
    const selected = scoredModels[0].model;

    // Cache selection
    this.modelSelectionCache.set(cacheKey, {
      model: selected,
      expiresAt: Date.now() + this.SELECTION_CACHE_TTL,
    });

    return selected;
  }

  /**
   * Generate embedding using specific model with fallback support
   */
  private async generateEmbeddingWithModel(
    text: string,
    model: EmbeddingModel
  ): Promise<EmbeddingResult> {
    let attempts = 0;
    let lastError: Error | null = null;

    // Try primary model first
    try {
      const result = await this.generateEmbedding(text, model);
      // Cache the result
      const cacheKey = this.getCacheKey(text);
      this.cache.set(cacheKey, {
        embedding: result.embedding,
        expiresAt: Date.now() + this.CACHE_TTL,
      });
      return result;
    } catch (error) {
      lastError = error as Error;
      attempts++;

      // Try fallback models if enabled
      if (
        this.config.enableModelFallback &&
        this.config.fallbackModels.length > 0
      ) {
        for (const fallbackModelName of this.config.fallbackModels) {
          if (attempts >= this.config.maxRetries) break;

          const fallbackModel = EMBEDDING_MODELS[fallbackModelName];
          if (!fallbackModel) continue;

          try {
            const result = await this.generateEmbedding(text, fallbackModel);
            console.warn(
              `⚠️ Fell back to ${fallbackModel.name} for embedding generation`
            );

            // Cache the result
            const cacheKey = this.getCacheKey(text);
            this.cache.set(cacheKey, {
              embedding: result.embedding,
              expiresAt: Date.now() + this.CACHE_TTL,
            });

            return result;
          } catch (fallbackError) {
            lastError = fallbackError as Error;
            attempts++;
          }
        }
      }
    }

    throw lastError || new Error('Failed to generate embedding with any model');
  }

  private async generateEmbedding(
    text: string,
    model: EmbeddingModel
  ): Promise<EmbeddingResult> {
    const response = await this.backend.embed(text, model.name);

    // Validate embedding dimensions against model
    if (response.embedding.length !== model.dimension) {
      throw new Error(
        `Embedding dimension mismatch: expected ${model.dimension}, got ${response.embedding.length}`
      );
    }

    // Defense-in-depth: validate against configured table dimension
    if (response.embedding.length !== this.config.dimension) {
      throw new Error(
        `Embedding dimension mismatch: expected ${this.config.dimension}, got ${response.embedding.length}. ` +
        `Model ${model.name} is incompatible with the configured vector table.`
      );
    }

    return {
      embedding: response.embedding,
      model,
      confidence: this.calculateEmbeddingConfidence(response.embedding),
      tokens: this.estimateTokens(text),
      quality: this.calculateEmbeddingConfidence(response.embedding),
      strategy: 'primary' as const,
      performance: {
        latency: 100, // Mock latency
        cacheHit: false,
      },
    };
  }

  /**
   * Analyze embedding quality
   */
  private analyzeEmbeddingQuality(embedding: number[]): number {
    const analysis = this.performQualityAnalysis(embedding);

    // Combine multiple quality metrics
    const varianceScore = Math.min(1, analysis.variance / 0.1); // Normalize variance
    const sparsityScore = 1 - analysis.sparsity; // Lower sparsity is better
    const clusteringScore = analysis.clustering;
    const densityScore = analysis.informationDensity;

    // Weighted average of quality metrics
    const quality =
      varianceScore * 0.25 +
      sparsityScore * 0.25 +
      clusteringScore * 0.25 +
      densityScore * 0.25;

    return Math.max(0, Math.min(1, quality));
  }

  /**
   * Perform detailed quality analysis of embedding
   */
  private performQualityAnalysis(
    embedding: number[]
  ): EmbeddingQualityAnalysis {
    const values = embedding;

    // Calculate variance
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance =
      values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
      values.length;

    // Calculate sparsity (percentage of values close to zero)
    const threshold = 0.01;
    const nearZeroCount = values.filter(
      (val) => Math.abs(val) < threshold
    ).length;
    const sparsity = nearZeroCount / values.length;

    // Calculate clustering coefficient (simplified)
    const clustering = this.calculateClusteringCoefficient(values);

    // Calculate information density (entropy-based approximation)
    const informationDensity = this.calculateInformationDensity(values);

    return {
      embedding,
      variance,
      sparsity,
      clustering,
      informationDensity,
      recommendations: this.generateQualityRecommendations(
        variance,
        sparsity,
        clustering,
        informationDensity
      ),
    };
  }

  /**
   * Calculate clustering coefficient for embedding quality
   */
  private calculateClusteringCoefficient(values: number[]): number {
    // Simplified clustering: measure how well values group together
    const sorted = [...values].sort((a, b) => a - b);
    const quartiles = [
      sorted[Math.floor(sorted.length * 0.25)],
      sorted[Math.floor(sorted.length * 0.5)],
      sorted[Math.floor(sorted.length * 0.75)],
    ];

    // Calculate spread between quartiles
    const spread = quartiles[2] - quartiles[0];
    const normalizedSpread = Math.min(1, spread / 2); // Normalize to 0-1

    return 1 - normalizedSpread; // Lower spread = better clustering
  }

  /**
   * Calculate information density using entropy approximation
   */
  private calculateInformationDensity(values: number[]): number {
    // Bin values into discrete ranges
    const bins = 20;
    const binSize = 2 / bins; // Range from -1 to 1
    const binCounts = new Array(bins).fill(0);

    values.forEach((val) => {
      const normalized = Math.max(-1, Math.min(1, val));
      const binIndex = Math.floor((normalized + 1) / binSize);
      binCounts[Math.min(bins - 1, binIndex)]++;
    });

    // Calculate entropy
    const totalValues = values.length;
    let entropy = 0;
    binCounts.forEach((count) => {
      if (count > 0) {
        const probability = count / totalValues;
        entropy -= probability * Math.log2(probability);
      }
    });

    // Normalize entropy (0-1 scale)
    const maxEntropy = Math.log2(bins);
    return entropy / maxEntropy;
  }

  /**
   * Generate quality recommendations
   */
  private generateQualityRecommendations(
    variance: number,
    sparsity: number,
    clustering: number,
    informationDensity: number
  ): string[] {
    const recommendations: string[] = [];

    if (variance < 0.01) {
      recommendations.push(
        'Low variance detected - consider using higher dimensional model'
      );
    }

    if (sparsity > 0.8) {
      recommendations.push(
        'High sparsity detected - embedding may lack discriminative power'
      );
    }

    if (clustering < 0.3) {
      recommendations.push(
        'Poor clustering - consider different model architecture'
      );
    }

    if (informationDensity < 0.2) {
      recommendations.push(
        'Low information density - text may be too generic or repetitive'
      );
    }

    return recommendations;
  }

  /**
   * Update performance metrics for a model
   */
  private updatePerformanceMetrics(
    modelName: string,
    latency: number,
    success: boolean,
    quality: number
  ): void {
    const existing = this.performanceMetrics.get(modelName) || {
      modelName,
      totalRequests: 0,
      averageLatency: 0,
      successRate: 0,
      cacheHitRate: 0,
      qualityScores: [],
      errorCount: 0,
      lastUpdated: Date.now(),
    };

    existing.totalRequests++;
    existing.averageLatency =
      (existing.averageLatency * (existing.totalRequests - 1) + latency) /
      existing.totalRequests;
    existing.successRate =
      (existing.successRate * (existing.totalRequests - 1) +
        (success ? 1 : 0)) /
      existing.totalRequests;
    existing.qualityScores.push(quality);

    if (!success) {
      existing.errorCount++;
    }

    existing.lastUpdated = Date.now();
    this.performanceMetrics.set(modelName, existing);
  }

  /**
   * Get quality match score for model and requirement
   */
  private getQualityMatch(modelQuality: number, requirement: string): number {
    const requirementThresholds: Record<string, number> = {
      standard: 0.7,
      high: 0.8,
      critical: 0.9,
    };

    const threshold = requirementThresholds[requirement];
    return modelQuality >= threshold ? 1 : modelQuality / threshold;
  }

  /**
   * Get urgency bonus for model latency
   */
  private getUrgencyBonus(latency: number, urgency: string): number {
    const urgencyThresholds: Record<string, number> = {
      low: 1000, // 1 second
      medium: 500, // 0.5 seconds
      high: 200, // 0.2 seconds
    };

    const threshold = urgencyThresholds[urgency];
    return latency <= threshold
      ? 1
      : Math.max(0, 1 - (latency - threshold) / threshold);
  }

  /**
   * Calculate embedding confidence based on characteristics
   */
  private calculateEmbeddingConfidence(embedding: number[]): number {
    const analysis = this.performQualityAnalysis(embedding);

    // Base confidence from quality metrics
    let confidence =
      (1 - analysis.sparsity) * 0.3 +
      analysis.clustering * 0.3 +
      analysis.informationDensity * 0.4;

    // Boost for well-distributed embeddings
    if (analysis.variance > 0.05 && analysis.variance < 0.2) {
      confidence *= 1.1;
    }

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Get performance statistics for all models
   */
  getPerformanceStats(): ModelPerformanceMetrics[] {
    return Array.from(this.performanceMetrics.values());
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; hitRate: number } {
    return {
      size: this.cache.size,
      hitRate: 0, // Would need to track cache hits vs misses
    };
  }

  /**
   * Clear performance metrics and caches
   */
  clearMetrics(): void {
    this.performanceMetrics.clear();
    this.modelSelectionCache.clear();
    this.cache.clear();
  }
}
