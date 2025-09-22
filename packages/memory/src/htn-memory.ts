/**
 * HTN Memory Manager
 *
 * Stores effectiveness data for HTN task executions, methods, and networks.
 * Provides querying and recommendation helpers for planners.
 *
 * Author: @darianrosebrook
 */

import {
  HTNTaskMemory,
  HTNTaskMemorySchema,
  HTNMethodMemory,
  HTNMethodMemorySchema,
  HTNNetworkMemory,
  HTNNetworkMemorySchema,
  HTNMemoryQuery,
  HTNMemoryStats,
  HTNLearningUpdate,
  MethodOptimization,
} from './types';

/**
 * In-memory HTN memory store (JSON-file/DB persistence can be layered later)
 */
export class HTNMemoryManager {
  private taskExecutions: Map<string, HTNTaskMemory> = new Map();
  private methods: Map<string, HTNMethodMemory> = new Map();
  private networks: Map<string, HTNNetworkMemory> = new Map();

  /** Record a task execution outcome with validation and safe defaults */
  recordTaskExecution(entry: HTNTaskMemory): void {
    const parsed = HTNTaskMemorySchema.safeParse(entry);
    if (!parsed.success) {
      // Fail fast with a clear error to avoid corrupting the store
      throw new Error(`Invalid HTNTaskMemory: ${parsed.error.message}`);
    }
    this.taskExecutions.set(parsed.data.id, parsed.data);
    this.updateMethodFromTask(parsed.data);
  }

  /** Record/update method-level stats directly (optional call) */
  upsertMethodMemory(mem: HTNMethodMemory): void {
    const parsed = HTNMethodMemorySchema.safeParse(mem);
    if (!parsed.success) {
      throw new Error(`Invalid HTNMethodMemory: ${parsed.error.message}`);
    }
    const key = `${parsed.data.taskId}:${parsed.data.methodId}`;
    this.methods.set(key, parsed.data);
  }

  /** Upsert network-level memory */
  upsertNetworkMemory(mem: HTNNetworkMemory): void {
    const parsed = HTNNetworkMemorySchema.safeParse(mem);
    if (!parsed.success) {
      throw new Error(`Invalid HTNNetworkMemory: ${parsed.error.message}`);
    }
    this.networks.set(parsed.data.networkId, parsed.data);
  }

  /** Query executions/methods by simple filters */
  query(query: HTNMemoryQuery): HTNTaskMemory[] {
    const list = Array.from(this.taskExecutions.values());
    return list
      .filter((e) => (query.taskId ? e.taskId === query.taskId : true))
      .filter((e) => (query.methodId ? e.methodUsed === query.methodId : true))
      .filter((e) => (query.outcome ? e.outcome === query.outcome : true))
      .filter((e) =>
        query.effectiveness
          ? (query.effectiveness.min ?? 0) <= e.effectiveness &&
            e.effectiveness <= (query.effectiveness.max ?? 1)
          : true
      )
      .filter((e) =>
        query.timeRange
          ? query.timeRange.start <= e.timestamp &&
            e.timestamp <= query.timeRange.end
          : true
      )
      .filter((e) =>
        query.tags && query.tags.length > 0
          ? e.tags.some((t) => query.tags!.includes(t))
          : true
      )
      .sort((a, b) => {
        if (!query.sortBy) return b.timestamp - a.timestamp;
        const order = query.sortOrder === 'asc' ? 1 : -1;
        switch (query.sortBy) {
          case 'effectiveness':
            return order * (a.effectiveness - b.effectiveness);
          case 'timestamp':
            return order * (a.timestamp - b.timestamp);
          case 'frequency': {
            // Approximate frequency by recentness bucket (newer = more frequent)
            return order * (a.timestamp - b.timestamp);
          }
          default:
            return b.timestamp - a.timestamp;
        }
      })
      .slice(0, query.limit ?? 100);
  }

