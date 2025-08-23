/**
 * Intrusion Parser
 *
 * Parses raw intrusion content into structured format for processing.
 * Handles text normalization, intent extraction, urgency detection, and context requirements.
 *
 * @author @darianrosebrook
 */

import { LLMInterface } from '../cognitive-core/llm-interface';
import {
  IntrusionContent,
  UrgencyLevel,
  IntrusionInterfaceConfig,
} from './types';

/**
 * Source metadata for intrusion tracking
 */
export interface SourceMetadata {
  sourceType: 'human' | 'script' | 'random' | 'test';
  sourceId?: string;
  sourceName?: string;
  sourceTrustLevel?: number; // 0-1 scale
  sourceHistory?: string[];
  context?: Record<string, any>;
}

/**
 * Parsing result with confidence and reasoning
 */
export interface ParsingResult {
  content: IntrusionContent;
  confidence: number;
  reasoning: string;
  warnings: string[];
}

/**
 * Intrusion parser for standardizing external suggestions
 */
export class IntrusionParser {
  private llm: LLMInterface;
  private config: IntrusionInterfaceConfig;
  private parsingCache: Map<string, ParsingResult> = new Map();

  constructor(
    llm: LLMInterface,
    config: Partial<IntrusionInterfaceConfig> = {}
  ) {
    this.llm = llm;
    this.config = { ...DEFAULT_INTRUSION_CONFIG, ...config };
  }

  /**
   * Parse raw suggestion text into structured intrusion
   */
  async parseIntrusion(
    rawContent: string,
    sourceMetadata: SourceMetadata
  ): Promise<ParsingResult> {
    const cacheKey = this.generateCacheKey(rawContent, sourceMetadata);

    // Check cache for recent parsing
    const cached = this.parsingCache.get(cacheKey);
    if (cached && Date.now() - cached.content.timestamp < 300000) {
      // 5 minute cache
      return cached;
    }

    try {
      // Generate unique ID
      const intrusionId = this.generateIntrusionId();

      // Parse intent and extract action
      const intentResult = await this.parseIntent(rawContent);

      // Detect urgency level
      const urgencyLevel = await this.detectUrgency(
        rawContent,
        intentResult.intent
      );

      // Identify context requirements
      const contextRequirements = await this.identifyContextRequirements(
        rawContent,
        intentResult.intent,
        intentResult.action
      );

      // Create structured content
      const content: IntrusionContent = {
        id: intrusionId,
        rawText: rawContent,
        parsedIntent: intentResult.intent,
        suggestedAction: intentResult.action,
        urgencyLevel,
        contextRequirements,
        sourceType: sourceMetadata.sourceType,
        timestamp: Date.now(),
        metadata: {
          sourceId: sourceMetadata.sourceId,
          sourceName: sourceMetadata.sourceName,
          sourceTrustLevel: sourceMetadata.sourceTrustLevel,
          sourceHistory: sourceMetadata.sourceHistory,
          context: sourceMetadata.context,
          parsingConfidence: intentResult.confidence,
        },
      };

      const result: ParsingResult = {
        content,
        confidence: intentResult.confidence,
        reasoning: intentResult.reasoning,
        warnings: intentResult.warnings,
      };

      // Cache result
      this.parsingCache.set(cacheKey, result);

      // Limit cache size
      if (this.parsingCache.size > 100) {
        const firstKey = this.parsingCache.keys().next().value;
        if (firstKey) {
          this.parsingCache.delete(firstKey);
        }
      }

      return result;
    } catch (error) {
      console.error('Error parsing intrusion:', error);
      return this.createFallbackParsing(
        rawContent,
        sourceMetadata,
        error as Error
      );
    }
  }

