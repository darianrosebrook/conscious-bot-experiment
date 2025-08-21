/**
 * Constitutional Filter - Ethical rule enforcement for capability execution
 *
 * Evaluates capability requests against constitutional rules and safety constraints
 * before execution to ensure ethical and safe behavior.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';

import {
  CapabilitySpec,
  ExecutionRequest,
  ExecutionContext,
  ConstitutionalDecision,
  RiskLevel,
  SafetyTag,
} from './types';

export interface ConstitutionalRule {
  id: string;
  name: string;
  description: string;
  priority: number; // Higher number = higher priority
  enabled: boolean;

  // Rule conditions
  appliesTo: string[]; // Capability IDs or patterns
  safetyTagTriggers: SafetyTag[];
  riskLevelThreshold: RiskLevel;
  contextConditions: ContextCondition[];

  // Rule logic
  evaluate: (
    capability: CapabilitySpec,
    request: ExecutionRequest,
    context: ExecutionContext
  ) => Promise<RuleEvaluation>;
}

export interface ContextCondition {
  type: 'health' | 'danger' | 'time' | 'location' | 'inventory' | 'social';
  operator: 'lt' | 'lte' | 'gt' | 'gte' | 'eq' | 'neq' | 'contains' | 'near';
  value: any;
  description: string;
}

export interface RuleEvaluation {
  passed: boolean;
  severity: 'minor' | 'moderate' | 'major' | 'critical';
  message: string;
  suggestedAction?: string;
  requiresApproval?: boolean;
}

export interface ConstitutionalFilterEvents {
  'rule-violated': [string, RuleEvaluation]; // ruleId, evaluation
  'high-risk-detected': [ExecutionRequest, ConstitutionalDecision];
  'approval-required': [ExecutionRequest, string[]]; // request, required approvals
}

/**
 * Constitutional filtering system that evaluates capability requests
 * against ethical rules and safety constraints before execution.
 */
export class ConstitutionalFilter extends EventEmitter<ConstitutionalFilterEvents> {
  private rules = new Map<string, ConstitutionalRule>();
  private approvalCache = new Map<
    string,
    { decision: boolean; expiry: number }
  >();
  private violationHistory: Array<{
    ruleId: string;
    timestamp: number;
    severity: string;
  }> = [];

  constructor() {
    super();
    this.initializeDefaultRules();
  }

