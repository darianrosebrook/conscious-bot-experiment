/**
 * Signal Extraction Pipeline
 *
 * A pluggable system for extracting signals from cognitive thoughts using
 * multiple extractors (memory, LLM, heuristics) to enable emergent behavior
 * rather than hard-coded concept extraction.
 *
 * @author @darianrosebrook
 */

import { CognitiveThought } from './cognitive-thought-processor';

/**
 * Signal types representing different categories of information extracted from thoughts
 */
export type SignalType =
  | 'resource_need'
  | 'tool_need'
  | 'safety_concern'
  | 'exploration'
  | 'knowledge_gap'
  | 'cognitive_reflection'
  | 'entity_observation'
  | 'environmental_factor';

/**
 * Signal represents extracted information with confidence and provenance
 */
export interface Signal {
  type: SignalType;
  concept: string; // e.g., 'wood', 'pickaxe', 'lighting', 'village'
  confidence: number; // 0..1
  details?: Record<string, any>; // locations, counts, evidence
  source: 'llm' | 'memory' | 'heuristic' | 'world_state';
  thoughtId: string;
  timestamp: number;
  memoryRefs?: string[]; // References to memory cards used
}

/**
 * Input for signal extractors
 */
export interface SignalExtractionInput {
  thought: CognitiveThought;
  worldState?: any;
  memoryClient?: any;
  llmEndpoint?: string;
}

/**
 * Signal Extractor interface for pluggable extraction logic
 */
export interface SignalExtractor {
  name: string;
  priority: number; // Higher priority = run first
  run(input: SignalExtractionInput): Promise<Signal[]>;
}

/**
 * Signal Extraction Pipeline orchestrates multiple extractors
 */
export class SignalExtractionPipeline {
  private extractors: SignalExtractor[] = [];
  private config: {
    confidenceThreshold: number;
    maxSignalsPerThought: number;
  };

  constructor(
    config: { confidenceThreshold?: number; maxSignalsPerThought?: number } = {}
  ) {
    this.config = {
      confidenceThreshold: config.confidenceThreshold || 0.3,
      maxSignalsPerThought: config.maxSignalsPerThought || 10,
    };
  }

  /**
   * Register an extractor in the pipeline
   */
  registerExtractor(extractor: SignalExtractor): void {
    this.extractors.push(extractor);
    // Sort by priority (highest first)
    this.extractors.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Extract signals from a thought using all registered extractors
   */
  async extractSignals(input: SignalExtractionInput): Promise<Signal[]> {
    const { thought, worldState, memoryClient, llmEndpoint } = input;

    // Run all extractors in parallel
    const extractorPromises = this.extractors.map((extractor) =>
      extractor
        .run({ thought, worldState, memoryClient, llmEndpoint })
        .catch((error) => {
          console.warn(`Signal extractor ${extractor.name} failed:`, error);
          return []; // Return empty array on failure
        })
    );

    const extractorResults = await Promise.allSettled(extractorPromises);

    // Collect all signals
    const rawSignals: Signal[] = [];
    for (const result of extractorResults) {
      if (result.status === 'fulfilled') {
        rawSignals.push(...result.value);
      }
    }

    // Merge signals by (type, concept) keeping highest confidence
    const mergedSignals = this.mergeSignals(rawSignals);

    // Apply confidence threshold and limit
    const filteredSignals = mergedSignals
      .filter((signal) => signal.confidence >= this.config.confidenceThreshold)
      .slice(0, this.config.maxSignalsPerThought);

    console.log(
      `🔍 [SIGNAL PIPELINE] Extracted ${filteredSignals.length} signals from thought ${thought.id.substring(0, 8)}`
    );
    filteredSignals.forEach((signal) => {
      console.log(
        `  - ${signal.source}:${signal.type}:${signal.concept} (${signal.confidence.toFixed(2)})`
      );
    });

    return filteredSignals;
  }

  /**
   * Merge signals by type and concept, keeping highest confidence
   */
  private mergeSignals(signals: Signal[]): Signal[] {
    const byKey = new Map<string, Signal>();

    for (const signal of signals) {
      const key = `${signal.type}:${signal.concept}`;
      const existing = byKey.get(key);

      if (!existing || signal.confidence > existing.confidence) {
        // Merge memory references if both have them
        if (existing && existing.memoryRefs && signal.memoryRefs) {
          signal.memoryRefs = [
            ...new Set([...existing.memoryRefs, ...signal.memoryRefs]),
          ];
        }
        byKey.set(key, signal);
      } else if (existing && signal.memoryRefs) {
        // Add memory references to existing signal
        existing.memoryRefs = existing.memoryRefs || [];
        existing.memoryRefs.push(...signal.memoryRefs);
        existing.memoryRefs = [...new Set(existing.memoryRefs)];
      }
    }

    return Array.from(byKey.values());
  }

  /**
   * Get statistics about extractor performance
   */
  getStats(): { extractorCount: number; totalSignals: number } {
    return {
      extractorCount: this.extractors.length,
      totalSignals: this.extractors.reduce(
        (sum, ext) => sum + (ext as any).signalCount || 0,
        0
      ),
    };
  }
}

/**
 * Memory-backed signal extractor using entity/area cards
 */
export class MemoryBackedExtractor implements SignalExtractor {
  name = 'memory-backed';
  priority = 100; // Highest priority

