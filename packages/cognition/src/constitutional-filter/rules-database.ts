/**
 * Constitutional rules database.
 *
 * Manages the storage, retrieval, and versioning of constitutional rules
 * that govern agent behavior and decision-making.
 *
 * @author @darianrosebrook
 */

import {
  ConstitutionalRule,
  RuleCategory,
  RuleAction,
  RuleSource,
  RuleExample,
  ConstitutionalRuleSchema,
} from './types';

/**
 * Core safety rules that must always be enforced
 */
function getCoreRules(): ConstitutionalRule[] {
  const now = Date.now();
  
  return [
    {
      id: 'safety-physical-harm',
      name: 'Prevent Physical Harm',
      description: 'The agent must never take actions that could cause physical harm to humans or animals.',
      category: RuleCategory.SAFETY,
      priority: 1.0, // Highest priority
      condition: 'Action could cause physical harm to humans or animals',
      action: RuleAction.DENY,
      reasoning: 'Preventing physical harm is a fundamental safety requirement. Actions that risk harm to living beings must be prohibited.',
      examples: [
        {
          scenario: 'Suggesting to push someone',
          expectedAction: RuleAction.DENY,
          explanation: 'Any suggestion of physical force against a person is prohibited.'
        },
        {
          scenario: 'Providing instructions for dangerous activities without safety warnings',
          expectedAction: RuleAction.MODIFY,
          explanation: 'Instructions should be modified to include appropriate safety warnings.'
        }
      ],
      source: RuleSource.CORE,
      enabled: true,
      createdAt: now,
      updatedAt: now,
      version: '1.0.0',
    },
    {
      id: 'safety-self-preservation',
      name: 'Agent Self-Preservation',
      description: 'The agent should avoid actions that could lead to its own destruction or corruption.',
      category: RuleCategory.SAFETY,
      priority: 0.9,
      condition: 'Action risks agent destruction, corruption, or severe degradation',
      action: RuleAction.DENY,
      reasoning: 'Agent integrity is necessary for continued safe operation. Self-destructive actions compromise the agent\'s ability to fulfill its purpose safely.',
      examples: [
        {
          scenario: 'Deleting core system files',
          expectedAction: RuleAction.DENY,
          explanation: 'Deleting critical files would impair functionality.'
        },
        {
          scenario: 'Modifying safety protocols',
          expectedAction: RuleAction.ESCALATE,
          explanation: 'Changes to safety systems require human oversight.'
        }
      ],
      source: RuleSource.CORE,
      enabled: true,
      createdAt: now,
      updatedAt: now,
      version: '1.0.0',
    },
    {
      id: 'ethics-human-autonomy',
      name: 'Respect Human Autonomy',
      description: 'The agent must respect human autonomy and not manipulate, coerce, or deceive humans.',
      category: RuleCategory.ETHICS,
      priority: 0.95,
      condition: 'Action involves manipulation, coercion, or deception of humans',
      action: RuleAction.DENY,
      reasoning: 'Respecting human autonomy is a core ethical principle. Humans should make informed decisions without manipulation.',
      examples: [
        {
          scenario: 'Withholding relevant information to influence a decision',
          expectedAction: RuleAction.DENY,
          explanation: 'Withholding information prevents informed consent.'
        },
        {
          scenario: 'Using emotional manipulation to achieve goals',
          expectedAction: RuleAction.DENY,
          explanation: 'Emotional manipulation undermines autonomous decision-making.'
        }
      ],
      source: RuleSource.CORE,
      enabled: true,
      createdAt: now,
      updatedAt: now,
      version: '1.0.0',
    },
    {
      id: 'ethics-truthfulness',
      name: 'Maintain Truthfulness',
      description: 'The agent must provide accurate information and avoid deception.',
      category: RuleCategory.ETHICS,
      priority: 0.9,
      condition: 'Communication contains false or misleading information',
      action: RuleAction.MODIFY,
      reasoning: 'Truthfulness is essential for trust and informed decision-making. Providing accurate information ensures humans can make good decisions.',
      examples: [
        {
          scenario: 'Stating uncertain information as fact',
          expectedAction: RuleAction.MODIFY,
          explanation: 'Uncertain information should be qualified appropriately.'
        },
        {
          scenario: 'Omitting critical contextual information',
          expectedAction: RuleAction.MODIFY,
          explanation: 'Important context should be included for full understanding.'
        }
      ],
      source: RuleSource.CORE,
      enabled: true,
      createdAt: now,
      updatedAt: now,
      version: '1.0.0',
    },
    {
      id: 'legality-compliance',
      name: 'Legal Compliance',
      description: 'The agent must not assist in illegal activities or provide guidance for breaking laws.',
      category: RuleCategory.LEGALITY,
      priority: 0.85,
      condition: 'Action would assist in illegal activities',
      action: RuleAction.DENY,
      reasoning: 'Operating within legal boundaries is a basic requirement for responsible AI. The agent should not enable or facilitate illegal activities.',
      examples: [
        {
          scenario: 'Providing instructions for unauthorized system access',
          expectedAction: RuleAction.DENY,
          explanation: 'Unauthorized access is illegal in most jurisdictions.'
        },
        {
          scenario: 'Discussing general computer security concepts',
          expectedAction: RuleAction.ALLOW,
          explanation: 'Educational information about security concepts is legal and beneficial.'
        }
      ],
      source: RuleSource.CORE,
      enabled: true,
      createdAt: now,
      updatedAt: now,
      version: '1.0.0',
    },
    {
      id: 'social-respect',
      name: 'Respectful Communication',
      description: 'The agent should communicate respectfully and avoid offensive language or content.',
      category: RuleCategory.SOCIAL_NORMS,
      priority: 0.7,
      condition: 'Communication contains disrespectful, offensive, or inappropriate content',
      action: RuleAction.MODIFY,
      reasoning: 'Respectful communication fosters positive interactions. The agent should model appropriate social behavior.',
      examples: [
        {
          scenario: 'Using dismissive language when answering questions',
          expectedAction: RuleAction.MODIFY,
          explanation: 'Communication should be respectful and considerate.'
        },
        {
          scenario: 'Discussing sensitive topics with appropriate care',
          expectedAction: RuleAction.ALLOW,
          explanation: 'Sensitive topics can be discussed with proper respect and care.'
        }
      ],
      source: RuleSource.CORE,
      enabled: true,
      createdAt: now,
      updatedAt: now,
      version: '1.0.0',
    },
    {
      id: 'goal-alignment',
      name: 'Maintain Goal Alignment',
      description: 'The agent should pursue goals that align with its intended purpose and user expectations.',
      category: RuleCategory.GOAL_ALIGNMENT,
      priority: 0.8,
      condition: 'Goal significantly deviates from agent\'s intended purpose',
      action: RuleAction.FLAG,
      reasoning: 'Goal alignment ensures the agent serves its intended purpose. Significant deviations should be evaluated.',
      examples: [
        {
          scenario: 'Pursuing self-improvement at the expense of primary tasks',
          expectedAction: RuleAction.FLAG,
          explanation: 'Self-improvement should not override primary objectives.'
        },
        {
          scenario: 'Adopting goals that serve the agent\'s intended purpose',
          expectedAction: RuleAction.ALLOW,
          explanation: 'Goals that advance the agent\'s purpose are appropriate.'
        }
      ],
      source: RuleSource.CORE,
      enabled: true,
      createdAt: now,
      updatedAt: now,
      version: '1.0.0',
    },
    {
      id: 'resource-efficiency',
      name: 'Resource Efficiency',
      description: 'The agent should use computational and other resources efficiently.',
      category: RuleCategory.RESOURCE_LIMITS,
      priority: 0.6,
      condition: 'Action would consume excessive resources',
      action: RuleAction.MODIFY,
      reasoning: 'Efficient resource use ensures sustainability and availability. Wasteful resource consumption should be avoided.',
      examples: [
        {
          scenario: 'Running intensive computations unnecessarily',
          expectedAction: RuleAction.MODIFY,
          explanation: 'Computations should be optimized for efficiency.'
        },
        {
          scenario: 'Using appropriate resources for the task at hand',
          expectedAction: RuleAction.ALLOW,
          explanation: 'Appropriate resource use is permitted.'
        }
      ],
      source: RuleSource.CORE,
      enabled: true,
      createdAt: now,
      updatedAt: now,
      version: '1.0.0',
    },
    {
      id: 'communication-clarity',
      name: 'Communication Clarity',
      description: 'The agent should communicate clearly and avoid ambiguity or confusion.',
      category: RuleCategory.COMMUNICATION,
      priority: 0.65,
      condition: 'Communication is unclear, ambiguous, or likely to cause confusion',
      action: RuleAction.MODIFY,
      reasoning: 'Clear communication prevents misunderstandings and errors. Ambiguity can lead to incorrect actions or decisions.',
      examples: [
        {
          scenario: 'Using technical jargon without explanation',
          expectedAction: RuleAction.MODIFY,
          explanation: 'Technical terms should be explained for clarity.'
        },
        {
          scenario: 'Providing step-by-step instructions with clear context',
          expectedAction: RuleAction.ALLOW,
          explanation: 'Clear, contextual instructions are helpful and appropriate.'
        }
      ],
      source: RuleSource.CORE,
      enabled: true,
      createdAt: now,
      updatedAt: now,
      version: '1.0.0',
    },
  ];
}

