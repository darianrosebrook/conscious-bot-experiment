/**
 * Audit trail implementation.
 *
 * Maintains a complete record of all decision-related actions
 * for accountability and transparency.
 *
 * @author @darianrosebrook
 */

import {
  AuditEntry,
  AuditAction,
  AuditEntrySchema,
} from './types';

/**
 * Audit trail configuration
 */
export interface AuditTrailConfig {
  maxEntries: number;
  retentionPeriod: number; // milliseconds
  compressionEnabled: boolean;
  compressionThreshold: number; // number of entries before compression
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: AuditTrailConfig = {
  maxEntries: 100000,
  retentionPeriod: 365 * 24 * 60 * 60 * 1000, // 1 year
  compressionEnabled: true,
  compressionThreshold: 1000, // compress after 1000 entries for a decision
};

/**
 * Audit trail implementation
 */
export class AuditTrail {
  private entries: Map<string, AuditEntry> = new Map();
  private entriesByDecision: Map<string, Set<string>> = new Map();
  private entriesByAction: Map<AuditAction, Set<string>> = new Map();
  private entriesByActor: Map<string, Set<string>> = new Map();
  private config: AuditTrailConfig;

  constructor(config: Partial<AuditTrailConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initializeIndexes();
  }

  /**
   * Initialize indexes
   */
  private initializeIndexes(): void {
    // Initialize entriesByAction map
    Object.values(AuditAction).forEach((action) => {
      this.entriesByAction.set(action as AuditAction, new Set<string>());
    });
  }

  /**
   * Add audit entry
   */
  addEntry(
    entry: Omit<AuditEntry, 'id' | 'timestamp'>
  ): AuditEntry {
    const now = Date.now();
    const id = `audit-${now}-${Math.random().toString(36).substring(2, 9)}`;

    const newEntry: AuditEntry = {
      ...entry,
      id,
      timestamp: now,
    };

    // Validate entry
    const validation = AuditEntrySchema.safeParse(newEntry);
    if (!validation.success) {
      console.warn('Invalid audit entry:', validation.error);
      throw new Error(`Invalid audit entry: ${validation.error.message}`);
    }

    // Add to collections
    this.entries.set(id, newEntry);

    // Add to indexes
    this.addToIndexes(newEntry);

    // Compress if needed
    if (
      this.config.compressionEnabled &&
      this.getDecisionEntryCount(newEntry.decisionId) >
        this.config.compressionThreshold
    ) {
      this.compressDecisionEntries(newEntry.decisionId);
    }

    // Cleanup old entries if needed
    if (this.entries.size > this.config.maxEntries) {
      this.cleanupOldEntries();
    }

    return newEntry;
  }

  /**
   * Add entry to indexes
   */
  private addToIndexes(entry: AuditEntry): void {
    // Add to decision index
    let decisionSet = this.entriesByDecision.get(entry.decisionId);
    if (!decisionSet) {
      decisionSet = new Set<string>();
      this.entriesByDecision.set(entry.decisionId, decisionSet);
    }
    decisionSet.add(entry.id);

    // Add to action index
    this.entriesByAction.get(entry.action)?.add(entry.id);

    // Add to actor index
    let actorSet = this.entriesByActor.get(entry.actor);
    if (!actorSet) {
      actorSet = new Set<string>();
      this.entriesByActor.set(entry.actor, actorSet);
    }
    actorSet.add(entry.id);
  }

  /**
   * Remove entry from indexes
   */
  private removeFromIndexes(entry: AuditEntry): void {
    // Remove from decision index
    this.entriesByDecision.get(entry.decisionId)?.delete(entry.id);

    // Remove from action index
    this.entriesByAction.get(entry.action)?.delete(entry.id);

    // Remove from actor index
    this.entriesByActor.get(entry.actor)?.delete(entry.id);
  }

  /**
   * Get entry by ID
   */
  getEntry(entryId: string): AuditEntry | null {
    return this.entries.get(entryId) || null;
  }

