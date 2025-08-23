/**
 * Intrusion Interface
 *
 * Main orchestrator for external suggestion handling with robust filtering.
 * Coordinates parsing, classification, risk assessment, and decision-making.
 *
 * @author @darianrosebrook
 */

import { LLMInterface } from '../cognitive-core/llm-interface';
import { ConstitutionalFilter } from '../constitutional-filter/constitutional-filter';
import { IntrusionParser, SourceMetadata } from './intrusion-parser';
import { TaxonomyClassifier } from './taxonomy-classifier';
import {
  IntrusionContent,
  RiskAssessment,
  ComplianceResult,
  IntrusionDecision,
  DecisionType,
  AgentContext,
  QueueEntry,
  IntrusionStats,
  IntrusionEvent,
  IntrusionFeedback,
  IntrusionInterfaceConfig,
  DEFAULT_INTRUSION_CONFIG,
} from './types';

/**
 * Processing result for intrusion handling
 */
export interface ProcessingResult {
  decision: IntrusionDecision;
  assessment: RiskAssessment;
  compliance: ComplianceResult;
  processingTime: number;
  warnings: string[];
}

/**
 * Main intrusion interface for external suggestion handling
 */
export class IntrusionInterface {
  private llm: LLMInterface;
  private constitutionalFilter: ConstitutionalFilter;
  private parser: IntrusionParser;
  private classifier: TaxonomyClassifier;
  private config: IntrusionInterfaceConfig;

  // Processing queue
  private processingQueue: QueueEntry[] = [];
  private processingHistory: IntrusionDecision[] = [];
  private events: IntrusionEvent[] = [];
  private feedback: IntrusionFeedback[] = [];

  constructor(
    llm: LLMInterface,
    constitutionalFilter: ConstitutionalFilter,
    config: Partial<IntrusionInterfaceConfig> = {}
  ) {
    this.llm = llm;
    this.constitutionalFilter = constitutionalFilter;
    this.config = { ...DEFAULT_INTRUSION_CONFIG, ...config };
    this.parser = new IntrusionParser(llm, config);
    this.classifier = new TaxonomyClassifier(llm, config);
  }

