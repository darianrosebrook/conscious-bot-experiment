/**
 * Explanation generator implementation.
 *
 * Generates human-readable explanations of decisions
 * with appropriate level of detail and context.
 *
 * @author @darianrosebrook
 */

import {
  DecisionRecord,
  DecisionStage,
  ExplanationRequest,
  ExplanationResponse,
  ExplanationFormat,
  ExplanationDetailLevel,
  Evidence,
} from './types';
import { DecisionTracker } from './decision-tracker';
import { EvidenceManager } from './evidence-manager';

/**
 * Explanation generator configuration
 */
export interface ExplanationGeneratorConfig {
  defaultFormat: ExplanationFormat;
  defaultDetailLevel: ExplanationDetailLevel;
  includeEvidenceByDefault: boolean;
  includeAlternativesByDefault: boolean;
  maxEvidenceItems: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: ExplanationGeneratorConfig = {
  defaultFormat: ExplanationFormat.TEXT,
  defaultDetailLevel: ExplanationDetailLevel.STANDARD,
  includeEvidenceByDefault: true,
  includeAlternativesByDefault: true,
  maxEvidenceItems: 5,
};

/**
 * Explanation generator implementation
 */
export class ExplanationGenerator {
  private decisionTracker: DecisionTracker;
  private evidenceManager: EvidenceManager;
  private config: ExplanationGeneratorConfig;

