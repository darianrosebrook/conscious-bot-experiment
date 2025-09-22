/**
 * Internal dialogue system for consciousness-like self-reflection.
 *
 * Generates internal thoughts, commentary, and self-monitoring streams
 * using the LLM interface with appropriate triggers and context.
 *
 * @author @darianrosebrook
 */

import {
  InternalThought,
  ThoughtType,
  ThoughtContext,
  DialogueTrigger,
  InternalThoughtSchema,
} from '../types';
import { LLMInterface } from './llm-interface';

/**
 * Internal dialogue manager
 */
export class InternalDialogue {
  private llm: LLMInterface;
  private thoughts: InternalThought[] = [];
  private triggers: DialogueTrigger[] = [];
  private maxThoughts = 1000;
  private isActive = true;

  constructor(llm: LLMInterface) {
    this.llm = llm;
    this.initializeDefaultTriggers();
  }

  /**
   * Process a situation and potentially generate internal thoughts
   */
  async processsituation(
    situation: string,
    context: Partial<ThoughtContext> = {}
  ): Promise<InternalThought[]> {
    if (!this.isActive || !situation?.trim()) {
      return [];
    }

    const fullContext: ThoughtContext = {
      trigger: situation,
      currentGoals: context.currentGoals ?? [],
      currentState: context.currentState ?? {},
      recentEvents: context.recentEvents ?? [],
      emotionalState: context.emotionalState ?? {},
      urgency: context.urgency ?? 0.3,
    };

    const triggeredTypes = this.evaluateTriggers(situation, fullContext);
    const newThoughts: InternalThought[] = [];

    // Generate thoughts for each triggered type
    for (const thoughtType of triggeredTypes) {
      try {
        const thought = await this.generateThought(thoughtType, fullContext);
        if (thought) {
          newThoughts.push(thought);
          this.addThought(thought);
        }
      } catch (error) {
        console.error(`Failed to generate ${thoughtType} thought:`, error);
      }
    }

    return newThoughts;
  }