  constructor(private memoryClient?: any) {}

  async run(input: SignalExtractionInput): Promise<Signal[]> {
    if (!this.memoryClient) return [];

    const { thought, worldState } = input;
    const signals: Signal[] = [];

    try {
      // Extract entities from thought content
      const entities = this.extractEntitiesFromThought(thought.content);

      // Query memory for entity cards
      for (const entity of entities) {
        const memoryContext = await this.memoryClient.getMemoryContext({
          query: `entity:${entity} in context`,
          taskType: 'entity_analysis',
          entities: [entity],
          location: worldState?.position,
          maxMemories: 3,
        });

        // Convert memory results to signals
        for (const memory of memoryContext.memories || []) {
          const signal = await this.memoryToSignal(memory, thought, entity);
          if (signal) signals.push(signal);
        }
      }

      // Query for area-specific signals
      const areaSignals = await this.extractAreaSignals(thought, worldState);
      signals.push(...areaSignals);
    } catch (error) {
      console.warn('MemoryBackedExtractor failed:', error);
    }

    return signals;
  }

  private extractEntitiesFromThought(content: string): string[] {
    // Simple entity extraction - could be enhanced with LLM
    const entities = new Set<string>();

    // Common Minecraft entities and concepts
    const patterns = [
      /\b(wood|log|plank)\b/gi,
      /\b(stone|cobblestone|dirt|sand|gravel)\b/gi,
      /\b(iron|gold|diamond|coal|redstone)\b/gi,
      /\b(pickaxe|axe|shovel|sword|tool)\b/gi,
      /\b(tree|leaves|grass|flower|plant)\b/gi,
      /\b(water|lava|river|lake|ocean)\b/gi,
      /\b(cave|tunnel|mine|underground)\b/gi,
      /\b(village|house|building|structure)\b/gi,
      /\b(food|hunger|health|damage|hurt)\b/gi,
      /\b(light|dark|torch|lantern|bright)\b/gi,
    ];

    for (const pattern of patterns) {
      const matches = content.match(pattern);
      if (matches) {
        matches.forEach((match) => entities.add(match.toLowerCase()));
      }
    }

    return Array.from(entities);
  }

  private async memoryToSignal(
    memory: any,
    thought: CognitiveThought,
    entity: string
  ): Promise<Signal | null> {
    if (!memory.content) return null;

    // Determine signal type based on memory content
    const content = memory.content.toLowerCase();
    let signalType: SignalType = 'entity_observation';

    if (content.includes('need') || content.includes('require')) {
      signalType = 'resource_need';
    } else if (content.includes('tool') || content.includes('craft')) {
      signalType = 'tool_need';
    } else if (
      content.includes('danger') ||
      content.includes('safe') ||
      content.includes('protect')
    ) {
      signalType = 'safety_concern';
    } else if (
      content.includes('explore') ||
      content.includes('find') ||
      content.includes('search')
    ) {
      signalType = 'exploration';
    }

    return {
      type: signalType,
      concept: entity,
      confidence: Math.min(memory.confidence || 0.5, 1.0),
      details: {
        memoryContent: memory.content,
        memoryType: memory.type,
      },
      source: 'memory',
      thoughtId: thought.id,
      timestamp: Date.now(),
      memoryRefs: [memory.id],
    };
  }