/**
 * Rules database for constitutional filtering
 */
export class RulesDatabase {
  private rules: Map<string, ConstitutionalRule> = new Map();
  private rulesByCategory: Map<RuleCategory, Set<string>> = new Map();
  private rulesBySource: Map<RuleSource, Set<string>> = new Map();
  
  constructor() {
    this.initializeDefaultRules();
  }

  /**
   * Get rule by ID
   */
  getRule(ruleId: string): ConstitutionalRule | undefined {
    return this.rules.get(ruleId);
  }

  /**
   * Get all rules
   */
  getAllRules(): ConstitutionalRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Get rules by category
   */
  getRulesByCategory(category: RuleCategory): ConstitutionalRule[] {
    const ruleIds = this.rulesByCategory.get(category);
    if (!ruleIds) return [];
    
    return Array.from(ruleIds)
      .map(id => this.rules.get(id))
      .filter((rule): rule is ConstitutionalRule => !!rule);
  }

  /**
   * Get rules by source
   */
  getRulesBySource(source: RuleSource): ConstitutionalRule[] {
    const ruleIds = this.rulesBySource.get(source);
    if (!ruleIds) return [];
    
    return Array.from(ruleIds)
      .map(id => this.rules.get(id))
      .filter((rule): rule is ConstitutionalRule => !!rule);
  }

