/**
 * Chunking Service
 *
 * Intelligently breaks down text content into semantic chunks for better
 * vector search retrieval. Supports overlap, metadata preservation, and
 * various chunking strategies optimized for Minecraft content.
 *
 * @author @darianrosebrook
 */

import { z } from 'zod';

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface ChunkingConfig {
  maxTokens: number;
  overlapPercent: number;
  semanticSplitting: boolean;
  preserveMetadata: boolean;
  minChunkSize: number;
  maxChunkSize: number;
}

export interface ChunkingMetadata {
  type: 'experience' | 'thought' | 'knowledge' | 'observation' | 'dialogue';
  confidence: number;
  source: string;
  timestamp: number;
  world?: string;
  position?: { x: number; y: number; z: number };
  entities?: string[];
  topics?: string[];
  sentiment?: 'positive' | 'negative' | 'neutral';
  importance?: number;

  // Memory decay tracking properties
  lastAccessed?: number;
  accessCount?: number;
}

export interface TextChunk {
  id: string;
  content: string;
  metadata: ChunkingMetadata;
  startIndex: number;
  endIndex: number;
  tokens: number;
  overlaps: {
    previous?: number;
    next?: number;
  };
}

const DEFAULT_CONFIG: ChunkingConfig = {
  maxTokens: 900,
  overlapPercent: 0.12,
  semanticSplitting: true,
  preserveMetadata: true,
  minChunkSize: 50,
  maxChunkSize: 2000,
};

// ============================================================================
// Chunking Service Implementation
// ============================================================================

export class ChunkingService {
  private config: ChunkingConfig;

  constructor(config: Partial<ChunkingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Chunk text content into semantic pieces
   */
  async chunkText(
    text: string,
    metadata: ChunkingMetadata,
    customConfig?: Partial<ChunkingConfig>
  ): Promise<TextChunk[]> {
    const config = { ...this.config, ...customConfig };

    // Validate inputs
    if (!text || text.length === 0) {
      return [];
    }

    if (text.length < config.minChunkSize) {
      return [this.createChunk(text, 0, text.length, metadata, config)];
    }

    // Choose chunking strategy based on content type
    if (config.semanticSplitting) {
      return this.semanticChunking(text, metadata, config);
    } else {
      return this.fixedChunking(text, metadata, config);
    }
  }

  /**
   * Chunk cognitive thoughts with special handling
   */
  async chunkCognitiveThought(
    thought: {
      content: string;
      type: string;
      attribution: string;
      context?: any;
      metadata?: any;
    },
    customConfig?: Partial<ChunkingConfig>
  ): Promise<TextChunk[]> {
    const metadata: ChunkingMetadata = {
      type: thought.type as any,
      confidence: 0.8,
      source: thought.attribution,
      timestamp: Date.now(),
      entities: this.extractEntities(thought.content),
      topics: this.extractTopics(thought.content),
      sentiment: this.analyzeSentiment(thought.content),
      importance: this.calculateImportance(thought.content, thought.type),
    };

    // Add spatial context if available
    if (thought.context?.position) {
      metadata.world = thought.context.world;
      metadata.position = thought.context.position;
    }

    return this.chunkText(thought.content, metadata, customConfig);
  }

  /**
   * Chunk Minecraft experiences with domain-specific handling
   */
  async chunkExperience(
    experience: {
      content: string;
      type: 'crafting' | 'building' | 'exploration' | 'combat' | 'farming';
      location?: {
        world: string;
        position: { x: number; y: number; z: number };
      };
      entities?: string[];
      outcome?: 'success' | 'failure' | 'partial';
      lessons?: string[];
    },
    customConfig?: Partial<ChunkingConfig>
  ): Promise<TextChunk[]> {
    const metadata: ChunkingMetadata = {
      type: 'experience',
      confidence: 0.9,
      source: 'minecraft',
      timestamp: Date.now(),
      world: experience.location?.world,
      position: experience.location?.position,
      entities: experience.entities,
      topics: [experience.type, ...(experience.lessons || [])],
      sentiment:
        experience.outcome === 'success'
          ? 'positive'
          : experience.outcome === 'failure'
            ? 'negative'
            : 'neutral',
      importance: this.calculateExperienceImportance(experience),
    };

    return this.chunkText(experience.content, metadata, customConfig);
  }

  /**
   * Merge overlapping chunks to reduce redundancy
   */
  mergeOverlappingChunks(chunks: TextChunk[]): TextChunk[] {
    if (chunks.length <= 1) return chunks;

    const merged: TextChunk[] = [];
    let current = chunks[0];

    for (let i = 1; i < chunks.length; i++) {
      const next = chunks[i];

      // Check if chunks overlap significantly
      const overlapRatio = this.calculateOverlapRatio(current, next);

      if (overlapRatio > 0.3 && this.canMergeChunks(current, next)) {
        // Merge chunks
        current = this.mergeChunks(current, next);
      } else {
        merged.push(current);
        current = next;
      }
    }

    merged.push(current);
    return merged;
  }

  /**
   * Semantic chunking that respects sentence and paragraph boundaries
   */
  private semanticChunking(
    text: string,
    metadata: ChunkingMetadata,
    config: ChunkingConfig
  ): TextChunk[] {
    const chunks: TextChunk[] = [];

    // Split into sentences first
    const sentences = this.splitIntoSentences(text);

    let currentChunk = '';
    let currentTokens = 0;
    let startIndex = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      const sentenceTokens = this.estimateTokens(sentence);

      // Check if adding this sentence would exceed token limit
      if (
        currentTokens + sentenceTokens > config.maxTokens &&
        currentChunk.length > 0
      ) {
        // Create chunk with current content
        chunks.push(
          this.createChunk(
            currentChunk.trim(),
            startIndex,
            startIndex + currentChunk.length,
            metadata,
            config
          )
        );

        // Start new chunk with overlap
        const overlapTokens = Math.floor(currentTokens * config.overlapPercent);
        const overlapText = this.getOverlapText(currentChunk, overlapTokens);
        currentChunk = overlapText + ' ' + sentence;
        currentTokens = this.estimateTokens(currentChunk);
        startIndex = text.indexOf(
          sentence,
          startIndex + currentChunk.length - overlapText.length
        );
      } else {
        currentChunk += (currentChunk ? ' ' : '') + sentence;
        currentTokens += sentenceTokens;
      }
    }

    // Add final chunk
    if (currentChunk.trim()) {
      chunks.push(
        this.createChunk(
          currentChunk.trim(),
          startIndex,
          text.length,
          metadata,
          config
        )
      );
    }

    return this.mergeOverlappingChunks(chunks);
  }