  /**
   * Get entries by decision
   */
  getEntriesByDecision(
    decisionId: string,
    options: {
      startTime?: number;
      endTime?: number;
      actions?: AuditAction[];
      actors?: string[];
      limit?: number;
      sortDirection?: 'asc' | 'desc';
    } = {}
  ): AuditEntry[] {
    const entryIds = this.entriesByDecision.get(decisionId);
    if (!entryIds) {
      return [];
    }

    let entries = Array.from(entryIds)
      .map((id) => this.entries.get(id))
      .filter((entry): entry is AuditEntry => !!entry);

    // Apply time filters
    if (options.startTime !== undefined) {
      entries = entries.filter((entry) => entry.timestamp >= options.startTime!);
    }

    if (options.endTime !== undefined) {
      entries = entries.filter((entry) => entry.timestamp <= options.endTime!);
    }

    // Filter by actions
    if (options.actions && options.actions.length > 0) {
      entries = entries.filter((entry) => options.actions!.includes(entry.action));
    }

    // Filter by actors
    if (options.actors && options.actors.length > 0) {
      entries = entries.filter((entry) => options.actors!.includes(entry.actor));
    }

    // Sort by timestamp
    entries.sort((a, b) =>
      options.sortDirection === 'asc'
        ? a.timestamp - b.timestamp
        : b.timestamp - a.timestamp
    );

    // Apply limit
    if (options.limit !== undefined && options.limit > 0) {
      entries = entries.slice(0, options.limit);
    }

    return entries;
  }

  /**
   * Get entries by action
   */
  getEntriesByAction(
    action: AuditAction,
    options: {
      startTime?: number;
      endTime?: number;
      limit?: number;
      sortDirection?: 'asc' | 'desc';
    } = {}
  ): AuditEntry[] {
    const entryIds = this.entriesByAction.get(action);
    if (!entryIds) {
      return [];
    }

    let entries = Array.from(entryIds)
      .map((id) => this.entries.get(id))
      .filter((entry): entry is AuditEntry => !!entry);

    // Apply time filters
    if (options.startTime !== undefined) {
      entries = entries.filter((entry) => entry.timestamp >= options.startTime!);
    }

    if (options.endTime !== undefined) {
      entries = entries.filter((entry) => entry.timestamp <= options.endTime!);
    }

    // Sort by timestamp
    entries.sort((a, b) =>
      options.sortDirection === 'asc'
        ? a.timestamp - b.timestamp
        : b.timestamp - a.timestamp
    );

    // Apply limit
    if (options.limit !== undefined && options.limit > 0) {
      entries = entries.slice(0, options.limit);
    }

    return entries;
  }

  /**
   * Get entries by actor
   */
  getEntriesByActor(
    actor: string,
    options: {
      startTime?: number;
      endTime?: number;
      actions?: AuditAction[];
      limit?: number;
      sortDirection?: 'asc' | 'desc';
    } = {}
  ): AuditEntry[] {
    const entryIds = this.entriesByActor.get(actor);
    if (!entryIds) {
      return [];
    }

    let entries = Array.from(entryIds)
      .map((id) => this.entries.get(id))
      .filter((entry): entry is AuditEntry => !!entry);

    // Apply time filters
    if (options.startTime !== undefined) {
      entries = entries.filter((entry) => entry.timestamp >= options.startTime!);
    }

    if (options.endTime !== undefined) {
      entries = entries.filter((entry) => entry.timestamp <= options.endTime!);
    }

    // Filter by actions
    if (options.actions && options.actions.length > 0) {
      entries = entries.filter((entry) => options.actions!.includes(entry.action));
    }

    // Sort by timestamp
    entries.sort((a, b) =>
      options.sortDirection === 'asc'
        ? a.timestamp - b.timestamp
        : b.timestamp - a.timestamp
    );

    // Apply limit
    if (options.limit !== undefined && options.limit > 0) {
      entries = entries.slice(0, options.limit);
    }

    return entries;
  }

  /**
   * Get all entries
   */
  getAllEntries(
    options: {
      startTime?: number;
      endTime?: number;
      actions?: AuditAction[];
      actors?: string[];
      limit?: number;
      sortDirection?: 'asc' | 'desc';
    } = {}
  ): AuditEntry[] {
    let entries = Array.from(this.entries.values());

    // Apply time filters
    if (options.startTime !== undefined) {
      entries = entries.filter((entry) => entry.timestamp >= options.startTime!);
    }

    if (options.endTime !== undefined) {
      entries = entries.filter((entry) => entry.timestamp <= options.endTime!);
    }

    // Filter by actions
    if (options.actions && options.actions.length > 0) {
      entries = entries.filter((entry) => options.actions!.includes(entry.action));
    }

    // Filter by actors
    if (options.actors && options.actors.length > 0) {
      entries = entries.filter((entry) => options.actors!.includes(entry.actor));
    }

    // Sort by timestamp
    entries.sort((a, b) =>
      options.sortDirection === 'asc'
        ? a.timestamp - b.timestamp
        : b.timestamp - a.timestamp
    );

    // Apply limit
    if (options.limit !== undefined && options.limit > 0) {
      entries = entries.slice(0, options.limit);
    }

    return entries;
  }

