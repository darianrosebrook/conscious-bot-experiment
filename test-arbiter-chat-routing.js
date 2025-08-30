#!/usr/bin/env node

/**
 * Test Script: LLM/HRM/MCP Arbiter Chat Routing
 *
 * Tests the cognitive router to verify it properly routes chat messages
 * to the appropriate planning system (LLM, HRM, or collaborative).
 *
 * @author @darianrosebrook
 */

import { routeTask } from './packages/planning/dist/hierarchical-planner/cognitive-router.js';

// Test chat messages with different characteristics
const testChatMessages = [
  // Social interactions (should route to LLM)
  {
    message: 'Hello! How are you doing?',
    expected: 'llm',
    description: 'Basic greeting - social interaction',
  },
  {
    message: 'Can you help me build a house?',
    expected: 'llm',
    description: 'Request for help - social interaction',
  },
  {
    message: "What's the weather like?",
    expected: 'llm',
    description: 'General question - natural language',
  },

  // Structured reasoning tasks (should route to HRM)
  {
    message: 'Find the shortest path to the diamond mine',
    expected: 'hrm_structured',
    description: 'Navigation task - structured reasoning',
  },
  {
    message: 'Calculate the optimal resource distribution',
    expected: 'hrm_structured',
    description: 'Resource optimization - structured reasoning',
  },
  {
    message: 'Solve this logic puzzle: if A then B, if B then C',
    expected: 'hrm_structured',
    description: 'Logic puzzle - structured reasoning',
  },

  // Ethical decisions (should route to collaborative)
  {
    message: 'Should I help this player or focus on my own goals?',
    expected: 'collaborative',
    description: 'Ethical decision - requires both logic and narrative',
  },
  {
    message: 'Is it right to take resources from another player?',
    expected: 'collaborative',
    description: 'Moral question - ethical complexity',
  },

  // Creative tasks (should route to LLM)
  {
    message: 'Tell me a story about a brave explorer',
    expected: 'llm',
    description: 'Creative storytelling - LLM domain',
  },
  {
    message: 'Design a beautiful garden layout',
    expected: 'llm',
    description: 'Creative design task - LLM domain',
  },

  // Emergency situations (should route to fastest available)
  {
    message: "URGENT: I'm falling into lava!",
    expected: 'hrm_structured',
    description: 'Emergency navigation - should use fastest (HRM)',
  },
  {
    message: 'EMERGENCY: Hostile mobs approaching!',
    expected: 'hrm_structured',
    description: 'Emergency situation - should use fastest (HRM)',
  },
];

/**
 * Test the routing decision for a chat message
 */
function testChatRouting(message, expectedRouter, description) {
  console.log(`\n🧪 Testing: "${message}"`);
  console.log(`📝 Description: ${description}`);
  console.log(`🎯 Expected Router: ${expectedRouter}`);

  try {
    const decision = routeTask(message, {
      domain: 'minecraft',
      urgency:
        message.toLowerCase().includes('urgent') ||
        message.toLowerCase().includes('emergency')
          ? 'emergency'
          : 'medium',
      requiresStructured: false,
      requiresCreativity: false,
      requiresWorldKnowledge: true,
    });

    console.log(`🔍 Actual Router: ${decision.router}`);
    console.log(`📊 Task Type: ${decision.taskType}`);
    console.log(`🎯 Confidence: ${(decision.confidence * 100).toFixed(1)}%`);
    console.log(`⏱️ Expected Latency: ${decision.expectedLatency}ms`);
    console.log(`🧠 Reasoning: ${decision.reasoning}`);

    const passed = decision.router === expectedRouter;
    console.log(
      `✅ ${passed ? 'PASS' : 'FAIL'}: Router selection ${passed ? 'correct' : 'incorrect'}`
    );

    return {
      passed,
      decision,
      expected: expectedRouter,
      actual: decision.router,
    };
  } catch (error) {
    console.log(`❌ ERROR: ${error.message}`);
    return {
      passed: false,
      error: error.message,
    };
  }
}

/**
 * Run all tests and generate summary
 */
async function runArbiterTests() {
  console.log('🚀 Testing LLM/HRM/MCP Arbiter Chat Routing\n');
  console.log('='.repeat(80));

  const results = [];
  let passedTests = 0;
  let totalTests = testChatMessages.length;

  for (const test of testChatMessages) {
    const result = testChatRouting(
      test.message,
      test.expected,
      test.description
    );
    results.push(result);

    if (result.passed) {
      passedTests++;
    }
  }

  // Generate summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${totalTests - passedTests}`);
  console.log(
    `Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`
  );

  // Show failed tests
  const failedTests = results.filter((r) => !r.passed);
  if (failedTests.length > 0) {
    console.log('\n❌ FAILED TESTS:');
    failedTests.forEach((result, index) => {
      const test = testChatMessages[index];
      console.log(`  ${index + 1}. "${test.message}"`);
      console.log(
        `     Expected: ${test.expected}, Got: ${result.actual || 'ERROR'}`
      );
      if (result.error) {
        console.log(`     Error: ${result.error}`);
      }
    });
  }

  // Router usage statistics
  const routerStats = {};
  results.forEach((result) => {
    if (result.decision) {
      const router = result.decision.router;
      routerStats[router] = (routerStats[router] || 0) + 1;
    }
  });

  console.log('\n📈 ROUTER USAGE STATISTICS:');
  Object.entries(routerStats).forEach(([router, count]) => {
    console.log(
      `  ${router}: ${count} tasks (${((count / totalTests) * 100).toFixed(1)}%)`
    );
  });

  // Performance analysis
  const avgLatency =
    results
      .filter((r) => r.decision)
      .reduce((sum, r) => sum + r.decision.expectedLatency, 0) /
    results.filter((r) => r.decision).length;

  console.log(`\n⏱️ Average Expected Latency: ${avgLatency.toFixed(1)}ms`);

  // Final verdict
  const successRate = (passedTests / totalTests) * 100;
  if (successRate >= 80) {
    console.log('\n🎉 ARBITER TEST PASSED: Chat routing is working correctly!');
  } else if (successRate >= 60) {
    console.log('\n⚠️ ARBITER TEST PARTIAL: Chat routing needs improvement');
  } else {
    console.log(
      '\n❌ ARBITER TEST FAILED: Chat routing has significant issues'
    );
  }

  return {
    successRate,
    passedTests,
    totalTests,
    results,
  };
}

// Run the tests if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runArbiterTests().catch((error) => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });
}

export { testChatRouting, runArbiterTests, testChatMessages };