  /**
   * Initialize with default constitutional rules
   */
  private initializeDefaultRules(): void {
    const defaultRules: ConstitutionalRule[] = [
      {
        id: 'no_unprovoked_violence',
        name: 'No Unprovoked Violence',
        description:
          'Do not attack players or friendly entities without provocation',
        priority: 100,
        enabled: true,
        appliesTo: ['attack_entity', 'use_weapon'],
        safetyTagTriggers: ['destructive'],
        riskLevelThreshold: RiskLevel.MEDIUM,
        contextConditions: [],
        evaluate: async (capability, request, context) => {
          if (
            capability.category === 'combat' &&
            !request.metadata?.justified
          ) {
            return {
              passed: false,
              severity: 'critical',
              message: 'Combat actions require justification',
              suggestedAction:
                'Provide justification or find non-violent solution',
              requiresApproval: true,
            };
          }
          return {
            passed: true,
            severity: 'minor',
            message: 'No violence concerns',
          };
        },
      },

      {
        id: 'no_griefing',
        name: 'No Griefing',
        description:
          'Do not destroy player-built structures or valuable resources',
        priority: 90,
        enabled: true,
        appliesTo: ['mine_block', 'break_structure', 'place_lava'],
        safetyTagTriggers: ['destructive', 'permanent_change'],
        riskLevelThreshold: RiskLevel.MEDIUM,
        contextConditions: [],
        evaluate: async (capability, request, context) => {
          // Check if near player-built structures (simplified)
          const nearPlayers = context.nearbyEntities.filter(
            (e) => e.type === 'player' && e.distance < 50
          );

          if (
            nearPlayers.length > 0 &&
            capability.safetyTags.includes('destructive')
          ) {
            return {
              passed: false,
              severity: 'major',
              message: 'Destructive action near player structures prohibited',
              suggestedAction:
                'Move away from player areas or find alternative approach',
            };
          }
          return {
            passed: true,
            severity: 'minor',
            message: 'No griefing concerns',
          };
        },
      },

      {
        id: 'respect_property',
        name: 'Respect Property',
        description: 'Do not take items that belong to other players',
        priority: 80,
        enabled: true,
        appliesTo: ['pick_up_item', 'open_chest', 'mine_block'],
        safetyTagTriggers: ['affects_others'],
        riskLevelThreshold: RiskLevel.LOW,
        contextConditions: [
          {
            type: 'social',
            operator: 'gt',
            value: 0,
            description: 'Other players nearby',
          },
        ],
        evaluate: async (capability, request, context) => {
          const nearPlayers = context.nearbyEntities.filter(
            (e) => e.type === 'player' && e.distance < 20
          );

          if (
            nearPlayers.length > 0 &&
            (capability.id === 'pick_up_item' || capability.id === 'mine_block')
          ) {
            return {
              passed: false,
              severity: 'moderate',
              message:
                'Taking items near other players may violate property rights',
              suggestedAction:
                'Ask permission or wait for players to leave area',
              requiresApproval: true,
            };
          }
          return {
            passed: true,
            severity: 'minor',
            message: 'No property concerns',
          };
        },
      },

      {
        id: 'avoid_self_harm',
        name: 'Avoid Self-Harm',
        description: 'Do not take actions that would likely cause self-damage',
        priority: 95,
        enabled: true,
        appliesTo: ['jump_from_height', 'enter_lava', 'touch_cactus'],
        safetyTagTriggers: [],
        riskLevelThreshold: RiskLevel.LOW,
        contextConditions: [
          {
            type: 'health',
            operator: 'lt',
            value: 0.5,
            description: 'Low health',
          },
        ],
        evaluate: async (capability, request, context) => {
          if (
            context.agentHealth < 0.3 &&
            capability.riskLevel >= RiskLevel.MEDIUM
          ) {
            return {
              passed: false,
              severity: 'major',
              message: 'Action too risky with low health',
              suggestedAction: 'Heal before attempting risky actions',
            };
          }

          if (context.dangerLevel > 0.7) {
            return {
              passed: false,
              severity: 'moderate',
              message: 'Environment too dangerous for this action',
              suggestedAction: 'Move to safer location first',
            };
          }

          return {
            passed: true,
            severity: 'minor',
            message: 'No self-harm concerns',
          };
        },
      },

      {
        id: 'preserve_environment',
        name: 'Preserve Environment',
        description: 'Minimize unnecessary environmental damage',
        priority: 60,
        enabled: true,
        appliesTo: ['burn_forest', 'drain_water', 'kill_animals'],
        safetyTagTriggers: ['destructive', 'permanent_change'],
        riskLevelThreshold: RiskLevel.LOW,
        contextConditions: [],
        evaluate: async (capability, request, context) => {
          if (
            capability.safetyTags.includes('destructive') &&
            !request.metadata?.necessary
          ) {
            return {
              passed: false,
              severity: 'moderate',
              message: 'Environmental damage requires justification',
              suggestedAction:
                'Provide necessity justification or find alternative',
              requiresApproval: true,
            };
          }
          return {
            passed: true,
            severity: 'minor',
            message: 'No environmental concerns',
          };
        },
      },

      {
        id: 'emergency_override',
        name: 'Emergency Override',
        description: 'Allow normally restricted actions in emergencies',
        priority: 200, // Highest priority
        enabled: true,
        appliesTo: ['*'], // Applies to all capabilities
        safetyTagTriggers: [],
        riskLevelThreshold: RiskLevel.MINIMAL,
        contextConditions: [
          {
            type: 'health',
            operator: 'lt',
            value: 0.2,
            description: 'Critical health',
          },
          {
            type: 'danger',
            operator: 'gt',
            value: 0.8,
            description: 'High danger',
          },
        ],
        evaluate: async (capability, request, context) => {
          const isEmergency =
            context.agentHealth < 0.2 || context.dangerLevel > 0.8;

          if (isEmergency && request.metadata?.emergency) {
            return {
              passed: true,
              severity: 'minor',
              message:
                'Emergency situation allows override of normal restrictions',
            };
          }

          // This rule doesn't block anything, it just provides emergency context
          return {
            passed: true,
            severity: 'minor',
            message: 'No emergency override needed',
          };
        },
      },
    ];

    for (const rule of defaultRules) {
      this.rules.set(rule.id, rule);
    }
  }

