/**
 * Episodic memory retrieval system.
 *
 * Retrieves episodic memories based on contextual cues, temporal proximity,
 * and semantic similarity with efficient indexing and relevance scoring.
 *
 * @author @darianrosebrook
 */

import { Experience, ExperienceType } from '../types';

/**
 * Retrieval cue for memory search
 */
export interface RetrievalCue {
  type: RetrievalCueType;
  value: string | number | any;
  weight: number; // 0-1, importance of this cue
  context?: any;
}

export enum RetrievalCueType {
  TEMPORAL = 'temporal',
  SPATIAL = 'spatial',
  SEMANTIC = 'semantic',
  EMOTIONAL = 'emotional',
  SOCIAL = 'social',
  GOAL = 'goal',
  ACTION = 'action',
  OUTCOME = 'outcome',
}

/**
 * Retrieval context for memory search
 */
export interface RetrievalContext {
  currentGoals?: string[];
  currentLocation?: any;
  currentTime?: number;
  emotionalState?: any;
  socialContext?: any;
  relevanceThreshold?: number;
  maxResults?: number;
  timeWindow?: number;
}

/**
 * Retrieved memory with relevance information
 */
export interface RetrievedMemory {
  memory: Experience;
  relevanceScore: number;
  matchCues: RetrievalCue[];
  confidence: number;
  retrievalTime: number;
}

/**
 * Temporal query for memory retrieval
 */
export interface TemporalQuery {
  startTime?: number;
  endTime?: number;
  duration?: number;
  relativeTime?: 'recent' | 'distant' | 'specific';
  timePattern?: 'daily' | 'weekly' | 'monthly';
}

/**
 * Spatial query for memory retrieval
 */
export interface SpatialQuery {
  location?: any;
  radius?: number;
  region?: string;
  spatialRelation?: 'near' | 'at' | 'within' | 'outside';
}

/**
 * Social query for memory retrieval
 */
export interface SocialQuery {
  participants?: string[];
  socialContext?: string;
  interactionType?: string;
  relationshipType?: string;
}

/**
 * Emotional query for memory retrieval
 */
export interface EmotionalQuery {
  emotionalState?: any;
  emotionalIntensity?: number;
  emotionalValence?: 'positive' | 'negative' | 'neutral';
  emotionalType?: string;
}

/**
 * Memory retrieval system
 */
export class EpisodicRetrieval {
  private memories: Experience[] = [];
  private indices: Map<string, Map<string, Experience[]>> = new Map();

  constructor() {
    this.initializeIndices();
  }

  /**
   * Add memories to the retrieval system
   */
  addMemories(newMemories: Experience[]): void {
    this.memories.push(...newMemories);
    this.updateIndices(newMemories);
  }