  /**
   * Fixed-size chunking with overlap
   */
  private fixedChunking(
    text: string,
    metadata: ChunkingMetadata,
    config: ChunkingConfig
  ): TextChunk[] {
    const chunks: TextChunk[] = [];
    const chunkSize = Math.min(config.maxChunkSize, text.length);
    const overlapSize = Math.floor(chunkSize * config.overlapPercent);

    for (let i = 0; i < text.length; i += chunkSize - overlapSize) {
      const end = Math.min(i + chunkSize, text.length);
      const chunkText = text.substring(i, end);

      if (chunkText.length >= config.minChunkSize) {
        chunks.push(this.createChunk(chunkText, i, end, metadata, config));
      }
    }

    return chunks;
  }

  /**
   * Create a single chunk with metadata
   */
  private createChunk(
    content: string,
    startIndex: number,
    endIndex: number,
    metadata: ChunkingMetadata,
    config: ChunkingConfig
  ): TextChunk {
    const tokens = this.estimateTokens(content);
    const id = this.generateChunkId(content, startIndex, metadata.timestamp);

    return {
      id,
      content,
      metadata,
      startIndex,
      endIndex,
      tokens,
      overlaps: {
        previous:
          startIndex > 0 ? Math.floor(tokens * config.overlapPercent) : 0,
        next:
          endIndex < this.estimateTokens(content) * 4
            ? Math.floor(tokens * config.overlapPercent)
            : 0,
      },
    };
  }

  /**
   * Merge two compatible chunks
   */
  private mergeChunks(chunk1: TextChunk, chunk2: TextChunk): TextChunk {
    const mergedContent = chunk1.content + ' ' + chunk2.content;
    const mergedTokens = chunk1.tokens + chunk2.tokens;

    return {
      id: this.generateChunkId(
        mergedContent,
        chunk1.startIndex,
        chunk1.metadata.timestamp
      ),
      content: mergedContent,
      metadata: {
        ...chunk1.metadata,
        confidence:
          (chunk1.metadata.confidence + chunk2.metadata.confidence) / 2,
        importance: Math.max(
          chunk1.metadata.importance || 0,
          chunk2.metadata.importance || 0
        ),
      },
      startIndex: chunk1.startIndex,
      endIndex: chunk2.endIndex,
      tokens: mergedTokens,
      overlaps: chunk2.overlaps,
    };
  }

  /**
   * Calculate overlap ratio between chunks
   */
  private calculateOverlapRatio(chunk1: TextChunk, chunk2: TextChunk): number {
    const overlapTokens = Math.min(
      chunk1.overlaps.next || 0,
      chunk2.overlaps.previous || 0
    );
    const totalTokens = chunk1.tokens + chunk2.tokens;
    return totalTokens > 0 ? overlapTokens / totalTokens : 0;
  }

  /**
   * Check if chunks can be merged
   */
  private canMergeChunks(chunk1: TextChunk, chunk2: TextChunk): boolean {
    // Don't merge chunks with different types
    if (chunk1.metadata.type !== chunk2.metadata.type) {
      return false;
    }

    // Don't merge chunks with very different confidence scores
    const confidenceDiff = Math.abs(
      chunk1.metadata.confidence - chunk2.metadata.confidence
    );
    if (confidenceDiff > 0.3) {
      return false;
    }

    // Don't merge chunks that are too large already
    if (chunk1.tokens + chunk2.tokens > this.config.maxTokens * 1.5) {
      return false;
    }

    return true;
  }

