/**
 * Provenance system implementation.
 *
 * Integrates decision tracking, evidence management, audit trail,
 * and explanation generation into a complete provenance system.
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
  Evidence,
  EvidenceType,
  AuditEntry,
  AuditAction,
  ExplanationRequest,
  ExplanationResponse,
  ExplanationFormat,
  ExplanationDetailLevel,
} from './types';
import { DecisionTracker, DecisionTrackerConfig } from './decision-tracker';
import { EvidenceManager, EvidenceManagerConfig } from './evidence-manager';
import { AuditTrail, AuditTrailConfig } from './audit-trail';
import {
  ExplanationGenerator,
  ExplanationGeneratorConfig,
} from './explanation-generator';

/**
 * Provenance system configuration
 */
export interface ProvenanceSystemConfig {
  decisionTracker: Partial<DecisionTrackerConfig>;
  evidenceManager: Partial<EvidenceManagerConfig>;
  auditTrail: Partial<AuditTrailConfig>;
  explanationGenerator: Partial<ExplanationGeneratorConfig>;
  systemActor: string;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: ProvenanceSystemConfig = {
  decisionTracker: {},
  evidenceManager: {},
  auditTrail: {},
  explanationGenerator: {},
  systemActor: 'system',
};

/**
 * Provenance system implementation
 */
export class ProvenanceSystem {
  private decisionTracker: DecisionTracker;
  private evidenceManager: EvidenceManager;
  private auditTrail: AuditTrail;
  private explanationGenerator: ExplanationGenerator;
  private config: ProvenanceSystemConfig;

  constructor(config: Partial<ProvenanceSystemConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize components
    this.decisionTracker = new DecisionTracker(this.config.decisionTracker);
    this.evidenceManager = new EvidenceManager(this.config.evidenceManager);
    this.auditTrail = new AuditTrail(this.config.auditTrail);
    this.explanationGenerator = new ExplanationGenerator(
      this.decisionTracker,
      this.evidenceManager,
      this.config.explanationGenerator
    );
  }

  /**
   * Start tracking a new decision
   */
  startDecision(
    title: string,
    description: string,
    domain: string,
    importance: DecisionImportance,
    context: Omit<DecisionContext, 'timestamp'>,
    actor: string
  ): DecisionRecord {
    // Create decision
    const decision = this.decisionTracker.startDecision(
      title,
      description,
      domain,
      importance,
      context
    );

    // Add audit entry
    this.auditTrail.addEntry({
      decisionId: decision.id,
      actor,
      action: AuditAction.CREATE,
      details: {
        title,
        description,
        domain,
        importance,
      },
    });

    return decision;
  }

  /**
   * Add information source to decision
   */
  addInformationSource(
    decisionId: string,
    source: Omit<InformationSource, 'id' | 'timestamp'>,
    actor: string
  ): DecisionRecord | null {
    // Add information source
    const decision = this.decisionTracker.addInformationSource(
      decisionId,
      source
    );
    if (!decision) {
      return null;
    }

    // Add audit entry
    this.auditTrail.addEntry({
      decisionId,
      actor,
      action: AuditAction.UPDATE,
      details: {
        action: 'add_information_source',
        source: {
          type: source.type,
          description: source.description,
        },
      },
    });

    return decision;
  }

  /**
   * Add alternative to decision
   */
  addAlternative(
    decisionId: string,
    alternative: Omit<Alternative, 'id'>,
    actor: string
  ): DecisionRecord | null {
    // Add alternative
    const decision = this.decisionTracker.addAlternative(
      decisionId,
      alternative
    );
    if (!decision) {
      return null;
    }

    // Add audit entry
    this.auditTrail.addEntry({
      decisionId,
      actor,
      action: AuditAction.UPDATE,
      details: {
        action: 'add_alternative',
        alternative: {
          title: alternative.title,
          description: alternative.description,
        },
      },
    });

    return decision;
  }

  /**
   * Make decision by selecting an alternative
   */
  makeDecision(
    decisionId: string,
    alternativeId: string,
    justification: Omit<Justification, 'timestamp'>,
    actor: string
  ): DecisionRecord | null {
    // Make decision
    const decision = this.decisionTracker.makeDecision(
      decisionId,
      alternativeId,
      justification
    );
    if (!decision) {
      return null;
    }

    // Add audit entry
    this.auditTrail.addEntry({
      decisionId,
      actor,
      action: AuditAction.UPDATE,
      details: {
        action: 'make_decision',
        selectedAlternative: alternativeId,
      },
    });

    return decision;
  }

