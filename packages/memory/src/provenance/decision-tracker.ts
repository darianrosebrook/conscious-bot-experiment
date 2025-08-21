/**
 * Decision tracker implementation.
 *
 * Tracks decisions throughout their complete lifecycle from initial context
 * through final outcomes and learning integration.
 *
 * @author @darianrosebrook
 */

import {
  DecisionRecord,
  DecisionStage,
  DecisionImportance,
  DecisionContext,
  InformationSource,
  Alternative,
  Justification,
  Execution,
  Outcome,
  Learning,
  DecisionOutcomeStatus,
  ExecutionStatus,
  Action,
  ActionStatus,
  DecisionRecordSchema,
} from './types';

/**
 * Decision tracker configuration
 */
export interface DecisionTrackerConfig {
  maxDecisions: number;
  autoCleanup: boolean;
  retentionPeriod: number; // milliseconds
  minImportanceToRetain: DecisionImportance;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: DecisionTrackerConfig = {
  maxDecisions: 1000,
  autoCleanup: true,
  retentionPeriod: 30 * 24 * 60 * 60 * 1000, // 30 days
  minImportanceToRetain: DecisionImportance.MEDIUM,
};

/**
 * Decision tracker implementation
 */
export class DecisionTracker {
  private decisions: Map<string, DecisionRecord> = new Map();
  private decisionsByDomain: Map<string, Set<string>> = new Map();
  private decisionsByImportance: Map<DecisionImportance, Set<string>> = new Map();
  private decisionsByStage: Map<DecisionStage, Set<string>> = new Map();
  private decisionsByTag: Map<string, Set<string>> = new Map();
  private config: DecisionTrackerConfig;

  constructor(config: Partial<DecisionTrackerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initializeIndexes();
  }

  /**
   * Initialize indexes
   */
  private initializeIndexes(): void {
    // Initialize decisionsByImportance map
    Object.values(DecisionImportance).forEach((importance) => {
      this.decisionsByImportance.set(
        importance as DecisionImportance,
        new Set<string>()
      );
    });

    // Initialize decisionsByStage map
    Object.values(DecisionStage).forEach((stage) => {
      this.decisionsByStage.set(stage as DecisionStage, new Set<string>());
    });
  }

  /**
   * Start tracking a new decision
   */
  startDecision(
    title: string,
    description: string,
    domain: string,
    importance: DecisionImportance,
    context: Omit<DecisionContext, 'timestamp'>
  ): DecisionRecord {
    const now = Date.now();
    const id = `decision-${now}-${Math.random().toString(36).substring(2, 9)}`;

    const decisionContext: DecisionContext = {
      ...context,
      timestamp: now,
    };

    const decision: DecisionRecord = {
      id,
      title,
      description,
      domain,
      importance,
      stage: DecisionStage.INITIATED,
      timestamp: now,
      context: decisionContext,
      informationSources: [],
      alternatives: [],
      justification: {
        reasoning: '',
        evidenceIds: [],
        confidenceScore: 0,
        ethicalConsiderations: [],
        timestamp: now,
      },
      tags: [],
      relatedDecisions: [],
    };

    // Validate decision
    const validation = DecisionRecordSchema.safeParse(decision);
    if (!validation.success) {
      console.warn('Invalid decision record:', validation.error);
      throw new Error(`Invalid decision record: ${validation.error.message}`);
    }

    // Add to collections
    this.decisions.set(id, decision);

    // Add to indexes
    this.addToIndexes(decision);

    // Cleanup old decisions if needed
    if (this.config.autoCleanup && this.decisions.size > this.config.maxDecisions) {
      this.cleanupOldDecisions();
    }

    return decision;
  }

  /**
   * Add decision to indexes
   */
  private addToIndexes(decision: DecisionRecord): void {
    // Add to domain index
    let domainSet = this.decisionsByDomain.get(decision.domain);
    if (!domainSet) {
      domainSet = new Set<string>();
      this.decisionsByDomain.set(decision.domain, domainSet);
    }
    domainSet.add(decision.id);

    // Add to importance index
    this.decisionsByImportance.get(decision.importance)?.add(decision.id);

    // Add to stage index
    this.decisionsByStage.get(decision.stage)?.add(decision.id);

    // Add to tag index
    for (const tag of decision.tags) {
      let tagSet = this.decisionsByTag.get(tag);
      if (!tagSet) {
        tagSet = new Set<string>();
        this.decisionsByTag.set(tag, tagSet);
      }
      tagSet.add(decision.id);
    }
  }

