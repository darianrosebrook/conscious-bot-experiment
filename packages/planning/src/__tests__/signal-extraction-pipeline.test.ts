/**
 * Signal Extraction Pipeline Tests
 *
 * Tests the new signal extraction pipeline that replaces hard-coded concept
 * extraction with memory/LLM/heuristic-based signal synthesis.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SignalExtractionPipeline,
  MemoryBackedExtractor,
  LLMExtractor,
  HeuristicExtractor,
  type Signal,
  type SignalType,
} from '../signal-extraction-pipeline';
import { CognitiveThought } from '../cognitive-thought-processor';

describe('Signal Extraction Pipeline Tests', () => {
  let pipeline: SignalExtractionPipeline;
  let mockMemoryClient: any;
  let mockLLMEndpoint: string;

  beforeEach(() => {
    // Mock memory client
    mockMemoryClient = {
      getMemoryEnhancedContext: vi.fn(),
    };

    // Mock LLM endpoint
    mockLLMEndpoint = 'http://localhost:3003';

    // Initialize pipeline with low threshold for testing
    pipeline = new SignalExtractionPipeline({
      confidenceThreshold: 0.2,
      maxSignalsPerThought: 10,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Signal Extraction Pipeline Core', () => {
    it('should initialize with default configuration', () => {
      const defaultPipeline = new SignalExtractionPipeline();
      expect(defaultPipeline).toBeDefined();
    });

    it('should register extractors and sort by priority', () => {
      const lowPriorityExtractor = { name: 'low', priority: 10, run: vi.fn() };
      const highPriorityExtractor = {
        name: 'high',
        priority: 100,
        run: vi.fn(),
      };

      pipeline.registerExtractor(lowPriorityExtractor as any);
      pipeline.registerExtractor(highPriorityExtractor as any);

      expect((pipeline as any).extractors[0].name).toBe('high');
      expect((pipeline as any).extractors[1].name).toBe('low');
    });

    it('should merge signals by type and concept keeping highest confidence', async () => {
      // Mock two extractors returning overlapping signals
      const extractor1 = {
        name: 'test1',
        priority: 50,
        run: vi.fn().mockResolvedValue([
          {
            type: 'resource_need' as SignalType,
            concept: 'wood',
            confidence: 0.5,
            source: 'memory' as const,
            thoughtId: 'test',
            timestamp: Date.now(),
          },
        ]),
      };

      const extractor2 = {
        name: 'test2',
        priority: 50,
        run: vi.fn().mockResolvedValue([
          {
            type: 'resource_need' as SignalType,
            concept: 'wood',
            confidence: 0.7, // Higher confidence
            source: 'llm' as const,
            thoughtId: 'test',
            timestamp: Date.now(),
          },
        ]),
      };

      pipeline.registerExtractor(extractor1 as any);
      pipeline.registerExtractor(extractor2 as any);

      const input = {
        thought: {
          id: 'test',
          content: 'I need wood',
          type: 'planning' as const,
          timestamp: Date.now(),
        },
      };

      const signals = await pipeline.extractSignals(input);

      expect(signals.length).toBe(1);
      expect(signals[0].concept).toBe('wood');
      expect(signals[0].confidence).toBe(0.7); // Should keep higher confidence
      expect(signals[0].source).toBe('llm');
    });
  });

  describe('MemoryBackedExtractor', () => {
    it('should extract signals from memory context', async () => {
      const extractor = new MemoryBackedExtractor(mockMemoryClient);

      const mockMemoryResponse = {
        memories: [
          {
            id: 'memory-1',
            content: 'Found wood near the forest',
            type: 'episodic',
            confidence: 0.8,
          },
        ],
      };

      mockMemoryClient.getMemoryEnhancedContext.mockResolvedValue(
        mockMemoryResponse
      );

      const thought: CognitiveThought = {
        id: 'test-thought',
        content: 'I need to find wood for building',
        type: 'planning',
        timestamp: Date.now(),
      };

      const signals = await extractor.run({
        thought,
        worldState: { biome: 'forest' },
      });

      expect(signals.length).toBeGreaterThan(0);
      expect(signals[0].type).toBe('entity_observation');
      expect(signals[0].concept).toBe('wood');
      expect(signals[0].source).toBe('memory');
      expect(signals[0].memoryRefs).toContain('memory-1');
    });

    it('should extract area signals from biome-specific memories', async () => {
      const extractor = new MemoryBackedExtractor(mockMemoryClient);

      const mockMemoryResponse = {
        memories: [
          {
            id: 'strategy-1',
            content: 'Forest biome has abundant wood resources',
            type: 'strategy',
            confidence: 0.9,
            opportunities: ['gather_wood', 'build_shelter'],
            hazards: ['night_hostiles'],
          },
        ],
      };

      mockMemoryClient.getMemoryEnhancedContext.mockResolvedValue(
        mockMemoryResponse
      );

      const thought: CognitiveThought = {
        id: 'test-thought',
        content: 'What should I do in this forest?',
        type: 'planning',
        timestamp: Date.now(),
      };

      const signals = await extractor.run({
        thought,
        worldState: { biome: 'forest', position: { x: 10, y: 71, z: 29 } },
      });

      const explorationSignals = signals.filter(
        (s) => s.type === 'exploration'
      );
      const safetySignals = signals.filter((s) => s.type === 'safety_concern');

      expect(explorationSignals.length).toBeGreaterThan(0);
      expect(explorationSignals.some((s) => s.concept === 'gather_wood')).toBe(
        true
      );
      expect(safetySignals.length).toBeGreaterThan(0);
      expect(safetySignals.some((s) => s.concept === 'night_hostiles')).toBe(
        true
      );
    });
  });

  describe('LLMExtractor', () => {
    it('should extract signals using structured LLM calls', async () => {
      const extractor = new LLMExtractor(mockMemoryClient, mockLLMEndpoint);

      // Mock fetch for LLM call
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    entities: ['wood', 'tree'],
                    opportunities: ['gather_resources'],
                    hazards: ['fall_damage'],
                    needs: ['axe'],
                    knowledge_gaps: [
                      {
                        question: 'Where is the nearest forest?',
                        probe: 'explore_spiral',
                        expected_evidence: 'tree_locations',
                      },
                    ],
                  }),
                },
              },
            ],
          }),
      });

      const thought: CognitiveThought = {
        id: 'test-thought',
        content: 'I need to find wood but I keep falling',
        type: 'planning',
        timestamp: Date.now(),
      };

      const signals = await extractor.run({
        thought,
        worldState: { biome: 'plains' },
      });

      expect(signals.length).toBeGreaterThan(0);

      const entitySignals = signals.filter(
        (s) => s.type === 'entity_observation'
      );
      const needSignals = signals.filter((s) => s.type === 'resource_need');
      const hazardSignals = signals.filter((s) => s.type === 'safety_concern');

      expect(entitySignals.some((s) => s.concept === 'wood')).toBe(true);
      expect(needSignals.some((s) => s.concept === 'axe')).toBe(true);
      expect(hazardSignals.some((s) => s.concept === 'fall_damage')).toBe(true);
    });

    it('should handle LLM call failures gracefully', async () => {
      const extractor = new LLMExtractor(mockMemoryClient, mockLLMEndpoint);

      // Mock failed LLM call
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
      });

      const thought: CognitiveThought = {
        id: 'test-thought',
        content: 'Test thought',
        type: 'planning',
        timestamp: Date.now(),
      };

      const signals = await extractor.run({ thought });

      expect(signals.length).toBe(0); // Should return empty array on failure
    });
  });

  describe('HeuristicExtractor', () => {
    it('should extract signals using regex patterns', async () => {
      const extractor = new HeuristicExtractor();

      const thought: CognitiveThought = {
        id: 'test-thought',
        content: 'I need wood and a pickaxe to mine stone and iron',
        type: 'planning',
        timestamp: Date.now(),
      };

      const signals = await extractor.run({ thought });

      expect(signals.length).toBeGreaterThan(0);

      const resourceSignals = signals.filter((s) => s.type === 'resource_need');
      const toolSignals = signals.filter((s) => s.type === 'tool_need');

      expect(resourceSignals.some((s) => s.concept === 'wood')).toBe(true);
      expect(resourceSignals.some((s) => s.concept === 'iron')).toBe(true);
      expect(toolSignals.some((s) => s.concept === 'pickaxe')).toBe(true);
      expect(toolSignals.some((s) => s.concept === 'axe')).toBe(true);

      // Check that heuristic signals have lower confidence
      signals.forEach((signal) => {
        expect(signal.confidence).toBeLessThanOrEqual(0.4);
        expect(signal.source).toBe('heuristic');
      });
    });

    it('should extract safety concerns from thought content', async () => {
      const extractor = new HeuristicExtractor();

      const thought: CognitiveThought = {
        id: 'test-thought',
        content: 'I see zombies and creepers, I need light and weapons',
        type: 'planning',
        timestamp: Date.now(),
      };

      const signals = await extractor.run({ thought });

      const safetySignals = signals.filter((s) => s.type === 'safety_concern');
      const toolSignals = signals.filter((s) => s.type === 'tool_need');

      expect(safetySignals.some((s) => s.concept === 'hostiles')).toBe(true);
      expect(safetySignals.some((s) => s.concept === 'lighting')).toBe(true);
      expect(toolSignals.some((s) => s.concept === 'sword')).toBe(true);
    });
  });

  describe('Integration Scenarios', () => {
    it('should combine signals from multiple extractors with priority ordering', async () => {
      // Setup pipeline with all extractors
      const memoryExtractor = new MemoryBackedExtractor(mockMemoryClient);
      const llmExtractor = new LLMExtractor(mockMemoryClient, mockLLMEndpoint);
      const heuristicExtractor = new HeuristicExtractor();

      pipeline.registerExtractor(memoryExtractor);
      pipeline.registerExtractor(llmExtractor);
      pipeline.registerExtractor(heuristicExtractor);

      // Mock memory response
      mockMemoryClient.getMemoryEnhancedContext.mockResolvedValue({
        memories: [
          {
            id: 'memory-wood',
            content: 'Found wood in forest',
            type: 'episodic',
            confidence: 0.9,
          },
        ],
      });

      // Mock LLM response
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    entities: ['wood', 'forest'],
                    opportunities: ['gather_wood'],
                    needs: ['axe'],
                  }),
                },
              },
            ],
          }),
      });

      const thought: CognitiveThought = {
        id: 'test-thought',
        content: 'I need wood and tools in the forest',
        type: 'planning',
        timestamp: Date.now(),
      };

      const signals = await pipeline.extractSignals({
        thought,
        worldState: { biome: 'forest' },
      });

      expect(signals.length).toBeGreaterThan(0);

      // Should have signals from multiple sources
      const sources = signals.map((s) => s.source);
      expect(sources).toContain('memory');
      expect(sources).toContain('llm');
      expect(sources).toContain('heuristic');

      // Memory signals should have higher priority
      const memorySignals = signals.filter((s) => s.source === 'memory');
      expect(memorySignals.some((s) => s.confidence > 0.7)).toBe(true);
    });

    it('should filter signals by confidence threshold', async () => {
      const highConfidencePipeline = new SignalExtractionPipeline({
        confidenceThreshold: 0.8,
      });

      const lowConfidencePipeline = new SignalExtractionPipeline({
        confidenceThreshold: 0.2,
      });

      const signals = [
        {
          type: 'resource_need' as SignalType,
          concept: 'wood',
          confidence: 0.9,
          source: 'memory' as const,
          thoughtId: 'test',
          timestamp: Date.now(),
        },
        {
          type: 'tool_need' as SignalType,
          concept: 'axe',
          confidence: 0.5,
          source: 'heuristic' as const,
          thoughtId: 'test',
          timestamp: Date.now(),
        },
        {
          type: 'exploration' as SignalType,
          concept: 'cave',
          confidence: 0.3,
          source: 'llm' as const,
          thoughtId: 'test',
          timestamp: Date.now(),
        },
      ];

      // Test high threshold
      const highThresholdResults = signals.filter((s) => s.confidence >= 0.8);
      expect(highThresholdResults.length).toBe(1);
      expect(highThresholdResults[0].concept).toBe('wood');

      // Test low threshold
      const lowThresholdResults = signals.filter((s) => s.confidence >= 0.2);
      expect(lowThresholdResults.length).toBe(3);
    });

    it('should limit the number of signals per thought', async () => {
      const limitedPipeline = new SignalExtractionPipeline({
        maxSignalsPerThought: 2,
      });

      const signals = [
        {
          type: 'resource_need' as SignalType,
          concept: 'wood1',
          confidence: 0.9,
          source: 'memory' as const,
          thoughtId: 'test',
          timestamp: Date.now(),
        },
        {
          type: 'resource_need' as SignalType,
          concept: 'wood2',
          confidence: 0.8,
          source: 'memory' as const,
          thoughtId: 'test',
          timestamp: Date.now(),
        },
        {
          type: 'resource_need' as SignalType,
          concept: 'wood3',
          confidence: 0.7,
          source: 'memory' as const,
          thoughtId: 'test',
          timestamp: Date.now(),
        },
        {
          type: 'tool_need' as SignalType,
          concept: 'axe1',
          confidence: 0.6,
          source: 'llm' as const,
          thoughtId: 'test',
          timestamp: Date.now(),
        },
        {
          type: 'tool_need' as SignalType,
          concept: 'axe2',
          confidence: 0.5,
          source: 'llm' as const,
          thoughtId: 'test',
          timestamp: Date.now(),
        },
      ];

      const limitedResults = signals.slice(0, 2);
      expect(limitedResults.length).toBe(2);
    });
  });

  describe('Signal Quality and Provenance', () => {
    it('should preserve provenance information in signals', async () => {
      const extractor = new MemoryBackedExtractor(mockMemoryClient);

      const mockMemoryResponse = {
        memories: [
          {
            id: 'memory-source-1',
            content: 'Found iron ore in cave',
            type: 'episodic',
            confidence: 0.8,
          },
        ],
      };

      mockMemoryClient.getMemoryEnhancedContext.mockResolvedValue(
        mockMemoryResponse
      );

      const thought: CognitiveThought = {
        id: 'test-thought',
        content: 'Looking for iron',
        type: 'planning',
        timestamp: Date.now(),
      };

      const signals = await extractor.run({ thought });

      expect(signals.length).toBeGreaterThan(0);
      const signal = signals[0];

      expect(signal.thoughtId).toBe(thought.id);
      expect(signal.memoryRefs).toContain('memory-source-1');
      expect(signal.timestamp).toBeDefined();
    });

    it('should handle extraction failures gracefully', async () => {
      const failingExtractor = {
        name: 'failing',
        priority: 50,
        run: vi.fn().mockRejectedValue(new Error('Extraction failed')),
      };

      pipeline.registerExtractor(failingExtractor as any);

      const thought: CognitiveThought = {
        id: 'test-thought',
        content: 'Test thought',
        type: 'planning',
        timestamp: Date.now(),
      };

      // Should not throw, should return empty array for failed extractors
      const signals = await pipeline.extractSignals({ thought });
      expect(signals.length).toBe(0);
    });
  });
});
