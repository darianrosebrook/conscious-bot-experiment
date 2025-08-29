/**
 * Test Narrative Thoughts
 *
 * Simple test to verify that narrative thought generation is working
 *
 * @author @darianrosebrook
 */

import { CognitiveStreamIntegration } from './cognitive-stream-integration.js';

async function testNarrativeThoughts() {
  console.log('🧠 Test Narrative Thoughts\n');
  console.log('Testing LLM-based narrative thought generation...\n');

  try {
    // Create cognitive stream integration without bot
    const cognitiveStream = new CognitiveStreamIntegration();

    // Set up event listeners to capture thoughts
    const thoughts: any[] = [];

    cognitiveStream.on('reflection', (event) => {
      console.log('📝 Reflection thought:', event.content);
      thoughts.push(event);
    });

    cognitiveStream.on('observation', (event) => {
      console.log('👁️ Observation thought:', event.content);
      thoughts.push(event);
    });

    // Test 1: State update thought
    console.log('🎯 Test 1: State Update Thought');
    await cognitiveStream.updateBotState({
      position: { x: 100, y: 64, z: 200 },
      health: 15,
      food: 8,
      inventory: { torch: 3, apple: 2 },
    });

    // Wait a moment for thought generation
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Test 2: Goal identification thought
    console.log('\n🎯 Test 2: Goal Identification Thought');
    await cognitiveStream.executePlanningCycle('find food');

    // Wait a moment for thought generation
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Test 3: Planning thought
    console.log('\n🎯 Test 3: Planning Thought');
    await cognitiveStream.executePlanningCycle('explore area');

    // Wait a moment for thought generation
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Test 4: Execution thought
    console.log('\n🎯 Test 4: Execution Thought');
    await cognitiveStream.executePlanningCycle('get light level');

    // Wait a moment for thought generation
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Summary
    console.log('\n📋 Narrative Thoughts Summary');
    console.log(`Total thoughts generated: ${thoughts.length}`);

    if (thoughts.length > 0) {
      console.log('\nThoughts generated:');
      thoughts.forEach((thought, index) => {
        console.log(
          `  ${index + 1}. [${thought.type}] ${thought.content.substring(0, 100)}...`
        );
      });
    } else {
      console.log(
        '⚠️ No thoughts were generated - this indicates an issue with the narrative system'
      );
    }

    // Test 5: Direct thought generation
    console.log('\n🎯 Test 5: Direct Thought Generation');
    const botState = cognitiveStream.getBotState();
    console.log('Current bot state:', botState);

    const activeGoals = cognitiveStream.getActiveGoals();
    console.log('Active goals:', activeGoals);
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    console.log('\n🔌 Test complete');
    process.exit(0);
  }
}

// Run the test
testNarrativeThoughts().catch(console.error);

export { testNarrativeThoughts };
