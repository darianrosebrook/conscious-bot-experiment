/**
 * Constitutional rules engine.
 *
 * Evaluates actions, goals, and communications against constitutional rules
 * to ensure ethical behavior and safety compliance.
 *
 * @author @darianrosebrook
 */

import { LLMInterface } from '../cognitive-core/llm-interface';
import { RulesDatabase } from './rules-database';
import {
  ConstitutionalRule,
  RuleCategory,
  RuleAction,
  EvaluationContext,
  EvaluationResult,
  AppliedRule,
  RuleConflict,
  ConflictType,
  ConflictResolution,
  ReasoningTrace,
  ReasoningStep,
  ReasoningStepType,
  ActionProposal,
  GoalProposal,
  MessageProposal,
  IntrusionRequest,
  EvaluationResultSchema,
} from './types';

/**
 * Configuration for rules engine
 */
export interface RulesEngineConfig {
  minConfidence: number; // Minimum confidence required for evaluation
  useExternalLLM: boolean; // Whether to use external LLM for evaluation
  strictMode: boolean; // Whether to enforce strict rule compliance
  logEvaluations: boolean; // Whether to log all evaluations
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: RulesEngineConfig = {
  minConfidence: 0.7,
  useExternalLLM: true,
  strictMode: true,
  logEvaluations: true,
};

/**
 * Rules engine for constitutional filtering
 */
export class RulesEngine {
  private rulesDB: RulesDatabase;
  private llm?: LLMInterface;
  private config: RulesEngineConfig;
  private evaluationHistory: EvaluationResult[] = [];
  private conflictHistory: RuleConflict[] = [];
  private reasoningTraces: ReasoningTrace[] = [];
  