  /**
   * Start execution of decision
   */
  startExecution(
    decisionId: string,
    metadata: Record<string, any> = {},
    actor: string
  ): DecisionRecord | null {
    // Start execution
    const decision = this.decisionTracker.startExecution(decisionId, metadata);
    if (!decision) {
      return null;
    }

    // Add audit entry
    this.auditTrail.addEntry({
      decisionId,
      actor,
      action: AuditAction.EXECUTE,
      details: {
        action: 'start_execution',
        metadata,
      },
    });

    return decision;
  }

  /**
   * Add action to execution
   */
  addAction(
    decisionId: string,
    action: Omit<import('./types').Action, 'id' | 'timestamp' | 'status'>,
    actor: string
  ): DecisionRecord | null {
    // Add action
    const decision = this.decisionTracker.addAction(decisionId, action);
    if (!decision) {
      return null;
    }

    // Add audit entry
    this.auditTrail.addEntry({
      decisionId,
      actor,
      action: AuditAction.UPDATE,
      details: {
        action: 'add_action',
        actionDetails: {
          type: action.type,
          description: action.description,
        },
      },
    });

    return decision;
  }

  /**
   * Update action status
   */
  updateActionStatus(
    decisionId: string,
    actionId: string,
    status: import('./types').ActionStatus,
    actor: string,
    result?: any
  ): DecisionRecord | null {
    // Update action status
    const decision = this.decisionTracker.updateActionStatus(
      decisionId,
      actionId,
      status,
      result
    );
    if (!decision) {
      return null;
    }

    // Add audit entry
    this.auditTrail.addEntry({
      decisionId,
      actor,
      action: AuditAction.UPDATE,
      details: {
        action: 'update_action_status',
        actionId,
        status,
      },
    });

    return decision;
  }

  /**
   * Complete execution
   */
  completeExecution(
    decisionId: string,
    status: import('./types').ExecutionStatus,
    actor: string
  ): DecisionRecord | null {
    // Complete execution
    const decision = this.decisionTracker.completeExecution(decisionId, status);
    if (!decision) {
      return null;
    }

    // Add audit entry
    this.auditTrail.addEntry({
      decisionId,
      actor,
      action: AuditAction.UPDATE,
      details: {
        action: 'complete_execution',
        status,
      },
    });

    return decision;
  }

  /**
   * Record outcome of decision
   */
  recordOutcome(
    decisionId: string,
    outcome: Omit<Outcome, 'timestamp'>,
    actor: string
  ): DecisionRecord | null {
    // Record outcome
    const decision = this.decisionTracker.recordOutcome(decisionId, outcome);
    if (!decision) {
      return null;
    }

    // Add audit entry
    this.auditTrail.addEntry({
      decisionId,
      actor,
      action: AuditAction.UPDATE,
      details: {
        action: 'record_outcome',
        status: outcome.status,
      },
    });

    return decision;
  }

  /**
   * Add learning from decision
   */
  addLearning(
    decisionId: string,
    learning: Omit<Learning, 'id' | 'timestamp'>,
    actor: string
  ): DecisionRecord | null {
    // Add learning
    const decision = this.decisionTracker.addLearning(decisionId, learning);
    if (!decision) {
      return null;
    }

    // Add audit entry
    this.auditTrail.addEntry({
      decisionId,
      actor,
      action: AuditAction.UPDATE,
      details: {
        action: 'add_learning',
        insight: learning.insight,
      },
    });

    return decision;
  }

  /**
   * Add evidence
   */
  addEvidence(
    evidence: Omit<Evidence, 'id' | 'timestamp'>,
    actor: string
  ): Evidence {
    // Add evidence
    const newEvidence = this.evidenceManager.addEvidence(evidence);

    // Add audit entry
    this.auditTrail.addEntry({
      decisionId: 'global',
      actor,
      action: AuditAction.CREATE,
      details: {
        action: 'add_evidence',
        evidenceId: newEvidence.id,
        type: evidence.type,
        source: evidence.source,
      },
    });

    return newEvidence;
  }

