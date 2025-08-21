/**
 * Evidence manager implementation.
 *
 * Manages evidence items that support decision justifications
 * and provide provenance for knowledge and actions.
 *
 * @author @darianrosebrook
 */

import { Evidence, EvidenceType, EvidenceSchema } from './types';

/**
 * Evidence manager configuration
 */
export interface EvidenceManagerConfig {
  maxEvidenceItems: number;
  deduplicationEnabled: boolean;
  retentionPeriod: number; // milliseconds
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: EvidenceManagerConfig = {
  maxEvidenceItems: 10000,
  deduplicationEnabled: true,
  retentionPeriod: 90 * 24 * 60 * 60 * 1000, // 90 days
};

/**
 * Evidence manager implementation
 */
export class EvidenceManager {
  private evidence: Map<string, Evidence> = new Map();
  private evidenceByType: Map<EvidenceType, Set<string>> = new Map();
  private evidenceBySource: Map<string, Set<string>> = new Map();
  private config: EvidenceManagerConfig;

  constructor(config: Partial<EvidenceManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initializeIndexes();
  }

  /**
   * Initialize indexes
   */
  private initializeIndexes(): void {
    // Initialize evidenceByType map
    Object.values(EvidenceType).forEach((type) => {
      this.evidenceByType.set(type as EvidenceType, new Set<string>());
    });
  }

  /**
   * Add evidence item
   */
  addEvidence(evidence: Omit<Evidence, 'id' | 'timestamp'>): Evidence {
    const now = Date.now();
    const id = `evidence-${now}-${Math.random().toString(36).substring(2, 9)}`;

    // Check for duplicates if enabled
    if (this.config.deduplicationEnabled) {
      const existingEvidence = this.findSimilarEvidence(evidence);
      if (existingEvidence) {
        return existingEvidence;
      }
    }

    const newEvidence: Evidence = {
      ...evidence,
      id,
      timestamp: now,
    };

    // Validate evidence
    const validation = EvidenceSchema.safeParse(newEvidence);
    if (!validation.success) {
      console.warn('Invalid evidence:', validation.error);
      throw new Error(`Invalid evidence: ${validation.error.message}`);
    }

    // Add to collections
    this.evidence.set(id, newEvidence);

    // Add to indexes
    this.addToIndexes(newEvidence);

    // Cleanup old evidence if needed
    if (this.evidence.size > this.config.maxEvidenceItems) {
      this.cleanupOldEvidence();
    }

    return newEvidence;
  }

  /**
   * Add evidence to indexes
   */
  private addToIndexes(evidence: Evidence): void {
    // Add to type index
    this.evidenceByType.get(evidence.type)?.add(evidence.id);

    // Add to source index
    let sourceSet = this.evidenceBySource.get(evidence.source);
    if (!sourceSet) {
      sourceSet = new Set<string>();
      this.evidenceBySource.set(evidence.source, sourceSet);
    }
    sourceSet.add(evidence.id);
  }

  /**
   * Remove evidence from indexes
   */
  private removeFromIndexes(evidence: Evidence): void {
    // Remove from type index
    this.evidenceByType.get(evidence.type)?.delete(evidence.id);

    // Remove from source index
    this.evidenceBySource.get(evidence.source)?.delete(evidence.id);
  }

  /**
   * Find similar evidence (for deduplication)
   */
  private findSimilarEvidence(
    evidence: Omit<Evidence, 'id' | 'timestamp'>
  ): Evidence | null {
    // Get evidence of the same type
    const typeSet = this.evidenceByType.get(evidence.type);
    if (!typeSet) {
      return null;
    }

    // Check for similar evidence
    for (const id of typeSet) {
      const existingEvidence = this.evidence.get(id);
      if (!existingEvidence) {
        continue;
      }

      // Check if from same source
      if (existingEvidence.source !== evidence.source) {
        continue;
      }

      // Compare content
      if (this.isSimilarContent(existingEvidence.content, evidence.content)) {
        return existingEvidence;
      }
    }

    return null;
  }

  /**
   * Compare evidence content for similarity
   */
  private isSimilarContent(content1: any, content2: any): boolean {
    // Handle primitive types
    if (typeof content1 === 'string' && typeof content2 === 'string') {
      return content1 === content2;
    }

    if (typeof content1 === 'number' && typeof content2 === 'number') {
      return Math.abs(content1 - content2) < 0.001;
    }

    if (typeof content1 === 'boolean' && typeof content2 === 'boolean') {
      return content1 === content2;
    }

    // Handle arrays
    if (Array.isArray(content1) && Array.isArray(content2)) {
      if (content1.length !== content2.length) {
        return false;
      }

      for (let i = 0; i < content1.length; i++) {
        if (!this.isSimilarContent(content1[i], content2[i])) {
          return false;
        }
      }

      return true;
    }

    // Handle objects
    if (
      typeof content1 === 'object' &&
      content1 !== null &&
      typeof content2 === 'object' &&
      content2 !== null
    ) {
      const keys1 = Object.keys(content1);
      const keys2 = Object.keys(content2);

      if (keys1.length !== keys2.length) {
        return false;
      }

      for (const key of keys1) {
        if (!content2.hasOwnProperty(key)) {
          return false;
        }

        if (!this.isSimilarContent(content1[key], content2[key])) {
          return false;
        }
      }

      return true;
    }

    // Default comparison
    return content1 === content2;
  }