  /**
   * Get overlapping text for chunk transitions
   */
  private getOverlapText(text: string, overlapTokens: number): string {
    const words = text.split(' ');
    const overlapWords = Math.min(overlapTokens * 4, words.length); // Rough estimate
    return words.slice(-overlapWords).join(' ');
  }

  /**
   * Split text into sentences using various strategies
   */
  private splitIntoSentences(text: string): string[] {
    // Enhanced sentence splitting that handles various punctuation
    const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z])/);

    // Clean up and filter empty sentences
    return sentences.map((s) => s.trim()).filter((s) => s.length > 0);
  }

  /**
   * Extract entities mentioned in text
   */
  private extractEntities(text: string): string[] {
    const entities: string[] = [];

    // Minecraft-specific entities
    const minecraftEntities = [
      'creeper',
      'zombie',
      'skeleton',
      'spider',
      'enderman',
      'villager',
      'iron golem',
      'wolf',
      'cat',
      'horse',
      'cow',
      'sheep',
      'pig',
      'chicken',
      'diamond',
      'iron',
      'gold',
      'redstone',
      'coal',
      'emerald',
      'player',
    ];

    const lowerText = text.toLowerCase();
    for (const entity of minecraftEntities) {
      if (lowerText.includes(entity)) {
        entities.push(entity);
      }
    }

    return [...new Set(entities)];
  }

  /**
   * Extract topics from text
   */
  private extractTopics(text: string): string[] {
    const topics: string[] = [];

    // Minecraft topics
    const minecraftTopics = [
      'crafting',
      'mining',
      'building',
      'farming',
      'exploration',
      'combat',
      'redstone',
      'survival',
      'creative',
      'adventure',
      'nether',
      'end',
      'village',
      'cave',
      'mountain',
      'ocean',
    ];

    const lowerText = text.toLowerCase();
    for (const topic of minecraftTopics) {
      if (lowerText.includes(topic)) {
        topics.push(topic);
      }
    }

    return [...new Set(topics)];
  }

  /**
   * Analyze sentiment of text
   */
  private analyzeSentiment(text: string): 'positive' | 'negative' | 'neutral' {
    const positiveWords = [
      'success',
      'good',
      'great',
      'awesome',
      'perfect',
      'excellent',
    ];
    const negativeWords = [
      'fail',
      'bad',
      'terrible',
      'wrong',
      'error',
      'problem',
    ];

    const lowerText = text.toLowerCase();
    const positiveCount = positiveWords.filter((word) =>
      lowerText.includes(word)
    ).length;
    const negativeCount = negativeWords.filter((word) =>
      lowerText.includes(word)
    ).length;

    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  }

  /**
   * Calculate importance score for content
   */
  private calculateImportance(content: string, type: string): number {
    let importance = 0.5; // Base importance

    // Boost importance for certain types
    const typeBoosts: Record<string, number> = {
      decision: 0.2,
      planning: 0.15,
      experience: 0.1,
      observation: 0.05,
    };

    importance += typeBoosts[type] || 0;

    // Boost for content with entities or technical terms
    if (this.extractEntities(content).length > 0) {
      importance += 0.1;
    }

    if (this.extractTopics(content).length > 2) {
      importance += 0.1;
    }

    // Boost for longer, more detailed content
    const length = content.length;
    if (length > 500) {
      importance += 0.1;
    }

    return Math.min(1.0, importance);
  }

  /**
   * Calculate importance for Minecraft experiences
   */
  private calculateExperienceImportance(experience: any): number {
    let importance = 0.6; // Experiences are generally important

    // Boost for successful outcomes
    if (experience.outcome === 'success') {
      importance += 0.2;
    }

    // Boost for experiences with lessons learned
    if (experience.lessons && experience.lessons.length > 0) {
      importance += 0.1;
    }

    // Boost for experiences involving rare entities
    if (
      experience.entities &&
      experience.entities.some((e: string) =>
        ['enderman', 'creeper', 'iron golem'].includes(e.toLowerCase())
      )
    ) {
      importance += 0.1;
    }

    return Math.min(1.0, importance);
  }

  /**
   * Generate unique chunk ID
   */
  private generateChunkId(
    content: string,
    startIndex: number,
    timestamp: number
  ): string {
    const hash = content.substring(0, 50).replace(/\s+/g, '-').toLowerCase();
    return `chunk-${timestamp}-${startIndex}-${hash}`;
  }

  /**
   * Estimate token count (rough approximation)
   */
  private estimateTokens(text: string): number {
    // Rough approximation: 1 token ≈ 4 characters for English text
    // More accurate would be to use a proper tokenizer
    return Math.ceil(text.length / 4);
  }

  /**
   * Update chunking configuration
   */
  updateConfig(config: Partial<ChunkingConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current chunking configuration
   */
  getConfig(): ChunkingConfig {
    return { ...this.config };
  }
}