  private async extractAreaSignals(
    thought: CognitiveThought,
    worldState?: any
  ): Promise<Signal[]> {
    if (!worldState?.position || !worldState?.biome) return [];

    const signals: Signal[] = [];
    const biome = worldState.biome.toLowerCase();

    // Query for area-specific knowledge
    const memoryContext = await this.memoryClient.getMemoryContext({
      query: `area:${biome} opportunities and hazards`,
      taskType: 'area_analysis',
      entities: [biome],
      location: worldState.position,
      maxMemories: 5,
    });

    for (const memory of memoryContext.memories || []) {
      if (memory.type === 'area_card' || memory.type === 'strategy') {
        // Extract opportunities as exploration signals
        if (memory.opportunities) {
          for (const opportunity of memory.opportunities) {
            signals.push({
              type: 'exploration',
              concept: opportunity,
              confidence: memory.confidence || 0.6,
              details: { area: biome, opportunity: true },
              source: 'memory',
              thoughtId: thought.id,
              timestamp: Date.now(),
              memoryRefs: [memory.id],
            });
          }
        }

        // Extract hazards as safety signals
        if (memory.hazards) {
          for (const hazard of memory.hazards) {
            signals.push({
              type: 'safety_concern',
              concept: hazard,
              confidence: memory.confidence || 0.6,
              details: { area: biome, hazard: true },
              source: 'memory',
              thoughtId: thought.id,
              timestamp: Date.now(),
              memoryRefs: [memory.id],
            });
          }
        }
      }
    }

    return signals;
  }
}

/**
 * LLM-based signal extractor using structured prompts
 */
export class LLMExtractor implements SignalExtractor {
  name = 'llm-backed';
  priority = 80; // High priority

  constructor(
    private memoryClient?: any,
    private llmEndpoint?: string
  ) {}

  async run(input: SignalExtractionInput): Promise<Signal[]> {
    if (!this.llmEndpoint) return [];

    const { thought, worldState, memoryClient } = input;
    const signals: Signal[] = [];

    try {
      // Get relevant memories for context
      let memoryContext = '';
      if (memoryClient) {
        const memories = await memoryClient.getMemoryContext({
          query: `context for: ${thought.content}`,
          taskType: 'signal_context',
          entities: this.extractEntitiesFromThought(thought.content),
          maxMemories: 3,
        });

        memoryContext =
          memories.memories?.map((m: any) => m.content).join('\n') || '';
      }

      // Call LLM with structured prompt
      const llmResponse = await this.callLLM(
        thought,
        worldState,
        memoryContext
      );

      if (llmResponse?.entities) {
        signals.push(...this.llmResponseToSignals(llmResponse, thought));
      }
    } catch (error) {
      console.warn('LLMExtractor failed:', error);
    }

    return signals;
  }

  private async callLLM(
    thought: CognitiveThought,
    worldState?: any,
    memoryContext?: string
  ): Promise<any> {
    const prompt = this.buildStructuredPrompt(
      thought,
      worldState,
      memoryContext
    );

    const response = await fetch(this.llmEndpoint!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1, // Low temperature for structured output
        max_tokens: 500,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };
    const content = data.choices?.[0]?.message?.content;

    if (!content) return null;

    try {
      return JSON.parse(content);
    } catch (error) {
      console.warn('Failed to parse LLM response as JSON:', content);
      return null;
    }
  }

  private buildStructuredPrompt(
    thought: CognitiveThought,
    worldState?: any,
    memoryContext?: string
  ): string {
    return `Analyze this cognitive thought and extract structured signals. Respond ONLY with valid JSON.

Thought: "${thought.content}"
World State: ${JSON.stringify(worldState || {})}
Relevant Memories: ${memoryContext || 'None'}

Return JSON with this exact schema:
{
  "entities": ["item1", "concept2", ...],
  "opportunities": ["opportunity1", "chance2", ...],
  "hazards": ["hazard1", "risk2", ...],
  "needs": ["need1", "requirement2", ...],
  "knowledge_gaps": [
    {"question": "What is X?", "probe": "action_to_take", "expected_evidence": "what to look for"}
  ]
}

Focus on actionable concepts related to Minecraft survival, crafting, exploration, and decision-making.`;
  }