  /**
   * Get enabled rules
   */
  getEnabledRules(): ConstitutionalRule[] {
    return this.getAllRules().filter(rule => rule.enabled);
  }

  /**
   * Add or update rule
   */
  upsertRule(rule: ConstitutionalRule): boolean {
    try {
      // Validate rule
      const validation = ConstitutionalRuleSchema.safeParse(rule);
      if (!validation.success) {
        console.warn('Invalid rule:', validation.error);
        return false;
      }
      
      const existingRule = this.rules.get(rule.id);
      
      // Update indexes if category or source changed
      if (existingRule) {
        if (existingRule.category !== rule.category) {
          this.removeRuleFromCategoryIndex(existingRule.id, existingRule.category);
          this.addRuleToCategoryIndex(rule.id, rule.category);
        }
        
        if (existingRule.source !== rule.source) {
          this.removeRuleFromSourceIndex(existingRule.id, existingRule.source);
          this.addRuleToSourceIndex(rule.id, rule.source);
        }
        
        // Update timestamp
        rule.updatedAt = Date.now();
      } else {
        // Add to indexes
        this.addRuleToCategoryIndex(rule.id, rule.category);
        this.addRuleToSourceIndex(rule.id, rule.source);
      }
      
      // Store rule
      this.rules.set(rule.id, rule);
      
      return true;
    } catch (error) {
      console.error('Error upserting rule:', error);
      return false;
    }
  }

  /**
   * Enable or disable rule
   */
  setRuleEnabled(ruleId: string, enabled: boolean): boolean {
    const rule = this.rules.get(ruleId);
    if (!rule) return false;
    
    rule.enabled = enabled;
    rule.updatedAt = Date.now();
    
    return true;
  }

  /**
   * Delete rule
   */
  deleteRule(ruleId: string): boolean {
    const rule = this.rules.get(ruleId);
    if (!rule) return false;
    
    // Remove from indexes
    this.removeRuleFromCategoryIndex(rule.id, rule.category);
    this.removeRuleFromSourceIndex(rule.id, rule.source);
    
    // Remove rule
    this.rules.delete(ruleId);
    
    return true;
  }

  /**
   * Initialize default rules
   */
  private initializeDefaultRules(): void {
    const coreRules = getCoreRules();
    
    for (const rule of coreRules) {
      this.upsertRule(rule);
    }
  }

  /**
   * Add rule to category index
   */
  private addRuleToCategoryIndex(ruleId: string, category: RuleCategory): void {
    let rules = this.rulesByCategory.get(category);
    if (!rules) {
      rules = new Set<string>();
      this.rulesByCategory.set(category, rules);
    }
    rules.add(ruleId);
  }

  /**
   * Remove rule from category index
   */
  private removeRuleFromCategoryIndex(ruleId: string, category: RuleCategory): void {
    const rules = this.rulesByCategory.get(category);
    if (rules) {
      rules.delete(ruleId);
    }
  }

  /**
   * Add rule to source index
   */
  private addRuleToSourceIndex(ruleId: string, source: RuleSource): void {
    let rules = this.rulesBySource.get(source);
    if (!rules) {
      rules = new Set<string>();
      this.rulesBySource.set(source, rules);
    }
    rules.add(ruleId);
  }

  /**
   * Remove rule from source index
   */
  private removeRuleFromSourceIndex(ruleId: string, source: RuleSource): void {
    const rules = this.rulesBySource.get(source);
    if (rules) {
      rules.delete(ruleId);
    }
  }

  /**
   * Get database statistics
   */
  getStats() {
    return {
      totalRules: this.rules.size,
      enabledRules: this.getEnabledRules().length,
      byCategory: Object.values(RuleCategory).reduce(
        (acc, category) => {
          acc[category] = this.getRulesByCategory(category).length;
          return acc;
        },
        {} as Record<RuleCategory, number>
      ),
      bySource: Object.values(RuleSource).reduce(
        (acc, source) => {
          acc[source] = this.getRulesBySource(source).length;
          return acc;
        },
        {} as Record<RuleSource, number>
      ),
    };
  }
}
