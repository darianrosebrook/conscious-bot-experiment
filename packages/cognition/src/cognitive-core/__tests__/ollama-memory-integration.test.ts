/**
 * Ollama Memory Integration Tests
 *
 * Tests the integration between Ollama LLM responses and the memory system,
 * including memory recall, storage, and the complete cognitive architecture flow.
 *
 * These tests verify the integration works end-to-end and can be run
 * with actual Ollama server for real integration testing.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { MemoryAwareLLMInterface } from '../memory-aware-llm';
import { LLMResponse } from '../memory-aware-llm';

// Skip these tests if Ollama is not available
const OLLAMA_AVAILABLE =
  process.env.OLLAMA_AVAILABLE === 'true' || process.env.CI !== 'true';

describe.skipIf(!OLLAMA_AVAILABLE)(
  'Ollama Memory Integration (Live)',
  () => {
    let memoryAwareLLM: MemoryAwareLLMInterface;

    beforeAll(async () => {
      // Initialize memory-aware LLM with real Ollama
      memoryAwareLLM = new MemoryAwareLLMInterface(
        {
          model: 'qwen2.5:7b',
          host: 'localhost',
          port: 11434,
          maxTokens: 2048,
          temperature: 0.7,
          timeout: 60000,
        },
        {
          enableAutoMemoryIntegration: true,
          enableMemoryEnhancedPrompts: true,
          enablePostResponseMemoryStorage: true,
          enableMemoryBasedConfidence: true,
          enableMemoryQualityAssessment: true,
          memoryEndpoint: 'http://localhost:3001',
        }
      );

      console.log('🔧 Setting up Ollama Memory Integration tests...');
    });

    afterAll(async () => {
      await memoryAwareLLM.close();
      console.log('✅ Ollama Memory Integration tests completed');
    });

    describe('Basic Memory Integration', () => {
      it('should generate response with memory context', async () => {
        const context = {
          enableMemoryRetrieval: true,
          enableMemoryStorage: true,
          memoryContext: {
            taskType: 'general_knowledge',
            emotionalState: 'curious',
          },
        };

        const response = await memoryAwareLLM.generateMemoryEnhancedResponse(
          'What is the best way to mine diamonds in Minecraft?',
          context
        );

        expect(response.text).toBeDefined();
        expect(response.text.length).toBeGreaterThan(10);
        expect(response.confidence).toBeGreaterThanOrEqual(0);
        expect(response.memoriesUsed).toBeDefined();
        expect(response.memoryOperations).toBeDefined();
        expect(response.cognitiveInsights).toBeDefined();

        console.log('📝 Response:', response.text.substring(0, 100) + '...');
        console.log('🧠 Memories used:', response.memoriesUsed?.length || 0);
      });

      it('should handle memory retrieval and cognitive pattern recording', async () => {
        const context = {
          enableMemoryRetrieval: true,
          enableMemoryStorage: true,
          memoryContext: {
            taskType: 'crafting',
            emotionalState: 'focused',
          },
        };

        const response = await memoryAwareLLM.generateMemoryEnhancedResponse(
          'How do I craft a diamond pickaxe?',
          context
        );

        expect(response.text).toContain('diamond');
        expect(response.cognitiveInsights?.thoughtPatterns).toBeDefined();
        expect(response.cognitiveInsights?.decisionQuality).toBeDefined();
        expect(response.memoryRecommendations).toBeDefined();

        console.log(
          '📝 Crafting response quality:',
          response.cognitiveInsights?.decisionQuality
        );
      });
    });

    describe('Context-Aware Memory Retrieval', () => {
      it('should retrieve different memories for different contexts', async () => {
        const contexts = [
          {
            name: 'mining_context',
            context: {
              enableMemoryRetrieval: true,
              memoryContext: {
                taskType: 'resource_gathering',
                emotionalState: 'determined',
              },
            },
            query: 'What tools do I need for mining?',
          },
          {
            name: 'crafting_context',
            context: {
              enableMemoryRetrieval: true,
              memoryContext: {
                taskType: 'crafting',
                emotionalState: 'patient',
              },
            },
            query: 'How do I craft better tools?',
          },
          {
            name: 'combat_context',
            context: {
              enableMemoryRetrieval: true,
              memoryContext: {
                taskType: 'combat',
                emotionalState: 'cautious',
              },
            },
            query: 'What weapons should I use for fighting?',
          },
        ];

        for (const { name, context, query } of contexts) {
          console.log(`🧪 Testing ${name}...`);

          const response = await memoryAwareLLM.generateMemoryEnhancedResponse(
            query,
            context
          );

          expect(response.text).toBeDefined();
          expect(response.memoriesUsed).toBeDefined();

          // Different contexts should potentially use different memories
          console.log(
            `   📊 ${name} - Memories used: ${response.memoriesUsed?.length || 0}`
          );
          console.log(
            `   💭 Response preview: ${response.text.substring(0, 80)}...`
          );
        }
      });
    });

    describe('Memory Quality Assessment', () => {
      it('should assess cognitive insights and provide learning opportunities', async () => {
        const context = {
          enableMemoryRetrieval: true,
          enableMemoryStorage: true,
          memoryContext: {
            taskType: 'problem_solving',
            emotionalState: 'analytical',
            cognitiveLoad: 0.7,
          },
        };

        const response = await memoryAwareLLM.generateMemoryEnhancedResponse(
          'I need to solve a complex redstone puzzle. What approach should I take?',
          context
        );

        expect(response.cognitiveInsights).toMatchObject({
          thoughtPatterns: expect.any(Array),
          decisionQuality: expect.any(Number),
          confidenceFactors: expect.any(Array),
          learningOpportunities: expect.any(Array),
        });

        console.log('🧠 Cognitive insights:');
        console.log(
          '   - Thought patterns:',
          response.cognitiveInsights?.thoughtPatterns
        );
        console.log(
          '   - Decision quality:',
          response.cognitiveInsights?.decisionQuality
        );
        console.log(
          '   - Confidence factors:',
          response.cognitiveInsights?.confidenceFactors
        );
        console.log(
          '   - Learning opportunities:',
          response.cognitiveInsights?.learningOpportunities
        );
      });
    });

    describe('Error Handling and Resilience', () => {
      it('should handle memory system failures gracefully', async () => {
        const context = {
          enableMemoryRetrieval: true,
          enableMemoryStorage: true,
        };

        // This test will work even if memory system is unavailable
        const response = await memoryAwareLLM.generateMemoryEnhancedResponse(
          'What happens if the memory system is down?',
          context
        );

        expect(response.text).toBeDefined();
        expect(response.text.length).toBeGreaterThan(0);
        expect(response.confidence).toBeGreaterThanOrEqual(0);

        console.log(
          '📝 Memory failure response:',
          response.text.substring(0, 100) + '...'
        );
        console.log('🔄 Memory operations:', response.memoryOperations);
      });
    });

    describe('Performance Characteristics', () => {
      it('should measure response latency and memory efficiency', async () => {
        const startTime = performance.now();

        const context = {
          enableMemoryRetrieval: true,
          enableMemoryStorage: true,
          maxMemories: 3, // Limit for performance
        };

        const response = await memoryAwareLLM.generateMemoryEnhancedResponse(
          'Give me a quick overview of Minecraft building strategies.',
          context
        );

        const endTime = performance.now();
        const totalTime = endTime - startTime;

        expect(totalTime).toBeLessThan(10000); // Should complete within 10 seconds
        expect(response.latency).toBeLessThan(10000);
        expect(response.memoriesUsed).toBeDefined();

        console.log('⚡ Performance metrics:');
        console.log('   - Total time:', totalTime.toFixed(2), 'ms');
        console.log(
          '   - Response latency:',
          response.latency.toFixed(2),
          'ms'
        );
        console.log('   - Memories used:', response.memoriesUsed?.length || 0);
        console.log('   - Confidence:', response.confidence.toFixed(2));
      });
    });

    describe('Integration with Complete Cognitive Architecture', () => {
      it('should demonstrate the complete mermaid chart flow', async () => {
        const complexContext = {
          enableMemoryRetrieval: true,
          enableMemoryStorage: true,
          memoryContext: {
            taskType: 'complex_problem_solving',
            emotionalState: 'focused',
            cognitiveLoad: 0.8,
            socialContext: false,
          },
          currentGoals: ['build_automated_system', 'optimize_resource_usage'],
          agentState: {
            inventory: ['iron_ingot', 'redstone', 'diamond'],
            location: 'desert_temple',
            health: 20,
            hunger: 18,
          },
        };

        const response = await memoryAwareLLM.generateMemoryEnhancedResponse(
          "I need to build an automated sorting system for my items. I have iron, redstone, and diamonds available. What's the best approach?",
          complexContext
        );

        expect(response.text).toBeDefined();
        expect(response.text.length).toBeGreaterThan(50);

        // Verify all components of the enhanced response
        expect(response.memoriesUsed).toBeDefined();
        expect(response.memoryOperations).toBeDefined();
        expect(response.memoryRecommendations).toBeDefined();
        expect(response.cognitiveInsights).toBeDefined();

        console.log('🏗️ Complete integration response:');
        console.log('📝 Text length:', response.text.length, 'characters');
        console.log('🧠 Memories used:', response.memoriesUsed?.length || 0);
        console.log(
          '💾 Memory operations:',
          response.memoryOperations?.length || 0
        );
        console.log('🎯 Confidence:', response.confidence.toFixed(2));
        console.log(
          '🧪 Decision quality:',
          response.cognitiveInsights?.decisionQuality?.toFixed(2) || 'N/A'
        );

        // Verify the response contains relevant content
        expect(
          response.text.toLowerCase().includes('automated') ||
            response.text.toLowerCase().includes('sorting') ||
            response.text.toLowerCase().includes('system')
        ).toBe(true);
      });
    });
  }
);

// Mock tests for when Ollama is not available
describe('Ollama Memory Integration (Mocked)', () => {
  let memoryAwareLLM: MemoryAwareLLMInterface;
  let mockMemorySystem: any;

  beforeAll(async () => {
    vi.clearAllMocks();

    // Mock the memory system
    const { createEnhancedMemorySystem } = await import(
      '@conscious-bot/memory'
    );
    mockMemorySystem = createEnhancedMemorySystem();

    memoryAwareLLM = new MemoryAwareLLMInterface(
      {
        model: 'mock-model',
        host: 'localhost',
        port: 11434,
        maxTokens: 2048,
        temperature: 0.7,
        timeout: 60000,
      },
      {
        enableAutoMemoryIntegration: true,
        enableMemoryEnhancedPrompts: true,
        enablePostResponseMemoryStorage: true,
        enableMemoryBasedConfidence: true,
        enableMemoryQualityAssessment: true,
        memoryEndpoint: 'http://localhost:3001',
      }
    );
  });

  afterAll(async () => {
    await memoryAwareLLM.close();
    vi.clearAllMocks();
  });

  it('should handle mocked LLM responses with memory integration', async () => {
    const mockResponse: LLMResponse = {
      id: 'mock-response-1',
      text: 'This is a mocked response for testing memory integration.',
      model: 'mock-model',
      tokensUsed: 100,
      latency: 500,
      confidence: 0.8,
      metadata: {},
      timestamp: Date.now(),
    };

    vi.spyOn(memoryAwareLLM as any, 'generateResponse').mockResolvedValue(
      mockResponse
    );

    const context = {
      enableMemoryRetrieval: true,
      enableMemoryStorage: true,
    };

    const result = await memoryAwareLLM.generateMemoryEnhancedResponse(
      'Test query for mocked integration',
      context
    );

    expect(result.text).toBe(
      'This is a mocked response for testing memory integration.'
    );
    expect(result.memoriesUsed).toEqual([]);
    expect(result.memoryOperations).toBeDefined();
    expect(result.confidence).toBe(0.8);
  });

  it('should skip memory integration when disabled', async () => {
    const mockResponse: LLMResponse = {
      id: 'mock-response-2',
      text: 'Response without memory integration.',
      model: 'mock-model',
      tokensUsed: 50,
      latency: 300,
      confidence: 0.6,
      metadata: {},
      timestamp: Date.now(),
    };

    vi.spyOn(memoryAwareLLM as any, 'generateResponse').mockResolvedValue(
      mockResponse
    );

    const context = {
      enableMemoryRetrieval: false,
      enableMemoryStorage: false,
    };

    const result = await memoryAwareLLM.generateMemoryEnhancedResponse(
      'Test query without memory',
      context
    );

    expect(result.text).toBe('Response without memory integration.');
    expect(result.memoriesUsed).toEqual([]);
    expect(result.memoryOperations).toEqual([]);
    expect(result.confidence).toBe(0.6); // No enhancement
  });
});
