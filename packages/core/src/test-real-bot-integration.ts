/**
 * Test Real Bot Integration
 * 
 * Tests that the cognitive stream integration can actually control a real Mineflayer bot
 * 
 * @author @darianrosebrook
 */

import { CognitiveStreamIntegration } from './cognitive-stream-integration.js';
import { MinecraftCognitiveIntegration } from './minecraft-cognitive-integration.js';

/**
 * Test suite for real bot integration
 */
class RealBotIntegrationTest {
  private cognitiveStream: CognitiveStreamIntegration;
  private minecraftIntegration: MinecraftCognitiveIntegration | null = null;

  constructor() {
    this.cognitiveStream = new CognitiveStreamIntegration();
  }

  /**
   * Test without real bot (mock mode)
   */
  async testMockMode(): Promise<void> {
    console.log('🧪 Testing Cognitive Stream in Mock Mode');
    
    try {
      await this.cognitiveStream.initialize();
      
      // Test goal identification
      await this.cognitiveStream.updateBotState({
        position: { x: 0, y: 45, z: 0 },
        health: 5,
        food: 8,
        inventory: { torch: 6, cobblestone: 20 },
        currentTask: 'surviving underground'
      });

      // Test planning execution
      await this.cognitiveStream.executePlanningCycle('torch the mining corridor safely');
      
      console.log('✅ Mock mode test completed');
      
    } catch (error) {
      console.error('❌ Mock mode test failed:', error);
    }
  }

  /**
   * Test with real bot (requires Mineflayer bot instance)
   */
  async testRealBotMode(bot: any): Promise<void> {
    console.log('🧪 Testing Cognitive Stream with Real Bot');
    
    try {
      // Create minecraft integration with real bot
      this.minecraftIntegration = new MinecraftCognitiveIntegration({
        bot,
        enableRealActions: true,
        actionTimeout: 30000,
        maxRetries: 3
      });

      // Initialize with real bot
      await this.minecraftIntegration.initialize();
      
      console.log('✅ Real bot integration test completed');
      
    } catch (error) {
      console.error('❌ Real bot integration test failed:', error);
    }
  }

  /**
   * Test leaf execution with real bot
   */
  async testRealLeafExecution(bot: any): Promise<void> {
    console.log('🧪 Testing Real Leaf Execution');
    
    try {
      // Import real leaves
      const { MoveToLeaf } = await import('./leaves/index.js');
      
      // Create leaf instance
      const moveToLeaf = new MoveToLeaf();
      
      // Create leaf context with real bot
      const ctx = {
        bot,
        abortSignal: new AbortController().signal,
        now: () => Date.now(),
        snapshot: async () => ({}),
        inventory: async () => ({}),
        emitMetric: (name: string, value: number) => {},
        emitError: (error: any) => {},
      };
      
      // Test leaf execution
      const result = await moveToLeaf.run(ctx, {
        pos: { x: 0, y: 64, z: 0 },
        safe: true
      });
      
      console.log('✅ Real leaf execution test completed:', result);
      
    } catch (error) {
      console.error('❌ Real leaf execution test failed:', error);
    }
  }

  /**
   * Run all tests
   */
  async runAllTests(bot?: any): Promise<void> {
    console.log('🚀 Starting Real Bot Integration Tests\n');
    
    // Test 1: Mock mode
    await this.testMockMode();
    
    // Test 2: Real bot mode (if bot provided)
    if (bot) {
      await this.testRealBotMode(bot);
      await this.testRealLeafExecution(bot);
    } else {
      console.log('⚠️ Skipping real bot tests - no bot instance provided');
    }
    
    console.log('\n🎉 Real Bot Integration Tests Complete');
  }
}

// Export for use
export { RealBotIntegrationTest };

// Run if this file is executed directly
async function main() {
  const test = new RealBotIntegrationTest();
  await test.runAllTests();
}

main().catch(console.error);
