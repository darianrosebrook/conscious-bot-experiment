/**
 * Memory-LLM Integration Tests
 *
 * Tests the complete integration between the memory system and LLM interface
 * following the mermaid chart flow from the root readme:
 *
 * Sensorimotor → World Model → Memory → Cognitive Core (LLM) → Planning
 *
 * This tests the complete cognitive architecture integration with memory recall,
 * Ollama responses, and the feedback loops described in the architecture.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryAwareLLMInterface } from '../memory-aware-llm';
import { LLMResponse } from '../llm-interface';

// Mock the memory system completely
vi.mock('@conscious-bot/memory', () => {
  const mockMemorySystem = {
    initialize: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    searchMemories: vi.fn(),
    ingestMemory: vi.fn(),
    recordCognitivePattern: vi.fn(),
    recordToolUsage: vi.fn(),
    recordBehaviorTreePattern: vi.fn(),
    getToolRecommendations: vi.fn(),
    evaluateMemoryDecay: vi.fn(),
  };

  return {
    createEnhancedMemorySystem: vi.fn().mockReturnValue(mockMemorySystem),
    EnhancedMemorySystem: vi.fn().mockImplementation(() => mockMemorySystem),
    DEFAULT_MEMORY_CONFIG: {
      host: 'localhost',
      port: 5432,
      user: 'conscious_bot',
      password: 'secure_password',
      database: 'conscious_bot',
      worldSeed: 0,
      vectorDbTableName: 'memory_chunks',
      ollamaHost: process.env.OLLAMA_HOST || 'http://localhost:5002',
      embeddingModel: 'nomic-embed-text',
      embeddingDimension: 768,
      defaultGraphWeight: 0.5,
      defaultVectorWeight: 0.5,
      maxSearchResults: 10,
      minSimilarity: 0.1,
      enableQueryExpansion: true,
      enableDiversification: true,
      enableSemanticBoost: true,
      enablePersistence: true,
      enableMultiHopReasoning: true,
      enableProvenanceTracking: true,
      enableDecayAwareRanking: true,
      maxHops: 3,
      enableMemoryDecay: true,
      decayEvaluationInterval: 300000,
      maxMemoryRetentionDays: 30,
      frequentAccessThreshold: 0.7,
      forgottenThresholdDays: 7,
      enableMemoryConsolidation: true,
      enableMemoryArchiving: true,
      enableNarrativeTracking: true,
      enableMetacognition: true,
      enableSelfModelUpdates: true,
      maxReflections: 10,
      reflectionCheckpointInterval: 600000,
      minLessonConfidence: 0.6,
      enableToolEfficiencyTracking: true,
      toolEfficiencyEvaluationInterval: 300000,
      minUsesForToolRecommendation: 3,
      toolEfficiencyRecencyWeight: 0.7,
      enableBehaviorTreeLearning: true,
      enableCognitivePatternTracking: true,
      maxPatternsPerContext: 10,
      enableAutoRecommendations: true,
      toolEfficiencyThreshold: 0.6,
      toolEfficiencyCleanupInterval: 3600000,
    },
  };
});

describe('Memory-LLM Integration Flow', () => {
  let memoryAwareLLM: MemoryAwareLLMInterface;
  let mockMemorySystem: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Get the mock memory system
    const { createEnhancedMemorySystem, DEFAULT_MEMORY_CONFIG } = await import(
      '@conscious-bot/memory'
    );
    mockMemorySystem = createEnhancedMemorySystem(DEFAULT_MEMORY_CONFIG);

    // Initialize the memory-aware LLM
    memoryAwareLLM = new MemoryAwareLLMInterface(
      {
        model: 'gemma3n:e2b',
        host: 'localhost',
        port: 5002,
        maxTokens: 2048,
        temperature: 0.7,
        timeout: 30000,
      },
      {
        enableAutoMemoryIntegration: true,
        enableMemoryEnhancedPrompts: true,
        enablePostResponseMemoryStorage: true,
        enableMemoryBasedConfidence: true,
        enableMemoryQualityAssessment: true,
      }
    );
  });

  afterEach(async () => {
    await memoryAwareLLM.close();
    vi.clearAllMocks();
  });

  describe('Complete Mermaid Chart Flow', () => {
    it('should handle the complete cognitive architecture flow with memory integration', async () => {
      // Step 1: Mock memory retrieval (simulating sensorimotor → memory flow)
      const mockEpisodicMemory = {
        id: 'episodic_1',
        type: 'episodic',
        content:
          'Previous mining experience: Successfully mined iron ore with stone pickaxe in mountains biome',
        relevance: 0.85,
        timestamp: Date.now() - 3600000, // 1 hour ago
        metadata: {
          biome: 'mountains',
          tool: 'stone_pickaxe',
          material: 'iron_ore',
        },
      };

      const mockSemanticMemory = {
        id: 'semantic_1',
        type: 'semantic',
        content:
          'Tool requirements: Iron ore can be mined with stone pickaxe or better',
        relevance: 0.92,
        timestamp: Date.now() - 86400000, // 1 day ago
        metadata: { category: 'tool_requirements' },
      };

      mockMemorySystem.searchMemories = vi.fn().mockResolvedValue({
        results: [mockEpisodicMemory, mockSemanticMemory],
        total: 2,
        query: 'What tool should I use for mining iron ore?',
      });

      // Step 2: Mock memory storage (simulating response storage)
      mockMemorySystem.ingestMemory = vi.fn().mockResolvedValue({
        id: 'dialogue_1',
        content: 'Conversation about iron ore mining stored',
        type: 'dialogue',
        metadata: { conversationId: 'test-conversation' },
      });

      // Step 3: Mock cognitive pattern recording
      mockMemorySystem.recordCognitivePattern = vi
        .fn()
        .mockResolvedValue(undefined);

      // Step 4: Mock the base LLM response
      const mockLLMResponse: LLMResponse = {
        id: 'llm-response-1',
        text: 'Based on your previous successful experience mining iron ore with a stone pickaxe in the mountains biome, and considering the tool requirements for iron ore, I recommend using a stone pickaxe. This tool has proven effective for this material and should work well in your current situation.',
        model: 'qwen2.5:7b',
        tokensUsed: 156,
        latency: 1250,
        confidence: 0.88,
        metadata: {
          finishReason: 'stop',
          reasoning: [
            'Retrieved episodic memory shows successful iron ore mining with stone pickaxe',
            'Semantic memory confirms tool requirements for iron ore',
            'Context matches previous successful experience',
          ],
          usage: {
            promptTokens: 342,
            completionTokens: 156,
            totalTokens: 498,
          },
        },
        timestamp: Date.now(),
      };

      vi.spyOn(memoryAwareLLM as any, 'generateResponse').mockResolvedValue(
        mockLLMResponse
      );

      // Step 5: Execute the complete flow
      const context = {
        enableMemoryRetrieval: true,
        enableMemoryStorage: true,
        memoryContext: {
          taskType: 'resource_gathering',
          emotionalState: 'focused',
          location: { biome: 'mountains', x: 100, y: 64, z: 200 },
        },
        maxMemories: 5,
        memoryTypes: ['episodic', 'semantic', 'procedural'] as Array<
          'episodic' | 'semantic' | 'procedural' | 'emotional' | 'spatial'
        >,
      };

      const result = await memoryAwareLLM.generateMemoryEnhancedResponse(
        'What tool should I use for mining iron ore in the mountains?',
        context
      );

      // Step 6: Verify the complete flow worked correctly
      // A. Memory retrieval was triggered
      expect(mockMemorySystem.searchMemories).toHaveBeenCalledWith({
        query: 'What tool should I use for mining iron ore in the mountains?',
        type: ['episodic', 'semantic', 'procedural'],
        limit: 5,
        context: {
          taskType: 'resource_gathering',
          emotionalState: 'focused',
          location: { biome: 'mountains', x: 100, y: 64, z: 200 },
        },
      });

      // B. Enhanced prompt was created with memory context
      expect(result.memoriesUsed!).toHaveLength(2);
      expect(result.memoriesUsed![0]).toMatchObject({
        type: 'episodic',
        relevance: 0.85,
      });
      expect(result.memoriesUsed![1]).toMatchObject({
        type: 'semantic',
        relevance: 0.92,
      });

      // C. LLM response was enhanced with memory context
      expect(result.text).toContain(
        'Based on your previous successful experience'
      );
      expect(result.text).toContain('stone pickaxe');
      expect(result.text).toContain('tool requirements');

      // D. Memory storage occurred
      expect(mockMemorySystem.ingestMemory).toHaveBeenCalledWith({
        content: expect.stringContaining('Conversation: User asked'),
        type: 'dialogue',
        source: 'llm_conversation',
        metadata: expect.objectContaining({
          conversationId: 'llm-response-1',
          confidence: 0.88,
          memoriesUsed: 2,
        }),
      });

      // E. Cognitive pattern was recorded
      expect(mockMemorySystem.recordCognitivePattern).toHaveBeenCalledWith(
        'decision',
        expect.objectContaining({
          taskComplexity: 'medium',
          emotionalState: 'focused',
        }),
        expect.objectContaining({
          approach: 'evidence_based_reasoning',
          confidence: 0.88,
        }),
        expect.any(Object),
        expect.any(Object)
      );

      // F. Memory-enhanced confidence was calculated
      expect(result.confidence).toBeGreaterThanOrEqual(0.88); // Should be enhanced

      // G. Memory recommendations were generated
      expect(result.memoryRecommendations).toBeDefined();
      expect(Array.isArray(result.memoryRecommendations)).toBe(true);

      // H. Cognitive insights were analyzed
      expect(result.cognitiveInsights).toBeDefined();
      expect(result.cognitiveInsights).toMatchObject({
        thoughtPatterns: expect.any(Array),
        decisionQuality: expect.any(Number),
        confidenceFactors: expect.any(Array),
        learningOpportunities: expect.any(Array),
      });
    });

    it('should handle memory retrieval failure gracefully', async () => {
      // Mock memory system failure
      mockMemorySystem.searchMemories = vi
        .fn()
        .mockRejectedValue(new Error('Memory system unavailable'));
      mockMemorySystem.ingestMemory = vi
        .fn()
        .mockRejectedValue(new Error('Storage failed'));

      const mockLLMResponse: LLMResponse = {
        id: 'fallback-response',
        text: 'I recommend using a stone pickaxe for iron ore mining.',
        model: 'qwen2.5:7b',
        tokensUsed: 80,
        latency: 800,
        confidence: 0.7,
        metadata: {
          finishReason: 'stop',
          usage: {
            promptTokens: 40,
            completionTokens: 40,
            totalTokens: 80,
          },
        },
        timestamp: Date.now(),
      };

      vi.spyOn(memoryAwareLLM as any, 'generateResponse').mockResolvedValue(
        mockLLMResponse
      );

      const context = {
        enableMemoryRetrieval: true,
        enableMemoryStorage: true,
      };

      const result = await memoryAwareLLM.generateMemoryEnhancedResponse(
        'What tool should I use for mining iron ore?',
        context
      );

      // Should still return a response even with memory failures
      expect(result.text).toContain('stone pickaxe');
      expect(result.memoriesUsed).toEqual([]); // No memories retrieved
      expect(result.memoryOperations!).toHaveLength(1);
      expect(result.memoryOperations![0].success).toBe(false); // Storage failed
      expect(result.confidence).toBe(0.7); // No enhancement from memory
    });

    it('should follow the complete sensorimotor → memory → LLM → planning flow', async () => {
      // This test simulates the complete mermaid chart flow:
      // Sensorimotor Interface → World Model / Place Graph → Memory → Cognitive Core → Planning

      // 1. Simulate sensorimotor input (location, biome, etc.)
      const sensorimotorContext = {
        currentLocation: {
          biome: 'mountains',
          coordinates: { x: 150, y: 64, z: 250 },
          nearbyBlocks: ['iron_ore', 'cobblestone', 'stone'],
        },
        timeOfDay: 'day' as const,
        weather: 'clear' as const,
        agentState: {
          inventory: ['wooden_pickaxe', 'stone_pickaxe'],
          health: 20,
          hunger: 18,
        },
      };

      // 2. Mock memory retrieval based on sensorimotor input
      const mockRelevantMemories = [
        {
          id: 'procedural_1',
          type: 'procedural',
          content:
            'Tool crafting sequence: wooden_pickaxe → stone_pickaxe → iron_pickaxe',
          relevance: 0.9,
          timestamp: Date.now() - 7200000, // 2 hours ago
        },
        {
          id: 'episodic_2',
          type: 'episodic',
          content:
            'Successfully mined iron ore with stone pickaxe in mountains biome yesterday',
          relevance: 0.85,
          timestamp: Date.now() - 86400000, // 1 day ago
        },
      ];

      mockMemorySystem.searchMemories = vi.fn().mockResolvedValue({
        results: mockRelevantMemories,
        total: 2,
        query: 'Mining strategy for iron ore with current inventory',
      });

      // 3. Mock LLM response that incorporates memory and sensorimotor context
      const mockLLMResponse: LLMResponse = {
        id: 'cognitive-response-1',
        text: "Given your current location in the mountains biome and your inventory containing both wooden and stone pickaxes, I recommend using the stone pickaxe for iron ore mining. Your previous experience shows this worked well in this biome, and the procedural knowledge confirms this is the optimal tool progression. The iron ore blocks you're near should be mineable with the stone pickaxe.",
        model: 'qwen2.5:7b',
        tokensUsed: 185,
        latency: 1400,
        confidence: 0.92,
        metadata: {
          finishReason: 'stop',
          reasoning: [
            'Analyzed current location and biome',
            'Checked inventory for available tools',
            'Retrieved relevant procedural and episodic memories',
            'Combined sensorimotor data with memory context',
            'Generated contextually appropriate recommendation',
          ],
          usage: {
            promptTokens: 420,
            completionTokens: 185,
            totalTokens: 605,
          },
        },
        timestamp: Date.now(),
      };

      vi.spyOn(memoryAwareLLM as any, 'generateResponse').mockResolvedValue(
        mockLLMResponse
      );

      // 4. Mock memory storage and cognitive pattern recording
      mockMemorySystem.ingestMemory = vi.fn().mockResolvedValue({
        id: 'contextual_dialogue_1',
        content: 'Contextual conversation with sensorimotor integration',
        type: 'dialogue',
        metadata: { sensorimotorContext: true },
      });

      mockMemorySystem.recordCognitivePattern = vi
        .fn()
        .mockResolvedValue(undefined);

      // 5. Execute the complete flow
      const context = {
        enableMemoryRetrieval: true,
        enableMemoryStorage: true,
        memoryContext: {
          taskType: 'resource_gathering',
          emotionalState: 'focused',
          location: sensorimotorContext.currentLocation,
        },
        currentGoals: ['mine_iron_ore', 'craft_better_tools'],
        agentState: sensorimotorContext.agentState,
      };

      const result = await memoryAwareLLM.generateMemoryEnhancedResponse(
        'What should I do to mine the iron ore I can see nearby?',
        context
      );

      // 6. Verify the complete sensorimotor → memory → LLM flow
      expect(mockMemorySystem.searchMemories).toHaveBeenCalledWith({
        query: 'What should I do to mine the iron ore I can see nearby?',
        type: ['episodic', 'semantic', 'procedural'],
        limit: 5,
        context: {
          taskType: 'resource_gathering',
          emotionalState: 'focused',
          location: sensorimotorContext.currentLocation,
        },
      });

      // 7. Verify memory integration in response
      expect(result.memoriesUsed!).toHaveLength(2);
      expect(result.memoriesUsed!.some((m) => m.type === 'procedural')).toBe(
        true
      );
      expect(result.memoriesUsed!.some((m) => m.type === 'episodic')).toBe(
        true
      );

      // 8. Verify sensorimotor context was incorporated
      expect(result.text).toContain('mountains biome');
      expect(result.text).toContain('stone pickaxe');
      expect(result.text).toContain('iron ore');

      // 9. Verify cognitive processing was recorded
      expect(mockMemorySystem.recordCognitivePattern).toHaveBeenCalledWith(
        'decision',
        expect.objectContaining({
          taskComplexity: 'medium',
          emotionalState: 'focused',
        }),
        expect.objectContaining({
          approach: expect.any(String),
          confidence: 0.92,
        }),
        expect.any(Object),
        expect.any(Object)
      );

      // 10. Verify memory storage included sensorimotor context
      expect(mockMemorySystem.ingestMemory).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Contextual conversation'),
          type: 'dialogue',
          source: 'llm_conversation',
          metadata: expect.objectContaining({
            sensorimotorContext: true,
          }),
        })
      );
    });

    it('should handle the complete HRM integration flow', async () => {
      // This test simulates integration with the Hierarchical Reasoning Model (HRM)
      // which is part of the planning system in the mermaid chart

      // 1. Mock complex multi-step reasoning scenario
      const complexScenario = {
        primaryTask: 'Build automated mining system',
        subtasks: [
          'Gather materials for redstone components',
          'Craft mechanical components',
          'Design power system',
          'Assemble and test system',
        ],
        currentInventory: ['iron_ingot', 'redstone', 'cobblestone'],
        location: { biome: 'desert', coordinates: { x: 200, y: 64, z: 300 } },
        timePressure: 'high',
        complexity: 'complex',
      };

      // 2. Mock hierarchical memory retrieval
      const mockHierarchicalMemories = [
        {
          id: 'procedural_hierarchy_1',
          type: 'procedural',
          content:
            'Complex task decomposition: Break down into subtasks, gather materials first, then craft, then assemble',
          relevance: 0.95,
          timestamp: Date.now() - 3600000,
        },
        {
          id: 'episodic_complex_1',
          type: 'episodic',
          content:
            'Previous complex build: Successfully completed automated farm system using hierarchical approach',
          relevance: 0.88,
          timestamp: Date.now() - 172800000, // 2 days ago
        },
        {
          id: 'semantic_planning_1',
          type: 'semantic',
          content:
            'HRM planning: Use hierarchical decomposition for complex multi-step tasks',
          relevance: 0.82,
          timestamp: Date.now() - 86400000,
        },
      ];

      mockMemorySystem.searchMemories = vi.fn().mockResolvedValue({
        results: mockHierarchicalMemories,
        total: 3,
        query: 'Complex multi-step task planning for automated mining system',
      });

      // 3. Mock HRM-aware LLM response
      const mockHRMResponse: LLMResponse = {
        id: 'hrm-response-1',
        text: 'For building an automated mining system, I recommend using a hierarchical approach. First, break down the task into manageable subtasks, then address each systematically. Based on your current inventory and previous successful builds, start with gathering additional materials, then move to component crafting, followed by system design and assembly. This hierarchical reasoning approach has proven effective for complex multi-step projects.',
        model: 'qwen2.5:7b',
        tokensUsed: 245,
        latency: 2100,
        confidence: 0.94,
        metadata: {
          reasoning: [
            'Applied hierarchical reasoning model to complex task',
            'Retrieved procedural memory for task decomposition',
            'Referenced episodic memory of successful complex builds',
            'Incorporated semantic knowledge of HRM planning principles',
            'Generated structured multi-step approach',
          ],
          usage: {
            promptTokens: 567,
            completionTokens: 245,
            totalTokens: 812,
          },
        },
        timestamp: Date.now(),
      };

      vi.spyOn(memoryAwareLLM as any, 'generateResponse').mockResolvedValue(
        mockHRMResponse
      );

      // 4. Mock hierarchical memory storage
      mockMemorySystem.ingestMemory = vi.fn().mockResolvedValue({
        id: 'hrm_dialogue_1',
        content:
          'Hierarchical reasoning conversation for complex system design',
        type: 'dialogue',
        metadata: { hrmIntegration: true, complexity: 'high' },
      });

      mockMemorySystem.recordCognitivePattern = vi
        .fn()
        .mockResolvedValue(undefined);

      // 5. Execute the complete HRM flow
      const hrmContext = {
        enableMemoryRetrieval: true,
        enableMemoryStorage: true,
        memoryContext: {
          taskType: 'system_design',
          emotionalState: 'focused',
          complexity: 'complex',
        },
        memoryTypes: ['procedural', 'episodic', 'semantic'],
        maxMemories: 10,
      };

      const result = await memoryAwareLLM.generateMemoryEnhancedResponse(
        'How should I approach building an automated mining system with my current inventory?',
        hrmContext
      );

      // 6. Verify the complete HRM integration flow
      expect(mockMemorySystem.searchMemories).toHaveBeenCalledWith({
        query:
          'How should I approach building an automated mining system with my current inventory?',
        type: ['procedural', 'episodic', 'semantic'],
        limit: 10,
        context: {
          taskType: 'system_design',
          emotionalState: 'focused',
          complexity: 'complex',
        },
      });

      // 7. Verify hierarchical memory integration
      expect(result.memoriesUsed).toHaveLength(3);
      expect(result.memoriesUsed.some((m) => m.type === 'procedural')).toBe(
        true
      );
      expect(result.memoriesUsed.some((m) => m.type === 'episodic')).toBe(true);
      expect(result.memoriesUsed.some((m) => m.type === 'semantic')).toBe(true);

      // 8. Verify HRM-aware response content
      expect(result.text).toContain('hierarchical approach');
      expect(result.text).toContain('break down the task');
      expect(result.text).toContain('subtasks');
      expect(result.text).toContain('systematic');

      // 9. Verify cognitive pattern recording for HRM
      expect(mockMemorySystem.recordCognitivePattern).toHaveBeenCalledWith(
        'planning',
        expect.objectContaining({
          taskComplexity: 'complex',
          emotionalState: 'focused',
        }),
        expect.objectContaining({
          approach: 'hierarchical_decomposition',
          confidence: 0.94,
        }),
        expect.any(Object),
        expect.any(Object)
      );

      // 10. Verify enhanced confidence from hierarchical reasoning
      expect(result.confidence).toBeGreaterThanOrEqual(0.94);
      expect(result.cognitiveInsights?.thoughtPatterns).toContain(
        'logical_reasoning'
      );
      expect(result.cognitiveInsights?.thoughtPatterns).toContain(
        'hypothetical_thinking'
      );
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle Ollama connection failures gracefully', async () => {
      // Mock LLM failure
      vi.spyOn(memoryAwareLLM as any, 'generateResponse').mockRejectedValue(
        new Error('Ollama connection failed')
      );

      const context = {
        enableMemoryRetrieval: true,
        enableMemoryStorage: true,
      };

      await expect(
        memoryAwareLLM.generateMemoryEnhancedResponse('Test query', context)
      ).rejects.toThrow('Ollama connection failed');
    });

    it('should handle partial memory system failures', async () => {
      // Mock partial failures
      mockMemorySystem.searchMemories = vi.fn().mockResolvedValue({
        results: [],
        total: 0,
        query: 'test query',
      });

      mockMemorySystem.ingestMemory = vi
        .fn()
        .mockRejectedValue(new Error('Storage temporarily unavailable'));

      const mockLLMResponse: LLMResponse = {
        id: 'partial-failure-response',
        text: 'I can help despite some system issues.',
        model: 'qwen2.5:7b',
        tokensUsed: 50,
        latency: 500,
        confidence: 0.6,
        metadata: {
          finishReason: 'stop',
          usage: {
            promptTokens: 40,
            completionTokens: 40,
            totalTokens: 80,
          },
        },
        timestamp: Date.now(),
      };

      vi.spyOn(memoryAwareLLM as any, 'generateResponse').mockResolvedValue(
        mockLLMResponse
      );

      const context = {
        enableMemoryRetrieval: true,
        enableMemoryStorage: true,
      };

      const result = await memoryAwareLLM.generateMemoryEnhancedResponse(
        'Test query with failures',
        context
      );

      expect(result.memoriesUsed).toEqual([]);
      expect(result.memoryOperations).toHaveLength(1);
      expect(result.memoryOperations[0].success).toBe(false);
      expect(result.text).toBe('I can help despite some system issues.');
    });

    it('should degrade gracefully when all systems fail', async () => {
      // Mock complete system failure
      mockMemorySystem.searchMemories = vi
        .fn()
        .mockRejectedValue(new Error('Memory system completely unavailable'));
      mockMemorySystem.ingestMemory = vi
        .fn()
        .mockRejectedValue(new Error('Storage system failed'));

      const mockFallbackResponse: LLMResponse = {
        id: 'fallback-response',
        text: "I apologize, but I'm experiencing system issues. Please try again later.",
        model: 'qwen2.5:7b',
        tokensUsed: 30,
        latency: 300,
        confidence: 0.3,
        metadata: { fallback: true },
        timestamp: Date.now(),
      };

      vi.spyOn(memoryAwareLLM as any, 'generateResponse').mockResolvedValue(
        mockFallbackResponse
      );

      const context = {
        enableMemoryRetrieval: true,
        enableMemoryStorage: true,
      };

      const result = await memoryAwareLLM.generateMemoryEnhancedResponse(
        'Test query with complete failure',
        context
      );

      expect(result.memoriesUsed).toEqual([]);
      expect(result.memoryOperations).toHaveLength(1);
      expect(result.memoryOperations[0].success).toBe(false);
      expect(result.confidence).toBe(0.3); // Reduced confidence due to failures
      expect(result.text).toContain('system issues');
    });
  });

  describe('Performance and Optimization', () => {
    it('should optimize memory retrieval for performance', async () => {
      const mockMemories = Array.from({ length: 10 }, (_, i) => ({
        id: `memory_${i}`,
        type: i % 2 === 0 ? 'episodic' : 'semantic',
        content: `Memory content ${i}`,
        relevance: 0.9 - i * 0.05, // Decreasing relevance
        timestamp: Date.now() - i * 3600000,
      }));

      mockMemorySystem.searchMemories = vi.fn().mockResolvedValue({
        results: mockMemories,
        total: 10,
        query: 'Performance test query',
      });

      const mockResponse: LLMResponse = {
        id: 'performance-response',
        text: 'Performance optimized response',
        model: 'qwen2.5:7b',
        tokensUsed: 80,
        latency: 600,
        confidence: 0.85,
        metadata: {
          finishReason: 'stop',
          usage: {
            promptTokens: 40,
            completionTokens: 40,
            totalTokens: 80,
          },
        },
        timestamp: Date.now(),
      };

      vi.spyOn(memoryAwareLLM as any, 'generateResponse').mockResolvedValue(
        mockResponse
      );

      const context = {
        enableMemoryRetrieval: true,
        enableMemoryStorage: true,
        maxMemories: 5, // Limit to 5 memories for performance
      };

      const result = await memoryAwareLLM.generateMemoryEnhancedResponse(
        'Performance test query',
        context
      );

      // Should limit memories to configured max
      expect(result.memoriesUsed).toHaveLength(5);
      expect(result.memoriesUsed[0].relevance).toBeGreaterThanOrEqual(
        result.memoriesUsed[4].relevance
      );
    });

    it('should cache memory operations for efficiency', async () => {
      // This would test caching mechanisms if implemented
      // For now, just verify the basic flow works efficiently

      const startTime = performance.now();

      const mockResponse: LLMResponse = {
        id: 'efficiency-response',
        text: 'Efficient response',
        model: 'qwen2.5:7b',
        tokensUsed: 60,
        latency: 400,
        confidence: 0.8,
        metadata: {
          finishReason: 'stop',
          usage: {
            promptTokens: 40,
            completionTokens: 40,
            totalTokens: 80,
          },
        },
        timestamp: Date.now(),
      };

      vi.spyOn(memoryAwareLLM as any, 'generateResponse').mockResolvedValue(
        mockResponse
      );

      const context = {
        enableMemoryRetrieval: false, // Skip memory for speed
        enableMemoryStorage: false,
      };

      const result = await memoryAwareLLM.generateMemoryEnhancedResponse(
        'Efficiency test query',
        context
      );

      const endTime = performance.now();
      const totalTime = endTime - startTime;

      expect(result.text).toBe('Efficient response');
      expect(result.latency).toBeLessThan(500); // Should be fast without memory ops
    });
  });
});
