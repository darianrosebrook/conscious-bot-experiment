#!/usr/bin/env npx tsx
/**
 * Scenario Runner CLI
 *
 * Usage:
 *   npx tsx scenarios/run-scenario.ts SCN-001                     # Setup + verify invariants
 *   npx tsx scenarios/run-scenario.ts SCN-001 --check             # Check acceptance (uses latest run dir)
 *   npx tsx scenarios/run-scenario.ts SCN-001 --check --run-dir <path>  # Check specific run
 *
 * Workflow:
 *   1. Start the bot:  pnpm start --debug --skip-install --skip-build
 *   2. Setup scenario: npx tsx scenarios/run-scenario.ts SCN-001
 *   3. Wait for capture duration
 *   4. Check results:  npx tsx scenarios/run-scenario.ts SCN-001 --check
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { setupScenario, evaluateScenario } from './lib/runner';
import type { ScenarioManifest } from './lib/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Parse args ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const scenarioId = args.find((a) => !a.startsWith('--'));
const checkMode = args.includes('--check');
const runDirArg = args.find((_, i) => args[i - 1] === '--run-dir');

if (!scenarioId) {
  console.error('Usage: npx tsx scenarios/run-scenario.ts <SCN-ID> [--check] [--run-dir <path>]');
  console.error('\nAvailable scenarios:');
  const manifestDir = path.join(__dirname, 'manifests');
  if (fs.existsSync(manifestDir)) {
    for (const file of fs.readdirSync(manifestDir).filter((f) => f.endsWith('.ts'))) {
      console.error(`  ${file.replace('.ts', '')}`);
    }
  }
  process.exit(1);
}

// ─── Load manifest ──────────────────────────────────────────────────────────

async function loadManifest(id: string): Promise<ScenarioManifest> {
  const manifestDir = path.join(__dirname, 'manifests');
  const files = fs.readdirSync(manifestDir).filter((f) => f.includes(id) && f.endsWith('.ts'));
  if (files.length === 0) throw new Error(`No manifest found for: ${id}`);

  const mod = await import(path.join(manifestDir, files[0]));
  const manifest = Object.values(mod).find(
    (v: any) => v && typeof v === 'object' && 'id' in v && 'fixture' in v
  ) as ScenarioManifest;
  if (!manifest) throw new Error(`No ScenarioManifest export in ${files[0]}`);
  return manifest;
}

// ─── Find latest run dir for a scenario ─────────────────────────────────────

function findLatestRunDir(scenarioId: string): string | null {
  const runsDir = path.join(process.cwd(), 'scenarios', 'runs');
  if (!fs.existsSync(runsDir)) return null;

  const dirs = fs.readdirSync(runsDir)
    .filter((d) => d.startsWith(scenarioId))
    .sort()
    .reverse();

  return dirs.length > 0 ? path.join(runsDir, dirs[0]) : null;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const manifest = await loadManifest(scenarioId!);

  if (checkMode) {
    // Evaluate acceptance criteria
    const runDir = runDirArg || findLatestRunDir(manifest.id);
    if (!runDir) {
      console.error(`No run directory found for ${manifest.id}. Run setup first.`);
      process.exit(1);
    }
    const { passed } = await evaluateScenario(manifest, runDir);
    process.exit(passed ? 0 : 1);
  }

  // Setup mode
  const { invariantsPassed, runDir } = await setupScenario(manifest);
  if (!invariantsPassed) {
    process.exit(1);
  }

  console.log('After the run completes, check acceptance:');
  console.log(`  npx tsx scenarios/run-scenario.ts ${manifest.id} --check --run-dir ${runDir}`);
}

main().catch((err) => {
  console.error('Scenario runner failed:', err.message || err);
  process.exit(1);
});
