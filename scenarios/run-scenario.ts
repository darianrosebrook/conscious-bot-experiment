#!/usr/bin/env npx tsx
/**
 * Scenario Runner CLI
 *
 * Usage:
 *   npx tsx scenarios/run-scenario.ts SCN-001           # Setup only (verify invariants)
 *   npx tsx scenarios/run-scenario.ts SCN-001 --check   # Check acceptance against existing run.log
 *   npx tsx scenarios/run-scenario.ts SCN-001 --full    # Setup + run bot + check (future)
 *
 * The runner sets up the world, verifies invariants, then exits.
 * The bot is started separately via pnpm start.
 * After the run, use --check to evaluate acceptance criteria.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { setupScenario, checkAcceptanceCriteria } from './lib/runner';
import type { ScenarioManifest } from './lib/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Load scenario ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const scenarioId = args.find((a) => !a.startsWith('--'));
const checkMode = args.includes('--check');

if (!scenarioId) {
  console.error('Usage: npx tsx scenarios/run-scenario.ts <SCN-ID> [--check]');
  console.error('Available scenarios:');
  const manifestDir = path.join(__dirname, 'manifests');
  for (const file of fs.readdirSync(manifestDir).filter((f) => f.endsWith('.ts'))) {
    console.error(`  ${file.replace('.ts', '')}`);
  }
  process.exit(1);
}

async function loadManifest(id: string): Promise<ScenarioManifest> {
  const manifestDir = path.join(__dirname, 'manifests');
  const files = fs.readdirSync(manifestDir).filter((f) => f.includes(id) && f.endsWith('.ts'));

  if (files.length === 0) {
    throw new Error(`No manifest found for scenario ID: ${id}`);
  }

  const manifestPath = path.join(manifestDir, files[0]);
  const mod = await import(manifestPath);
  // Find the exported manifest (first export that matches ScenarioManifest shape)
  const manifest = Object.values(mod).find(
    (v: any) => v && typeof v === 'object' && 'id' in v && 'fixture' in v
  ) as ScenarioManifest;

  if (!manifest) {
    throw new Error(`No ScenarioManifest export found in ${files[0]}`);
  }

  return manifest;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const manifest = await loadManifest(scenarioId!);

  if (checkMode) {
    // Check acceptance criteria against existing run.log
    const runLogPath = path.join(process.cwd(), 'run.log');
    if (!fs.existsSync(runLogPath)) {
      console.error('No run.log found. Run the bot first, then use --check.');
      process.exit(1);
    }
    const runLog = fs.readFileSync(runLogPath, 'utf-8');
    const results = checkAcceptanceCriteria(manifest, runLog);
    const allPassed = results.every((r) => r.passed);
    process.exit(allPassed ? 0 : 1);
  }

  // Setup mode: apply fixture and verify invariants
  const { invariantsPassed } = await setupScenario(manifest);

  if (!invariantsPassed) {
    process.exit(1);
  }

  console.log('Scenario setup complete. Start the bot:');
  console.log(`  pnpm start --debug --capture-logs=${manifest.maxDurationSeconds} --skip-install --skip-build`);
  console.log('');
  console.log('After the run, check acceptance:');
  console.log(`  npx tsx scenarios/run-scenario.ts ${manifest.id} --check`);
}

main().catch((err) => {
  console.error('Scenario runner failed:', err);
  process.exit(1);
});