  /**
   * Update evidence
   */
  updateEvidence(
    evidenceId: string,
    updates: Partial<Omit<Evidence, 'id'>>
  ): Evidence | null {
    const evidence = this.evidence.get(evidenceId);
    if (!evidence) {
      return null;
    }

    // Handle type update
    if (updates.type && updates.type !== evidence.type) {
      // Remove from old type index
      this.evidenceByType.get(evidence.type)?.delete(evidenceId);

      // Add to new type index
      this.evidenceByType.get(updates.type)?.add(evidenceId);
    }

    // Handle source update
    if (updates.source && updates.source !== evidence.source) {
      // Remove from old source index
      this.evidenceBySource.get(evidence.source)?.delete(evidenceId);

      // Add to new source index
      let sourceSet = this.evidenceBySource.get(updates.source);
      if (!sourceSet) {
        sourceSet = new Set<string>();
        this.evidenceBySource.set(updates.source, sourceSet);
      }
      sourceSet.add(evidenceId);
    }

    // Update evidence
    const updatedEvidence: Evidence = {
      ...evidence,
      ...updates,
    };

    // Validate evidence
    const validation = EvidenceSchema.safeParse(updatedEvidence);
    if (!validation.success) {
      console.warn('Invalid evidence:', validation.error);
      throw new Error(`Invalid evidence: ${validation.error.message}`);
    }

    this.evidence.set(evidenceId, updatedEvidence);

    return updatedEvidence;
  }

  /**
   * Remove evidence
   */
  removeEvidence(evidenceId: string): boolean {
    const evidence = this.evidence.get(evidenceId);
    if (!evidence) {
      return false;
    }

    // Remove from indexes
    this.removeFromIndexes(evidence);

    // Remove evidence
    this.evidence.delete(evidenceId);

    return true;
  }

  /**
   * Get evidence by ID
   */
  getEvidence(evidenceId: string): Evidence | null {
    return this.evidence.get(evidenceId) || null;
  }

  /**
   * Get evidence by type
   */
  getEvidenceByType(type: EvidenceType): Evidence[] {
    const evidenceIds = this.evidenceByType.get(type);
    if (!evidenceIds) {
      return [];
    }

    return Array.from(evidenceIds)
      .map((id) => this.evidence.get(id))
      .filter((evidence): evidence is Evidence => !!evidence);
  }

  /**
   * Get evidence by source
   */
  getEvidenceBySource(source: string): Evidence[] {
    const evidenceIds = this.evidenceBySource.get(source);
    if (!evidenceIds) {
      return [];
    }

    return Array.from(evidenceIds)
      .map((id) => this.evidence.get(id))
      .filter((evidence): evidence is Evidence => !!evidence);
  }

  /**
   * Get all evidence
   */
  getAllEvidence(): Evidence[] {
    return Array.from(this.evidence.values());
  }

  /**
   * Get multiple evidence items by IDs
   */
  getEvidenceByIds(evidenceIds: string[]): Evidence[] {
    return evidenceIds
      .map((id) => this.evidence.get(id))
      .filter((evidence): evidence is Evidence => !!evidence);
  }

  /**
   * Search evidence by content
   */
  searchEvidence(
    query: string,
    options: {
      type?: EvidenceType;
      source?: string;
      maxResults?: number;
    } = {}
  ): Evidence[] {
    let candidates: Evidence[];

    // Filter by type if specified
    if (options.type) {
      candidates = this.getEvidenceByType(options.type);
    }
    // Filter by source if specified
    else if (options.source) {
      candidates = this.getEvidenceBySource(options.source);
    }
    // Otherwise, use all evidence
    else {
      candidates = Array.from(this.evidence.values());
    }

    // Search for query in content
    const results = candidates.filter((evidence) => {
      // Convert content to string for searching
      const contentStr = this.contentToSearchableString(evidence.content);
      return contentStr.toLowerCase().includes(query.toLowerCase());
    });

    // Sort by relevance (simple implementation)
    results.sort((a, b) => {
      const contentA = this.contentToSearchableString(a.content);
      const contentB = this.contentToSearchableString(b.content);
      const scoreA = this.calculateRelevanceScore(contentA, query);
      const scoreB = this.calculateRelevanceScore(contentB, query);
      return scoreB - scoreA;
    });

    // Apply limit if specified
    if (options.maxResults) {
      return results.slice(0, options.maxResults);
    }

    return results;
  }