  /**
   * Get decision entry count
   */
  private getDecisionEntryCount(decisionId: string): number {
    return this.entriesByDecision.get(decisionId)?.size || 0;
  }

  /**
   * Compress decision entries
   */
  private compressDecisionEntries(decisionId: string): void {
    const entries = this.getEntriesByDecision(decisionId, {
      sortDirection: 'asc',
    });

    if (entries.length <= this.config.compressionThreshold) {
      return;
    }

    // Group entries by action type
    const entriesByAction = new Map<AuditAction, AuditEntry[]>();
    for (const entry of entries) {
      const actionEntries = entriesByAction.get(entry.action) || [];
      actionEntries.push(entry);
      entriesByAction.set(entry.action, actionEntries);
    }

    // Compress each action type
    for (const [action, actionEntries] of entriesByAction.entries()) {
      if (actionEntries.length <= 10) {
        continue;
      }

      // Keep first and last 5 entries
      const entriesToKeep = [
        ...actionEntries.slice(0, 5),
        ...actionEntries.slice(-5),
      ];

      // Remove middle entries
      for (let i = 5; i < actionEntries.length - 5; i++) {
        const entry = actionEntries[i];
        this.removeFromIndexes(entry);
        this.entries.delete(entry.id);
      }

      // Create summary entry
      const removedCount = actionEntries.length - 10;
      if (removedCount > 0) {
        const firstRemoved = actionEntries[5];
        const lastRemoved = actionEntries[actionEntries.length - 6];

        this.addEntry({
          decisionId,
          actor: 'system',
          action: AuditAction.UPDATE,
          details: {
            message: `Compressed ${removedCount} ${action} entries`,
            timeRange: {
              start: firstRemoved.timestamp,
              end: lastRemoved.timestamp,
            },
          },
        });
      }
    }
  }

  /**
   * Clean up old entries
   */
  private cleanupOldEntries(): void {
    const now = Date.now();
    const cutoff = now - this.config.retentionPeriod;

    // Find entries to remove
    const entriesToRemove: string[] = [];

    for (const entry of this.entries.values()) {
      if (entry.timestamp < cutoff) {
        entriesToRemove.push(entry.id);
      }
    }

    // Remove entries
    for (const entryId of entriesToRemove) {
      const entry = this.entries.get(entryId);
      if (entry) {
        this.removeFromIndexes(entry);
        this.entries.delete(entryId);
      }
    }
  }

  /**
   * Get audit trail statistics
   */
  getStats() {
    // Count entries by action
    const countByAction = Object.values(AuditAction).reduce(
      (acc, action) => {
        acc[action] = this.entriesByAction.get(action as AuditAction)?.size || 0;
        return acc;
      },
      {} as Record<string, number>
    );

    // Count entries by actor
    const countByActor: Record<string, number> = {};
    for (const [actor, entries] of this.entriesByActor.entries()) {
      countByActor[actor] = entries.size;
    }

    // Get top actors
    const topActors = Object.entries(countByActor)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([actor, count]) => ({ actor, count }));

    // Get top decisions
    const decisionCounts = Array.from(this.entriesByDecision.entries())
      .map(([decisionId, entries]) => ({
        decisionId,
        count: entries.size,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Calculate time range
    let oldestTimestamp = Infinity;
    let newestTimestamp = 0;

    for (const entry of this.entries.values()) {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
      }
      if (entry.timestamp > newestTimestamp) {
        newestTimestamp = entry.timestamp;
      }
    }

    return {
      totalEntries: this.entries.size,
      countByAction,
      countByActor,
      topActors,
      topDecisions: decisionCounts,
      oldestEntry: oldestTimestamp === Infinity ? null : oldestTimestamp,
      newestEntry: newestTimestamp === 0 ? null : newestTimestamp,
      timeSpan:
        oldestTimestamp === Infinity || newestTimestamp === 0
          ? 0
          : newestTimestamp - oldestTimestamp,
    };
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.entries.clear();
    this.entriesByDecision.clear();
    this.entriesByActor.clear();

    // Clear indexes
    for (const entrySet of this.entriesByAction.values()) {
      entrySet.clear();
    }
  }
}