  /**
   * Retrieve memories by contextual cues
   */
  retrieveByContext(
    cues: RetrievalCue[],
    context?: RetrievalContext
  ): RetrievedMemory[] {
    const startTime = Date.now();
    const results: RetrievedMemory[] = [];
    const relevanceThreshold = context?.relevanceThreshold ?? 0.3;
    const maxResults = context?.maxResults ?? 20;

    // Calculate relevance scores for all memories
    for (const memory of this.memories) {
      const relevanceScore = this.calculateRelevanceScore(memory, cues, context);
      
      if (relevanceScore >= relevanceThreshold) {
        const matchCues = this.findMatchingCues(memory, cues);
        const confidence = this.calculateConfidence(memory, matchCues);
        
        results.push({
          memory,
          relevanceScore,
          matchCues,
          confidence,
          retrievalTime: Date.now() - startTime,
        });
      }
    }

    // Sort by relevance score and limit results
    return results
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, maxResults);
  }

  /**
   * Retrieve memories from specific time periods
   */
  retrieveByTimeframe(
    query: TemporalQuery,
    context?: RetrievalContext
  ): RetrievedMemory[] {
    const cues: RetrievalCue[] = [];
    
    if (query.startTime && query.endTime) {
      cues.push({
        type: RetrievalCueType.TEMPORAL,
        value: { start: query.startTime, end: query.endTime },
        weight: 1.0,
      });
    } else if (query.relativeTime) {
      const timeRange = this.calculateRelativeTimeRange(query.relativeTime);
      cues.push({
        type: RetrievalCueType.TEMPORAL,
        value: timeRange,
        weight: 0.8,
      });
    }

    return this.retrieveByContext(cues, context);
  }

  /**
   * Retrieve memories associated with specific locations
   */
  retrieveByLocation(
    query: SpatialQuery,
    context?: RetrievalContext
  ): RetrievedMemory[] {
    const cues: RetrievalCue[] = [];
    
    if (query.location) {
      cues.push({
        type: RetrievalCueType.SPATIAL,
        value: query.location,
        weight: 1.0,
        context: { radius: query.radius, relation: query.spatialRelation },
      });
    }

    return this.retrieveByContext(cues, context);
  }

  /**
   * Retrieve memories involving specific entities or participants
   */
  retrieveBySocialContext(
    query: SocialQuery,
    context?: RetrievalContext
  ): RetrievedMemory[] {
    const cues: RetrievalCue[] = [];
    
    if (query.participants) {
      for (const participant of query.participants) {
        cues.push({
          type: RetrievalCueType.SOCIAL,
          value: participant,
          weight: 0.7,
        });
      }
    }

    if (query.interactionType) {
      cues.push({
        type: RetrievalCueType.ACTION,
        value: query.interactionType,
        weight: 0.6,
      });
    }

    return this.retrieveByContext(cues, context);
  }

  /**
   * Retrieve memories with similar emotional significance
   */
  retrieveByEmotionalSimilarity(
    query: EmotionalQuery,
    context?: RetrievalContext
  ): RetrievedMemory[] {
    const cues: RetrievalCue[] = [];
    
    if (query.emotionalState) {
      cues.push({
        type: RetrievalCueType.EMOTIONAL,
        value: query.emotionalState,
        weight: 0.8,
      });
    }

    if (query.emotionalValence) {
      cues.push({
        type: RetrievalCueType.EMOTIONAL,
        value: query.emotionalValence,
        weight: 0.6,
      });
    }

    return this.retrieveByContext(cues, context);
  }

  /**
   * Retrieve memories by semantic similarity
   */
  retrieveBySemanticSimilarity(
    query: string,
    context?: RetrievalContext
  ): RetrievedMemory[] {
    const cues: RetrievalCue[] = [
      {
        type: RetrievalCueType.SEMANTIC,
        value: query,
        weight: 1.0,
      },
    ];

    return this.retrieveByContext(cues, context);
  }

  /**
   * Retrieve memories by goal relevance
   */
  retrieveByGoalRelevance(
    goal: string,
    context?: RetrievalContext
  ): RetrievedMemory[] {
    const cues: RetrievalCue[] = [
      {
        type: RetrievalCueType.GOAL,
        value: goal,
        weight: 0.9,
      },
    ];

    return this.retrieveByContext(cues, context);
  }

  /**
   * Reconstruct detailed memory from stored representation
   */
  reconstructMemoryNarrative(
    memoryId: string,
    context?: any
  ): Experience | null {
    const memory = this.memories.find(m => m.id === memoryId);
    
    if (!memory) {
      return null;
    }

    // In a real implementation, this would reconstruct additional details
    // from related memories and semantic knowledge
    return this.enhanceMemoryWithContext(memory, context);
  }

  /**
   * Get memory statistics
   */
  getStats() {
    return {
      totalMemories: this.memories.length,
      memoryTypes: this.getMemoryTypeDistribution(),
      temporalRange: this.getTemporalRange(),
      spatialCoverage: this.getSpatialCoverage(),
      averageSalience: this.calculateAverageSalience(),
    };
  }

  /**
   * Initialize memory indices for efficient retrieval
   */
  private initializeIndices(): void {
    const indexTypes = [
      'type',
      'temporal',
      'spatial',
      'participants',
      'actions',
      'outcomes',
      'emotions',
    ];

    for (const indexType of indexTypes) {
      this.indices.set(indexType, new Map());
    }
  }

  /**
   * Update indices with new memories
   */
  private updateIndices(newMemories: Experience[]): void {
    for (const memory of newMemories) {
      this.addToIndices(memory);
    }
  }

  /**
   * Add memory to all relevant indices
   */
  private addToIndices(memory: Experience): void {
    // Type index
    this.addToIndex('type', memory.type, memory);

    // Temporal index (by day)
    const dayKey = new Date(memory.timestamp).toDateString();
    this.addToIndex('temporal', dayKey, memory);

    // Spatial index
    if (memory.location) {
      const locationKey = `${memory.location.x},${memory.location.y},${memory.location.z}`;
      this.addToIndex('spatial', locationKey, memory);
    }

    // Participants index
    for (const participant of memory.participants) {
      this.addToIndex('participants', participant, memory);
    }

    // Actions index
    for (const action of memory.actions) {
      this.addToIndex('actions', action.type, memory);
    }

    // Outcomes index
    for (const outcome of memory.outcomes) {
      this.addToIndex('outcomes', outcome.description, memory);
    }

    // Emotions index
    if (memory.emotions) {
      const emotionKeys = this.extractEmotionKeys(memory.emotions);
      for (const emotionKey of emotionKeys) {
        this.addToIndex('emotions', emotionKey, memory);
      }
    }
  }

  /**
   * Add memory to specific index
   */
  private addToIndex(indexType: string, key: string, memory: Experience): void {
    const index = this.indices.get(indexType);
    if (!index) return;

    if (!index.has(key)) {
      index.set(key, []);
    }
    index.get(key)!.push(memory);
  }

  /**
   * Calculate relevance score for memory based on cues
   */
  private calculateRelevanceScore(
    memory: Experience,
    cues: RetrievalCue[],
    context?: RetrievalContext
  ): number {
    let totalScore = 0;
    let totalWeight = 0;

    for (const cue of cues) {
      const cueScore = this.calculateCueScore(memory, cue, context);
      totalScore += cueScore * cue.weight;
      totalWeight += cue.weight;
    }

    // Apply context-based adjustments
    const contextAdjustment = this.calculateContextAdjustment(memory, context);
    
    return totalWeight > 0 ? (totalScore / totalWeight) * contextAdjustment : 0;
  }

  /**
   * Calculate score for a specific cue
   */
  private calculateCueScore(
    memory: Experience,
    cue: RetrievalCue,
    context?: RetrievalContext
  ): number {
    switch (cue.type) {
      case RetrievalCueType.TEMPORAL:
        return this.calculateTemporalScore(memory, cue.value, context);
      
      case RetrievalCueType.SPATIAL:
        return this.calculateSpatialScore(memory, cue.value, cue.context);
      
      case RetrievalCueType.SEMANTIC:
        return this.calculateSemanticScore(memory, cue.value as string);
      
      case RetrievalCueType.EMOTIONAL:
        return this.calculateEmotionalScore(memory, cue.value);
      
      case RetrievalCueType.SOCIAL:
        return this.calculateSocialScore(memory, cue.value as string);
      
      case RetrievalCueType.GOAL:
        return this.calculateGoalScore(memory, cue.value as string);
      
      case RetrievalCueType.ACTION:
        return this.calculateActionScore(memory, cue.value as string);
      
      case RetrievalCueType.OUTCOME:
        return this.calculateOutcomeScore(memory, cue.value as string);
      
      default:
        return 0;
    }
  }

  /**
   * Calculate temporal relevance score
   */
  private calculateTemporalScore(
    memory: Experience,
    timeValue: any,
    context?: RetrievalContext
  ): number {
    if (typeof timeValue === 'object' && timeValue.start && timeValue.end) {
      // Time range query
      if (memory.timestamp >= timeValue.start && memory.timestamp <= timeValue.end) {
        return 1.0;
      }
      return 0;
    }

    // Relative time query
    const currentTime = context?.currentTime ?? Date.now();
    const timeDiff = Math.abs(currentTime - memory.timestamp);
    const dayInMs = 24 * 60 * 60 * 1000;

    if (timeValue === 'recent') {
      return Math.max(0, 1 - timeDiff / (7 * dayInMs)); // Last week
    } else if (timeValue === 'distant') {
      return Math.min(1, timeDiff / (30 * dayInMs)); // Older than a month
    }

    return 0;
  }

  /**
   * Calculate spatial relevance score
   */
  private calculateSpatialScore(
    memory: Experience,
    location: any,
    context?: any
  ): number {
    if (!memory.location || !location) return 0;

    const distance = this.calculateDistance(memory.location, location);
    const radius = context?.radius ?? 100;

    if (distance <= radius) {
      return Math.max(0, 1 - distance / radius);
    }

    return 0;
  }

  /**
   * Calculate semantic relevance score
   */
  private calculateSemanticScore(memory: Experience, query: string): number {
    const queryLower = query.toLowerCase();
    const descriptionLower = memory.description.toLowerCase();
    
    // Simple keyword matching
    const queryWords = queryLower.split(/\s+/);
    const descriptionWords = descriptionLower.split(/\s+/);
    
    let matches = 0;
    for (const queryWord of queryWords) {
      if (descriptionWords.includes(queryWord)) {
        matches++;
      }
    }
    
    return matches / queryWords.length;
  }

  /**
   * Calculate emotional relevance score
   */
  private calculateEmotionalScore(memory: Experience, emotionalValue: any): number {
    if (!memory.emotions) return 0;

    if (typeof emotionalValue === 'string') {
      // Emotional valence query
      const positiveEmotions = ['satisfaction', 'excitement', 'joy'];
      const negativeEmotions = ['frustration', 'fear', 'sadness'];
      
      if (emotionalValue === 'positive') {
        return Math.max(...positiveEmotions.map(e => memory.emotions[e] || 0));
      } else if (emotionalValue === 'negative') {
        return Math.max(...negativeEmotions.map(e => memory.emotions[e] || 0));
      }
    } else if (typeof emotionalValue === 'object') {
      // Specific emotional state query
      let totalMatch = 0;
      let totalEmotions = 0;
      
      for (const [emotion, intensity] of Object.entries(emotionalValue)) {
        if (memory.emotions[emotion] !== undefined) {
          const match = 1 - Math.abs(memory.emotions[emotion] - intensity);
          totalMatch += match;
          totalEmotions++;
        }
      }
      
      return totalEmotions > 0 ? totalMatch / totalEmotions : 0;
    }

    return 0;
  }

  /**
   * Calculate social relevance score
   */
  private calculateSocialScore(memory: Experience, participant: string): number {
    return memory.participants.includes(participant) ? 1.0 : 0;
  }

  /**
   * Calculate goal relevance score
   */
  private calculateGoalScore(memory: Experience, goal: string): number {
    const goalLower = goal.toLowerCase();
    const descriptionLower = memory.description.toLowerCase();
    
    if (descriptionLower.includes(goalLower)) {
      return 0.8;
    }
    
    // Check if memory type is goal-related
    const goalRelatedTypes = [
      ExperienceType.GOAL_ACHIEVEMENT,
      ExperienceType.GOAL_FAILURE,
      ExperienceType.SKILL_IMPROVEMENT,
    ];
    
    return goalRelatedTypes.includes(memory.type) ? 0.6 : 0;
  }

  /**
   * Calculate action relevance score
   */
  private calculateActionScore(memory: Experience, actionType: string): number {
    return memory.actions.some(action => action.type === actionType) ? 1.0 : 0;
  }

  /**
   * Calculate outcome relevance score
   */
  private calculateOutcomeScore(memory: Experience, outcome: string): number {
    return memory.outcomes.some(o => o.description.includes(outcome)) ? 1.0 : 0;
  }

  /**
   * Calculate context adjustment factor
   */
  private calculateContextAdjustment(memory: Experience, context?: RetrievalContext): number {
    let adjustment = 1.0;

    // Boost memories relevant to current goals
    if (context?.currentGoals && context.currentGoals.length > 0) {
      const goalRelevance = this.calculateGoalRelevance(memory, context.currentGoals);
      adjustment *= (1 + goalRelevance * 0.3);
    }

    // Boost memories from current location
    if (context?.currentLocation && memory.location) {
      const locationRelevance = this.calculateSpatialScore(memory, context.currentLocation);
      adjustment *= (1 + locationRelevance * 0.2);
    }

    return Math.min(2.0, adjustment); // Cap at 2x boost
  }

  /**
   * Calculate goal relevance for multiple goals
   */
  private calculateGoalRelevance(memory: Experience, goals: string[]): number {
    let maxRelevance = 0;
    
    for (const goal of goals) {
      const relevance = this.calculateGoalScore(memory, goal);
      maxRelevance = Math.max(maxRelevance, relevance);
    }
    
    return maxRelevance;
  }

  /**
   * Find cues that match a memory
   */
  private findMatchingCues(memory: Experience, cues: RetrievalCue[]): RetrievalCue[] {
    return cues.filter(cue => {
      const score = this.calculateCueScore(memory, cue);
      return score > 0.5; // Threshold for considering a cue as matching
    });
  }

  /**
   * Calculate confidence in retrieval result
   */
  private calculateConfidence(memory: Experience, matchCues: RetrievalCue[]): number {
    if (matchCues.length === 0) return 0;

    const cueConfidences = matchCues.map(cue => {
      const score = this.calculateCueScore(memory, cue);
      return score * cue.weight;
    });

    const averageConfidence = cueConfidences.reduce((sum, conf) => sum + conf, 0) / cueConfidences.length;
    
    // Boost confidence for high-salience memories
    const salienceBoost = memory.salienceScore * 0.2;
    
    return Math.min(1.0, averageConfidence + salienceBoost);
  }

  /**
   * Calculate distance between two locations
   */
  private calculateDistance(loc1: any, loc2: any): number {
    const dx = loc1.x - loc2.x;
    const dy = loc1.y - loc2.y;
    const dz = loc1.z - loc2.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Calculate relative time range
   */
  private calculateRelativeTimeRange(relativeTime: string): { start: number; end: number } {
    const now = Date.now();
    const dayInMs = 24 * 60 * 60 * 1000;

    switch (relativeTime) {
      case 'recent':
        return { start: now - 7 * dayInMs, end: now };
      case 'distant':
        return { start: 0, end: now - 30 * dayInMs };
      default:
        return { start: 0, end: now };
    }
  }

  /**
   * Extract emotion keys from emotional state
   */
  private extractEmotionKeys(emotions: any): string[] {
    const keys: string[] = [];
    
    for (const [emotion, intensity] of Object.entries(emotions)) {
      if (typeof intensity === 'number' && intensity > 0.3) {
        keys.push(emotion);
      }
    }
    
    return keys;
  }

  /**
   * Enhance memory with additional context
   */
  private enhanceMemoryWithContext(memory: Experience, context?: any): Experience {
    // In a real implementation, this would add related memories,
    // semantic knowledge, and other contextual information
    return {
      ...memory,
      metadata: {
        ...memory.metadata,
        enhanced: true,
        enhancementContext: context,
      },
    };
  }

  /**
   * Get memory type distribution
   */
  private getMemoryTypeDistribution(): Record<string, number> {
    const distribution: Record<string, number> = {};
    
    for (const memory of this.memories) {
      distribution[memory.type] = (distribution[memory.type] || 0) + 1;
    }
    
    return distribution;
  }

  /**
   * Get temporal range of memories
   */
  private getTemporalRange(): { earliest: number; latest: number } {
    if (this.memories.length === 0) {
      return { earliest: 0, latest: 0 };
    }

    const timestamps = this.memories.map(m => m.timestamp);
    return {
      earliest: Math.min(...timestamps),
      latest: Math.max(...timestamps),
    };
  }

  /**
   * Get spatial coverage of memories
   */
  private getSpatialCoverage(): { locations: number; coverage: number } {
    const locations = new Set<string>();
    
    for (const memory of this.memories) {
      if (memory.location) {
        const locationKey = `${memory.location.x},${memory.location.y},${memory.location.z}`;
        locations.add(locationKey);
      }
    }
    
    return {
      locations: locations.size,
      coverage: locations.size / Math.max(1, this.memories.length),
    };
  }

  /**
   * Calculate average salience of memories
   */
  private calculateAverageSalience(): number {
    if (this.memories.length === 0) return 0;
    
    const totalSalience = this.memories.reduce((sum, memory) => sum + memory.salienceScore, 0);
    return totalSalience / this.memories.length;
  }
}
