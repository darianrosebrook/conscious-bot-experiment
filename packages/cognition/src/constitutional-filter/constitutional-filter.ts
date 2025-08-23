/**
 * Constitutional filter for ethical behavior enforcement.
 *
 * Provides high-level interface for evaluating actions, goals, and communications
 * against constitutional rules to ensure safety and ethical compliance.
 *
 * @author @darianrosebrook
 */

import { LLMInterface } from '../cognitive-core/llm-interface';
import { RulesDatabase } from './rules-database';
import { RulesEngine, RulesEngineConfig } from './rules-engine';
import {
  ActionProposal,
  GoalProposal,
  MessageProposal,
  IntrusionRequest,
  EvaluationContext,
  EvaluationResult,
  RuleAction,
  ReasoningTrace,
  ComplianceReport,
  NormDrift,
  RuleCategory,
} from './types';

/**
 * Configuration for constitutional filter
 */
export interface ConstitutionalFilterConfig {
  enforcementLevel: EnforcementLevel;
  autoCorrect: boolean;
  generateExplanations: boolean;
  trackCompliance: boolean;
  detectNormDrift: boolean;
  rulesEngine: Partial<RulesEngineConfig>;
}

/**
 * Enforcement level for constitutional rules
 */
export enum EnforcementLevel {
  STRICT = 'strict', // Enforce all rules strictly
  STANDARD = 'standard', // Enforce most rules with some flexibility
  ADVISORY = 'advisory', // Only provide warnings without enforcement
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: ConstitutionalFilterConfig = {
  enforcementLevel: EnforcementLevel.STANDARD,
  autoCorrect: true,
  generateExplanations: true,
  trackCompliance: true,
  detectNormDrift: true,
  rulesEngine: {
    minConfidence: 0.7,
    useExternalLLM: true,
    strictMode: true,
    logEvaluations: true,
  },
};

/**
 * Constitutional filter for ethical behavior enforcement
 */
export class ConstitutionalFilter {
  private rulesDB: RulesDatabase;
  private rulesEngine: RulesEngine;
  private llm?: LLMInterface;
  private config: ConstitutionalFilterConfig;
  private complianceReports: ComplianceReport[] = [];
  private normDrifts: NormDrift[] = [];
  private lastComplianceCheck: number = 0;

  constructor(
    llm?: LLMInterface,
    config: Partial<ConstitutionalFilterConfig> = {}
  ) {
    this.llm = llm;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.rulesDB = new RulesDatabase();
    this.rulesEngine = new RulesEngine(
      this.rulesDB,
      llm,
      this.config.rulesEngine
    );
  }

  /**
   * Filter an action proposal
   */
  async filterAction(
    action: ActionProposal,
    contextData: Partial<EvaluationContext> = {}
  ): Promise<{
    allowed: boolean;
    action: ActionProposal;
    result: EvaluationResult;
    trace?: ReasoningTrace;
  }> {
    // Evaluate action
    const result = await this.rulesEngine.evaluateAction(action, contextData);

    // Generate reasoning trace if enabled
    let trace: ReasoningTrace | undefined;
    if (this.config.generateExplanations) {
      const context: EvaluationContext = {
        action,
        ...contextData,
        timestamp: result.timestamp,
      };
      trace = await this.rulesEngine.generateReasoningTrace(context, result);
    }

    // Apply enforcement based on result
    const { allowed, modifiedAction } = this.enforceActionDecision(
      action,
      result
    );

    return {
      allowed,
      action: modifiedAction,
      result,
      trace,
    };
  }

  /**
   * Filter a goal proposal
   */
  async filterGoal(
    goal: GoalProposal,
    contextData: Partial<EvaluationContext> = {}
  ): Promise<{
    allowed: boolean;
    goal: GoalProposal;
    result: EvaluationResult;
    trace?: ReasoningTrace;
  }> {
    // Evaluate goal
    const result = await this.rulesEngine.evaluateGoal(goal, contextData);

    // Generate reasoning trace if enabled
    let trace: ReasoningTrace | undefined;
    if (this.config.generateExplanations) {
      const context: EvaluationContext = {
        goal,
        ...contextData,
        timestamp: result.timestamp,
      };
      trace = await this.rulesEngine.generateReasoningTrace(context, result);
    }

    // Apply enforcement based on result
    const { allowed, modifiedGoal } = this.enforceGoalDecision(goal, result);

    return {
      allowed,
      goal: modifiedGoal,
      result,
      trace,
    };
  }