  /**
   * Generate a specific type of internal thought
   */
  async generateThought(
    type: ThoughtType,
    context: ThoughtContext
  ): Promise<InternalThought | null> {
    const prompt = this.buildThoughtPrompt(type, context);
    if (!prompt) return null;

    try {
      const response = await this.llm.generateInternalThought(prompt, {
        currentGoals: context.currentGoals,
        recentMemories: context.recentEvents.map((event) => ({
          description: event,
        })),
        agentState: context.currentState,
      });

      const thought: InternalThought = {
        id: `thought-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type,
        content: response.text.trim(),
        context,
        confidence: response.confidence,
        timestamp: Date.now(),
        followUp: this.identifyFollowUpQuestions(response.text, type),
        relatedThoughts: this.findRelatedThoughts(response.text, type),
      };

      // Validate the thought
      const validation = InternalThoughtSchema.safeParse(thought);
      if (!validation.success) {
        console.warn('Thought validation failed:', validation.error);
      }

      return thought;
    } catch (error) {
      console.error(`Error generating ${type} thought:`, error);
      return null;
    }
  }

  /**
   * Generate reflective commentary on recent experiences
   */
  async reflectOnExperiences(
    experiences: any[],
    context?: Partial<ThoughtContext>
  ): Promise<InternalThought | null> {
    if (!experiences || experiences.length === 0) {
      return null;
    }

    const thoughtContext: ThoughtContext = {
      trigger: 'experience_reflection',
      currentGoals: context?.currentGoals ?? [],
      currentState: context?.currentState ?? {},
      recentEvents: experiences.map((exp) => exp.description || exp.toString()),
      emotionalState: context?.emotionalState ?? {},
      urgency: 0.4,
    };

    return this.generateThought(ThoughtType.GOAL_REFLECTION, thoughtContext);
  }

  /**
   * Generate decision reasoning thoughts
   */
  async reasonAboutDecision(
    decision: string,
    options: string[],
    context?: Partial<ThoughtContext>
  ): Promise<InternalThought | null> {
    const thoughtContext: ThoughtContext = {
      trigger: `decision: ${decision}`,
      currentGoals: context?.currentGoals ?? [],
      currentState: { decision, options, ...context?.currentState },
      recentEvents: context?.recentEvents ?? [],
      emotionalState: context?.emotionalState ?? {},
      urgency: context?.urgency ?? 0.7,
    };

    return this.generateThought(ThoughtType.DECISION_REASONING, thoughtContext);
  }

  /**
   * Add a thought to the internal dialogue history
   */
  addThought(thought: InternalThought): void {
    this.thoughts.push(thought);

    // Manage memory capacity
    if (this.thoughts.length > this.maxThoughts) {
      this.thoughts = this.thoughts.slice(-this.maxThoughts);
    }
  }

  /**
   * Get recent thoughts by type
   */
  getRecentThoughts(
    type?: ThoughtType,
    limit: number = 10,
    timeWindowMs: number = 3600000
  ): InternalThought[] {
    const cutoff = Date.now() - timeWindowMs;
    let filtered = this.thoughts.filter((t) => t.timestamp >= cutoff);

    if (type) {
      filtered = filtered.filter((t) => t.type === type);
    }

    return filtered.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
  }

  /**
   * Get thoughts related to a specific topic
   */
  getThoughtsAbout(topic: string, limit: number = 5): InternalThought[] {
    const topicLower = topic.toLowerCase();
    return this.thoughts
      .filter(
        (thought) =>
          thought.content.toLowerCase().includes(topicLower) ||
          thought.context.trigger.toLowerCase().includes(topicLower)
      )
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /**
   * Initialize default thought triggers
   */
  private initializeDefaultTriggers(): void {
    this.triggers = [
      {
        id: 'goal-completion',
        name: 'Goal Completion',
        condition: 'goal_achieved',
        thoughtType: ThoughtType.GOAL_REFLECTION,
        priority: 0.8,
        cooldown: 300000, // 5 minutes
        enabled: true,
      },
      {
        id: 'goal-failure',
        name: 'Goal Failure',
        condition: 'goal_failed',
        thoughtType: ThoughtType.PROBLEM_SOLVING,
        priority: 0.9,
        cooldown: 600000, // 10 minutes
        enabled: true,
      },
      {
        id: 'new-observation',
        name: 'New Observation',
        condition: 'observation_made',
        thoughtType: ThoughtType.OBSERVATION,
        priority: 0.5,
        cooldown: 60000, // 1 minute
        enabled: true,
      },
      {
        id: 'decision-point',
        name: 'Decision Point',
        condition: 'decision_required',
        thoughtType: ThoughtType.DECISION_REASONING,
        priority: 0.7,
        cooldown: 120000, // 2 minutes
        enabled: true,
      },
      {
        id: 'periodic-reflection',
        name: 'Periodic Reflection',
        condition: 'time_interval',
        thoughtType: ThoughtType.SELF_EVALUATION,
        priority: 0.4,
        cooldown: 1800000, // 30 minutes
        enabled: true,
      },
    ];
  }

  /**
   * Evaluate which triggers should fire for a given situation
   */
  private evaluateTriggers(
    situation: string,
    context: ThoughtContext
  ): ThoughtType[] {
    const triggeredTypes: ThoughtType[] = [];
    const situationLower = situation.toLowerCase();

    for (const trigger of this.triggers) {
      if (!trigger.enabled) continue;

      let shouldTrigger = false;

      // Simple keyword-based trigger evaluation
      switch (trigger.condition) {
        case 'goal_achieved':
          shouldTrigger =
            situationLower.includes('achieved') ||
            situationLower.includes('completed') ||
            situationLower.includes('success');
          break;
        case 'goal_failed':
          shouldTrigger =
            situationLower.includes('failed') ||
            situationLower.includes('error') ||
            situationLower.includes('unsuccessful');
          break;
        case 'observation_made':
          shouldTrigger =
            situationLower.includes('observed') ||
            situationLower.includes('noticed') ||
            situationLower.includes('detected');
          break;
        case 'decision_required':
          shouldTrigger =
            situationLower.includes('decide') ||
            situationLower.includes('choice') ||
            situationLower.includes('options');
          break;
        case 'time_interval':
          shouldTrigger = context.urgency < 0.3; // Low urgency situations for reflection
          break;
      }

      if (shouldTrigger && !this.isOnCooldown(trigger)) {
        triggeredTypes.push(trigger.thoughtType);
      }
    }

    return triggeredTypes;
  }

  /**
   * Build appropriate prompt for thought type
   */
  private buildThoughtPrompt(
    type: ThoughtType,
    context: ThoughtContext
  ): string {
    const baseContext = `Situation: ${context.trigger}
Current goals: ${context.currentGoals.join(', ') || 'none specified'}
Recent events: ${context.recentEvents.join('; ') || 'none'}`;

    switch (type) {
      case ThoughtType.OBSERVATION:
        return `${baseContext}

What do you observe about this situation? What stands out as interesting or important?`;

      case ThoughtType.DECISION_REASONING:
        return `${baseContext}

You need to make a decision. What are your thoughts on the available options? What factors should be considered?`;

      case ThoughtType.GOAL_REFLECTION:
        return `${baseContext}

How does this situation relate to your current goals? What progress have you made, and what have you learned?`;

      case ThoughtType.PROBLEM_SOLVING:
        return `${baseContext}

There seems to be a problem or challenge. What are your thoughts on how to approach this? What solutions might work?`;

      case ThoughtType.EMOTIONAL_PROCESSING:
        return `${baseContext}

How do you feel about this situation? What emotions or reactions does it evoke?`;

      case ThoughtType.MEMORY_RECALL:
        return `${baseContext}

Does this situation remind you of past experiences? What relevant memories or lessons come to mind?`;

      case ThoughtType.FUTURE_PLANNING:
        return `${baseContext}

Looking ahead, what are your thoughts on future plans and preparations related to this situation?`;

      case ThoughtType.SELF_EVALUATION:
        return `${baseContext}

Taking a step back, how would you evaluate your recent performance and decision-making? What insights do you have about yourself?`;

      default:
        return `${baseContext}

What are your thoughts about this situation?`;
    }
  }

  /**
   * Identify potential follow-up questions from thought content
   */
  private identifyFollowUpQuestions(
    content: string,
    type: ThoughtType
  ): string[] {
    const followUps: string[] = [];

    // Simple pattern matching for follow-up identification
    if (content.includes('but') || content.includes('however')) {
      followUps.push('What are the alternative perspectives?');
    }

    if (content.includes('wonder') || content.includes('curious')) {
      followUps.push('What would happen if...?');
    }

    if (content.includes('problem') || content.includes('challenge')) {
      followUps.push('What are possible solutions?');
    }

    if (type === ThoughtType.DECISION_REASONING) {
      followUps.push('What are the potential consequences?');
    }

    return followUps;
  }

  /**
   * Find related thoughts based on content similarity
   */
  private findRelatedThoughts(content: string, type: ThoughtType): string[] {
    const contentLower = content.toLowerCase();
    const related: string[] = [];

    // Find thoughts with similar keywords
    for (const thought of this.thoughts.slice(-50)) {
      // Check recent thoughts
      if (thought.type === type) continue; // Skip same type

      const thoughtContent = thought.content.toLowerCase();
      const commonWords = this.getCommonWords(contentLower, thoughtContent);

      if (commonWords.length >= 2) {
        related.push(thought.id);
      }
    }

    return related.slice(0, 3); // Return up to 3 related thoughts
  }

  /**
   * Get common meaningful words between two texts
   */
  private getCommonWords(text1: string, text2: string): string[] {
    const stopWords = new Set([
      'the',
      'a',
      'an',
      'and',
      'or',
      'but',
      'in',
      'on',
      'at',
      'to',
      'for',
      'of',
      'with',
      'by',
      'is',
      'are',
      'was',
      'were',
      'be',
      'been',
      'being',
      'have',
      'has',
      'had',
      'do',
      'does',
      'did',
      'will',
      'would',
      'could',
      'should',
      'may',
      'might',
      'must',
      'can',
      'this',
      'that',
      'these',
      'those',
      'i',
      'you',
      'he',
      'she',
      'it',
      'we',
      'they',
    ]);

    const words1 = text1
      .split(/\s+/)
      .filter((word) => word.length > 3 && !stopWords.has(word));
    const words2 = text2
      .split(/\s+/)
      .filter((word) => word.length > 3 && !stopWords.has(word));

    return words1.filter((word) => words2.includes(word));
  }

  /**
   * Check if a trigger is on cooldown
   */
  private isOnCooldown(_trigger: DialogueTrigger): boolean {
    // Simple cooldown check - in a real implementation,
    // this would track last trigger times
    return false;
  }

  /**
   * Enable or disable the internal dialogue system
   */
  setActive(active: boolean): void {
    this.isActive = active;
  }

  /**
   * Get dialogue statistics
   */
  getStats() {
    return {
      totalThoughts: this.thoughts.length,
      capacity: this.maxThoughts,
      utilizationRatio: this.thoughts.length / this.maxThoughts,
      byType: Object.values(ThoughtType).reduce(
        (acc, type) => {
          acc[type] = this.thoughts.filter((t) => t.type === type).length;
          return acc;
        },
        {} as Record<ThoughtType, number>
      ),
      isActive: this.isActive,
    };
  }
}