  constructor(
    decisionTracker: DecisionTracker,
    evidenceManager: EvidenceManager,
    config: Partial<ExplanationGeneratorConfig> = {}
  ) {
    this.decisionTracker = decisionTracker;
    this.evidenceManager = evidenceManager;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate explanation for decision
   */
  generateExplanation(
    request: ExplanationRequest
  ): ExplanationResponse | null {
    const decision = this.decisionTracker.getDecision(request.decisionId);
    if (!decision) {
      return null;
    }

    // Apply defaults
    const format = request.format || this.config.defaultFormat;
    const detailLevel = request.detailLevel || this.config.defaultDetailLevel;

    // Generate content based on format
    let content: string | Record<string, any>;
    switch (format) {
      case ExplanationFormat.STRUCTURED:
        content = this.generateStructuredExplanation(decision, detailLevel, request);
        break;
      case ExplanationFormat.SUMMARY:
        content = this.generateSummaryExplanation(decision);
        break;
      case ExplanationFormat.TECHNICAL:
        content = this.generateTechnicalExplanation(decision, detailLevel);
        break;
      case ExplanationFormat.SIMPLE:
        content = this.generateSimpleExplanation(decision);
        break;
      case ExplanationFormat.TEXT:
      default:
        content = this.generateTextExplanation(decision, detailLevel, request);
        break;
    }

    // Gather contextual information
    const contextualInformation = this.gatherContextualInformation(
      decision,
      detailLevel,
      request
    );

    // Calculate confidence score
    const confidenceScore = this.calculateConfidenceScore(decision);

    return {
      decisionId: request.decisionId,
      format,
      detailLevel,
      content,
      contextualInformation,
      confidenceScore,
      generatedAt: Date.now(),
    };
  }

  /**
   * Generate text explanation
   */
  private generateTextExplanation(
    decision: DecisionRecord,
    detailLevel: ExplanationDetailLevel,
    request: ExplanationRequest
  ): string {
    let explanation = '';

    // Title and description
    explanation += `Decision: ${decision.title}\n`;
    explanation += `${decision.description}\n\n`;

    // Context
    explanation += 'Context:\n';
    explanation += `Situation: ${decision.context.situation}\n`;
    
    if (detailLevel !== ExplanationDetailLevel.MINIMAL) {
      explanation += 'Goals:\n';
      for (const goal of decision.context.goals) {
        explanation += `- ${goal}\n`;
      }
      
      explanation += 'Constraints:\n';
      for (const constraint of decision.context.constraints) {
        explanation += `- ${constraint}\n`;
      }
    }
    
    explanation += '\n';

    // Information sources
    if (detailLevel !== ExplanationDetailLevel.MINIMAL && 
        decision.informationSources.length > 0) {
      explanation += 'Information Sources:\n';
      
      const sourcesToShow = detailLevel === ExplanationDetailLevel.COMPREHENSIVE ? 
        decision.informationSources : 
        decision.informationSources.slice(0, 3);
      
      for (const source of sourcesToShow) {
        explanation += `- ${source.description} (${source.type}, reliability: ${source.reliability.toFixed(2)})\n`;
      }
      
      if (decision.informationSources.length > sourcesToShow.length) {
        explanation += `  ...and ${decision.informationSources.length - sourcesToShow.length} more sources\n`;
      }
      
      explanation += '\n';
    }

    // Selected alternative
    if (decision.selectedAlternative) {
      const selectedAlt = decision.alternatives.find(
        (alt) => alt.id === decision.selectedAlternative
      );
      
      if (selectedAlt) {
        explanation += 'Decision Made:\n';
        explanation += `Selected: ${selectedAlt.title}\n`;
        explanation += `${selectedAlt.description}\n\n`;
      }
    }

    // Justification
    explanation += 'Justification:\n';
    explanation += `${decision.justification.reasoning}\n\n`;

    // Evidence
    if (this.config.includeEvidenceByDefault && 
        decision.justification.evidenceIds.length > 0 && 
        detailLevel !== ExplanationDetailLevel.MINIMAL) {
      
      explanation += 'Supporting Evidence:\n';
      
      const evidenceItems = this.evidenceManager.getEvidenceByIds(
        decision.justification.evidenceIds
      );
      
      const itemsToShow = Math.min(
        evidenceItems.length,
        detailLevel === ExplanationDetailLevel.COMPREHENSIVE ? 
          this.config.maxEvidenceItems * 2 : this.config.maxEvidenceItems
      );
      
      for (let i = 0; i < itemsToShow; i++) {
        const evidence = evidenceItems[i];
        explanation += `- ${this.formatEvidenceForText(evidence)}\n`;
      }
      
      if (evidenceItems.length > itemsToShow) {
        explanation += `  ...and ${evidenceItems.length - itemsToShow} more evidence items\n`;
      }
      
      explanation += '\n';
    }

    // Alternatives
    if (this.config.includeAlternativesByDefault && 
        decision.alternatives.length > 1 && 
        detailLevel !== ExplanationDetailLevel.MINIMAL) {
      
      explanation += 'Alternatives Considered:\n';
      
      const alternativesToShow = decision.alternatives.filter(
        (alt) => alt.id !== decision.selectedAlternative
      );
      
      const maxAlts = detailLevel === ExplanationDetailLevel.COMPREHENSIVE ? 5 : 3;
      const altsToShow = alternativesToShow.slice(0, maxAlts);
      
      for (const alt of altsToShow) {
        explanation += `- ${alt.title} (utility: ${alt.estimatedUtility.toFixed(2)})\n`;
        
        if (detailLevel >= ExplanationDetailLevel.STANDARD) {
          explanation += `  ${alt.description}\n`;
          
          if (detailLevel >= ExplanationDetailLevel.DETAILED) {
            if (alt.pros.length > 0) {
              explanation += '  Pros:\n';
              for (const pro of alt.pros) {
                explanation += `  + ${pro}\n`;
              }
            }
            
            if (alt.cons.length > 0) {
              explanation += '  Cons:\n';
              for (const con of alt.cons) {
                explanation += `  - ${con}\n`;
              }
            }
          }
        }
      }
      
      if (alternativesToShow.length > altsToShow.length) {
        explanation += `  ...and ${alternativesToShow.length - altsToShow.length} more alternatives\n`;
      }
      
      explanation += '\n';
    }

    // Outcome
    if (decision.outcome && decision.stage >= DecisionStage.OUTCOME_RECORDED) {
      explanation += 'Outcome:\n';
      explanation += `Status: ${decision.outcome.status}\n`;
      explanation += `${decision.outcome.description}\n\n`;
      
      if (detailLevel >= ExplanationDetailLevel.DETAILED && 
          Object.keys(decision.outcome.metrics).length > 0) {
        explanation += 'Metrics:\n';
        for (const [key, value] of Object.entries(decision.outcome.metrics)) {
          explanation += `- ${key}: ${value}\n`;
        }
        explanation += '\n';
      }
    }

    // Learnings
    if (decision.learnings && 
        decision.learnings.length > 0 && 
        decision.stage >= DecisionStage.LEARNING_INTEGRATED && 
        detailLevel >= ExplanationDetailLevel.STANDARD) {
      
      explanation += 'Learnings:\n';
      
      const learningsToShow = detailLevel === ExplanationDetailLevel.COMPREHENSIVE ? 
        decision.learnings : 
        decision.learnings.slice(0, 3);
      
      for (const learning of learningsToShow) {
        explanation += `- ${learning.insight}\n`;
      }
      
      if (decision.learnings.length > learningsToShow.length) {
        explanation += `  ...and ${decision.learnings.length - learningsToShow.length} more learnings\n`;
      }
    }

    return explanation;
  }

  /**
   * Generate structured explanation
   */
  private generateStructuredExplanation(
    decision: DecisionRecord,
    detailLevel: ExplanationDetailLevel,
    request: ExplanationRequest
  ): Record<string, any> {
    const explanation: Record<string, any> = {
      title: decision.title,
      description: decision.description,
      domain: decision.domain,
      importance: decision.importance,
      stage: decision.stage,
      timestamp: decision.timestamp,
      context: {
        situation: decision.context.situation,
        goals: decision.context.goals,
        constraints: decision.context.constraints,
      },
    };

    // Add information sources
    if (detailLevel !== ExplanationDetailLevel.MINIMAL) {
      explanation.informationSources = decision.informationSources.map((source) => ({
        type: source.type,
        description: source.description,
        reliability: source.reliability,
      }));
    }

    // Add selected alternative
    if (decision.selectedAlternative) {
      const selectedAlt = decision.alternatives.find(
        (alt) => alt.id === decision.selectedAlternative
      );
      
      if (selectedAlt) {
        explanation.selectedAlternative = {
          title: selectedAlt.title,
          description: selectedAlt.description,
          estimatedUtility: selectedAlt.estimatedUtility,
          confidence: selectedAlt.confidence,
        };
      }
    }

    // Add justification
    explanation.justification = {
      reasoning: decision.justification.reasoning,
      confidenceScore: decision.justification.confidenceScore,
    };

    // Add evidence
    if (this.config.includeEvidenceByDefault && 
        decision.justification.evidenceIds.length > 0 && 
        detailLevel !== ExplanationDetailLevel.MINIMAL) {
      
      const evidenceItems = this.evidenceManager.getEvidenceByIds(
        decision.justification.evidenceIds
      );
      
      explanation.evidence = evidenceItems.map((evidence) => ({
        type: evidence.type,
        content: this.summarizeContent(evidence.content),
        source: evidence.source,
        reliability: evidence.reliability,
      }));
    }

    // Add alternatives
    if (this.config.includeAlternativesByDefault && 
        decision.alternatives.length > 1 && 
        detailLevel !== ExplanationDetailLevel.MINIMAL) {
      
      explanation.alternatives = decision.alternatives
        .filter((alt) => alt.id !== decision.selectedAlternative)
        .map((alt) => ({
          title: alt.title,
          description: alt.description,
          estimatedUtility: alt.estimatedUtility,
          confidence: alt.confidence,
          pros: alt.pros,
          cons: alt.cons,
        }));
    }

    // Add outcome
    if (decision.outcome && decision.stage >= DecisionStage.OUTCOME_RECORDED) {
      explanation.outcome = {
        status: decision.outcome.status,
        description: decision.outcome.description,
      };
      
      if (detailLevel >= ExplanationDetailLevel.DETAILED) {
        explanation.outcome.metrics = decision.outcome.metrics;
      }
    }

    // Add learnings
    if (decision.learnings && 
        decision.learnings.length > 0 && 
        decision.stage >= DecisionStage.LEARNING_INTEGRATED && 
        detailLevel >= ExplanationDetailLevel.STANDARD) {
      
      explanation.learnings = decision.learnings.map((learning) => ({
        insight: learning.insight,
        applicability: learning.applicability,
        confidence: learning.confidence,
      }));
    }

    return explanation;
  }

  /**
   * Generate summary explanation
   */
  private generateSummaryExplanation(decision: DecisionRecord): string {
    let summary = `Decision: ${decision.title}\n\n`;
    
    // Context
    summary += `In the context of ${decision.context.situation}, `;
    
    // Decision made
    if (decision.selectedAlternative) {
      const selectedAlt = decision.alternatives.find(
        (alt) => alt.id === decision.selectedAlternative
      );
      
      if (selectedAlt) {
        summary += `the decision was made to ${selectedAlt.title.toLowerCase()}. `;
      }
    }
    
    // Justification
    summary += `This was because ${decision.justification.reasoning.toLowerCase()}. `;
    
    // Outcome
    if (decision.outcome) {
      summary += `The outcome was ${decision.outcome.status.toLowerCase()}: ${decision.outcome.description}`;
    } else {
      summary += 'The outcome is still pending.';
    }
    
    return summary;
  }

  /**
   * Generate technical explanation
   */
  private generateTechnicalExplanation(
    decision: DecisionRecord,
    detailLevel: ExplanationDetailLevel
  ): string {
    let explanation = `# Technical Analysis: ${decision.title}\n\n`;
    
    // Decision metadata
    explanation += '## Metadata\n\n';
    explanation += `- ID: \`${decision.id}\`\n`;
    explanation += `- Domain: \`${decision.domain}\`\n`;
    explanation += `- Importance: \`${decision.importance}\`\n`;
    explanation += `- Stage: \`${decision.stage}\`\n`;
    explanation += `- Timestamp: \`${new Date(decision.timestamp).toISOString()}\`\n\n`;
    
    // Context
    explanation += '## Context\n\n';
    explanation += `Situation: ${decision.context.situation}\n\n`;
    explanation += '### Goals\n\n';
    for (const goal of decision.context.goals) {
      explanation += `- ${goal}\n`;
    }
    explanation += '\n### Constraints\n\n';
    for (const constraint of decision.context.constraints) {
      explanation += `- ${constraint}\n`;
    }
    explanation += '\n';
    
    // Information sources
    if (decision.informationSources.length > 0) {
      explanation += '## Information Sources\n\n';
      explanation += '| Type | Description | Reliability | Timestamp |\n';
      explanation += '|------|-------------|------------|----------|\n';
      
      for (const source of decision.informationSources) {
        explanation += `| ${source.type} | ${source.description} | ${source.reliability.toFixed(3)} | ${new Date(source.timestamp).toISOString()} |\n`;
      }
      explanation += '\n';
    }
    
    // Alternatives analysis
    explanation += '## Alternatives Analysis\n\n';
    explanation += '| Alternative | Utility | Confidence | Pros | Cons | Risks |\n';
    explanation += '|------------|---------|------------|------|------|-------|\n';
    
    for (const alt of decision.alternatives) {
      const isSelected = alt.id === decision.selectedAlternative;
      const title = isSelected ? `**${alt.title}** (SELECTED)` : alt.title;
      const pros = alt.pros.join(', ');
      const cons = alt.cons.join(', ');
      const risks = alt.risks.map(r => `${r.description} (P:${r.probability.toFixed(2)}, I:${r.impact.toFixed(2)})`).join(', ');
      
      explanation += `| ${title} | ${alt.estimatedUtility.toFixed(3)} | ${alt.confidence.toFixed(3)} | ${pros} | ${cons} | ${risks} |\n`;
    }
    explanation += '\n';
    
    // Justification
    explanation += '## Justification\n\n';
    explanation += `${decision.justification.reasoning}\n\n`;
    explanation += `Confidence Score: ${decision.justification.confidenceScore.toFixed(3)}\n\n`;
    
    if (decision.justification.ethicalConsiderations.length > 0) {
      explanation += '### Ethical Considerations\n\n';
      for (const consideration of decision.justification.ethicalConsiderations) {
        explanation += `- ${consideration}\n`;
      }
      explanation += '\n';
    }
    
    // Evidence
    if (decision.justification.evidenceIds.length > 0) {
      explanation += '## Evidence\n\n';
      
      const evidenceItems = this.evidenceManager.getEvidenceByIds(
        decision.justification.evidenceIds
      );
      
      explanation += '| ID | Type | Source | Reliability | Content |\n';
      explanation += '|----|------|--------|------------|--------|\n';
      
      for (const evidence of evidenceItems) {
        const contentSummary = this.summarizeContent(evidence.content);
        explanation += `| \`${evidence.id}\` | ${evidence.type} | ${evidence.source} | ${evidence.reliability.toFixed(3)} | ${contentSummary} |\n`;
      }
      explanation += '\n';
    }
    
    // Execution
    if (decision.execution) {
      explanation += '## Execution\n\n';
      explanation += `Status: \`${decision.execution.status}\`\n`;
      explanation += `Start Time: \`${new Date(decision.execution.startTime).toISOString()}\`\n`;
      if (decision.execution.endTime) {
        explanation += `End Time: \`${new Date(decision.execution.endTime).toISOString()}\`\n`;
        explanation += `Duration: ${(decision.execution.endTime - decision.execution.startTime) / 1000} seconds\n`;
      }
      explanation += '\n';
      
      if (decision.execution.actions.length > 0) {
        explanation += '### Actions\n\n';
        explanation += '| ID | Type | Status | Timestamp | Description |\n';
        explanation += '|----|------|--------|-----------|-------------|\n';
        
        for (const action of decision.execution.actions) {
          explanation += `| \`${action.id}\` | ${action.type} | \`${action.status}\` | \`${new Date(action.timestamp).toISOString()}\` | ${action.description} |\n`;
        }
        explanation += '\n';
      }
    }
    
    // Outcome
    if (decision.outcome) {
      explanation += '## Outcome\n\n';
      explanation += `Status: \`${decision.outcome.status}\`\n`;
      explanation += `Description: ${decision.outcome.description}\n\n`;
      
      if (Object.keys(decision.outcome.metrics).length > 0) {
        explanation += '### Metrics\n\n';
        explanation += '| Metric | Value |\n';
        explanation += '|--------|-------|\n';
        
        for (const [key, value] of Object.entries(decision.outcome.metrics)) {
          explanation += `| ${key} | ${value} |\n`;
        }
        explanation += '\n';
      }
      
      if (Object.keys(decision.outcome.expectedVsActual).length > 0) {
        explanation += '### Expected vs Actual\n\n';
        explanation += '| Metric | Expected | Actual |\n';
        explanation += '|--------|----------|--------|\n';
        
        for (const [key, { expected, actual }] of Object.entries(decision.outcome.expectedVsActual)) {
          explanation += `| ${key} | ${expected} | ${actual} |\n`;
        }
        explanation += '\n';
      }
    }
    
    // Learnings
    if (decision.learnings && decision.learnings.length > 0) {
      explanation += '## Learnings\n\n';
      
      for (const learning of decision.learnings) {
        explanation += `### ${learning.insight}\n\n`;
        explanation += `Confidence: ${learning.confidence.toFixed(3)}\n\n`;
        
        if (learning.applicability.length > 0) {
          explanation += 'Applicability:\n';
          for (const app of learning.applicability) {
            explanation += `- ${app}\n`;
          }
          explanation += '\n';
        }
        
        if (learning.integratedInto.length > 0) {
          explanation += 'Integrated into:\n';
          for (const integration of learning.integratedInto) {
            explanation += `- \`${integration}\`\n`;
          }
          explanation += '\n';
        }
      }
    }
    
    // Related decisions
    if (decision.relatedDecisions.length > 0) {
      explanation += '## Related Decisions\n\n';
      
      for (const relatedId of decision.relatedDecisions) {
        const related = this.decisionTracker.getDecision(relatedId);
        if (related) {
          explanation += `- \`${relatedId}\`: ${related.title}\n`;
        } else {
          explanation += `- \`${relatedId}\` (not found)\n`;
        }
      }
    }
    
    return explanation;
  }

  /**
   * Generate simple explanation
   */
  private generateSimpleExplanation(decision: DecisionRecord): string {
    let explanation = `We made a decision about: ${decision.title}\n\n`;
    
    // Situation
    explanation += `The situation was: ${decision.context.situation}\n\n`;
    
    // What was decided
    if (decision.selectedAlternative) {
      const selectedAlt = decision.alternatives.find(
        (alt) => alt.id === decision.selectedAlternative
      );
      
      if (selectedAlt) {
        explanation += `We decided to: ${selectedAlt.title}\n\n`;
      }
    }
    
    // Simple justification
    explanation += `We did this because: ${decision.justification.reasoning}\n\n`;
    
    // Outcome in simple terms
    if (decision.outcome) {
      explanation += `The result was: ${decision.outcome.description}\n`;
    } else {
      explanation += `We're still waiting to see the results.`;
    }
    
    return explanation;
  }

  /**
   * Gather contextual information
   */
  private gatherContextualInformation(
    decision: DecisionRecord,
    detailLevel: ExplanationDetailLevel,
    request: ExplanationRequest
  ): Record<string, any> {
    const context: Record<string, any> = {
      decisionMetadata: {
        id: decision.id,
        domain: decision.domain,
        importance: decision.importance,
        stage: decision.stage,
        timestamp: decision.timestamp,
        tags: decision.tags,
      },
    };

    // Add related decisions
    if (decision.relatedDecisions.length > 0) {
      const relatedDecisions = decision.relatedDecisions
        .map((id) => this.decisionTracker.getDecision(id))
        .filter((d): d is DecisionRecord => !!d)
        .map((d) => ({
          id: d.id,
          title: d.title,
          stage: d.stage,
        }));

      context.relatedDecisions = relatedDecisions;
    }

    // Add focus areas if requested
    if (request.focusAreas && request.focusAreas.length > 0) {
      context.focusAreas = request.focusAreas;
    }

    return context;
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidenceScore(decision: DecisionRecord): number {
    let score = decision.justification.confidenceScore;

    // Adjust based on evidence reliability
    if (decision.justification.evidenceIds.length > 0) {
      const evidenceItems = this.evidenceManager.getEvidenceByIds(
        decision.justification.evidenceIds
      );

      if (evidenceItems.length > 0) {
        const avgReliability =
          evidenceItems.reduce((sum, e) => sum + e.reliability, 0) /
          evidenceItems.length;

        // Weight justification confidence (70%) and evidence reliability (30%)
        score = score * 0.7 + avgReliability * 0.3;
      }
    }

    // Adjust based on selected alternative confidence
    if (decision.selectedAlternative) {
      const selectedAlt = decision.alternatives.find(
        (alt) => alt.id === decision.selectedAlternative
      );

      if (selectedAlt) {
        // Further adjust with alternative confidence (20%)
        score = score * 0.8 + selectedAlt.confidence * 0.2;
      }
    }

    return Math.min(1, Math.max(0, score));
  }

  /**
   * Format evidence for text output
   */
  private formatEvidenceForText(evidence: Evidence): string {
    const contentStr = this.summarizeContent(evidence.content);
    return `${contentStr} (${evidence.type}, reliability: ${evidence.reliability.toFixed(2)})`;
  }

  /**
   * Summarize content for display
   */
  private summarizeContent(content: any): string {
    if (typeof content === 'string') {
      return content.length > 100 ? content.substring(0, 97) + '...' : content;
    }

    if (typeof content === 'number' || typeof content === 'boolean') {
      return content.toString();
    }

    if (Array.isArray(content)) {
      return `[Array of ${content.length} items]`;
    }

    if (typeof content === 'object' && content !== null) {
      return `{Object with keys: ${Object.keys(content).join(', ')}}`;
    }

    return String(content);
  }
}