  /**
   * Add evidence to decision justification
   */
  addEvidenceToJustification(
    decisionId: string,
    evidenceId: string,
    actor: string
  ): DecisionRecord | null {
    // Get decision
    const decision = this.decisionTracker.getDecision(decisionId);
    if (!decision) {
      return null;
    }

    // Verify evidence exists
    const evidence = this.evidenceManager.getEvidence(evidenceId);
    if (!evidence) {
      return null;
    }

    // Skip if already added
    if (decision.justification.evidenceIds.includes(evidenceId)) {
      return decision;
    }

    // Add evidence ID to justification
    decision.justification.evidenceIds.push(evidenceId);

    // Add audit entry
    this.auditTrail.addEntry({
      decisionId,
      actor,
      action: AuditAction.UPDATE,
      details: {
        action: 'add_evidence_to_justification',
        evidenceId,
      },
    });

    return decision;
  }

  /**
   * Generate explanation for decision
   */
  explainDecision(
    decisionId: string,
    request: Partial<ExplanationRequest> = {},
    actor: string
  ): ExplanationResponse | null {
    // Get decision
    const decision = this.decisionTracker.getDecision(decisionId);
    if (!decision) {
      return null;
    }

    // Create full request
    const fullRequest: ExplanationRequest = {
      decisionId,
      format: request.format || ExplanationFormat.TEXT,
      detailLevel: request.detailLevel || ExplanationDetailLevel.STANDARD,
      focusAreas: request.focusAreas,
      audience: request.audience,
    };

    // Generate explanation
    const explanation =
      this.explanationGenerator.generateExplanation(fullRequest);
    if (!explanation) {
      return null;
    }

    // Add audit entry
    this.auditTrail.addEntry({
      decisionId,
      actor,
      action: AuditAction.ACCESS,
      details: {
        action: 'explain_decision',
        format: fullRequest.format,
        detailLevel: fullRequest.detailLevel,
      },
    });

    return explanation;
  }

  /**
   * Get decision by ID
   */
  getDecision(decisionId: string, actor: string): DecisionRecord | null {
    const decision = this.decisionTracker.getDecision(decisionId);
    if (!decision) {
      return null;
    }

    // Add audit entry
    this.auditTrail.addEntry({
      decisionId,
      actor,
      action: AuditAction.ACCESS,
      details: {
        action: 'get_decision',
      },
    });

    return decision;
  }

  /**
   * Get decisions by domain
   */
  getDecisionsByDomain(domain: string, actor: string): DecisionRecord[] {
    const decisions = this.decisionTracker.getDecisionsByDomain(domain);

    // Add audit entry
    this.auditTrail.addEntry({
      decisionId: 'global',
      actor,
      action: AuditAction.ACCESS,
      details: {
        action: 'get_decisions_by_domain',
        domain,
        count: decisions.length,
      },
    });

    return decisions;
  }

  /**
   * Get decisions by importance
   */
  getDecisionsByImportance(
    importance: DecisionImportance,
    actor: string
  ): DecisionRecord[] {
    const decisions = this.decisionTracker.getDecisionsByImportance(importance);

    // Add audit entry
    this.auditTrail.addEntry({
      decisionId: 'global',
      actor,
      action: AuditAction.ACCESS,
      details: {
        action: 'get_decisions_by_importance',
        importance,
        count: decisions.length,
      },
    });

    return decisions;
  }

  /**
   * Get all decisions
   */
  getAllDecisions(actor: string): DecisionRecord[] {
    const decisions = this.decisionTracker.getAllDecisions();

    // Add audit entry
    this.auditTrail.addEntry({
      decisionId: 'global',
      actor,
      action: AuditAction.ACCESS,
      details: {
        action: 'get_all_decisions',
        count: decisions.length,
      },
    });

    return decisions;
  }

  /**
   * Get decisions by stage
   */
  getDecisionsByStage(stage: DecisionStage, actor: string): DecisionRecord[] {
    const decisions = this.decisionTracker.getDecisionsByStage(stage);

    // Add audit entry
    this.auditTrail.addEntry({
      decisionId: 'global',
      actor,
      action: AuditAction.ACCESS,
      details: {
        action: 'get_decisions_by_stage',
        stage,
        count: decisions.length,
      },
    });

    return decisions;
  }

  /**
   * Get decisions by tag
   */
  getDecisionsByTag(tag: string, actor: string): DecisionRecord[] {
    const decisions = this.decisionTracker.getDecisionsByTag(tag);

    // Add audit entry
    this.auditTrail.addEntry({
      decisionId: 'global',
      actor,
      action: AuditAction.ACCESS,
      details: {
        action: 'get_decisions_by_tag',
        tag,
        count: decisions.length,
      },
    });

    return decisions;
  }