  /**
   * Convert content to searchable string
   */
  private contentToSearchableString(content: any): string {
    if (typeof content === 'string') {
      return content;
    }

    if (typeof content === 'number' || typeof content === 'boolean') {
      return content.toString();
    }

    if (Array.isArray(content)) {
      return content
        .map((item) => this.contentToSearchableString(item))
        .join(' ');
    }

    if (typeof content === 'object' && content !== null) {
      return Object.entries(content)
        .map(
          ([key, value]) => `${key} ${this.contentToSearchableString(value)}`
        )
        .join(' ');
    }

    return '';
  }

  /**
   * Calculate relevance score for search results
   */
  private calculateRelevanceScore(content: string, query: string): number {
    const queryLower = query.toLowerCase();
    const contentLower = content.toLowerCase();

    // Count occurrences
    let count = 0;
    let index = contentLower.indexOf(queryLower);
    while (index !== -1) {
      count++;
      index = contentLower.indexOf(queryLower, index + 1);
    }

    // Boost exact matches
    if (contentLower === queryLower) {
      count += 10;
    }

    // Boost matches at the beginning
    if (contentLower.startsWith(queryLower)) {
      count += 5;
    }

    // Boost matches of whole words
    const wordRegex = new RegExp(`\\b${queryLower}\\b`, 'g');
    const wordMatches = contentLower.match(wordRegex);
    if (wordMatches) {
      count += wordMatches.length * 3;
    }

    return count;
  }

  /**
   * Get evidence statistics
   */
  getStats() {
    // Count evidence by type
    const countByType = Object.values(EvidenceType).reduce(
      (acc, type) => {
        acc[type] = this.evidenceByType.get(type as EvidenceType)?.size || 0;
        return acc;
      },
      {} as Record<string, number>
    );

    // Count evidence by source
    const countBySource: Record<string, number> = {};
    for (const [source, evidence] of this.evidenceBySource.entries()) {
      countBySource[source] = evidence.size;
    }

    // Get top sources
    const topSources = Object.entries(countBySource)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([source, count]) => ({ source, count }));

    // Calculate reliability stats
    let totalReliability = 0;
    let reliabilityCount = 0;
    for (const evidence of this.evidence.values()) {
      totalReliability += evidence.reliability;
      reliabilityCount++;
    }

    const averageReliability =
      reliabilityCount > 0 ? totalReliability / reliabilityCount : 0;

    return {
      totalEvidence: this.evidence.size,
      countByType,
      countBySource,
      topSources,
      averageReliability,
      oldestEvidence: this.getOldestEvidence()?.timestamp || null,
      newestEvidence: this.getNewestEvidence()?.timestamp || null,
    };
  }

  /**
   * Get oldest evidence
   */
  private getOldestEvidence(): Evidence | null {
    let oldest: Evidence | null = null;
    let oldestTimestamp = Infinity;

    for (const evidence of this.evidence.values()) {
      if (evidence.timestamp < oldestTimestamp) {
        oldest = evidence;
        oldestTimestamp = evidence.timestamp;
      }
    }

    return oldest;
  }

  /**
   * Get newest evidence
   */
  private getNewestEvidence(): Evidence | null {
    let newest: Evidence | null = null;
    let newestTimestamp = 0;

    for (const evidence of this.evidence.values()) {
      if (evidence.timestamp > newestTimestamp) {
        newest = evidence;
        newestTimestamp = evidence.timestamp;
      }
    }

    return newest;
  }

  /**
   * Clean up old evidence
   */
  private cleanupOldEvidence(): void {
    const now = Date.now();
    const cutoff = now - this.config.retentionPeriod;

    // Find evidence to remove
    const evidenceToRemove: string[] = [];

    for (const evidence of this.evidence.values()) {
      if (evidence.timestamp < cutoff) {
        evidenceToRemove.push(evidence.id);
      }
    }

    // Remove evidence
    for (const evidenceId of evidenceToRemove) {
      const evidence = this.evidence.get(evidenceId);
      if (evidence) {
        this.removeFromIndexes(evidence);
        this.evidence.delete(evidenceId);
      }
    }
  }

  /**
   * Clear all evidence
   */
  clear(): void {
    this.evidence.clear();
    this.evidenceBySource.clear();

    // Clear indexes
    for (const evidenceSet of this.evidenceByType.values()) {
      evidenceSet.clear();
    }
  }
}
