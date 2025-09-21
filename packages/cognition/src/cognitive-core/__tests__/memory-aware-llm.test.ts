/**
 * Memory-Aware LLM Interface Tests
 *
 * Comprehensive tests for the memory-aware LLM interface including:
 * - Ollama integration with memory retrieval
 * - Memory recall triggering
 * - Memory storage and consolidation
 * - Cognitive pattern learning
 * - Integration with the mermaid chart flow
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { MemoryAwareLLMInterface } from '../memory-aware-llm';
import { LLMResponse, MemoryEnhancedLLMContext } from '../memory-aware-llm';
import { EnhancedMemorySystem } from '@conscious-bot/memory';

// Mock the memory system
vi.mock('@conscious-bot/memory', () => ({
  createEnhancedMemorySystem: vi.fn(),
  EnhancedMemorySystem: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    searchMemories: vi.fn(),
    ingestMemory: vi.fn(),
    recordCognitivePattern: vi.fn(),
  })),
}));

describe('MemoryAwareLLMInterface', () => {
  let memoryAwareLLM: MemoryAwareLLMInterface;
  let mockMemorySystem: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock memory system
    mockMemorySystem = {
      initialize: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      searchMemories: vi.fn(),
      ingestMemory: vi.fn(),
      recordCognitivePattern: vi.fn(),
    };

    // Mock the import
    vi.doMock('@conscious-bot/memory', () => ({
      createEnhancedMemorySystem: vi.fn().mockReturnValue(mockMemorySystem),
    }));

    memoryAwareLLM = new MemoryAwareLLMInterface();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with memory system integration', async () => {
      await memoryAwareLLM['initializeMemorySystem']();
      expect(mockMemorySystem.initialize).toHaveBeenCalled();
    });

    it('should handle memory system initialization failure gracefully', async () => {
      mockMemorySystem.initialize = vi
        .fn()
        .mockRejectedValue(new Error('Connection failed'));

      // Should not throw, but log warning
      await expect(
        memoryAwareLLM['initializeMemorySystem']()
      ).resolves.not.toThrow();
    });
  });

  describe('Memory Retrieval', () => {
    it('should retrieve relevant memories for a query', async () => {
      const mockMemories = [
        {
          id: '1',
          type: 'episodic',
          content: 'Previous experience',
          relevance: 0.8,
          timestamp: Date.now(),
        },
        {
          id: '2',
          type: 'semantic',
          content: 'Known fact',
          relevance: 0.6,
          timestamp: Date.now(),
        },
      ];

      mockMemorySystem.searchMemories = vi.fn().mockResolvedValue({
        results: mockMemories,
        total: 2,
        query: 'test query',
      });

      const memories = await memoryAwareLLM['retrieveRelevantMemories'](
        'test query',
        { enableMemoryRetrieval: true }
      );

      expect(memories).toHaveLength(2);
      expect(memories[0]).toMatchObject({
        id: '1',
        type: 'episodic',
        relevance: 0.8,
      });
    });

    it('should handle memory retrieval failure gracefully', async () => {
      mockMemorySystem.searchMemories = vi
        .fn()
        .mockRejectedValue(new Error('Search failed'));

      const memories = await memoryAwareLLM['retrieveRelevantMemories'](
        'test query',
        { enableMemoryRetrieval: true }
      );

      expect(memories).toEqual([]);
    });
  });

  describe('Prompt Enhancement', () => {
    it('should enhance prompt with relevant memories', () => {
      const memories = [
        {
          id: '1',
          type: 'episodic',
          content: 'Previous experience',
          relevance: 0.8,
          timestamp: Date.now(),
        },
        {
          id: '2',
          type: 'semantic',
          content: 'Known fact',
          relevance: 0.6,
          timestamp: Date.now(),
        },
      ];

      const enhancedPrompt = memoryAwareLLM['enhancePromptWithMemories'](
        'What should I do?',
        memories,
        { enableMemoryRetrieval: true }
      );

      expect(enhancedPrompt).toContain(
        '[Memory: EPISODIC] Previous experience'
      );
      expect(enhancedPrompt).toContain('[Memory: SEMANTIC] Known fact');
      expect(enhancedPrompt).toContain('What should I do?');
    });

    it('should not enhance prompt when memories are disabled', () => {
      const memories = [
        {
          id: '1',
          type: 'episodic',
          content: 'Previous experience',
          relevance: 0.8,
          timestamp: Date.now(),
        },
      ];

      const enhancedPrompt = memoryAwareLLM['enhancePromptWithMemories'](
        'What should I do?',
        memories,
        { enableMemoryRetrieval: false }
      );

      expect(enhancedPrompt).toBe('What should I do?');
    });
  });

  describe('Memory Storage', () => {
    it('should store conversation as episodic memory', async () => {
      const mockResponse: LLMResponse = {
        id: 'test-response',
        text: 'This is a test response',
        model: 'test-model',
        tokensUsed: 100,
        latency: 1000,
        confidence: 0.8,
        metadata: {},
        timestamp: Date.now(),
      };

      mockMemorySystem.ingestMemory = vi.fn().mockResolvedValue({
        id: 'stored-memory',
        content: 'Conversation stored',
        type: 'dialogue',
        metadata: {},
      });

      const operations = await memoryAwareLLM['storeResponseAndMemories'](
        'Test prompt',
        mockResponse,
        { enableMemoryStorage: true },
        []
      );

      expect(operations).toHaveLength(1);
      expect(operations[0]).toMatchObject({
        type: 'store',
        memoryType: 'dialogue',
        success: true,
      });
    });

    it('should handle memory storage failure gracefully', async () => {
      const mockResponse: LLMResponse = {
        id: 'test-response',
        text: 'This is a test response',
        model: 'test-model',
        tokensUsed: 100,
        latency: 1000,
        confidence: 0.8,
        metadata: {},
        timestamp: Date.now(),
      };

      mockMemorySystem.ingestMemory = vi
        .fn()
        .mockRejectedValue(new Error('Storage failed'));

      const operations = await memoryAwareLLM['storeResponseAndMemories'](
        'Test prompt',
        mockResponse,
        { enableMemoryStorage: true },
        []
      );

      expect(operations).toHaveLength(1);
      expect(operations[0]).toMatchObject({
        type: 'store',
        memoryType: 'dialogue',
        success: false,
      });
    });
  });

  describe('Cognitive Pattern Recording', () => {
    it('should record cognitive processing patterns', async () => {
      const mockResponse: LLMResponse = {
        id: 'test-response',
        text: 'This is a test response with step by step reasoning',
        model: 'test-model',
        tokensUsed: 100,
        latency: 1000,
        confidence: 0.8,
        metadata: { reasoning: ['Step 1', 'Step 2'] },
        timestamp: Date.now(),
      };

      mockMemorySystem.recordCognitivePattern = vi
        .fn()
        .mockResolvedValue(undefined);

      await memoryAwareLLM['storeResponseAndMemories'](
        'Test prompt with multiple steps',
        mockResponse,
        { enableMemoryStorage: true },
        []
      );

      expect(mockMemorySystem.recordCognitivePattern).toHaveBeenCalledWith(
        'decision',
        expect.objectContaining({
          taskComplexity: expect.any(String),
          emotionalState: 'neutral',
        }),
        expect.objectContaining({
          approach: 'step_by_step_reasoning',
          confidence: 0.8,
        }),
        expect.objectContaining({
          success: true,
          quality: expect.any(Number),
        }),
        expect.objectContaining({
          commonBiases: expect.any(Array),
          effectiveStrategies: expect.any(Array),
        })
      );
    });
  });

  describe('Memory-Enhanced Response Generation', () => {
    it('should generate memory-enhanced response with all components', async () => {
      const mockMemories = [
        {
          id: '1',
          type: 'episodic',
          content: 'Previous experience',
          relevance: 0.8,
          timestamp: Date.now(),
        },
      ];

      const mockResponse: LLMResponse = {
        id: 'test-response',
        text: 'Enhanced response with memory context',
        model: 'test-model',
        tokensUsed: 100,
        latency: 1000,
        confidence: 0.8,
        metadata: {},
        timestamp: Date.now(),
      };

      mockMemorySystem.searchMemories = vi.fn().mockResolvedValue({
        results: mockMemories,
        total: 1,
        query: 'test query',
      });

      mockMemorySystem.ingestMemory = vi.fn().mockResolvedValue({
        id: 'stored-memory',
        content: 'Conversation stored',
        type: 'dialogue',
        metadata: {},
      });

      // Mock the base generateResponse method
      vi.spyOn(memoryAwareLLM as any, 'generateResponse').mockResolvedValue(
        mockResponse
      );

      const context: MemoryEnhancedLLMContext = {
        enableMemoryRetrieval: true,
        enableMemoryStorage: true,
        maxMemories: 5,
      };

      const result = await memoryAwareLLM.generateMemoryEnhancedResponse(
        'Test query with memory context',
        context
      );

      expect(result).toMatchObject({
        text: 'Enhanced response with memory context',
        memoriesUsed: expect.any(Array),
        memoryOperations: expect.any(Array),
        memoryRecommendations: expect.any(Array),
        cognitiveInsights: expect.any(Object),
      });

      expect(result.memoriesUsed).toHaveLength(1);
      expect(result.memoryOperations).toHaveLength(1);
      expect(result.confidence).toBeGreaterThanOrEqual(0.8); // Should be enhanced
    });

    it('should handle memory integration failures gracefully', async () => {
      mockMemorySystem.searchMemories = vi
        .fn()
        .mockRejectedValue(new Error('Search failed'));
      mockMemorySystem.ingestMemory = vi
        .fn()
        .mockRejectedValue(new Error('Storage failed'));

      // Mock the base generateResponse method
      const mockResponse: LLMResponse = {
        id: 'test-response',
        text: 'Fallback response',
        model: 'test-model',
        tokensUsed: 50,
        latency: 500,
        confidence: 0.6,
        metadata: {},
        timestamp: Date.now(),
      };
      vi.spyOn(memoryAwareLLM as any, 'generateResponse').mockResolvedValue(
        mockResponse
      );

      const context: MemoryEnhancedLLMContext = {
        enableMemoryRetrieval: true,
        enableMemoryStorage: true,
      };

      const result = await memoryAwareLLM.generateMemoryEnhancedResponse(
        'Test query',
        context
      );

      expect(result.text).toBe('Fallback response');
      expect(result.memoriesUsed).toEqual([]);
      expect(result.memoryOperations).toHaveLength(1);
      expect(result.memoryOperations[0].success).toBe(false);
    });
  });

  describe('Memory Recommendations', () => {
    it('should generate memory consolidation recommendations', async () => {
      const mockResponse: LLMResponse = {
        id: 'test-response',
        text: 'High quality response with detailed reasoning',
        model: 'test-model',
        tokensUsed: 200,
        latency: 1500,
        confidence: 0.9,
        metadata: {},
        timestamp: Date.now(),
      };

      mockMemorySystem.searchMemories = vi.fn().mockResolvedValue({
        results: [
          {
            id: '1',
            type: 'episodic',
            content: 'Memory 1',
            relevance: 0.8,
            timestamp: Date.now(),
          },
          {
            id: '2',
            type: 'episodic',
            content: 'Memory 2',
            relevance: 0.7,
            timestamp: Date.now(),
          },
          {
            id: '3',
            type: 'episodic',
            content: 'Memory 3',
            relevance: 0.6,
            timestamp: Date.now(),
          },
          {
            id: '4',
            type: 'episodic',
            content: 'Memory 4',
            relevance: 0.5,
            timestamp: Date.now(),
          },
          {
            id: '5',
            type: 'episodic',
            content: 'Memory 5',
            relevance: 0.4,
            timestamp: Date.now(),
          },
          {
            id: '6',
            type: 'episodic',
            content: 'Memory 6',
            relevance: 0.3,
            timestamp: Date.now(),
          },
        ],
        total: 6,
        query: 'test query',
      });

      const recommendations = await memoryAwareLLM[
        'generateMemoryRecommendations'
      ]('Test query with many related memories', mockResponse, {
        enableMemoryStorage: true,
      });

      expect(recommendations).toContainEqual(
        expect.objectContaining({
          action: 'consolidate',
          reason: expect.stringContaining('6 related memories'),
          priority: 0.7,
        })
      );

      expect(recommendations).toContainEqual(
        expect.objectContaining({
          action: 'store',
          reason: expect.stringContaining('High-confidence'),
          priority: 0.8,
        })
      );
    });
  });

  describe('Cognitive Insights', () => {
    it('should analyze cognitive insights from interactions', async () => {
      const mockResponse: LLMResponse = {
        id: 'test-response',
        text: 'This response includes step by step reasoning and considers multiple alternatives',
        model: 'test-model',
        tokensUsed: 150,
        latency: 1200,
        confidence: 0.85,
        metadata: { reasoning: ['Step 1', 'Step 2', 'Alternative considered'] },
        timestamp: Date.now(),
      };

      const insights = await memoryAwareLLM['analyzeCognitiveInsights'](
        'Complex question requiring analysis',
        mockResponse,
        { enableMemoryStorage: true }
      );

      expect(insights).toMatchObject({
        thoughtPatterns: expect.arrayContaining(['logical_reasoning']),
        decisionQuality: expect.any(Number),
        confidenceFactors: expect.arrayContaining(['evidence_based']),
        learningOpportunities: expect.arrayContaining([
          'knowledge_acquisition',
        ]),
      });

      expect(insights.decisionQuality).toBeGreaterThan(0.5);
    });
  });

  describe('Helper Methods', () => {
    it('should correctly estimate task complexity', () => {
      expect(memoryAwareLLM['estimateTaskComplexity']('Simple question?')).toBe(
        'simple'
      );
      expect(
        memoryAwareLLM['estimateTaskComplexity'](
          'Medium question with multiple steps?'
        )
      ).toBe('medium');
      expect(
        memoryAwareLLM['estimateTaskComplexity'](
          'Very long and complex question with multiple requirements and considerations that need careful analysis?'
        )
      ).toBe('complex');
    });

    it('should analyze reasoning approach', () => {
      const mockResponse: LLMResponse = {
        id: 'test-response',
        text: 'First, I need to consider the options. Then, I should evaluate each one step by step.',
        model: 'test-model',
        tokensUsed: 100,
        latency: 1000,
        confidence: 0.8,
        metadata: {},
        timestamp: Date.now(),
      };

      expect(memoryAwareLLM['analyzeApproach']('test', mockResponse)).toBe(
        'step_by_step_reasoning'
      );
    });

    it('should assess response quality', () => {
      const mockResponse: LLMResponse = {
        id: 'test-response',
        text: 'This is a detailed response with structure:\n1. First point\n2. Second point\n• Bullet point\nBased on evidence, this is the best approach.',
        model: 'test-model',
        tokensUsed: 200,
        latency: 1500,
        confidence: 0.9,
        metadata: {},
        timestamp: Date.now(),
      };

      const quality = memoryAwareLLM['assessResponseQuality'](
        'test question',
        mockResponse
      );
      expect(quality).toBeGreaterThan(0.7);
    });

    it('should detect cognitive biases', () => {
      const mockResponse: LLMResponse = {
        id: 'test-response',
        text: "This is obviously the best approach. Everyone knows this is correct. It's always the best way.",
        model: 'test-model',
        tokensUsed: 100,
        latency: 1000,
        confidence: 0.9,
        metadata: {},
        timestamp: Date.now(),
      };

      const biases = memoryAwareLLM['detectBiases']('test', mockResponse);
      expect(biases).toContain('overconfidence_bias');
      expect(biases).toContain('all_or_nothing_thinking');
    });
  });

  describe('Integration Flow Tests', () => {
    it('should follow the complete mermaid chart flow', async () => {
      // Mock all the necessary components for the full integration flow
      const mockMemories = [
        {
          id: '1',
          type: 'episodic',
          content: 'Previous successful mining experience',
          relevance: 0.8,
          timestamp: Date.now(),
        },
        {
          id: '2',
          type: 'semantic',
          content: 'Iron ore requires stone pickaxe',
          relevance: 0.9,
          timestamp: Date.now(),
        },
      ];

      const mockResponse: LLMResponse = {
        id: 'test-response',
        text: 'Based on your previous experience and knowledge about tool requirements, I recommend using a stone pickaxe for iron ore mining.',
        model: 'test-model',
        tokensUsed: 120,
        latency: 1100,
        confidence: 0.85,
        metadata: {
          reasoning: [
            'Retrieved memories show successful pattern',
            'Knowledge confirms tool requirement',
          ],
        },
        timestamp: Date.now(),
      };

      mockMemorySystem.searchMemories = vi.fn().mockResolvedValue({
        results: mockMemories,
        total: 2,
        query: 'What tool should I use for mining iron ore?',
      });

      mockMemorySystem.ingestMemory = vi.fn().mockResolvedValue({
        id: 'stored-memory',
        content: 'Conversation about iron ore mining stored',
        type: 'dialogue',
        metadata: {},
      });

      mockMemorySystem.recordCognitivePattern = vi
        .fn()
        .mockResolvedValue(undefined);

      // Mock the base generateResponse method
      vi.spyOn(memoryAwareLLM as any, 'generateResponse').mockResolvedValue(
        mockResponse
      );

      const context: MemoryEnhancedLLMContext = {
        enableMemoryRetrieval: true,
        enableMemoryStorage: true,
        memoryContext: {
          taskType: 'resource_gathering',
          emotionalState: 'focused',
        },
      };

      const result = await memoryAwareLLM.generateMemoryEnhancedResponse(
        'What tool should I use for mining iron ore?',
        context
      );

      // Verify the complete flow
      expect(result.memoriesUsed).toHaveLength(2);
      expect(result.memoriesUsed[0]).toMatchObject({
        type: 'episodic',
        relevance: 0.8,
      });
      expect(result.memoriesUsed[1]).toMatchObject({
        type: 'semantic',
        relevance: 0.9,
      });

      expect(result.memoryOperations).toHaveLength(1);
      expect(result.memoryOperations[0]).toMatchObject({
        type: 'store',
        memoryType: 'dialogue',
        success: true,
      });

      expect(result.memoryRecommendations).toBeDefined();
      expect(result.cognitiveInsights).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0.85); // Enhanced confidence
    });

    it('should handle the full integration with behavior tree patterns', async () => {
      const mockMemories = [
        {
          id: '1',
          type: 'procedural',
          content: 'Successful tool crafting sequence',
          relevance: 0.9,
          timestamp: Date.now(),
        },
      ];

      const mockResponse: LLMResponse = {
        id: 'test-response',
        text: 'For optimal mining, follow this sequence: 1. Craft stone pickaxe, 2. Find iron ore, 3. Mine with stone pickaxe.',
        model: 'test-model',
        tokensUsed: 150,
        latency: 1300,
        confidence: 0.88,
        metadata: {},
        timestamp: Date.now(),
      };

      mockMemorySystem.searchMemories = vi.fn().mockResolvedValue({
        results: mockMemories,
        total: 1,
        query: 'Best mining strategy',
      });

      mockMemorySystem.ingestMemory = vi.fn().mockResolvedValue({
        id: 'stored-memory',
        content: 'Mining strategy conversation stored',
        type: 'dialogue',
        metadata: {},
      });

      // Mock the base generateResponse method
      vi.spyOn(memoryAwareLLM as any, 'generateResponse').mockResolvedValue(
        mockResponse
      );

      const context: MemoryEnhancedLLMContext = {
        enableMemoryRetrieval: true,
        enableMemoryStorage: true,
        memoryContext: {
          taskType: 'resource_gathering',
          emotionalState: 'focused',
        },
      };

      const result = await memoryAwareLLM.generateMemoryEnhancedResponse(
        'What is the best strategy for mining iron ore?',
        context
      );

      // Verify behavior tree pattern was recorded
      expect(mockMemorySystem.recordCognitivePattern).toHaveBeenCalledWith(
        'decision',
        expect.objectContaining({
          taskComplexity: 'medium',
          emotionalState: 'focused',
        }),
        expect.objectContaining({
          approach: 'step_by_step_reasoning',
          confidence: 0.88,
        }),
        expect.any(Object),
        expect.any(Object)
      );

      expect(result.text).toContain('sequence');
      expect(result.memoriesUsed).toHaveLength(1);
    });
  });
});