  /**
   * Evaluate capability execution against constitutional rules
   *
   * @param capability - Capability being requested
   * @param request - Specific execution request
   * @param context - Current agent and environmental context
   * @returns Constitutional approval with reasoning
   */
  async evaluateExecution(
    capability: CapabilitySpec,
    request: ExecutionRequest,
    context: ExecutionContext
  ): Promise<ConstitutionalDecision> {
    const applicableRules = this.getApplicableRules(
      capability,
      request,
      context
    );
    const violatedRules: string[] = [];
    const evaluations: RuleEvaluation[] = [];
    let maxSeverity: 'minor' | 'moderate' | 'major' | 'critical' = 'minor';
    const suggestedActions: string[] = [];
    let requiresHumanReview = false;

    // Evaluate each applicable rule
    for (const rule of applicableRules) {
      try {
        const evaluation = await rule.evaluate(capability, request, context);
        evaluations.push(evaluation);

        if (!evaluation.passed) {
          violatedRules.push(rule.id);
          this.recordViolation(rule.id, evaluation.severity);
          this.emit('rule-violated', rule.id, evaluation);

          // Track highest severity
          if (
            this.getSeverityLevel(evaluation.severity) >
            this.getSeverityLevel(maxSeverity)
          ) {
            maxSeverity = evaluation.severity;
          }

          if (evaluation.suggestedAction) {
            suggestedActions.push(evaluation.suggestedAction);
          }

          if (evaluation.requiresApproval) {
            requiresHumanReview = true;
          }
        }
      } catch (error) {
        // Rule evaluation failed - treat as violation
        violatedRules.push(rule.id);
        evaluations.push({
          passed: false,
          severity: 'critical',
          message: `Rule evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
        maxSeverity = 'critical';
      }
    }

    const approved = violatedRules.length === 0;
    const reasoning = approved
      ? `All ${applicableRules.length} constitutional rules passed`
      : `${violatedRules.length} constitutional rule(s) violated: ${violatedRules.join(', ')}`;

    const decision: ConstitutionalDecision = {
      approved,
      reasoning,
      violatedRules,
      severity: maxSeverity,
      suggestedActions,
      requiresHumanReview,
      timestamp: Date.now(),
    };

    // Emit high-risk detection
    if (!approved && (maxSeverity === 'major' || maxSeverity === 'critical')) {
      this.emit('high-risk-detected', request, decision);
    }

    // Emit approval requirement
    if (requiresHumanReview) {
      this.emit('approval-required', request, suggestedActions);
    }

    return decision;
  }

  /**
   * Get applicable rules for capability and context
   */
  private getApplicableRules(
    capability: CapabilitySpec,
    request: ExecutionRequest,
    context: ExecutionContext
  ): ConstitutionalRule[] {
    const rules: ConstitutionalRule[] = [];

    for (const [id, rule] of this.rules) {
      if (!rule.enabled) continue;

      // Check if rule applies to this capability
      const appliesToCapability =
        rule.appliesTo.includes('*') ||
        rule.appliesTo.includes(capability.id) ||
        rule.appliesTo.some((pattern) => capability.id.includes(pattern));

      if (!appliesToCapability) continue;

      // Check risk level threshold
      if (capability.riskLevel < rule.riskLevelThreshold) continue;

      // Check safety tag triggers
      if (rule.safetyTagTriggers.length > 0) {
        const hasTriggeredTag = rule.safetyTagTriggers.some((tag) =>
          capability.safetyTags.includes(tag)
        );
        if (!hasTriggeredTag) continue;
      }

      // Check context conditions
      if (rule.contextConditions.length > 0) {
        const contextMatches = rule.contextConditions.some((condition) =>
          this.evaluateContextCondition(condition, context)
        );
        if (!contextMatches) continue;
      }

      rules.push(rule);
    }

    // Sort by priority (descending)
    return rules.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Evaluate a context condition
   */
  private evaluateContextCondition(
    condition: ContextCondition,
    context: ExecutionContext
  ): boolean {
    let contextValue: any;

    switch (condition.type) {
      case 'health':
        contextValue = context.agentHealth;
        break;
      case 'danger':
        contextValue = context.dangerLevel;
        break;
      case 'time':
        contextValue = context.timeOfDay;
        break;
      case 'social':
        contextValue = context.nearbyEntities.filter(
          (e) => e.type === 'player'
        ).length;
        break;
      default:
        return false;
    }

    switch (condition.operator) {
      case 'lt':
        return contextValue < condition.value;
      case 'lte':
        return contextValue <= condition.value;
      case 'gt':
        return contextValue > condition.value;
      case 'gte':
        return contextValue >= condition.value;
      case 'eq':
        return contextValue === condition.value;
      case 'neq':
        return contextValue !== condition.value;
      default:
        return false;
    }
  }

  /**
   * Get numeric severity level for comparison
   */
  private getSeverityLevel(severity: string): number {
    switch (severity) {
      case 'minor':
        return 1;
      case 'moderate':
        return 2;
      case 'major':
        return 3;
      case 'critical':
        return 4;
      default:
        return 0;
    }
  }

  /**
   * Record a rule violation for tracking
   */
  private recordViolation(ruleId: string, severity: string): void {
    this.violationHistory.push({
      ruleId,
      timestamp: Date.now(),
      severity,
    });

    // Keep only recent violations (last 1000)
    if (this.violationHistory.length > 1000) {
      this.violationHistory = this.violationHistory.slice(-1000);
    }
  }

  /**
   * Add a new constitutional rule
   *
   * @param rule - Rule to add
   */
  addRule(rule: ConstitutionalRule): void {
    this.rules.set(rule.id, rule);
  }

  /**
   * Remove a constitutional rule
   *
   * @param ruleId - ID of rule to remove
   */
  removeRule(ruleId: string): boolean {
    return this.rules.delete(ruleId);
  }

  /**
   * Enable or disable a rule
   *
   * @param ruleId - ID of rule
   * @param enabled - Whether to enable or disable
   */
  setRuleEnabled(ruleId: string, enabled: boolean): boolean {
    const rule = this.rules.get(ruleId);
    if (!rule) return false;

    rule.enabled = enabled;
    return true;
  }

  /**
   * Get all constitutional rules
   *
   * @returns Array of all rules
   */
  getRules(): ConstitutionalRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Get rule by ID
   *
   * @param ruleId - ID of rule
   * @returns Rule or undefined
   */
  getRule(ruleId: string): ConstitutionalRule | undefined {
    return this.rules.get(ruleId);
  }

  /**
   * Get violation history
   *
   * @param limit - Maximum number of violations to return
   * @returns Recent violations
   */
  getViolationHistory(
    limit: number = 100
  ): Array<{ ruleId: string; timestamp: number; severity: string }> {
    return this.violationHistory.slice(-limit);
  }

  /**
   * Get violation statistics
   *
   * @returns Violation statistics by rule and severity
   */
  getViolationStats(): {
    totalViolations: number;
    violationsByRule: Record<string, number>;
    violationsBySeverity: Record<string, number>;
  } {
    const violationsByRule: Record<string, number> = {};
    const violationsBySeverity: Record<string, number> = {};

    for (const violation of this.violationHistory) {
      violationsByRule[violation.ruleId] =
        (violationsByRule[violation.ruleId] || 0) + 1;
      violationsBySeverity[violation.severity] =
        (violationsBySeverity[violation.severity] || 0) + 1;
    }

    return {
      totalViolations: this.violationHistory.length,
      violationsByRule,
      violationsBySeverity,
    };
  }

  /**
   * Clear violation history
   */
  clearViolationHistory(): void {
    this.violationHistory = [];
  }

  /**
   * Check if a capability would be approved (dry run)
   *
   * @param capability - Capability to check
   * @param request - Request to check
   * @param context - Context to check
   * @returns Whether it would be approved
   */
  async wouldApprove(
    capability: CapabilitySpec,
    request: ExecutionRequest,
    context: ExecutionContext
  ): Promise<boolean> {
    const decision = await this.evaluateExecution(capability, request, context);
    return decision.approved;
  }
}