  /**
   * Get evidence by ID
   */
  getEvidence(evidenceId: string, actor: string): Evidence | null {
    const evidence = this.evidenceManager.getEvidence(evidenceId);
    if (!evidence) {
      return null;
    }

    // Add audit entry
    this.auditTrail.addEntry({
      decisionId: 'global',
      actor,
      action: AuditAction.ACCESS,
      details: {
        action: 'get_evidence',
        evidenceId,
      },
    });

    return evidence;
  }

  /**
   * Search evidence
   */
  searchEvidence(
    query: string,
    options: {
      type?: EvidenceType;
      source?: string;
      maxResults?: number;
    } = {},
    actor: string
  ): Evidence[] {
    const results = this.evidenceManager.searchEvidence(query, options);

    // Add audit entry
    this.auditTrail.addEntry({
      decisionId: 'global',
      actor,
      action: AuditAction.ACCESS,
      details: {
        action: 'search_evidence',
        query,
        options,
        resultCount: results.length,
      },
    });

    return results;
  }

  /**
   * Get audit trail for decision
   */
  getAuditTrail(
    decisionId: string,
    options: {
      startTime?: number;
      endTime?: number;
      actions?: AuditAction[];
      actors?: string[];
      limit?: number;
      sortDirection?: 'asc' | 'desc';
    } = {},
    actor: string
  ): AuditEntry[] {
    const entries = this.auditTrail.getEntriesByDecision(decisionId, options);

    // Add audit entry for this access
    this.auditTrail.addEntry({
      decisionId,
      actor,
      action: AuditAction.ACCESS,
      details: {
        action: 'get_audit_trail',
        options,
        resultCount: entries.length,
      },
    });

    return entries;
  }

  /**
   * Get provenance system statistics
   */
  getStats(actor: string) {
    const decisionStats = this.decisionTracker.getStats();
    const evidenceStats = this.evidenceManager.getStats();
    const auditStats = this.auditTrail.getStats();

    // Add audit entry
    this.auditTrail.addEntry({
      decisionId: 'global',
      actor,
      action: AuditAction.ACCESS,
      details: {
        action: 'get_stats',
      },
    });

    return {
      decisions: decisionStats,
      evidence: evidenceStats,
      audit: auditStats,
      timestamp: Date.now(),
    };
  }

  /**
   * Why function - explain a decision or evidence
   */
  why(
    id: string,
    options: {
      format?: ExplanationFormat;
      detailLevel?: ExplanationDetailLevel;
    } = {}
  ): string | Record<string, any> | null {
    // Check if it's a decision ID
    const decision = this.decisionTracker.getDecision(id);
    if (decision) {
      const explanation = this.explainDecision(
        id,
        {
          format: options.format || ExplanationFormat.TEXT,
          detailLevel: options.detailLevel || ExplanationDetailLevel.STANDARD,
        },
        this.config.systemActor
      );

      if (explanation) {
        return explanation.content;
      }
    }

    // Check if it's an evidence ID
    const evidence = this.evidenceManager.getEvidence(id);
    if (evidence) {
      // Add audit entry
      this.auditTrail.addEntry({
        decisionId: 'global',
        actor: this.config.systemActor,
        action: AuditAction.ACCESS,
        details: {
          action: 'why',
          evidenceId: id,
        },
      });

      // Format evidence based on requested format
      if (options.format === ExplanationFormat.STRUCTURED) {
        return {
          id: evidence.id,
          type: evidence.type,
          content: evidence.content,
          source: evidence.source,
          reliability: evidence.reliability,
          timestamp: evidence.timestamp,
          metadata: evidence.metadata,
        };
      } else {
        // Default to text format
        let result = `Evidence: ${evidence.id}\n`;
        result += `Type: ${evidence.type}\n`;
        result += `Source: ${evidence.source}\n`;
        result += `Reliability: ${evidence.reliability.toFixed(2)}\n`;
        result += `Timestamp: ${new Date(evidence.timestamp).toISOString()}\n\n`;
        result += `Content: ${JSON.stringify(evidence.content, null, 2)}\n`;
        return result;
      }
    }

    return null;
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.decisionTracker.clear();
    this.evidenceManager.clear();
    this.auditTrail.clear();
  }

  // Expose components for direct access if needed
  get components() {
    return {
      decisionTracker: this.decisionTracker,
      evidenceManager: this.evidenceManager,
      auditTrail: this.auditTrail,
      explanationGenerator: this.explanationGenerator,
    };
  }
}