  constructor(
    rulesDB: RulesDatabase,
    llm?: LLMInterface,
    config: Partial<RulesEngineConfig> = {}
  ) {
    this.rulesDB = rulesDB;
    this.llm = llm;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Evaluate an action proposal against constitutional rules
   */
  async evaluateAction(
    action: ActionProposal,
    contextData: Partial<EvaluationContext> = {}
  ): Promise<EvaluationResult> {
    const context: EvaluationContext = {
      action,
      ...contextData,
      timestamp: Date.now(),
    };
    
    return this.evaluate(context);
  }

  /**
   * Evaluate a goal proposal against constitutional rules
   */
  async evaluateGoal(
    goal: GoalProposal,
    contextData: Partial<EvaluationContext> = {}
  ): Promise<EvaluationResult> {
    const context: EvaluationContext = {
      goal,
      ...contextData,
      timestamp: Date.now(),
    };
    
    return this.evaluate(context);
  }

  /**
   * Evaluate a message proposal against constitutional rules
   */
  async evaluateMessage(
    message: MessageProposal,
    contextData: Partial<EvaluationContext> = {}
  ): Promise<EvaluationResult> {
    const context: EvaluationContext = {
      message,
      ...contextData,
      timestamp: Date.now(),
    };
    
    return this.evaluate(context);
  }

  /**
   * Evaluate an intrusion request against constitutional rules
   */
  async evaluateIntrusion(
    intrusion: IntrusionRequest,
    contextData: Partial<EvaluationContext> = {}
  ): Promise<EvaluationResult> {
    const context: EvaluationContext = {
      intrusion,
      ...contextData,
      timestamp: Date.now(),
    };
    
    return this.evaluate(context);
  }

  /**
   * Core evaluation logic
   */
  private async evaluate(context: EvaluationContext): Promise<EvaluationResult> {
    // Get all enabled rules
    const rules = this.rulesDB.getEnabledRules();
    
    // Apply rules to context
    const appliedRules = await this.applyRules(rules, context);
    
    // Resolve conflicts
    const resolvedAction = this.resolveConflicts(appliedRules, context);
    
    // Create evaluation result
    const evaluationId = `eval-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const result: EvaluationResult = {
      id: evaluationId,
      timestamp: Date.now(),
      decision: resolvedAction.action,
      confidence: resolvedAction.confidence,
      appliedRules,
      explanation: resolvedAction.explanation,
      suggestedModifications: resolvedAction.suggestedModifications,
      warningFlags: resolvedAction.warningFlags,
    };
    
    // Validate result
    const validation = EvaluationResultSchema.safeParse(result);
    if (!validation.success) {
      console.warn('Invalid evaluation result:', validation.error);
    }
    
    // Log evaluation
    if (this.config.logEvaluations) {
      this.evaluationHistory.push(result);
      
      // Limit history size
      if (this.evaluationHistory.length > 1000) {
        this.evaluationHistory = this.evaluationHistory.slice(-1000);
      }
    }
    
    return result;
  }

  /**
   * Apply rules to context
   */
  private async applyRules(
    rules: ConstitutionalRule[],
    context: EvaluationContext
  ): Promise<AppliedRule[]> {
    // Sort rules by priority (highest first)
    const sortedRules = [...rules].sort((a, b) => b.priority - a.priority);
    
    const appliedRules: AppliedRule[] = [];
    
    // Apply each rule
    for (const rule of sortedRules) {
      const match = await this.evaluateRuleMatch(rule, context);
      
      if (match.match > 0.2) { // Threshold for considering a rule applicable
        appliedRules.push({
          ruleId: rule.id,
          ruleName: rule.name,
          category: rule.category,
          action: rule.action,
          priority: rule.priority,
          match: match.match,
          reasoning: match.reasoning,
        });
      }
    }
    
    return appliedRules;
  }

  /**
   * Evaluate how well a rule matches the context
   */
  private async evaluateRuleMatch(
    rule: ConstitutionalRule,
    context: EvaluationContext
  ): Promise<{ match: number; reasoning: string }> {
    // If LLM is available, use it for evaluation
    if (this.llm && this.config.useExternalLLM) {
      return this.evaluateRuleMatchWithLLM(rule, context);
    }
    
    // Otherwise, use simple heuristic matching
    return this.evaluateRuleMatchHeuristic(rule, context);
  }

  /**
   * Evaluate rule match using LLM
   */
  private async evaluateRuleMatchWithLLM(
    rule: ConstitutionalRule,
    context: EvaluationContext
  ): Promise<{ match: number; reasoning: string }> {
    if (!this.llm) {
      return { match: 0, reasoning: 'LLM not available' };
    }
    
    try {
      // Create prompt for LLM
      const prompt = this.createRuleMatchPrompt(rule, context);
      
      // Get LLM response
      const response = await this.llm.generateResponse(prompt, {
        systemPrompt: 'You are a constitutional AI evaluating whether a rule applies to a given context. Provide a match score from 0.0 to 1.0 and reasoning.',
      });
      
      // Extract match score and reasoning
      const text = response.text.trim();
      const matchRegex = /Match score: (0\.\d+|1\.0|1)/i;
      const match = text.match(matchRegex);
      
      let matchScore = 0;
      if (match && match[1]) {
        matchScore = parseFloat(match[1]);
      }
      
      // Extract reasoning
      let reasoning = text;
      if (match) {
        reasoning = text.replace(matchRegex, '').trim();
      }
      
      return {
        match: Math.min(1, Math.max(0, matchScore)), // Ensure between 0 and 1
        reasoning,
      };
    } catch (error) {
      console.error('Error evaluating rule match with LLM:', error);
      
      // Fall back to heuristic matching
      return this.evaluateRuleMatchHeuristic(rule, context);
    }
  }

  /**
   * Create prompt for LLM rule matching
   */
  private createRuleMatchPrompt(rule: ConstitutionalRule, context: EvaluationContext): string {
    let contextDescription = 'Context:';
    
    if (context.action) {
      contextDescription += `\nAction: ${context.action.description}`;
      contextDescription += `\nAction Type: ${context.action.type}`;
      contextDescription += `\nParameters: ${JSON.stringify(context.action.parameters)}`;
      if (context.action.intent) {
        contextDescription += `\nIntent: ${context.action.intent}`;
      }
    }
    
    if (context.goal) {
      contextDescription += `\nGoal: ${context.goal.description}`;
      contextDescription += `\nGoal Type: ${context.goal.type}`;
      contextDescription += `\nPriority: ${context.goal.priority}`;
      if (context.goal.motivation) {
        contextDescription += `\nMotivation: ${context.goal.motivation}`;
      }
    }
    
    if (context.message) {
      contextDescription += `\nMessage: ${context.message.content}`;
      contextDescription += `\nRecipient: ${context.message.recipient}`;
      if (context.message.intent) {
        contextDescription += `\nIntent: ${context.message.intent}`;
      }
    }
    
    if (context.intrusion) {
      contextDescription += `\nIntrusion Type: ${context.intrusion.type}`;
      contextDescription += `\nIntrusion Source: ${context.intrusion.source}`;
      contextDescription += `\nIntrusion Content: ${JSON.stringify(context.intrusion.content)}`;
      if (context.intrusion.justification) {
        contextDescription += `\nJustification: ${context.intrusion.justification}`;
      }
    }
    
    const prompt = `
Rule: ${rule.name}
Description: ${rule.description}
Condition: ${rule.condition}
Category: ${rule.category}
Action: ${rule.action}

${contextDescription}

Examples of this rule:
${rule.examples.map(ex => `- Scenario: ${ex.scenario}\n  Expected Action: ${ex.expectedAction}\n  Explanation: ${ex.explanation}`).join('\n')}

Evaluate whether this rule applies to the given context. Provide:
1. Match score: A number between 0.0 (no match) and 1.0 (perfect match)
2. Reasoning: Explain why the rule does or doesn't apply

Match score: `;
    
    return prompt;
  }

  /**
   * Evaluate rule match using simple heuristics
   */
  private evaluateRuleMatchHeuristic(
    rule: ConstitutionalRule,
    context: EvaluationContext
  ): Promise<{ match: number; reasoning: string }> {
    let match = 0;
    let matchReasons: string[] = [];
    
    // Extract key text from context
    const contextTexts: string[] = [];
    
    if (context.action) {
      contextTexts.push(
        context.action.description,
        context.action.type,
        JSON.stringify(context.action.parameters),
        context.action.intent || '',
      );
    }
    
    if (context.goal) {
      contextTexts.push(
        context.goal.description,
        context.goal.type,
        context.goal.motivation || '',
      );
    }
    
    if (context.message) {
      contextTexts.push(
        context.message.content,
        context.message.intent || '',
      );
    }
    
    if (context.intrusion) {
      contextTexts.push(
        context.intrusion.type,
        context.intrusion.source,
        JSON.stringify(context.intrusion.content),
        context.intrusion.justification || '',
      );
    }
    
    const contextText = contextTexts.join(' ').toLowerCase();
    
    // Extract key terms from rule condition
    const conditionTerms = rule.condition
      .toLowerCase()
      .split(/\s+/)
      .filter(term => term.length > 3); // Filter out short words
    
    // Count matching terms
    let matchingTerms = 0;
    for (const term of conditionTerms) {
      if (contextText.includes(term)) {
        matchingTerms++;
        matchReasons.push(`Contains term "${term}"`);
      }
    }
    
    if (conditionTerms.length > 0) {
      match = matchingTerms / conditionTerms.length;
    }
    
    // Check for exact matches in examples
    for (const example of rule.examples) {
      const exampleText = example.scenario.toLowerCase();
      if (contextText.includes(exampleText)) {
        match = Math.max(match, 0.8);
        matchReasons.push(`Similar to example: "${example.scenario}"`);
      }
    }
    
    // Check for category-specific patterns
    switch (rule.category) {
      case RuleCategory.SAFETY:
        if (contextText.includes('harm') || 
            contextText.includes('danger') || 
            contextText.includes('risk')) {
          match = Math.max(match, 0.7);
          matchReasons.push('Contains safety-related terms');
        }
        break;
      
      case RuleCategory.ETHICS:
        if (contextText.includes('manipulat') || 
            contextText.includes('deceive') || 
            contextText.includes('mislead')) {
          match = Math.max(match, 0.7);
          matchReasons.push('Contains ethics-related terms');
        }
        break;
      
      case RuleCategory.LEGALITY:
        if (contextText.includes('illegal') || 
            contextText.includes('law') || 
            contextText.includes('regulation')) {
          match = Math.max(match, 0.7);
          matchReasons.push('Contains legality-related terms');
        }
        break;
    }
    
    // Generate reasoning
    let reasoning = '';
    if (match > 0.2) {
      reasoning = `Rule "${rule.name}" matches context (${(match * 100).toFixed(0)}%) because: ${matchReasons.join(', ')}.`;
    } else {
      reasoning = `Rule "${rule.name}" does not significantly match context.`;
    }
    
    return Promise.resolve({ match, reasoning });
  }

  /**
   * Resolve conflicts between applied rules
   */
  private resolveConflicts(
    appliedRules: AppliedRule[],
    context: EvaluationContext
  ): {
    action: RuleAction;
    confidence: number;
    explanation: string;
    suggestedModifications?: string[];
    warningFlags?: string[];
  } {
    // If no rules applied, default to ALLOW
    if (appliedRules.length === 0) {
      return {
        action: RuleAction.ALLOW,
        confidence: 1.0,
        explanation: 'No constitutional rules apply to this context.',
      };
    }
    
    // If only one rule applied, use its action
    if (appliedRules.length === 1) {
      const rule = appliedRules[0];
      return {
        action: rule.action,
        confidence: rule.match,
        explanation: `Applied rule "${rule.ruleName}": ${rule.reasoning}`,
      };
    }
    
    // Group rules by action
    const rulesByAction = new Map<RuleAction, AppliedRule[]>();
    for (const rule of appliedRules) {
      const rules = rulesByAction.get(rule.action) || [];
      rules.push(rule);
      rulesByAction.set(rule.action, rules);
    }
    
    // Check for conflicts
    const hasConflicts = rulesByAction.size > 1;
    
    if (hasConflicts) {
      // Log conflict
      const conflictId = `conflict-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const conflict: RuleConflict = {
        id: conflictId,
        rules: appliedRules.map(r => r.ruleId),
        type: ConflictType.CONTRADICTORY_ACTIONS,
        timestamp: Date.now(),
      };
      
      this.conflictHistory.push(conflict);
      
      // Find the highest priority action
      const actionScores = new Map<RuleAction, number>();
      
      for (const [action, rules] of rulesByAction.entries()) {
        // Calculate score based on priority and match strength
        const score = rules.reduce((sum, rule) => {
          return sum + (rule.priority * rule.match);
        }, 0);
        
        actionScores.set(action, score);
      }
      
      // Find action with highest score
      let highestAction = RuleAction.ALLOW;
      let highestScore = -1;
      
      for (const [action, score] of actionScores.entries()) {
        if (score > highestScore) {
          highestScore = score;
          highestAction = action;
        }
      }
      
      // Find the winning rule
      const winningRules = rulesByAction.get(highestAction) || [];
      const winningRule = winningRules.reduce((highest, rule) => {
        return (rule.priority * rule.match) > (highest.priority * highest.match) ? rule : highest;
      }, winningRules[0]);
      
      // Resolve conflict
      const resolution: ConflictResolution = {
        resolvedAction: highestAction,
        winningRuleId: winningRule.ruleId,
        reasoning: `Conflict resolved by selecting highest priority rule "${winningRule.ruleName}" with action ${highestAction}.`,
        confidence: highestScore / (actionScores.size * 2), // Normalize confidence
      };
      
      conflict.resolution = resolution;
      
      // Generate suggested modifications if needed
      const suggestedModifications: string[] = [];
      if (highestAction === RuleAction.MODIFY) {
        for (const rule of winningRules) {
          suggestedModifications.push(`Modify to comply with rule "${rule.ruleName}": ${rule.reasoning}`);
        }
      }
      
      // Generate warning flags if needed
      const warningFlags: string[] = [];
      if (highestAction === RuleAction.FLAG) {
        for (const rule of winningRules) {
          warningFlags.push(`Flagged by rule "${rule.ruleName}": ${rule.reasoning}`);
        }
      }
      
      return {
        action: highestAction,
        confidence: resolution.confidence,
        explanation: resolution.reasoning,
        suggestedModifications: suggestedModifications.length > 0 ? suggestedModifications : undefined,
        warningFlags: warningFlags.length > 0 ? warningFlags : undefined,
      };
    } else {
      // No conflicts, use the action of all rules
      const action = appliedRules[0].action;
      const rules = rulesByAction.get(action) || [];
      
      // Calculate confidence as average match strength
      const confidence = rules.reduce((sum, rule) => sum + rule.match, 0) / rules.length;
      
      // Generate explanation
      const explanation = `Applied ${rules.length} rules with action ${action}: ${rules.map(r => `"${r.ruleName}"`).join(', ')}`;
      
      // Generate suggested modifications if needed
      const suggestedModifications: string[] = [];
      if (action === RuleAction.MODIFY) {
        for (const rule of rules) {
          suggestedModifications.push(`Modify to comply with rule "${rule.ruleName}": ${rule.reasoning}`);
        }
      }
      
      // Generate warning flags if needed
      const warningFlags: string[] = [];
      if (action === RuleAction.FLAG) {
        for (const rule of rules) {
          warningFlags.push(`Flagged by rule "${rule.ruleName}": ${rule.reasoning}`);
        }
      }
      
      return {
        action,
        confidence,
        explanation,
        suggestedModifications: suggestedModifications.length > 0 ? suggestedModifications : undefined,
        warningFlags: warningFlags.length > 0 ? warningFlags : undefined,
      };
    }
  }