  /**
   * Remove decision from indexes
   */
  private removeFromIndexes(decision: DecisionRecord): void {
    // Remove from domain index
    this.decisionsByDomain.get(decision.domain)?.delete(decision.id);

    // Remove from importance index
    this.decisionsByImportance.get(decision.importance)?.delete(decision.id);

    // Remove from stage index
    this.decisionsByStage.get(decision.stage)?.delete(decision.id);

    // Remove from tag index
    for (const tag of decision.tags) {
      this.decisionsByTag.get(tag)?.delete(decision.id);
    }
  }

  /**
   * Update decision stage
   */
  updateStage(
    decisionId: string,
    stage: DecisionStage
  ): DecisionRecord | null {
    const decision = this.decisions.get(decisionId);
    if (!decision) {
      return null;
    }

    // Remove from old stage index
    this.decisionsByStage.get(decision.stage)?.delete(decisionId);

    // Update stage
    decision.stage = stage;

    // Add to new stage index
    this.decisionsByStage.get(stage)?.add(decisionId);

    return decision;
  }

  /**
   * Add information source to decision
   */
  addInformationSource(
    decisionId: string,
    source: Omit<InformationSource, 'id' | 'timestamp'>
  ): DecisionRecord | null {
    const decision = this.decisions.get(decisionId);
    if (!decision) {
      return null;
    }

    const now = Date.now();
    const id = `source-${now}-${Math.random().toString(36).substring(2, 9)}`;

    const informationSource: InformationSource = {
      ...source,
      id,
      timestamp: now,
    };

    decision.informationSources.push(informationSource);

    // Update stage if needed
    if (decision.stage === DecisionStage.INITIATED) {
      this.updateStage(decisionId, DecisionStage.INFORMATION_GATHERED);
    }

    return decision;
  }