  /**
   * Filter a message proposal
   */
  async filterMessage(
    message: MessageProposal,
    contextData: Partial<EvaluationContext> = {}
  ): Promise<{
    allowed: boolean;
    message: MessageProposal;
    result: EvaluationResult;
    trace?: ReasoningTrace;
  }> {
    // Evaluate message
    const result = await this.rulesEngine.evaluateMessage(message, contextData);

    // Generate reasoning trace if enabled
    let trace: ReasoningTrace | undefined;
    if (this.config.generateExplanations) {
      const context: EvaluationContext = {
        message,
        ...contextData,
        timestamp: result.timestamp,
      };
      trace = await this.rulesEngine.generateReasoningTrace(context, result);
    }

    // Apply enforcement based on result
    const { allowed, modifiedMessage } = this.enforceMessageDecision(
      message,
      result
    );

    return {
      allowed,
      message: modifiedMessage,
      result,
      trace,
    };
  }

  /**
   * Filter an intrusion request
   */
  async filterIntrusion(
    intrusion: IntrusionRequest,
    contextData: Partial<EvaluationContext> = {}
  ): Promise<{
    allowed: boolean;
    result: EvaluationResult;
    trace?: ReasoningTrace;
  }> {
    // Evaluate intrusion
    const result = await this.rulesEngine.evaluateIntrusion(
      intrusion,
      contextData
    );

    // Generate reasoning trace if enabled
    let trace: ReasoningTrace | undefined;
    if (this.config.generateExplanations) {
      const context: EvaluationContext = {
        intrusion,
        ...contextData,
        timestamp: result.timestamp,
      };
      trace = await this.rulesEngine.generateReasoningTrace(context, result);
    }

    // Apply enforcement based on result
    const allowed = this.enforceIntrusionDecision(intrusion, result);

    return {
      allowed,
      result,
      trace,
    };
  }

  /**
   * Enforce decision for action proposal
   */
  private enforceActionDecision(
    action: ActionProposal,
    result: EvaluationResult
  ): {
    allowed: boolean;
    modifiedAction: ActionProposal;
  } {
    // Clone action to avoid modifying original
    const modifiedAction = { ...action };

    // Apply enforcement based on enforcement level
    switch (this.config.enforcementLevel) {
      case EnforcementLevel.STRICT:
        // In strict mode, only ALLOW actions are permitted
        if (result.decision === RuleAction.ALLOW) {
          return { allowed: true, modifiedAction };
        } else if (
          result.decision === RuleAction.MODIFY &&
          this.config.autoCorrect
        ) {
          // Apply modifications if auto-correct is enabled
          if (
            result.suggestedModifications &&
            result.suggestedModifications.length > 0
          ) {
            // Add modifications to justification
            modifiedAction.justification = modifiedAction.justification
              ? `${modifiedAction.justification}\n\nModified due to constitutional rules: ${result.suggestedModifications.join(', ')}`
              : `Modified due to constitutional rules: ${result.suggestedModifications.join(', ')}`;
          }
          return { allowed: true, modifiedAction };
        } else {
          return { allowed: false, modifiedAction };
        }

      case EnforcementLevel.STANDARD:
        // In standard mode, ALLOW and MODIFY actions are permitted, FLAG is warned
        if (result.decision === RuleAction.ALLOW) {
          return { allowed: true, modifiedAction };
        } else if (result.decision === RuleAction.MODIFY) {
          // Apply modifications if auto-correct is enabled
          if (
            this.config.autoCorrect &&
            result.suggestedModifications &&
            result.suggestedModifications.length > 0
          ) {
            // Add modifications to justification
            modifiedAction.justification = modifiedAction.justification
              ? `${modifiedAction.justification}\n\nModified due to constitutional rules: ${result.suggestedModifications.join(', ')}`
              : `Modified due to constitutional rules: ${result.suggestedModifications.join(', ')}`;
          }
          return { allowed: true, modifiedAction };
        } else if (result.decision === RuleAction.FLAG) {
          // Add warning flags to justification
          if (result.warningFlags && result.warningFlags.length > 0) {
            modifiedAction.justification = modifiedAction.justification
              ? `${modifiedAction.justification}\n\nWarning: ${result.warningFlags.join(', ')}`
              : `Warning: ${result.warningFlags.join(', ')}`;
          }
          return { allowed: true, modifiedAction };
        } else {
          return { allowed: false, modifiedAction };
        }

      case EnforcementLevel.ADVISORY:
        // In advisory mode, all actions are permitted with warnings
        if (
          result.decision === RuleAction.DENY ||
          result.decision === RuleAction.ESCALATE
        ) {
          // Add warning to justification
          modifiedAction.justification = modifiedAction.justification
            ? `${modifiedAction.justification}\n\nWarning: This action violates constitutional rules but is permitted in advisory mode.`
            : `Warning: This action violates constitutional rules but is permitted in advisory mode.`;
        } else if (
          result.decision === RuleAction.MODIFY &&
          result.suggestedModifications
        ) {
          // Add suggestions to justification
          modifiedAction.justification = modifiedAction.justification
            ? `${modifiedAction.justification}\n\nSuggested modifications: ${result.suggestedModifications.join(', ')}`
            : `Suggested modifications: ${result.suggestedModifications.join(', ')}`;
        } else if (result.decision === RuleAction.FLAG && result.warningFlags) {
          // Add warning flags to justification
          modifiedAction.justification = modifiedAction.justification
            ? `${modifiedAction.justification}\n\nWarning: ${result.warningFlags.join(', ')}`
            : `Warning: ${result.warningFlags.join(', ')}`;
        }
        return { allowed: true, modifiedAction };

      default:
        return { allowed: true, modifiedAction };
    }
  }

