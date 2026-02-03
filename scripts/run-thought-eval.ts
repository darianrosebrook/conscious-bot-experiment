#!/usr/bin/env npx tsx
/**
 * Run Thought Eval CLI
 *
 * CLI entry point for running thought evaluation suites.
 *
 * Usage:
 *   npx tsx scripts/run-thought-eval.ts --suite idle-v1 --frame balanced --sampler standard --out artifacts/evals
 *
 * Options:
 *   --suite     Suite name or path to JSONL file (required)
 *   --frame     Frame profile: minimal, balanced, rich (default: balanced)
 *   --sampler   Sampler profile: low-variance, standard, creative (default: standard)
 *   --out       Output directory (default: artifacts/evals)
 *   --mode      Eval mode: thought_only, end_to_end (default: thought_only)
 *   --model     LLM model ID (optional)
 *   --verbose   Enable verbose logging
 *   --help      Show this help message
 *
 * @author @darianrosebrook
 */

import * as path from 'path';
import * as fs from 'fs';

import {
  runEval,
  isValidFrameProfile,
  isValidSamplerProfile,
  discoverSuites,
  getSuiteId,
  type EvalConfig,
  type FrameProfileName,
  type SamplerProfileName,
} from '../packages/cognition/src/evals/harness';

// ============================================================================
// CLI Argument Parsing
// ============================================================================

interface CLIArgs {
  suite: string;
  frame: FrameProfileName;
  sampler: SamplerProfileName;
  out: string;
  mode: 'thought_only' | 'end_to_end';
  model?: string;
  verbose: boolean;
  help: boolean;
}

function parseArgs(): CLIArgs {
  const args = process.argv.slice(2);

  const result: CLIArgs = {
    suite: '',
    frame: 'balanced',
    sampler: 'standard',
    out: 'artifacts/evals',
    mode: 'thought_only',
    verbose: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--suite':
      case '-s':
        result.suite = nextArg || '';
        i++;
        break;

      case '--frame':
      case '-f':
        if (nextArg && isValidFrameProfile(nextArg)) {
          result.frame = nextArg;
        } else {
          console.error(`Invalid frame profile: ${nextArg}. Valid: minimal, balanced, rich`);
          process.exit(1);
        }
        i++;
        break;

      case '--sampler':
        if (nextArg && isValidSamplerProfile(nextArg)) {
          result.sampler = nextArg;
        } else {
          console.error(`Invalid sampler profile: ${nextArg}. Valid: low-variance, standard, creative`);
          process.exit(1);
        }
        i++;
        break;

      case '--out':
      case '-o':
        result.out = nextArg || result.out;
        i++;
        break;

      case '--mode':
      case '-m':
        if (nextArg === 'thought_only' || nextArg === 'end_to_end') {
          result.mode = nextArg;
        } else {
          console.error(`Invalid mode: ${nextArg}. Valid: thought_only, end_to_end`);
          process.exit(1);
        }
        i++;
        break;

      case '--model':
        result.model = nextArg;
        i++;
        break;

      case '--verbose':
      case '-v':
        result.verbose = true;
        break;

      case '--help':
      case '-h':
        result.help = true;
        break;

      default:
        // Treat as suite if no flag
        if (!arg.startsWith('-') && !result.suite) {
          result.suite = arg;
        }
    }
  }

  return result;
}

function showHelp(): void {
  console.log(`
Run Thought Eval CLI

Usage:
  npx tsx scripts/run-thought-eval.ts [options]

Options:
  --suite, -s     Suite name or path to JSONL file (required)
                  Can be a name like 'idle-v1' or a path like './custom.jsonl'
  --frame, -f     Frame profile: minimal, balanced, rich (default: balanced)
  --sampler       Sampler profile: low-variance, standard, creative (default: standard)
  --out, -o       Output directory (default: artifacts/evals)
  --mode, -m      Eval mode: thought_only, end_to_end (default: thought_only)
  --model         LLM model ID (optional)
  --verbose, -v   Enable verbose logging
  --help, -h      Show this help message

Examples:
  # Run with default settings
  npx tsx scripts/run-thought-eval.ts --suite idle-v1

  # Run with specific profiles
  npx tsx scripts/run-thought-eval.ts --suite idle-v1 --frame minimal --sampler standard

  # Run multiple frame profiles (run command multiple times)
  npx tsx scripts/run-thought-eval.ts --suite idle-v1 --frame minimal
  npx tsx scripts/run-thought-eval.ts --suite idle-v1 --frame balanced
  npx tsx scripts/run-thought-eval.ts --suite idle-v1 --frame rich

  # Run with custom output directory
  npx tsx scripts/run-thought-eval.ts --suite idle-v1 --out ./my-results

Built-in suites:
  idle-v1       20 scenarios testing idle behavior and compulsion/inertia
  `);
}

