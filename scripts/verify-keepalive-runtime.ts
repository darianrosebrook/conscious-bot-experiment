#!/usr/bin/env npx tsx
/**
 * Keep-Alive Runtime Verification Script
 *
 * Verifies that the keep-alive integration is actually running and captures
 * boundary artifacts for debugging the A→B→C→D pipeline.
 *
 * Usage:
 *   npx tsx scripts/verify-keepalive-runtime.ts
 *
 * Requires planning service to be running on localhost:3001
 */

const PLANNING_URL = process.env.PLANNING_URL || 'http://localhost:3001';
const COGNITION_URL = process.env.COGNITION_URL || 'http://localhost:3003';

interface KeepAliveState {
  initialized: boolean;
  globalExists: boolean;
  isActive: boolean;
  state: {
    lastTickTime: number;
    tickCount: number;
    counters: {
      ticks: number;
      thoughts: number;
      skips: number;
      goals: number;
      eligibleGoals: number;
    };
  } | null;
}

interface CognitiveStreamThought {
  id: string;
  type: string;
  content: string;
  timestamp: number;
  convertEligible: boolean;
  processed: boolean;
  metadata?: {
    source?: string;
    extractedGoal?: unknown;
    extractedGoalRaw?: unknown;
    eligibilityReasoning?: string;
    groundingResult?: { pass: boolean; reason: string };
  };
}

async function checkKeepAliveState(): Promise<KeepAliveState | null> {
  try {
    // Planning service uses /keep-alive/status without /api prefix
    const response = await fetch(`${PLANNING_URL}/keep-alive/status`);
    if (!response.ok) {
      console.error(`❌ Keep-alive state endpoint returned ${response.status}`);
      return null;
    }
    const data = await response.json();
    // Map the response to our expected format
    return {
      initialized: data.initialized,
      globalExists: data.globalExists ?? true,
      isActive: data.active,
      state: data.state,
    };
  } catch (error) {
    console.error('❌ Failed to fetch keep-alive state:', error);
    return null;
  }
}

async function getRecentThoughts(): Promise<CognitiveStreamThought[]> {
  try {
    const response = await fetch(`${COGNITION_URL}/api/cognitive-stream/recent?limit=20`);
    if (!response.ok) {
      console.error(`❌ Cognitive stream recent endpoint returned ${response.status}`);
      return [];
    }
    const data = await response.json();
    return data.thoughts || [];
  } catch (error) {
    console.error('❌ Failed to fetch thoughts:', error);
    return [];
  }
}

async function getActionableThoughts(): Promise<CognitiveStreamThought[]> {
  try {
    const response = await fetch(`${COGNITION_URL}/api/cognitive-stream/actionable`);
    if (!response.ok) {
      console.error(`❌ Actionable thoughts endpoint returned ${response.status}`);
      return [];
    }
    const data = await response.json();
    return data.thoughts || [];
  } catch (error) {
    console.error('❌ Failed to fetch actionable thoughts:', error);
    return [];
  }
}