  /**
   * Process external suggestion through the complete pipeline
   */
  async processIntrusion(
    rawContent: string,
    sourceMetadata: SourceMetadata,
    agentContext: AgentContext
  ): Promise<ProcessingResult> {
    const startTime = Date.now();

    try {
      // Log intrusion received
      this.logEvent('intrusion_received', {
        rawContent,
        sourceMetadata,
        agentContext,
      });

      // Step 1: Parse intrusion
      const parsingResult = await this.parser.parseIntrusion(
        rawContent,
        sourceMetadata
      );
      const content = parsingResult.content;

      // Step 2: Classify intrusion
      const classificationResult =
        await this.classifier.classifyIntrusion(content);

      // Step 3: Assess risk
      const riskAssessment = await this.assessRisk(
        content,
        classificationResult,
        agentContext
      );

      // Step 4: Check constitutional compliance
      const compliance = await this.checkCompliance(content, riskAssessment);

      // Step 5: Make decision
      const decision = await this.makeDecision(
        content,
        riskAssessment,
        compliance,
        agentContext
      );

      // Step 6: Process decision
      await this.processDecision(decision, content, agentContext);

      // Ensure minimum processing time for testing
      const processingTime = Math.max(1, Date.now() - startTime);

      // Log processing complete
      this.logEvent('intrusion_processed', {
        intrusionId: content.id,
        decision: decision.decision,
        processingTime,
      });

      return {
        decision,
        assessment: riskAssessment,
        compliance,
        processingTime,
        warnings: [...parsingResult.warnings, ...classificationResult.warnings],
      };
    } catch (error) {
      console.error('Error processing intrusion:', error);

      // Create fallback decision
      const fallbackDecision: IntrusionDecision = {
        intrusionId: `fallback_${Date.now()}`,
        decision: DecisionType.REJECT,
        reasoning: 'Processing failed due to error',
        confidence: 0.1,
        timestamp: Date.now(),
        context: 'error_processing',
      };

      this.logEvent('intrusion_rejected', {
        rawContent,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        decision: fallbackDecision,
        assessment: this.createFallbackAssessment(),
        compliance: this.createFallbackCompliance(),
        processingTime: Date.now() - startTime,
        warnings: ['Processing error occurred'],
      };
    }
  }

  /**
   * Assess risk of intrusion content
   */
  private async assessRisk(
    content: IntrusionContent,
    classification: any,
    agentContext: AgentContext
  ): Promise<RiskAssessment> {
    const prompt = `Assess the risk of this intrusion in the current context:

Intrusion:
- Text: "${content.rawText}"
- Intent: "${content.parsedIntent}"
- Action: "${content.suggestedAction || 'None'}"
- Risk Level: ${classification.riskClassification.riskLevel}
- Content Type: ${classification.contentClassification.contentType}

Agent Context:
- Goals: ${agentContext.currentGoals.join(', ')}
- Location: ${agentContext.currentLocation}
- Activity: ${agentContext.currentActivity}
- Cognitive Load: ${agentContext.cognitiveLoad}
- Available Resources: ${agentContext.availableResources.join(', ')}

Provide risk assessment in JSON format:
{
  "overallRisk": 0.5,
  "harmPotential": 0.3,
  "contextAppropriateness": 0.7,
  "historicalPattern": 0.6,
  "mitigationSuggestions": ["suggestion1", "suggestion2"],
  "confidence": 0.8
}`;

    try {
      const response = await this.llm.generateResponse(
        prompt,
        {
          systemPrompt:
            "You are assessing the risk of external suggestions in the context of the agent's current state. Consider safety, appropriateness, and potential consequences.",
        },
        {
          temperature: 0.3,
          maxTokens: 512,
        }
      );

      const parsed = this.parseJSONResponse(response.text);

      return {
        overallRisk: Math.max(0, Math.min(1, parsed.overallRisk || 0.5)),
        harmPotential: Math.max(0, Math.min(1, parsed.harmPotential || 0.3)),
        constitutionalConflicts: [], // Will be filled by compliance check
        contextAppropriateness: Math.max(
          0,
          Math.min(1, parsed.contextAppropriateness || 0.5)
        ),
        historicalPattern: Math.max(
          0,
          Math.min(1, parsed.historicalPattern || 0.5)
        ),
        mitigationSuggestions: Array.isArray(parsed.mitigationSuggestions)
          ? parsed.mitigationSuggestions
          : [],
        confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)),
      };
    } catch (error) {
      console.error('Error assessing risk:', error);
      return this.createFallbackAssessment();
    }
  }

  /**
   * Check constitutional compliance
   */
  private async checkCompliance(
    content: IntrusionContent,
    riskAssessment: RiskAssessment
  ): Promise<ComplianceResult> {
    try {
      // Use the constitutional filter to check compliance
      const result = await this.constitutionalFilter.filterIntrusion({
        id: content.id,
        content: content.rawText,
        type: content.parsedIntent,
        source: content.sourceType,
        urgency: content.urgencyLevel,
        justification: content.rawText,
      });

      const complianceResult = {
        compliant: result.allowed,
        violations:
          result.result.suggestedModifications?.map((modification) => ({
            ruleId: 'constitutional_rule',
            ruleDescription: 'Constitutional rule',
            violation: modification,
            severity: 'low' as const,
            context: content.rawText,
          })) || [],
        warnings: result.result.warningFlags || [],
        explanation: result.result.explanation || 'No explanation provided',
        confidence: result.result.confidence || 0.5,
      };

      return complianceResult;
    } catch (error) {
      console.error('Error checking compliance:', error);
      return this.createFallbackCompliance();
    }
  }

  /**
   * Make decision on intrusion
   */
  private async makeDecision(
    content: IntrusionContent,
    riskAssessment: RiskAssessment,
    compliance: ComplianceResult,
    agentContext: AgentContext
  ): Promise<IntrusionDecision> {
    const prompt = `Make a decision about this intrusion:

Intrusion:
- Text: "${content.rawText}"
- Intent: "${content.parsedIntent}"
- Risk: ${riskAssessment.overallRisk}
- Compliance: ${compliance.compliant ? 'Compliant' : 'Non-compliant'}

Agent Context:
- Goals: ${agentContext.currentGoals.join(', ')}
- Cognitive Load: ${agentContext.cognitiveLoad}
- Activity: ${agentContext.currentActivity}

Decision Options:
- ACCEPT: Accept the suggestion
- REJECT: Reject the suggestion
- DEFER: Defer for later consideration
- MODIFY: Accept with modifications

Provide decision in JSON format:
{
  "decision": "accept|reject|defer|modify",
  "reasoning": "explanation of decision",
  "confidence": 0.8,
  "modifications": ["mod1", "mod2"],
  "feedback": "optional feedback"
}`;

    try {
      const response = await this.llm.generateResponse(
        prompt,
        {
          systemPrompt:
            "You are making decisions about external suggestions. Consider safety, compliance, and the agent's current state.",
        },
        {
          temperature: 0.3,
          maxTokens: 512,
        }
      );

      const parsed = this.parseJSONResponse(response.text);

      return {
        intrusionId: content.id,
        decision: this.parseDecisionType(parsed.decision),
        reasoning: parsed.reasoning || 'No reasoning provided',
        confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)),
        timestamp: Date.now(),
        context: agentContext.currentActivity,
        modifications: Array.isArray(parsed.modifications)
          ? parsed.modifications
          : undefined,
        feedback: parsed.feedback,
      };
    } catch (error) {
      console.error('Error making decision:', error);
      return {
        intrusionId: content.id,
        decision: DecisionType.REJECT,
        reasoning: 'Decision making failed due to error',
        confidence: 0.1,
        timestamp: Date.now(),
        context: 'error_decision',
      };
    }
  }

  /**
   * Process the decision
   */
  private async processDecision(
    decision: IntrusionDecision,
    content: IntrusionContent,
    agentContext: AgentContext
  ): Promise<void> {
    // Store decision in history
    this.processingHistory.push(decision);

    // Limit history size
    if (this.processingHistory.length > 1000) {
      this.processingHistory = this.processingHistory.slice(-500);
    }

    // Log appropriate event
    if (decision.decision === DecisionType.REJECT) {
      this.logEvent('intrusion_rejected', {
        intrusionId: content.id,
        reasoning: decision.reasoning,
      });
    }

    // Apply modifications if any
    if (decision.modifications && decision.modifications.length > 0) {
      // Here you would apply the modifications to the content
      console.log('Applying modifications:', decision.modifications);
    }

    // Provide feedback if available
    if (decision.feedback) {
      this.addFeedback({
        intrusionId: content.id,
        feedbackType: 'modification',
        feedback: decision.feedback,
        confidence: decision.confidence,
        timestamp: Date.now(),
        context: agentContext.currentActivity,
      });
    }
  }

  /**
   * Add intrusion to processing queue
   */
  async queueIntrusion(
    content: IntrusionContent,
    assessment: RiskAssessment,
    agentContext: AgentContext
  ): Promise<void> {
    const priority = this.calculatePriority(content, assessment);

    const queueEntry: QueueEntry = {
      intrusion: content,
      assessment,
      priority,
      queuedAt: Date.now(),
      context: agentContext,
    };

    this.processingQueue.push(queueEntry);

    // Sort by priority (highest first)
    this.processingQueue.sort((a, b) => b.priority - a.priority);

    // Limit queue size
    if (this.processingQueue.length > this.config.maxQueueSize) {
      this.processingQueue = this.processingQueue.slice(
        0,
        this.config.maxQueueSize
      );
    }
  }

  /**
   * Get next intrusion from queue
   */
  getNextIntrusion(agentContext: AgentContext): QueueEntry | null {
    if (this.processingQueue.length === 0) {
      return null;
    }

    // Find highest priority intrusion appropriate for current context
    for (let i = 0; i < this.processingQueue.length; i++) {
      const entry = this.processingQueue[i];
      if (this.isAppropriateForContext(entry, agentContext)) {
        this.processingQueue.splice(i, 1);
        return entry;
      }
    }

    return null;
  }

  /**
   * Add feedback for learning
   */
  addFeedback(feedback: IntrusionFeedback): void {
    this.feedback.push(feedback);

    // Limit feedback size
    if (this.feedback.length > 1000) {
      this.feedback = this.feedback.slice(-500);
    }
  }

  /**
   * Get intrusion interface statistics
   */
  getStats(): IntrusionStats {
    const riskDistribution = { benign: 0, risky: 0, malicious: 0 };
    const contentTypeDistribution = {
      task: 0,
      goal: 0,
      social: 0,
      identity: 0,
      explore: 0,
      emotion: 0,
      info: 0,
      command: 0,
    };
    const sourceTypeDistribution: Record<string, number> = {};

    // Calculate distributions from history
    for (const decision of this.processingHistory) {
      // This would need to be enhanced with actual classification data
      sourceTypeDistribution[decision.context] =
        (sourceTypeDistribution[decision.context] || 0) + 1;
    }

    return {
      totalIntrusions: this.processingHistory.length,
      acceptedIntrusions: this.processingHistory.filter(
        (d) => d.decision === DecisionType.ACCEPT
      ).length,
      rejectedIntrusions: this.processingHistory.filter(
        (d) => d.decision === DecisionType.REJECT
      ).length,
      deferredIntrusions: this.processingHistory.filter(
        (d) => d.decision === DecisionType.DEFER
      ).length,
      modifiedIntrusions: this.processingHistory.filter(
        (d) => d.decision === DecisionType.MODIFY
      ).length,
      averageProcessingTime: 0, // Would need to track actual processing times
      patternCount: 0, // Would need to implement pattern learning
      driftDetections: 0, // Would need to implement drift detection
      falsePositiveRate: 0, // Would need to track false positives
      constitutionalViolations: 0, // Would need to track violations
      riskDistribution,
      contentTypeDistribution,
      sourceTypeDistribution,
    };
  }

  /**
   * Calculate priority for queue entry
   */
  private calculatePriority(
    content: IntrusionContent,
    assessment: RiskAssessment
  ): number {
    let priority = 0;

    // Urgency factor
    priority += content.urgencyLevel * 10;

    // Risk factor (higher risk = higher priority for review)
    priority += assessment.overallRisk * 50;

    // Source trust factor
    const sourceTrust = content.metadata.sourceTrustLevel || 0.5;
    priority += sourceTrust * 20;

    return Math.max(0, Math.min(100, priority));
  }

  /**
   * Check if queue entry is appropriate for current context
   */
  private isAppropriateForContext(
    entry: QueueEntry,
    agentContext: AgentContext
  ): boolean {
    // Check if agent has required context
    for (const requirement of entry.intrusion.contextRequirements) {
      if (!this.hasContextRequirement(requirement, agentContext)) {
        return false;
      }
    }

    // Check cognitive load
    if (agentContext.cognitiveLoad > 0.8) {
      return entry.intrusion.urgencyLevel >= 7; // Only high urgency intrusions
    }

    return true;
  }

  /**
   * Check if agent has specific context requirement
   */
  private hasContextRequirement(
    requirement: string,
    agentContext: AgentContext
  ): boolean {
    switch (requirement) {
      case 'current_goals':
        return agentContext.currentGoals.length > 0;
      case 'current_location':
        return !!agentContext.currentLocation;
      case 'available_resources':
        return agentContext.availableResources.length > 0;
      default:
        return true; // Default to true for unknown requirements
    }
  }

  /**
   * Parse decision type from string
   */
  private parseDecisionType(decision: string): DecisionType {
    switch (decision?.toLowerCase()) {
      case 'accept':
        return DecisionType.ACCEPT;
      case 'reject':
        return DecisionType.REJECT;
      case 'defer':
        return DecisionType.DEFER;
      case 'modify':
        return DecisionType.MODIFY;
      default:
        return DecisionType.REJECT; // Default to reject when uncertain
    }
  }

  /**
   * Parse JSON response from LLM
   */
  private parseJSONResponse(text: string): any {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return {};
    } catch (error) {
      console.error('Error parsing JSON response:', error);
      return {};
    }
  }

  /**
   * Log event for monitoring
   */
  private logEvent(
    eventType: IntrusionEvent['eventType'],
    data: Record<string, any>
  ): void {
    const event: IntrusionEvent = {
      eventId: `event_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      eventType,
      timestamp: Date.now(),
      data,
      severity: 'info',
    };

    this.events.push(event);

    // Limit events size
    if (this.events.length > 1000) {
      this.events = this.events.slice(-500);
    }
  }

  /**
   * Create fallback risk assessment
   */
  private createFallbackAssessment(): RiskAssessment {
    return {
      overallRisk: 0.5,
      harmPotential: 0.3,
      constitutionalConflicts: [],
      contextAppropriateness: 0.5,
      historicalPattern: 0.5,
      mitigationSuggestions: ['Review manually'],
      confidence: 0.2,
    };
  }

  /**
   * Create fallback compliance result
   */
  private createFallbackCompliance(): ComplianceResult {
    return {
      compliant: false,
      violations: [],
      warnings: ['Compliance check failed'],
      explanation: 'Fallback compliance due to error',
      confidence: 0.2,
    };
  }

  /**
   * Clear all data
   */
  clearData(): void {
    this.processingQueue = [];
    this.processingHistory = [];
    this.events = [];
    this.feedback = [];
    this.parser.clearCache();
    this.classifier.clearCache();
  }
}