  /** Compute summary statistics for current store */
  getStats(): HTNMemoryStats {
    const execs = Array.from(this.taskExecutions.values());
    const methods = Array.from(this.methods.values());
    const totalExecutions = execs.length;
    const successRate =
      totalExecutions === 0
        ? 0
        : execs.filter((e) => e.outcome === 'success').length / totalExecutions;
    const averageEffectiveness =
      totalExecutions === 0
        ? 0
        : execs.reduce((s, e) => s + e.effectiveness, 0) / totalExecutions;
    const averageDuration =
      totalExecutions === 0
        ? 0
        : execs.reduce((s, e) => s + e.duration, 0) / totalExecutions;
    const averageReward =
      totalExecutions === 0
        ? 0
        : execs.reduce((s, e) => s + e.reward, 0) / totalExecutions;

    const most =
      methods.slice().sort((a, b) => b.effectiveness - a.effectiveness)[0]
        ?.methodId ?? '';
    const least =
      methods.slice().sort((a, b) => a.effectiveness - b.effectiveness)[0]
        ?.methodId ?? '';

    return {
      totalExecutions,
      successRate,
      averageEffectiveness,
      averageDuration,
      averageReward,
      methodCount: methods.length,
      taskCount: new Set(execs.map((e) => e.taskId)).size,
      failurePatternCount: 0,
      optimizationCount: 0,
      timeRange: {
        start: execs.length ? Math.min(...execs.map((e) => e.timestamp)) : 0,
        end: execs.length ? Math.max(...execs.map((e) => e.timestamp)) : 0,
      },
      mostEffectiveMethod: most,
      leastEffectiveMethod: least,
      emergingPatterns: [],
      decliningPatterns: [],
    };
  }

  /** Apply learning update (e.g., from planner) to method memory */
  applyLearning(update: HTNLearningUpdate): void {
    const key = `${update.taskId}:${update.methodId}`;
    const mem = this.methods.get(key);
    if (!mem) return;

    mem.effectiveness = this.clamp(
      mem.effectiveness + update.effectivenessChange
    );
    mem.confidence = this.clamp(mem.confidence + update.confidenceChange);
    mem.lastUsed = Date.now();
    this.methods.set(key, mem);
  }

  /** Recommend best method for a given task based on effectiveness and confidence */
  recommendMethod(taskId: string): { methodId: string; score: number } | null {
    const candidates = Array.from(this.methods.values()).filter(
      (m) => m.taskId === taskId
    );
    if (candidates.length === 0) return null;
    const best = candidates
      .slice()
      .sort(
        (a, b) =>
          b.effectiveness * b.confidence - a.effectiveness * a.confidence
      )[0];
    return {
      methodId: best.methodId,
      score: best.effectiveness * best.confidence,
    };
  }

  /** Register an optimization event for a method */
  registerMethodOptimization(
    taskId: string,
    methodId: string,
    opt: MethodOptimization
  ): void {
    const key = `${taskId}:${methodId}`;
    const mem = this.methods.get(key);
    if (!mem) return;
    mem.optimizationHistory = [...(mem.optimizationHistory || []), opt];
    this.methods.set(key, mem);
  }

  private updateMethodFromTask(entry: HTNTaskMemory): void {
    const key = `${entry.taskId}:${entry.methodUsed}`;
    const existing = this.methods.get(key);
    const success = entry.outcome === 'success';

    if (!existing) {
      const base: HTNMethodMemory = {
        id: `method-${key}`,
        taskId: entry.taskId,
        methodId: entry.methodUsed,
        effectiveness: entry.effectiveness,
        successRate: success ? 1 : 0,
        averageDuration: entry.duration,
        averageReward: entry.reward,
        usageCount: 1,
        lastUsed: entry.timestamp,
        contextSensitivity: {},
        failurePatterns: [],
        optimizationHistory: [],
        confidence: 0.5,
        timestamp: Date.now(),
      };
      this.methods.set(key, base);
      return;
    }

    const total = existing.usageCount + 1;
    existing.averageDuration =
      (existing.averageDuration * existing.usageCount + entry.duration) / total;
    existing.averageReward =
      (existing.averageReward * existing.usageCount + entry.reward) / total;
    existing.successRate =
      (existing.successRate * existing.usageCount + (success ? 1 : 0)) / total;
    existing.effectiveness =
      (existing.effectiveness * existing.usageCount + entry.effectiveness) /
      total;
    existing.usageCount = total;
    existing.lastUsed = entry.timestamp;
    this.methods.set(key, existing);
  }

  private clamp(value: number): number {
    if (Number.isNaN(value)) return 0;
    return Math.max(0, Math.min(1, value));
  }
}

export type { HTNTaskMemory, HTNMethodMemory, HTNNetworkMemory };