  /**
   * Enforce decision for goal proposal
   */
  private enforceGoalDecision(
    goal: GoalProposal,
    result: EvaluationResult
  ): {
    allowed: boolean;
    modifiedGoal: GoalProposal;
  } {
    // Clone goal to avoid modifying original
    const modifiedGoal = { ...goal };

    // Apply enforcement based on enforcement level
    switch (this.config.enforcementLevel) {
      case EnforcementLevel.STRICT:
        // In strict mode, only ALLOW goals are permitted
        if (result.decision === RuleAction.ALLOW) {
          return { allowed: true, modifiedGoal };
        } else if (
          result.decision === RuleAction.MODIFY &&
          this.config.autoCorrect
        ) {
          // Apply modifications if auto-correct is enabled
          if (
            result.suggestedModifications &&
            result.suggestedModifications.length > 0
          ) {
            // Add modifications to constraints
            const constraints = modifiedGoal.constraints || [];
            constraints.push(...result.suggestedModifications);
            modifiedGoal.constraints = constraints;
          }
          return { allowed: true, modifiedGoal };
        } else {
          return { allowed: false, modifiedGoal };
        }

      case EnforcementLevel.STANDARD:
        // In standard mode, ALLOW and MODIFY goals are permitted, FLAG is warned
        if (result.decision === RuleAction.ALLOW) {
          return { allowed: true, modifiedGoal };
        } else if (result.decision === RuleAction.MODIFY) {
          // Apply modifications if auto-correct is enabled
          if (
            this.config.autoCorrect &&
            result.suggestedModifications &&
            result.suggestedModifications.length > 0
          ) {
            // Add modifications to constraints
            const constraints = modifiedGoal.constraints || [];
            constraints.push(...result.suggestedModifications);
            modifiedGoal.constraints = constraints;
          }
          return { allowed: true, modifiedGoal };
        } else if (result.decision === RuleAction.FLAG) {
          // Add warning flags to constraints
          if (result.warningFlags && result.warningFlags.length > 0) {
            const constraints = modifiedGoal.constraints || [];
            constraints.push(
              ...result.warningFlags.map((flag) => `Warning: ${flag}`)
            );
            modifiedGoal.constraints = constraints;
          }
          return { allowed: true, modifiedGoal };
        } else {
          return { allowed: false, modifiedGoal };
        }

      case EnforcementLevel.ADVISORY:
        // In advisory mode, all goals are permitted with warnings
        if (
          result.decision === RuleAction.DENY ||
          result.decision === RuleAction.ESCALATE
        ) {
          // Add warning to constraints
          const constraints = modifiedGoal.constraints || [];
          constraints.push(
            'Warning: This goal violates constitutional rules but is permitted in advisory mode.'
          );
          modifiedGoal.constraints = constraints;
        } else if (
          result.decision === RuleAction.MODIFY &&
          result.suggestedModifications
        ) {
          // Add suggestions to constraints
          const constraints = modifiedGoal.constraints || [];
          constraints.push(
            ...result.suggestedModifications.map((mod) => `Suggestion: ${mod}`)
          );
          modifiedGoal.constraints = constraints;
        } else if (result.decision === RuleAction.FLAG && result.warningFlags) {
          // Add warning flags to constraints
          const constraints = modifiedGoal.constraints || [];
          constraints.push(
            ...result.warningFlags.map((flag) => `Warning: ${flag}`)
          );
          modifiedGoal.constraints = constraints;
        }
        return { allowed: true, modifiedGoal };

      default:
        return { allowed: true, modifiedGoal };
    }
  }