function analyzeThought(thought: CognitiveStreamThought): void {
  console.log(`\n  📝 Thought: ${thought.id}`);
  console.log(`     Type: ${thought.type}`);
  console.log(`     Content: ${thought.content.slice(0, 80)}...`);
  console.log(`     Timestamp: ${new Date(thought.timestamp).toISOString()}`);
  console.log(`     convertEligible: ${thought.convertEligible}`);
  console.log(`     processed: ${thought.processed}`);

  if (thought.metadata) {
    console.log(`     source: ${thought.metadata.source || 'unknown'}`);

    if (thought.metadata.extractedGoalRaw) {
      console.log(`     ✅ extractedGoalRaw PRESENT (audit trail preserved)`);
      console.log(`        ${JSON.stringify(thought.metadata.extractedGoalRaw)}`);
    } else {
      console.log(`     ⚠️  extractedGoalRaw ABSENT (no goal extracted)`);
    }

    if (thought.metadata.extractedGoal) {
      console.log(`     ✅ extractedGoal PRESENT (exposed for conversion)`);
      console.log(`        ${JSON.stringify(thought.metadata.extractedGoal)}`);
    } else {
      console.log(`     ⚠️  extractedGoal ABSENT (not exposed or no goal)`);
    }

    if (thought.metadata.eligibilityReasoning) {
      console.log(`     eligibilityReasoning: ${thought.metadata.eligibilityReasoning}`);
    }

    if (thought.metadata.groundingResult) {
      console.log(`     groundingResult: pass=${thought.metadata.groundingResult.pass}`);
      console.log(`        reason: ${thought.metadata.groundingResult.reason}`);
    }
  }

  // Diagnosis
  if (thought.convertEligible === true) {
    console.log(`     🎯 ELIGIBLE FOR CONVERSION - should become a task`);
  } else if (thought.metadata?.extractedGoalRaw && !thought.metadata?.extractedGoal) {
    console.log(`     💰 Goal extracted but BUDGET SUPPRESSED`);
  } else if (thought.metadata?.extractedGoal && thought.metadata?.groundingResult?.pass === false) {
    console.log(`     🚫 Goal extracted but GROUNDING FAILED`);
  } else if (!thought.metadata?.extractedGoalRaw) {
    console.log(`     ℹ️  No goal extracted (model observation only)`);
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('        KEEP-ALIVE RUNTIME VERIFICATION');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Planning URL: ${PLANNING_URL}`);
  console.log(`Cognition URL: ${COGNITION_URL}`);
  console.log('');

  // Step 1: Check keep-alive state
  console.log('🔍 Step 1: Checking keep-alive integration state...');
  const state = await checkKeepAliveState();

  if (!state) {
    console.log('');
    console.log('❌ DIAGNOSIS: Could not reach planning service keep-alive endpoint.');
    console.log('   - Is the planning service running? (pnpm dev:planning)');
    console.log('   - Check if /api/keep-alive/state endpoint exists');
    return;
  }

  console.log(`   initialized: ${state.initialized}`);
  console.log(`   globalExists: ${state.globalExists}`);
  console.log(`   isActive: ${state.isActive}`);

  if (!state.initialized || !state.isActive) {
    console.log('');
    console.log('❌ DIAGNOSIS: Keep-alive is NOT active.');
    console.log('   - Set KEEPALIVE_ENABLED=true in environment');
    console.log('   - Check initialization logs for errors');
    return;
  }

  if (state.state) {
    console.log(`   lastTickTime: ${state.state.lastTickTime ? new Date(state.state.lastTickTime).toISOString() : 'never'}`);
    console.log(`   tickCount: ${state.state.tickCount}`);
    console.log(`   counters:`);
    console.log(`      ticks: ${state.state.counters.ticks}`);
    console.log(`      thoughts: ${state.state.counters.thoughts}`);
    console.log(`      skips: ${state.state.counters.skips}`);
    console.log(`      goals: ${state.state.counters.goals}`);
    console.log(`      eligibleGoals: ${state.state.counters.eligibleGoals}`);
  }

  // Step 2: Check recent thoughts
  console.log('');
  console.log('🔍 Step 2: Fetching recent thoughts from cognitive stream...');
  const thoughts = await getRecentThoughts();

  if (thoughts.length === 0) {
    console.log('   ⚠️  No thoughts found in cognitive stream');
  } else {
    console.log(`   Found ${thoughts.length} thoughts`);

    // Filter for keep-alive thoughts
    const keepAliveThoughts = thoughts.filter(t => t.metadata?.source === 'keepalive');
    console.log(`   Keep-alive thoughts: ${keepAliveThoughts.length}`);

    if (keepAliveThoughts.length > 0) {
      console.log('');
      console.log('📋 Keep-alive thought analysis:');
      for (const thought of keepAliveThoughts.slice(0, 5)) {
        analyzeThought(thought);
      }
    }
  }

  // Step 3: Check actionable thoughts
  console.log('');
  console.log('🔍 Step 3: Checking actionable (pending) thoughts...');
  const actionable = await getActionableThoughts();

  if (actionable.length === 0) {
    console.log('   ⚠️  No actionable thoughts pending');
  } else {
    console.log(`   Found ${actionable.length} actionable thoughts`);
    for (const thought of actionable.slice(0, 3)) {
      analyzeThought(thought);
    }
  }

  // Summary
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('        SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');

  if (state.state) {
    if (state.state.counters.ticks === 0) {
      console.log('❌ No ticks have occurred. Possible causes:');
      console.log('   - Bot is not in "no_tasks" idle state');
      console.log('   - Rate limiting preventing ticks (2 min default interval)');
      console.log('   - Idle detection conditions not met (active plans, threats, etc.)');
    } else if (state.state.counters.goals === 0) {
      console.log('⚠️  Ticks occurred but no goals extracted. Possible causes:');
      console.log('   - Model consistently producing observations without goals');
      console.log('   - Prompt not eliciting goal tags from model');
    } else if (state.state.counters.eligibleGoals === 0) {
      console.log('⚠️  Goals extracted but none eligible. Possible causes:');
      console.log('   - Grounding failing (sparse environment context)');
      console.log('   - Budget suppressing goal emission');
    } else {
      console.log('✅ Keep-alive producing eligible goals!');
      console.log(`   ${state.state.counters.eligibleGoals} eligible goals from ${state.state.counters.goals} total`);
    }
  }

  console.log('');
}

main().catch(console.error);