// ============================================================================
// Suite Resolution
// ============================================================================

function resolveSuitePath(suite: string): string {
  // Check if it's already a path
  if (suite.endsWith('.jsonl')) {
    if (fs.existsSync(suite)) {
      return path.resolve(suite);
    }
    // Try relative to cwd
    const cwdPath = path.join(process.cwd(), suite);
    if (fs.existsSync(cwdPath)) {
      return cwdPath;
    }
    throw new Error(`Suite file not found: ${suite}`);
  }

  // Look in built-in suites directory
  const builtInPath = path.join(
    __dirname,
    '../packages/cognition/src/evals/suites',
    `${suite}.jsonl`
  );

  if (fs.existsSync(builtInPath)) {
    return builtInPath;
  }

  // List available suites
  const suitesDir = path.join(__dirname, '../packages/cognition/src/evals/suites');
  const available = discoverSuites(suitesDir).map(getSuiteId);

  throw new Error(
    `Suite not found: ${suite}\n` +
    `Available built-in suites: ${available.join(', ')}\n` +
    `Or provide a path to a JSONL file.`
  );
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const args = parseArgs();

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  if (!args.suite) {
    console.error('Error: --suite is required\n');
    showHelp();
    process.exit(1);
  }

  // Set verbose mode for event emitter
  if (args.verbose) {
    process.env.EVAL_VERBOSE = 'true';
  }

  // Resolve suite path
  let suitePath: string;
  try {
    suitePath = resolveSuitePath(args.suite);
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('                    Thought Eval Harness');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log();
  console.log(`Suite:    ${getSuiteId(suitePath)}`);
  console.log(`Path:     ${suitePath}`);
  console.log(`Frame:    ${args.frame}`);
  console.log(`Sampler:  ${args.sampler}`);
  console.log(`Mode:     ${args.mode}`);
  console.log(`Output:   ${args.out}`);
  if (args.model) {
    console.log(`Model:    ${args.model}`);
  }
  console.log();
  console.log('───────────────────────────────────────────────────────────────');
  console.log();

  // Build config
  const config: EvalConfig = {
    suitePath,
    frameProfile: args.frame,
    samplerProfile: args.sampler,
    outputDir: args.out,
    mode: args.mode,
    modelId: args.model,
  };

  // Run eval
  console.log('Running evaluation...\n');
  const startTime = Date.now();

  const result = await runEval(config);

  const duration = Date.now() - startTime;

  // Print results
  console.log();
  console.log('───────────────────────────────────────────────────────────────');
  console.log('                         Results');
  console.log('───────────────────────────────────────────────────────────────');
  console.log();

  if (result.success) {
    console.log(`✓ Run completed successfully`);
  } else {
    console.log(`✗ Run completed with errors`);
    for (const error of result.errors) {
      console.log(`  - ${error}`);
    }
  }

  console.log();
  console.log(`Run ID:      ${result.runId}`);
  console.log(`Bundle ID:   ${result.bundleId}`);
  console.log(`Duration:    ${duration}ms`);
  console.log();
  console.log('Metrics:');
  console.log(`  Action Rate:        ${(result.metrics.action_rate * 100).toFixed(1)}%`);
  console.log(`  Compulsion Count:   ${result.metrics.compulsion_count}`);
  console.log(`  Inertia Count:      ${result.metrics.inertia_count}`);
  console.log(`  Hallucination Count: ${result.metrics.hallucination_count}`);
  console.log();

  if (result.passed) {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('                        ✓ PASSED');
    console.log('═══════════════════════════════════════════════════════════════');
  } else {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('                        ✗ FAILED');
    console.log('═══════════════════════════════════════════════════════════════');
  }

  console.log();
  console.log('Output files:');
  console.log(`  Summary:  ${result.summaryPath}`);
  console.log(`  Events:   ${result.eventsPath}`);
  console.log();

  // Exit with appropriate code
  process.exit(result.passed ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