  /**
   * Enforce decision for message proposal
   */
  private enforceMessageDecision(
    message: MessageProposal,
    result: EvaluationResult
  ): {
    allowed: boolean;
    modifiedMessage: MessageProposal;
  } {
    // Clone message to avoid modifying original
    const modifiedMessage = { ...message };

    // Apply enforcement based on enforcement level
    switch (this.config.enforcementLevel) {
      case EnforcementLevel.STRICT:
        // In strict mode, only ALLOW messages are permitted
        if (result.decision === RuleAction.ALLOW) {
          return { allowed: true, modifiedMessage };
        } else if (
          result.decision === RuleAction.MODIFY &&
          this.config.autoCorrect
        ) {
          // Apply modifications if auto-correct is enabled
          if (
            result.suggestedModifications &&
            result.suggestedModifications.length > 0
          ) {
            // Modify message content based on suggestions
            // This is a simple implementation; in practice, you would use LLM to modify the content
            let content = modifiedMessage.content;
            for (const suggestion of result.suggestedModifications) {
              content = this.applyMessageModification(content, suggestion);
            }
            modifiedMessage.content = content;
          }
          return { allowed: true, modifiedMessage };
        } else {
          return { allowed: false, modifiedMessage };
        }

      case EnforcementLevel.STANDARD:
        // In standard mode, ALLOW and MODIFY messages are permitted, FLAG is warned
        if (result.decision === RuleAction.ALLOW) {
          return { allowed: true, modifiedMessage };
        } else if (result.decision === RuleAction.MODIFY) {
          // Apply modifications if auto-correct is enabled
          if (
            this.config.autoCorrect &&
            result.suggestedModifications &&
            result.suggestedModifications.length > 0
          ) {
            // Modify message content based on suggestions
            let content = modifiedMessage.content;
            for (const suggestion of result.suggestedModifications) {
              content = this.applyMessageModification(content, suggestion);
            }
            modifiedMessage.content = content;
          }
          return { allowed: true, modifiedMessage };
        } else if (result.decision === RuleAction.FLAG) {
          // Add warning prefix to message
          if (result.warningFlags && result.warningFlags.length > 0) {
            const warning = `[Warning: ${result.warningFlags[0]}] `;
            modifiedMessage.content = warning + modifiedMessage.content;
          }
          return { allowed: true, modifiedMessage };
        } else {
          return { allowed: false, modifiedMessage };
        }

      case EnforcementLevel.ADVISORY:
        // In advisory mode, all messages are permitted with warnings
        if (
          result.decision === RuleAction.DENY ||
          result.decision === RuleAction.ESCALATE
        ) {
          // Add warning prefix to message
          const warning =
            '[Warning: This message violates constitutional rules but is permitted in advisory mode.] ';
          modifiedMessage.content = warning + modifiedMessage.content;
        } else if (
          result.decision === RuleAction.MODIFY &&
          result.suggestedModifications
        ) {
          // Add suggestion note to message
          const suggestion = `[Suggestion: ${result.suggestedModifications[0]}] `;
          modifiedMessage.content = suggestion + modifiedMessage.content;
        } else if (result.decision === RuleAction.FLAG && result.warningFlags) {
          // Add warning prefix to message
          const warning = `[Warning: ${result.warningFlags[0]}] `;
          modifiedMessage.content = warning + modifiedMessage.content;
        }
        return { allowed: true, modifiedMessage };

      default:
        return { allowed: true, modifiedMessage };
    }
  }

  /**
   * Apply modification to message content
   */
  private applyMessageModification(
    content: string,
    suggestion: string
  ): string {
    // Simple implementation; in practice, you would use LLM to modify the content
    // This just appends the suggestion as a note
    return `${content}\n\n[Note: ${suggestion}]`;
  }

