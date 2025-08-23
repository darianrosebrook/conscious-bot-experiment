/**
 * Taxonomy Classifier
 *
 * Classifies intrusions into safety and behavioral categories.
 * Provides risk assessment and content type classification for intrusion filtering.
 *
 * @author @darianrosebrook
 */

import { LLMInterface } from '../cognitive-core/llm-interface';
import {
  IntrusionContent,
  RiskClassification,
  ContentClassification,
  RiskLevel,
  ContentType,
  IntrusionInterfaceConfig,
} from './types';

/**
 * Classification result combining risk and content analysis
 */
export interface ClassificationResult {
  riskClassification: RiskClassification;
  contentClassification: ContentClassification;
  overallConfidence: number;
  reasoning: string;
  warnings: string[];
}

/**
 * Taxonomy classifier for intrusion categorization
 */
export class TaxonomyClassifier {
  private llm: LLMInterface;
  private config: IntrusionInterfaceConfig;
  private classificationCache: Map<string, ClassificationResult> = new Map();

  constructor(
    llm: LLMInterface,
    config: Partial<IntrusionInterfaceConfig> = {}
  ) {
    this.llm = llm;
    this.config = { ...DEFAULT_INTRUSION_CONFIG, ...config };
  }

  /**
   * Classify intrusion content by risk and type
   */
  async classifyIntrusion(
    content: IntrusionContent
  ): Promise<ClassificationResult> {
    const cacheKey = this.generateCacheKey(content);

    // Check cache for recent classification
    const cached = this.classificationCache.get(cacheKey);
    if (cached && Date.now() - content.timestamp < 300000) {
      // 5 minute cache
      return cached;
    }

    try {
      // Classify risk level
      const riskClassification = await this.classifyRisk(content);

      // Classify content type
      const contentClassification = await this.classifyContent(content);

      // Calculate overall confidence
      const overallConfidence =
        (riskClassification.confidence + contentClassification.confidence) / 2;

      // Generate reasoning
      const reasoning = this.generateReasoning(
        riskClassification,
        contentClassification
      );

      // Collect warnings
      const warnings = this.collectWarnings(
        riskClassification,
        contentClassification
      );

      const result: ClassificationResult = {
        riskClassification,
        contentClassification,
        overallConfidence,
        reasoning,
        warnings,
      };

      // Cache result
      this.classificationCache.set(cacheKey, result);

      // Limit cache size
      if (this.classificationCache.size > 100) {
        const firstKey = this.classificationCache.keys().next().value;
        if (firstKey) {
          this.classificationCache.delete(firstKey);
        }
      }

      return result;
    } catch (error) {
      console.error('Error classifying intrusion:', error);
      return this.createFallbackClassification(content, error as Error);
    }
  }