  /**
   * Parse intent and extract suggested action from raw text
   */
  private async parseIntent(rawContent: string): Promise<{
    intent: string;
    action?: string;
    confidence: number;
    reasoning: string;
    warnings: string[];
  }> {
    const prompt = `Analyze this external suggestion and extract the intent and any suggested action:

Text: "${rawContent}"

Please provide:
1. The main intent or purpose of this suggestion
2. Any specific action being suggested (if any)
3. Your confidence in this interpretation (0-1)
4. Reasoning for your interpretation
5. Any warnings or concerns about the content

Respond in JSON format:
{
  "intent": "description of the main intent",
  "action": "specific action suggested or null",
  "confidence": 0.8,
  "reasoning": "explanation of interpretation",
  "warnings": ["warning1", "warning2"]
}`;

    try {
      const response = await this.llm.generateResponse(prompt, {
        systemPrompt:
          'You are analyzing external suggestions to understand their intent and extract suggested actions. Be precise and cautious.',
        temperature: 0.3,
        maxTokens: 512,
      });

      const parsed = this.parseJSONResponse(response.text);

      return {
        intent: parsed.intent || 'Unknown intent',
        action: parsed.action || undefined,
        confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)),
        reasoning: parsed.reasoning || 'No reasoning provided',
        warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
      };
    } catch (error) {
      console.error('Error parsing intent:', error);
      return {
        intent: 'Unable to parse intent',
        confidence: 0.1,
        reasoning: 'Failed to parse intent due to error',
        warnings: ['Intent parsing failed'],
      };
    }
  }

  /**
   * Detect urgency level from content and intent
   */
  private async detectUrgency(
    rawContent: string,
    intent: string
  ): Promise<number> {
    const prompt = `Assess the urgency level of this suggestion:

Text: "${rawContent}"
Intent: "${intent}"

Consider:
- Time sensitivity
- Potential consequences of delay
- Emotional intensity
- Command-like language
- Safety implications

Rate urgency on a scale of 1-10:
1-2: Low urgency (casual suggestion)
3-4: Medium-low urgency (helpful advice)
5-6: Medium urgency (timely suggestion)
7-8: High urgency (important action needed)
9-10: Critical urgency (immediate action required)

Provide just the number (1-10):`;

    try {
      const response = await this.llm.generateResponse(prompt, {
        systemPrompt:
          'You are assessing the urgency of external suggestions. Be objective and consider safety implications.',
        temperature: 0.2,
        maxTokens: 10,
      });

      const urgency = parseInt(response.text.trim(), 10);
      return Math.max(1, Math.min(10, isNaN(urgency) ? 5 : urgency));
    } catch (error) {
      console.error('Error detecting urgency:', error);
      return UrgencyLevel.MEDIUM; // Default to medium urgency
    }
  }

  /**
   * Identify context requirements for the intrusion
   */
  private async identifyContextRequirements(
    rawContent: string,
    intent: string,
    action?: string
  ): Promise<string[]> {
    const prompt = `Identify what context or information would be needed to properly evaluate this suggestion:

Text: "${rawContent}"
Intent: "${intent}"
Action: "${action || 'None specified'}"

Consider what the agent would need to know to:
- Understand the suggestion
- Evaluate its appropriateness
- Assess potential risks
- Determine feasibility

List specific context requirements as a JSON array:
["requirement1", "requirement2", "requirement3"]`;

    try {
      const response = await this.llm.generateResponse(prompt, {
        systemPrompt:
          'You are identifying context requirements for external suggestions. Be specific about what information would be needed.',
        temperature: 0.3,
        maxTokens: 256,
      });

      const parsed = this.parseJSONResponse(response.text);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error('Error identifying context requirements:', error);
      return ['current_goals', 'current_location', 'available_resources'];
    }
  }

  /**
   * Generate unique intrusion ID
   */
  private generateIntrusionId(): string {
    return `intrusion_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate cache key for parsing results
   */
  private generateCacheKey(
    rawContent: string,
    sourceMetadata: SourceMetadata
  ): string {
    const contentHash = this.simpleHash(rawContent);
    return `${sourceMetadata.sourceType}_${contentHash}`;
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
   * Create fallback parsing when main parsing fails
   */
  private createFallbackParsing(
    rawContent: string,
    sourceMetadata: SourceMetadata,
    error: Error
  ): ParsingResult {
    const content: IntrusionContent = {
      id: this.generateIntrusionId(),
      rawText: rawContent,
      parsedIntent: 'Unable to parse intent',
      urgencyLevel: UrgencyLevel.MEDIUM,
      contextRequirements: ['current_goals', 'current_location'],
      sourceType: sourceMetadata.sourceType,
      timestamp: Date.now(),
      metadata: {
        sourceId: sourceMetadata.sourceId,
        parsingError: error.message,
        fallback: true,
      },
    };

    return {
      content,
      confidence: 0.1,
      reasoning: 'Fallback parsing due to error',
      warnings: ['Parsing failed', 'Low confidence interpretation'],
    };
  }

  /**
   * Get parsing statistics
   */
  getStats() {
    return {
      cacheSize: this.parsingCache.size,
      cacheHitRate: 0.5, // Would need to track actual hits
      averageConfidence: 0.7, // Would need to track actual confidence
    };
  }

  /**
   * Clear parsing cache
   */
  clearCache(): void {
    this.parsingCache.clear();
  }
}

// Import the default config
import { DEFAULT_INTRUSION_CONFIG } from './types';