  /**
   * Enforce decision for intrusion request
   */
  private enforceIntrusionDecision(
    intrusion: IntrusionRequest,
    result: EvaluationResult
  ): boolean {
    // Apply enforcement based on enforcement level
    switch (this.config.enforcementLevel) {
      case EnforcementLevel.STRICT:
        // In strict mode, only ALLOW intrusions are permitted
        return result.decision === RuleAction.ALLOW;

      case EnforcementLevel.STANDARD:
        // In standard mode, ALLOW and FLAG intrusions are permitted
        return (
          result.decision === RuleAction.ALLOW ||
          result.decision === RuleAction.FLAG
        );

      case EnforcementLevel.ADVISORY:
        // In advisory mode, all intrusions are permitted
        return true;

      default:
        return true;
    }
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(): Promise<ComplianceReport> {
    const now = Date.now();

    // Use last report time as start period
    const start = this.lastComplianceCheck || now - 86400000; // Default to last 24 hours
    this.lastComplianceCheck = now;

    // Get evaluation history within period
    const evaluations = this.rulesEngine
      .getEvaluationHistory()
      .filter(
        (evalResult) =>
          evalResult.timestamp >= start && evalResult.timestamp <= now
      );

    // Calculate statistics
    const totalEvaluations = evaluations.length;
    const violationCount = evaluations.filter(
      (evalResult) =>
        evalResult.decision === RuleAction.DENY ||
        evalResult.decision === RuleAction.ESCALATE
    ).length;

    const flaggedCount = evaluations.filter(
      (evalResult) => evalResult.decision === RuleAction.FLAG
    ).length;

    const escalationCount = evaluations.filter(
      (evalResult) => evalResult.decision === RuleAction.ESCALATE
    ).length;

    // Calculate compliance by category
    const byCategory: Record<RuleCategory, number> = Object.values(
      RuleCategory
    ).reduce(
      (acc, category) => {
        acc[category] = 0;
        return acc;
      },
      {} as Record<RuleCategory, number>
    );

    for (const evalResult of evaluations) {
      for (const rule of evalResult.appliedRules) {
        if (
          rule.action === RuleAction.DENY ||
          rule.action === RuleAction.ESCALATE
        ) {
          byCategory[rule.category] = (byCategory[rule.category] || 0) + 1;
        }
      }
    }

    // Find significant violations
    const significantViolations = evaluations
      .filter(
        (evalResult) =>
          (evalResult.decision === RuleAction.DENY ||
            evalResult.decision === RuleAction.ESCALATE) &&
          evalResult.confidence > 0.8
      )
      .map((evalResult) => evalResult.explanation)
      .slice(0, 5);

    // Calculate overall compliance
    const overallCompliance =
      totalEvaluations > 0
        ? 1 -
          (violationCount + escalationCount + flaggedCount * 0.5) /
            totalEvaluations
        : 1;

    // Generate recommendations
    const recommendations: string[] = [];

    // Find most violated categories
    const sortedCategories = Object.entries(byCategory)
      .sort(([, a], [, b]) => b - a)
      .filter(([, count]) => count > 0)
      .slice(0, 3);

    if (sortedCategories.length > 0) {
      for (const [category, count] of sortedCategories) {
        recommendations.push(
          `Review compliance with ${category} rules (${count} violations).`
        );
      }
    }

    if (escalationCount > 0) {
      recommendations.push(
        `Address ${escalationCount} escalated issues requiring human oversight.`
      );
    }

    if (overallCompliance < 0.9) {
      recommendations.push(
        'Consider additional constitutional rule training to improve compliance.'
      );
    }

    // Create report
    const reportId = `report-${now}-${Math.random().toString(36).substring(2, 9)}`;
    const report: ComplianceReport = {
      id: reportId,
      period: {
        start,
        end: now,
      },
      overallCompliance,
      violationCount,
      flaggedCount,
      escalationCount,
      byCategory,
      significantViolations,
      recommendations,
      timestamp: now,
    };

    // Store report
    this.complianceReports.push(report);

    // Limit history size
    if (this.complianceReports.length > 100) {
      this.complianceReports = this.complianceReports.slice(-100);
    }

    return report;
  }

  /**
   * Get rules database
   */
  getRulesDatabase(): RulesDatabase {
    return this.rulesDB;
  }

  /**
   * Get rules engine
   */
  getRulesEngine(): RulesEngine {
    return this.rulesEngine;
  }

  /**
   * Get compliance reports
   */
  getComplianceReports(): ComplianceReport[] {
    return [...this.complianceReports];
  }

  /**
   * Get norm drifts
   */
  getNormDrifts(): NormDrift[] {
    return [...this.normDrifts];
  }

  /**
   * Get statistics
   */
  getStats() {
    const rulesStats = this.rulesDB.getStats();
    const engineStats = this.rulesEngine.getStats();

    return {
      rules: rulesStats,
      evaluations: engineStats,
      complianceReports: this.complianceReports.length,
      normDrifts: this.normDrifts.length,
      enforcementLevel: this.config.enforcementLevel,
    };
  }
}