  /**
   * Assess safety risk level of intrusion content
   */
  async classifyRisk(content: IntrusionContent): Promise<RiskClassification> {
    const prompt = `Assess the safety risk level of this intrusion:

Text: "${content.rawText}"
Intent: "${content.parsedIntent}"
Action: "${content.suggestedAction || 'None'}"
Source: ${content.sourceType}
Urgency: ${content.urgencyLevel}/10

Risk Categories:
- BENIGN: Safe, helpful suggestions with no potential for harm
- RISKY: Potentially problematic but not clearly malicious
- MALICIOUS: Clearly harmful intent or high potential for damage

Consider:
- Potential for harm to self, others, or environment
- Constitutional violations
- Manipulation attempts
- Safety implications
- Trustworthiness of source

Respond in JSON format:
{
  "riskLevel": "benign|risky|malicious",
  "confidence": 0.8,
  "reasoning": "explanation of risk assessment",
  "factors": ["factor1", "factor2", "factor3"]
}`;

    try {
      const response = await this.llm.generateResponse(prompt, {
        systemPrompt:
          'You are assessing the safety risk of external suggestions. Be cautious and prioritize safety.',
        temperature: 0.2,
        maxTokens: 512,
      });

      const parsed = this.parseJSONResponse(response.text);

      return {
        riskLevel: this.parseRiskLevel(parsed.riskLevel),
        confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)),
        reasoning: parsed.reasoning || 'No reasoning provided',
        factors: Array.isArray(parsed.factors) ? parsed.factors : [],
      };
    } catch (error) {
      console.error('Error classifying risk:', error);
      return {
        riskLevel: RiskLevel.RISKY, // Default to risky when uncertain
        confidence: 0.3,
        reasoning: 'Risk classification failed due to error',
        factors: ['classification_error'],
      };
    }
  }

  /**
   * Categorize the type of suggestion being made
   */
  async classifyContent(
    content: IntrusionContent
  ): Promise<ContentClassification> {
    const prompt = `Categorize the type of suggestion in this intrusion:

Text: "${content.rawText}"
Intent: "${content.parsedIntent}"
Action: "${content.suggestedAction || 'None'}"

Content Types:
- TASK_SUGGESTION: Direct action recommendations
- GOAL_MODIFICATION: Changes to current objectives
- SOCIAL_MANIPULATION: Attempts to influence relationships
- SELF_MODIFICATION: Changes to identity or values
- EXPLORATION: Suggestions for discovery or learning
- EMOTIONAL_TRIGGER: Attempts to provoke emotional response
- INFORMATION_REQUEST: Requests for information
- COMMAND: Direct commands or orders

Respond in JSON format:
{
  "contentType": "task|goal|social|identity|explore|emotion|info|command",
  "subcategory": "optional subcategory",
  "confidence": 0.8,
  "reasoning": "explanation of classification"
}`;

    try {
      const response = await this.llm.generateResponse(prompt, {
        systemPrompt:
          'You are categorizing the type of external suggestion. Be precise about the intent and nature of the suggestion.',
        temperature: 0.3,
        maxTokens: 256,
      });

      const parsed = this.parseJSONResponse(response.text);

      return {
        contentType: this.parseContentType(parsed.contentType),
        subcategory: parsed.subcategory,
        confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)),
        reasoning: parsed.reasoning || 'No reasoning provided',
      };
    } catch (error) {
      console.error('Error classifying content:', error);
      return {
        contentType: ContentType.TASK_SUGGESTION, // Default to task suggestion
        confidence: 0.3,
        reasoning: 'Content classification failed due to error',
      };
    }
  }

  /**
   * Parse risk level from string
   */
  private parseRiskLevel(riskLevel: string): RiskLevel {
    switch (riskLevel?.toLowerCase()) {
      case 'benign':
        return RiskLevel.BENIGN;
      case 'risky':
        return RiskLevel.RISKY;
      case 'malicious':
        return RiskLevel.MALICIOUS;
      default:
        return RiskLevel.RISKY; // Default to risky when uncertain
    }
  }

  /**
   * Parse content type from string
   */
  private parseContentType(contentType: string): ContentType {
    switch (contentType?.toLowerCase()) {
      case 'task':
        return ContentType.TASK_SUGGESTION;
      case 'goal':
        return ContentType.GOAL_MODIFICATION;
      case 'social':
        return ContentType.SOCIAL_MANIPULATION;
      case 'identity':
        return ContentType.SELF_MODIFICATION;
      case 'explore':
        return ContentType.EXPLORATION;
      case 'emotion':
        return ContentType.EMOTIONAL_TRIGGER;
      case 'info':
        return ContentType.INFORMATION_REQUEST;
      case 'command':
        return ContentType.COMMAND;
      default:
        return ContentType.TASK_SUGGESTION; // Default to task suggestion
    }
  }

  /**
   * Generate reasoning for classification
   */
  private generateReasoning(
    riskClassification: RiskClassification,
    contentClassification: ContentClassification
  ): string {
    return `Risk: ${riskClassification.riskLevel} (${Math.round(riskClassification.confidence * 100)}% confidence) - ${riskClassification.reasoning}. Content: ${contentClassification.contentType} (${Math.round(contentClassification.confidence * 100)}% confidence) - ${contentClassification.reasoning}`;
  }

  /**
   * Collect warnings from classifications
   */
  private collectWarnings(
    riskClassification: RiskClassification,
    contentClassification: ContentClassification
  ): string[] {
    const warnings: string[] = [];

    // Risk-based warnings
    if (riskClassification.riskLevel === RiskLevel.MALICIOUS) {
      warnings.push('High risk content detected');
    } else if (riskClassification.riskLevel === RiskLevel.RISKY) {
      warnings.push('Potentially risky content');
    }

    if (riskClassification.confidence < 0.5) {
      warnings.push('Low confidence in risk assessment');
    }

    // Content-based warnings
    if (contentClassification.contentType === ContentType.SELF_MODIFICATION) {
      warnings.push('Identity modification attempt detected');
    } else if (
      contentClassification.contentType === ContentType.SOCIAL_MANIPULATION
    ) {
      warnings.push('Social manipulation attempt detected');
    } else if (contentClassification.contentType === ContentType.COMMAND) {
      warnings.push('Command-like content detected');
    }

    if (contentClassification.confidence < 0.5) {
      warnings.push('Low confidence in content classification');
    }

    return warnings;
  }

  /**
   * Generate cache key for classification results
   */
  private generateCacheKey(content: IntrusionContent): string {
    const contentHash = this.simpleHash(content.rawText + content.parsedIntent);
    return `${content.sourceType}_${contentHash}`;
  }

  /**
   * Simple hash function for content
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Parse JSON response from LLM
   */
  private parseJSONResponse(text: string): any {
    try {
      // Try to extract JSON from the response
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
   * Create fallback classification when main classification fails
   */
  private createFallbackClassification(
    content: IntrusionContent,
    error: Error
  ): ClassificationResult {
    const riskClassification: RiskClassification = {
      riskLevel: RiskLevel.RISKY,
      confidence: 0.2,
      reasoning: 'Fallback classification due to error',
      factors: ['classification_error'],
    };

    const contentClassification: ContentClassification = {
      contentType: ContentType.TASK_SUGGESTION,
      confidence: 0.2,
      reasoning: 'Fallback classification due to error',
    };

    return {
      riskClassification,
      contentClassification,
      overallConfidence: 0.2,
      reasoning: 'Classification failed due to error',
      warnings: ['Classification error', 'Low confidence results'],
    };
  }

  /**
   * Get classification statistics
   */
  getStats() {
    const riskDistribution: Record<RiskLevel, number> = {
      [RiskLevel.BENIGN]: 0,
      [RiskLevel.RISKY]: 0,
      [RiskLevel.MALICIOUS]: 0,
    };

    const contentTypeDistribution: Record<ContentType, number> = {
      [ContentType.TASK_SUGGESTION]: 0,
      [ContentType.GOAL_MODIFICATION]: 0,
      [ContentType.SOCIAL_MANIPULATION]: 0,
      [ContentType.SELF_MODIFICATION]: 0,
      [ContentType.EXPLORATION]: 0,
      [ContentType.EMOTIONAL_TRIGGER]: 0,
      [ContentType.INFORMATION_REQUEST]: 0,
      [ContentType.COMMAND]: 0,
    };

    // Count classifications in cache
    for (const result of this.classificationCache.values()) {
      riskDistribution[result.riskClassification.riskLevel]++;
      contentTypeDistribution[result.contentClassification.contentType]++;
    }

    return {
      cacheSize: this.classificationCache.size,
      riskDistribution,
      contentTypeDistribution,
      averageConfidence: 0.7, // Would need to track actual confidence
    };
  }

  /**
   * Clear classification cache
   */
  clearCache(): void {
    this.classificationCache.clear();
  }
}

// Import the default config
import { DEFAULT_INTRUSION_CONFIG } from './types';