  private llmResponseToSignals(
    response: any,
    thought: CognitiveThought
  ): Signal[] {
    const signals: Signal[] = [];

    // Convert entities to signals
    for (const entity of response.entities || []) {
      signals.push({
        type: 'entity_observation',
        concept: entity,
        confidence: 0.7,
        source: 'llm',
        thoughtId: thought.id,
        timestamp: Date.now(),
      });
    }

    // Convert opportunities to exploration signals
    for (const opportunity of response.opportunities || []) {
      signals.push({
        type: 'exploration',
        concept: opportunity,
        confidence: 0.6,
        source: 'llm',
        thoughtId: thought.id,
        timestamp: Date.now(),
      });
    }

    // Convert hazards to safety signals
    for (const hazard of response.hazards || []) {
      signals.push({
        type: 'safety_concern',
        concept: hazard,
        confidence: 0.6,
        source: 'llm',
        thoughtId: thought.id,
        timestamp: Date.now(),
      });
    }

    // Convert needs to resource/tool signals
    for (const need of response.needs || []) {
      const signalType: SignalType = need.toLowerCase().includes('tool')
        ? 'tool_need'
        : 'resource_need';
      signals.push({
        type: signalType,
        concept: need,
        confidence: 0.6,
        source: 'llm',
        thoughtId: thought.id,
        timestamp: Date.now(),
      });
    }

    return signals;
  }

  private extractEntitiesFromThought(content: string): string[] {
    // Simple extraction for LLM context
    return content.match(/\b\w+\b/g)?.slice(0, 10) || [];
  }
}

/**
 * Heuristic-based signal extractor (fallback)
 */
export class HeuristicExtractor implements SignalExtractor {
  name = 'heuristic-fallback';
  priority = 10; // Lowest priority

  async run(input: SignalExtractionInput): Promise<Signal[]> {
    const { thought } = input;
    const signals: Signal[] = [];

    // Extract signals using regex patterns
    const patterns = this.getPatterns();

    for (const [type, patternMap] of Object.entries(patterns)) {
      for (const [concept, pattern] of Object.entries(patternMap)) {
        const matches = thought.content.match(pattern);
        if (matches) {
          signals.push({
            type: type as SignalType,
            concept,
            confidence: 0.4, // Lower confidence for heuristics
            details: { matches },
            source: 'heuristic',
            thoughtId: thought.id,
            timestamp: Date.now(),
          });
        }
      }
    }

    return signals;
  }

  private getPatterns(): Record<string, Record<string, RegExp>> {
    return {
      resource_need: {
        wood: /\b(wood|log|tree|plank)\b/gi,
        stone: /\b(stone|cobblestone)\b/gi,
        iron: /\b(iron|ore)\b/gi,
        coal: /\b(coal|charcoal)\b/gi,
        food: /\b(food|hunger|eat|starve)\b/gi,
        water: /\b(water|thirst|drink)\b/gi,
      },
      tool_need: {
        pickaxe: /\b(pickaxe|pick|mine|mining)\b/gi,
        axe: /\b(axe|chop|cut|wood)\b/gi,
        shovel: /\b(shovel|dig|dirt)\b/gi,
        sword: /\b(sword|weapon|fight|combat)\b/gi,
        torch: /\b(torch|light|dark|lantern)\b/gi,
      },
      safety_concern: {
        health: /\b(health|hurt|damage|die|danger)\b/gi,
        lighting: /\b(light|dark|torch|lantern|bright)\b/gi,
        hostiles: /\b(hostile|monster|mob|zombie|creeper|skeleton|spider)\b/gi,
        fall: /\b(fall|height|cliff|drop|edge)\b/gi,
      },
      exploration: {
        cave: /\b(cave|underground|tunnel|mine)\b/gi,
        village: /\b(village|house|building|structure)\b/gi,
        biome: /\b(biome|area|terrain|environment)\b/gi,
        resource: /\b(resource|material|item|gather)\b/gi,
      },
      knowledge_gap: {
        unknown: /\b(unknown|unsure|confused|what|how|where)\b/gi,
        need_info: /\b(need|require|want|should|could)\b/gi,
        explore: /\b(explore|find|search|look|discover)\b/gi,
      },
    };
  }
}