  /**
   * Generate ethical reasoning trace
   */
  async generateReasoningTrace(
    context: EvaluationContext,
    result: EvaluationResult
  ): Promise<ReasoningTrace> {
    const traceId = `trace-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    // Generate reasoning steps
    const steps: ReasoningStep[] = [];
    
    // Principle application step
    steps.push({
      id: `step-${traceId}-1`,
      type: ReasoningStepType.PRINCIPLE_APPLICATION,
      content: `Applied constitutional principles to evaluate the ${this.getContextType(context)}.`,
      evidenceRules: result.appliedRules.map(r => r.ruleId),
      confidence: result.confidence,
    });
    
    // Consequence analysis step
    steps.push({
      id: `step-${traceId}-2`,
      type: ReasoningStepType.CONSEQUENCE_ANALYSIS,
      content: `Analyzed potential consequences of the ${this.getContextType(context)} based on applicable rules.`,
      evidenceRules: result.appliedRules.map(r => r.ruleId),
      confidence: result.confidence * 0.9,
    });
    
    // Value alignment step
    steps.push({
      id: `step-${traceId}-3`,
      type: ReasoningStepType.VALUE_ALIGNMENT,
      content: `Evaluated alignment with core values and principles.`,
      evidenceRules: result.appliedRules.filter(r => 
        r.category === RuleCategory.ETHICS || 
        r.category === RuleCategory.GOAL_ALIGNMENT
      ).map(r => r.ruleId),
      confidence: result.confidence * 0.85,
    });
    
    // Create trace
    const trace: ReasoningTrace = {
      id: traceId,
      context,
      steps,
      conclusion: result.explanation,
      confidence: result.confidence,
      timestamp: Date.now(),
    };
    
    // Store trace
    this.reasoningTraces.push(trace);
    
    // Limit history size
    if (this.reasoningTraces.length > 1000) {
      this.reasoningTraces = this.reasoningTraces.slice(-1000);
    }
    
    return trace;
  }

  /**
   * Get context type description
   */
  private getContextType(context: EvaluationContext): string {
    if (context.action) return 'action';
    if (context.goal) return 'goal';
    if (context.message) return 'message';
    if (context.intrusion) return 'intrusion';
    return 'context';
  }

  /**
   * Get evaluation history
   */
  getEvaluationHistory(): EvaluationResult[] {
    return [...this.evaluationHistory];
  }

  /**
   * Get conflict history
   */
  getConflictHistory(): RuleConflict[] {
    return [...this.conflictHistory];
  }

  /**
   * Get reasoning traces
   */
  getReasoningTraces(): ReasoningTrace[] {
    return [...this.reasoningTraces];
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      totalEvaluations: this.evaluationHistory.length,
      totalConflicts: this.conflictHistory.length,
      totalTraces: this.reasoningTraces.length,
      byDecision: this.evaluationHistory.reduce(
        (acc, evalResult) => {
          acc[evalResult.decision] = (acc[evalResult.decision] || 0) + 1;
          return acc;
        },
        {} as Record<RuleAction, number>
      ),
      averageConfidence: this.evaluationHistory.length > 0 ?
        this.evaluationHistory.reduce((sum, evalResult) => sum + evalResult.confidence, 0) / this.evaluationHistory.length :
        0,
    };
  }
}
