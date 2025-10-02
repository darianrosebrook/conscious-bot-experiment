#!/usr/bin/env tsx
/**
 * Audit Thought-to-Action Pipeline
 *
 * Runs a timed audit session to capture the thought-to-action pipeline
 * and saves the results to logs/audit/
 *
 * Usage:
 *   npm run audit:thought-pipeline
 *   npm run audit:thought-pipeline -- --duration 120
 *   npm run audit:thought-pipeline -- --duration 30
 *
 * @author @darianrosebrook
 */

import { auditLogger } from '../packages/cognition/src/audit/thought-action-audit-logger';

// Parse command line arguments
const args = process.argv.slice(2);
const durationIndex = args.indexOf('--duration');
const duration =
  durationIndex >= 0 && args[durationIndex + 1]
    ? parseInt(args[durationIndex + 1], 10)
    : 120; // Default 2 minutes

async function main() {
  console.log('='.repeat(80));
  console.log('THOUGHT-TO-ACTION PIPELINE AUDIT');
  console.log('='.repeat(80));
  console.log('');
  console.log(`Duration: ${duration} seconds`);
  console.log(`Output: ./logs/audit/`);
  console.log('');
  console.log('Monitoring pipeline:');
  console.log('  1. Need identification');
  console.log('  2. Thought generation');
  console.log('  3. Thought processing');
  console.log('  4. Action planning');
  console.log('  5. Tool selection');
  console.log('  6. Tool execution');
  console.log('  7. Action completion');
  console.log('  8. Feedback received');
  console.log('');
  console.log('='.repeat(80));
  console.log('');

  // Start audit session
  const sessionId = auditLogger.startSession();

  console.log(`✅ Started audit session: ${sessionId}`);
  console.log(`⏳ Will run for ${duration} seconds...`);
  console.log('');
  console.log('💡 Make sure the bot is running and performing actions!');
  console.log('');

  // Wait for duration
  await new Promise((resolve) => setTimeout(resolve, duration * 1000));

  // End session
  console.log('');
  console.log('⏰ Time expired, ending session...');
  console.log('');

  const session = await auditLogger.endSession(sessionId);

  if (session) {
    console.log('');
    console.log('='.repeat(80));
    console.log('AUDIT COMPLETE');
    console.log('='.repeat(80));
    console.log('');
    console.log(`Session ID: ${session.sessionId}`);
    console.log(
      `Duration: ${((session.endTime! - session.startTime) / 1000).toFixed(2)}s`
    );
    console.log(`Total Entries: ${session.entries.length}`);

    if (session.summary) {
      console.log(`Successful: ${session.summary.successCount}`);
      console.log(`Failed: ${session.summary.failureCount}`);
      console.log(
        `Average Duration: ${session.summary.averageDuration.toFixed(2)}ms`
      );
    }

    console.log('');
    console.log('📁 Logs saved to: ./logs/audit/');
    console.log('   - JSON format: audit-<timestamp>.json');
    console.log('   - Text format: audit-<timestamp>.txt');
    console.log('');
    console.log('✅ Audit complete!');
  } else {
    console.error('❌ Failed to end session');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Audit failed:', error);
  process.exit(1);
});