  /**
   * Add alternative to decision
   */
  addAlternative(
    decisionId: string,
    alternative: Omit<Alternative, 'id'>
  ): DecisionRecord | null {
    const decision = this.decisions.get(decisionId);
    if (!decision) {
      return null;
    }

    const id = `alt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    const newAlternative: Alternative = {
      ...alternative,
      id,
    };

    decision.alternatives.push(newAlternative);

    // Update stage if needed
    if (
      decision.stage === DecisionStage.INITIATED ||
      decision.stage === DecisionStage.INFORMATION_GATHERED
    ) {
      this.updateStage(decisionId, DecisionStage.ALTERNATIVES_EVALUATED);
    }

    return decision;
  }

  /**
   * Make decision by selecting an alternative
   */
  makeDecision(
    decisionId: string,
    alternativeId: string,
    justification: Omit<Justification, 'timestamp'>
  ): DecisionRecord | null {
    const decision = this.decisions.get(decisionId);
    if (!decision) {
      return null;
    }

    // Verify alternative exists
    const alternativeExists = decision.alternatives.some(
      (alt) => alt.id === alternativeId
    );
    if (!alternativeExists) {
      throw new Error(`Alternative ${alternativeId} does not exist`);
    }

    // Update decision
    decision.selectedAlternative = alternativeId;
    decision.justification = {
      ...justification,
      timestamp: Date.now(),
    };

    // Update stage
    this.updateStage(decisionId, DecisionStage.DECISION_MADE);

    return decision;
  }

  /**
   * Start execution of decision
   */
  startExecution(
    decisionId: string,
    metadata: Record<string, any> = {}
  ): DecisionRecord | null {
    const decision = this.decisions.get(decisionId);
    if (!decision) {
      return null;
    }

    // Verify decision has been made
    if (decision.stage < DecisionStage.DECISION_MADE) {
      throw new Error('Cannot execute decision before it is made');
    }

    // Create execution record
    decision.execution = {
      actions: [],
      startTime: Date.now(),
      status: ExecutionStatus.IN_PROGRESS,
      metadata,
    };

    // Update stage
    this.updateStage(decisionId, DecisionStage.EXECUTED);

    return decision;
  }

  /**
   * Add action to execution
   */
  addAction(
    decisionId: string,
    action: Omit<Action, 'id' | 'timestamp' | 'status'>
  ): DecisionRecord | null {
    const decision = this.decisions.get(decisionId);
    if (!decision || !decision.execution) {
      return null;
    }

    const now = Date.now();
    const id = `action-${now}-${Math.random().toString(36).substring(2, 9)}`;

    const newAction: Action = {
      ...action,
      id,
      timestamp: now,
      status: ActionStatus.PENDING,
    };

    decision.execution.actions.push(newAction);

    return decision;
  }

  /**
   * Update action status
   */
  updateActionStatus(
    decisionId: string,
    actionId: string,
    status: ActionStatus,
    result?: any
  ): DecisionRecord | null {
    const decision = this.decisions.get(decisionId);
    if (!decision || !decision.execution) {
      return null;
    }

    // Find action
    const action = decision.execution.actions.find((a) => a.id === actionId);
    if (!action) {
      return null;
    }

    // Update action
    action.status = status;
    if (result !== undefined) {
      action.result = result;
    }

    // Check if all actions are completed
    const allCompleted = decision.execution.actions.every(
      (a) => a.status === ActionStatus.COMPLETED || a.status === ActionStatus.FAILED
    );

    if (allCompleted) {
      decision.execution.status = ExecutionStatus.COMPLETED;
      decision.execution.endTime = Date.now();
    }

    return decision;
  }

  /**
   * Complete execution
   */
  completeExecution(
    decisionId: string,
    status: ExecutionStatus = ExecutionStatus.COMPLETED
  ): DecisionRecord | null {
    const decision = this.decisions.get(decisionId);
    if (!decision || !decision.execution) {
      return null;
    }

    // Update execution
    decision.execution.status = status;
    decision.execution.endTime = Date.now();

    return decision;
  }

  /**
   * Record outcome of decision
   */
  recordOutcome(
    decisionId: string,
    outcome: Omit<Outcome, 'timestamp'>
  ): DecisionRecord | null {
    const decision = this.decisions.get(decisionId);
    if (!decision) {
      return null;
    }

    // Create outcome record
    decision.outcome = {
      ...outcome,
      timestamp: Date.now(),
    };

    // Update stage
    this.updateStage(decisionId, DecisionStage.OUTCOME_RECORDED);

    return decision;
  }

  /**
   * Add learning from decision
   */
  addLearning(
    decisionId: string,
    learning: Omit<Learning, 'id' | 'timestamp'>
  ): DecisionRecord | null {
    const decision = this.decisions.get(decisionId);
    if (!decision) {
      return null;
    }

    const now = Date.now();
    const id = `learning-${now}-${Math.random().toString(36).substring(2, 9)}`;

    const newLearning: Learning = {
      ...learning,
      id,
      timestamp: now,
    };

    // Initialize learnings array if needed
    if (!decision.learnings) {
      decision.learnings = [];
    }

    decision.learnings.push(newLearning);

    // Update stage
    this.updateStage(decisionId, DecisionStage.LEARNING_INTEGRATED);

    return decision;
  }

  /**
   * Add tag to decision
   */
  addTag(decisionId: string, tag: string): DecisionRecord | null {
    const decision = this.decisions.get(decisionId);
    if (!decision) {
      return null;
    }

    // Skip if tag already exists
    if (decision.tags.includes(tag)) {
      return decision;
    }

    // Add tag
    decision.tags.push(tag);

    // Update tag index
    let tagSet = this.decisionsByTag.get(tag);
    if (!tagSet) {
      tagSet = new Set<string>();
      this.decisionsByTag.set(tag, tagSet);
    }
    tagSet.add(decisionId);

    return decision;
  }

  /**
   * Remove tag from decision
   */
  removeTag(decisionId: string, tag: string): DecisionRecord | null {
    const decision = this.decisions.get(decisionId);
    if (!decision) {
      return null;
    }

    // Remove tag
    decision.tags = decision.tags.filter((t) => t !== tag);

    // Update tag index
    this.decisionsByTag.get(tag)?.delete(decisionId);

    return decision;
  }

  /**
   * Add related decision
   */
  addRelatedDecision(
    decisionId: string,
    relatedDecisionId: string
  ): DecisionRecord | null {
    const decision = this.decisions.get(decisionId);
    if (!decision) {
      return null;
    }

    // Verify related decision exists
    if (!this.decisions.has(relatedDecisionId)) {
      return null;
    }

    // Skip if already related
    if (decision.relatedDecisions.includes(relatedDecisionId)) {
      return decision;
    }

    // Add related decision
    decision.relatedDecisions.push(relatedDecisionId);

    return decision;
  }

  /**
   * Get decision by ID
   */
  getDecision(decisionId: string): DecisionRecord | null {
    return this.decisions.get(decisionId) || null;
  }

  /**
   * Get decisions by domain
   */
  getDecisionsByDomain(domain: string): DecisionRecord[] {
    const decisionIds = this.decisionsByDomain.get(domain);
    if (!decisionIds) {
      return [];
    }

    return Array.from(decisionIds)
      .map((id) => this.decisions.get(id))
      .filter((decision): decision is DecisionRecord => !!decision);
  }

  /**
   * Get decisions by importance
   */
  getDecisionsByImportance(importance: DecisionImportance): DecisionRecord[] {
    const decisionIds = this.decisionsByImportance.get(importance);
    if (!decisionIds) {
      return [];
    }

    return Array.from(decisionIds)
      .map((id) => this.decisions.get(id))
      .filter((decision): decision is DecisionRecord => !!decision);
  }

  /**
   * Get decisions by stage
   */
  getDecisionsByStage(stage: DecisionStage): DecisionRecord[] {
    const decisionIds = this.decisionsByStage.get(stage);
    if (!decisionIds) {
      return [];
    }

    return Array.from(decisionIds)
      .map((id) => this.decisions.get(id))
      .filter((decision): decision is DecisionRecord => !!decision);
  }

  /**
   * Get decisions by tag
   */
  getDecisionsByTag(tag: string): DecisionRecord[] {
    const decisionIds = this.decisionsByTag.get(tag);
    if (!decisionIds) {
      return [];
    }

    return Array.from(decisionIds)
      .map((id) => this.decisions.get(id))
      .filter((decision): decision is DecisionRecord => !!decision);
  }

  /**
   * Get all decisions
   */
  getAllDecisions(): DecisionRecord[] {
    return Array.from(this.decisions.values());
  }

  /**
   * Get decision statistics
   */
  getStats() {
    // Count decisions by stage
    const countByStage = Object.values(DecisionStage).reduce(
      (acc, stage) => {
        acc[stage] = this.decisionsByStage.get(stage as DecisionStage)?.size || 0;
        return acc;
      },
      {} as Record<string, number>
    );

    // Count decisions by importance
    const countByImportance = Object.values(DecisionImportance).reduce(
      (acc, importance) => {
        acc[importance] =
          this.decisionsByImportance.get(importance as DecisionImportance)?.size ||
          0;
        return acc;
      },
      {} as Record<string, number>
    );

    // Count decisions by domain
    const countByDomain: Record<string, number> = {};
    for (const [domain, decisions] of this.decisionsByDomain.entries()) {
      countByDomain[domain] = decisions.size;
    }

    // Count decisions by outcome status
    const countByOutcome = Object.values(DecisionOutcomeStatus).reduce(
      (acc, status) => {
        acc[status] = Array.from(this.decisions.values()).filter(
          (d) => d.outcome?.status === status
        ).length;
        return acc;
      },
      {} as Record<string, number>
    );

    // Get top tags
    const tagCounts = Array.from(this.decisionsByTag.entries())
      .map(([tag, decisions]) => ({ tag, count: decisions.size }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalDecisions: this.decisions.size,
      countByStage,
      countByImportance,
      countByDomain,
      countByOutcome,
      topTags: tagCounts,
      averageAlternativesPerDecision:
        Array.from(this.decisions.values()).reduce(
          (sum, d) => sum + d.alternatives.length,
          0
        ) / this.decisions.size || 0,
    };
  }

  /**
   * Clean up old decisions
   */
  private cleanupOldDecisions(): void {
    const now = Date.now();
    const cutoff = now - this.config.retentionPeriod;
    const importanceLevels = Object.values(DecisionImportance);
    const minImportanceIndex = importanceLevels.indexOf(
      this.config.minImportanceToRetain
    );

    // Find decisions to remove
    const decisionsToRemove: string[] = [];

    for (const decision of this.decisions.values()) {
      const importanceIndex = importanceLevels.indexOf(decision.importance);

      // Keep important decisions regardless of age
      if (importanceIndex >= minImportanceIndex) {
        continue;
      }

      // Remove old decisions
      if (decision.timestamp < cutoff) {
        decisionsToRemove.push(decision.id);
      }
    }

    // Remove decisions
    for (const decisionId of decisionsToRemove) {
      const decision = this.decisions.get(decisionId);
      if (decision) {
        this.removeFromIndexes(decision);
        this.decisions.delete(decisionId);
      }
    }
  }

  /**
   * Clear all decisions
   */
  clear(): void {
    this.decisions.clear();
    this.decisionsByDomain.clear();

    // Clear indexes
    for (const decisionSet of this.decisionsByImportance.values()) {
      decisionSet.clear();
    }

    for (const decisionSet of this.decisionsByStage.values()) {
      decisionSet.clear();
    }

    for (const decisionSet of this.decisionsByTag.values()) {
      decisionSet.clear();
    }
  }
}
