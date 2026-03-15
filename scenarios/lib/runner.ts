/**
 * Scenario Runner — Phase-Split Execution Pipeline
 *
 * Governed execution of scenario manifests against a live Minecraft server.
 * Each phase is explicit and produces artifacts. No deferred checks.
 *
 * Pipeline:
 *   Phase 1: world_setup    — Apply gamerules, clear/fill/place blocks, RCON commands
 *   Phase 2: wait_for_bot   — Poll bot HTTP API until connected and spawned
 *   Phase 3: apply_bot_state — Teleport, gamemode, clear inventory, give items, effects
 *   Phase 4: verify_invariants — Check ALL invariants (world + bot state) via RCON + HTTP
 *   Phase 5: run             — Start log capture, wait for duration
 *   Phase 6: evaluate        — Check acceptance criteria, collect artifact bundle
 *
 * Artifact bundle per run:
 *   scenarios/runs/<SCN-ID>-<timestamp>/
 *     manifest.json          — scenario manifest used
 *     setup-transcript.log   — RCON commands and results
 *     initial-state.json     — post-connect bot state snapshot
 *     invariant-results.json — pre-run invariant check results
 *     run.log                — scoped runtime log
 *     final-state.json       — post-run bot state snapshot
 *     acceptance-results.json — acceptance criteria results
 *     summary.json           — overall pass/fail with metadata
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import type {
  ScenarioManifest,
  WorldInvariant,
  AcceptanceCriterion,
  FillRegion,
  BlockPlacement,
} from './types';

const CONTAINER = process.env.MC_CONTAINER || 'conscious-bot-minecraft';
const BOT_URL = process.env.BOT_URL || 'http://localhost:3005';
const BOT_USERNAME = process.env.BOT_USERNAME || 'BotSterling';

// ─── RCON helper ────────────────────────────────────────────────────────────

const setupTranscript: string[] = [];

function rcon(command: string): string {
  try {
    const result = execSync(
      `docker exec ${CONTAINER} rcon-cli "${command.replace(/"/g, '\\"')}"`,
      { encoding: 'utf-8', timeout: 10000 }
    );
    const trimmed = result.trim();
    setupTranscript.push(`> ${command}\n  ${trimmed}`);
    return trimmed;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setupTranscript.push(`> ${command}\n  ERROR: ${msg}`);
    console.error(`[RCON] Failed: ${command}\n  ${msg}`);
    return '';
  }
}

// ─── Bot HTTP helper ────────────────────────────────────────────────────────

async function fetchBotState(): Promise<any> {
  try {
    const res = await fetch(`${BOT_URL}/state`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchBotConnection(): Promise<any> {
  try {
    const res = await fetch(`${BOT_URL}/connection`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function extractBotSnapshot(raw: any): {
  position: { x: number; y: number; z: number } | null;
  health: number;
  food: number;
  gameMode: string;
  inventory: Array<{ type: string; count: number }>;
} {
  const ws = raw?.data?.worldState || raw?.worldState || {};
  const player = ws?.player || {};
  const invData = raw?.data?.data?.inventory || {};
  const items = Array.isArray(invData?.items) ? invData.items : [];
  return {
    position: player.position || null,
    health: player.health ?? -1,
    food: player.food ?? -1,
    gameMode: player.gameMode ?? 'unknown',
    inventory: items.map((i: any) => ({ type: i.type || i.name, count: i.count })),
  };
}

// ─── Artifact directory ─────────────────────────────────────────────────────

function createRunDir(scenarioId: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const runId = `${scenarioId}-${timestamp}`;
  const runDir = path.join(process.cwd(), 'scenarios', 'runs', runId);
  fs.mkdirSync(runDir, { recursive: true });
  return runDir;
}

function writeArtifact(runDir: string, filename: string, data: unknown): void {
  const filePath = path.join(runDir, filename);
  if (typeof data === 'string') {
    fs.writeFileSync(filePath, data);
  } else {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  }
}

// ─── Phase 0: Hard Reset ────────────────────────────────────────────────────
// Destroy all carryover state from previous runs. This runs BEFORE any
// fixture application. Without this, inventory, placed blocks, dropped items,
// and entity state from prior scenarios contaminate the next run.

function hardReset(): void {
  // Kill all dropped item entities in the world
  rcon('kill @e[type=minecraft:item]');

  // Clear bot inventory completely
  rcon(`clear ${BOT_USERNAME}`);

  // Remove all XP
  rcon(`experience set ${BOT_USERNAME} 0 points`);
  rcon(`experience set ${BOT_USERNAME} 0 levels`);

  // Clear all effects
  rcon(`effect clear ${BOT_USERNAME}`);

  // Reset health and hunger
  rcon(`effect give ${BOT_USERNAME} minecraft:instant_health 1 10`);
  rcon(`effect give ${BOT_USERNAME} minecraft:saturation 1 10`);

  // Clear a large area around spawn of any player-placed blocks.
  // Works for both flat worlds (Y=-60 ground) and normal worlds (Y=63 ground).
  // Build the platform at Y=63 regardless, since scenarios expect that level.
  rcon('fill -20 59 -20 20 59 20 minecraft:bedrock');
  rcon('fill -20 60 -20 20 62 20 minecraft:dirt');
  rcon('fill -20 63 -20 20 63 20 minecraft:grass_block');
  rcon('fill -20 64 -20 20 80 20 minecraft:air');

  // Kill any mobs that spawned
  rcon('kill @e[type=!minecraft:player]');
}

// ─── Phase 1: World Setup ───────────────────────────────────────────────────

function applyWorldSetup(manifest: ScenarioManifest): void {
  const { rules, fixture } = manifest;

  // Gamerules
  if (rules.difficulty) rcon(`difficulty ${rules.difficulty}`);
  if (rules.doDaylightCycle !== undefined) rcon(`gamerule doDaylightCycle ${rules.doDaylightCycle}`);
  if (rules.doMobSpawning !== undefined) rcon(`gamerule doMobSpawning ${rules.doMobSpawning}`);
  if (rules.doWeatherCycle !== undefined) rcon(`gamerule doWeatherCycle ${rules.doWeatherCycle}`);
  if (rules.time !== undefined) rcon(`time set ${rules.time}`);
  if (rules.weather) rcon(`weather ${rules.weather}`);
  rcon('gamerule spawnRadius 0');

  // Force-load chunks
  rcon('forceload add -16 -16 16 16');

  // Fixture
  if (fixture.clearRegions) {
    for (const r of fixture.clearRegions) {
      rcon(`fill ${r.from.x} ${r.from.y} ${r.from.z} ${r.to.x} ${r.to.y} ${r.to.z} ${r.block}`);
    }
  }
  if (fixture.fillRegions) {
    for (const r of fixture.fillRegions) {
      rcon(`fill ${r.from.x} ${r.from.y} ${r.from.z} ${r.to.x} ${r.to.y} ${r.to.z} ${r.block}`);
    }
  }
  if (fixture.blocks) {
    for (const b of fixture.blocks) {
      rcon(`setblock ${b.pos.x} ${b.pos.y} ${b.pos.z} ${b.block}`);
    }
  }
  if (fixture.commands) {
    for (const cmd of fixture.commands) {
      rcon(cmd);
    }
  }

  // Set worldspawn to scenario position
  const { position } = manifest.bot;
  rcon(`setworldspawn ${position.x} ${position.y} ${position.z}`);
}

// ─── Phase 2: Wait for Bot ──────────────────────────────────────────────────

async function waitForBot(timeoutMs = 120000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const conn = await fetchBotConnection();
    if (conn?.state === 'connected') {
      // Also verify bot is spawned via state endpoint
      const state = await fetchBotState();
      if (state?.success && state?.data?.worldState?.player?.health > 0) {
        return true;
      }
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

// ─── Phase 3: Apply Bot State ───────────────────────────────────────────────

function applyBotState(manifest: ScenarioManifest): void {
  const { bot } = manifest;

  rcon(`tp ${BOT_USERNAME} ${bot.position.x} ${bot.position.y} ${bot.position.z}`);
  rcon(`gamemode ${bot.gameMode} ${BOT_USERNAME}`);
  rcon(`clear ${BOT_USERNAME}`);

  if (bot.inventory) {
    for (const item of bot.inventory) {
      rcon(`give ${BOT_USERNAME} minecraft:${item.item} ${item.count}`);
    }
  }

  // Heal and feed
  rcon(`effect give ${BOT_USERNAME} minecraft:instant_health 1 10`);
  rcon(`effect give ${BOT_USERNAME} minecraft:saturation 1 10`);

  if (bot.effects) {
    for (const eff of bot.effects) {
      rcon(`effect give ${BOT_USERNAME} minecraft:${eff.effect} ${eff.duration} ${eff.amplifier}`);
    }
  }

  // Short delay for server to process all commands
  execSync('sleep 2');
}

// ─── Phase 4: Verify Invariants ─────────────────────────────────────────────

export interface InvariantResult {
  invariant: WorldInvariant;
  passed: boolean;
  detail: string;
}

function verifyWorldInvariant(inv: WorldInvariant): InvariantResult {
  try {
    switch (inv.type) {
      case 'block_present': {
        const pos = inv.params.pos as { x: number; y: number; z: number };
        const block = inv.params.block as string;
        const result = rcon(`execute if block ${pos.x} ${pos.y} ${pos.z} minecraft:${block}`);
        const passed = result.includes('Test passed');
        return { invariant: inv, passed, detail: `(${pos.x},${pos.y},${pos.z}): ${passed ? block : 'NOT ' + block}` };
      }
      case 'block_absent': {
        const pos = inv.params.pos as { x: number; y: number; z: number };
        const block = inv.params.block as string;
        const result = rcon(`execute if block ${pos.x} ${pos.y} ${pos.z} minecraft:${block}`);
        const passed = !result.includes('Test passed');
        return { invariant: inv, passed, detail: `(${pos.x},${pos.y},${pos.z}): ${passed ? 'absent' : 'PRESENT (should be absent)'}` };
      }
      default:
        return { invariant: inv, passed: false, detail: `world check not applicable: ${inv.type}` };
    }
  } catch (err) {
    return { invariant: inv, passed: false, detail: `error: ${err}` };
  }
}

function verifyBotInvariant(inv: WorldInvariant, snapshot: ReturnType<typeof extractBotSnapshot>): InvariantResult {
  try {
    switch (inv.type) {
      case 'inventory_empty': {
        const passed = snapshot.inventory.length === 0;
        return { invariant: inv, passed, detail: `items: ${snapshot.inventory.length} (expected 0)` };
      }
      case 'inventory_contains': {
        const item = inv.params.item as string;
        const count = (inv.params.count as number) || 1;
        const found = snapshot.inventory.find((i) => i.type === item);
        const passed = (found?.count ?? 0) >= count;
        return { invariant: inv, passed, detail: `${item}: ${found?.count ?? 0} (need >= ${count})` };
      }
      case 'bot_at_position': {
        const expected = inv.params.pos as { x: number; y: number; z: number };
        const tolerance = (inv.params.tolerance as number) || 2;
        const pos = snapshot.position;
        if (!pos) return { invariant: inv, passed: false, detail: 'no position data' };
        const dist = Math.sqrt(
          (pos.x - expected.x) ** 2 + (pos.y - expected.y) ** 2 + (pos.z - expected.z) ** 2
        );
        const passed = dist <= tolerance;
        return { invariant: inv, passed, detail: `dist=${dist.toFixed(1)} (tolerance=${tolerance})` };
      }
      default:
        return { invariant: inv, passed: false, detail: `bot check not applicable: ${inv.type}` };
    }
  } catch (err) {
    return { invariant: inv, passed: false, detail: `error: ${err}` };
  }
}

async function verifyAllInvariants(
  manifest: ScenarioManifest,
): Promise<{ passed: boolean; results: InvariantResult[] }> {
  const botState = await fetchBotState();
  const snapshot = extractBotSnapshot(botState);

  const results: InvariantResult[] = [];
  for (const inv of manifest.preRunInvariants) {
    if (inv.type === 'block_present' || inv.type === 'block_absent') {
      results.push(verifyWorldInvariant(inv));
    } else {
      results.push(verifyBotInvariant(inv, snapshot));
    }
  }

  // Mandatory bot position check (not in manifest — always verified)
  const pos = snapshot.position;
  const expected = manifest.bot.position;
  if (pos) {
    const dist = Math.sqrt(
      (pos.x - expected.x) ** 2 + (pos.y - expected.y) ** 2 + (pos.z - expected.z) ** 2
    );
    results.push({
      invariant: { type: 'bot_at_position', description: 'Bot at scenario spawn position', params: {} },
      passed: dist <= 3,
      detail: `pos=(${pos.x.toFixed(1)},${pos.y.toFixed(1)},${pos.z.toFixed(1)}) expected=(${expected.x},${expected.y},${expected.z}) dist=${dist.toFixed(1)}`,
    });
  }

  return { passed: results.every((r) => r.passed), results };
}

// ─── Phase 6: Acceptance Checking ───────────────────────────────────────────

export interface AcceptanceResult {
  criterion: AcceptanceCriterion;
  passed: boolean;
  detail: string;
}

function checkAcceptance(criterion: AcceptanceCriterion, runLog: string): AcceptanceResult {
  try {
    switch (criterion.type) {
      case 'log_contains': {
        const pattern = new RegExp(criterion.params.pattern as string);
        const matches = runLog.match(pattern);
        const passed = !!matches;
        return { criterion, passed, detail: passed ? `found: ${matches![0].slice(0, 100)}` : 'NOT found' };
      }
      case 'log_absent': {
        const pattern = new RegExp(criterion.params.pattern as string);
        const matches = runLog.match(pattern);
        const passed = !matches;
        return { criterion, passed, detail: passed ? 'correctly absent' : `found (should be absent): ${matches![0].slice(0, 100)}` };
      }
      case 'inventory_has': {
        const item = criterion.params.item as string;
        const minCount = (criterion.params.minCount as number) || 1;
        const result = rcon(`clear ${BOT_USERNAME} minecraft:${item} 0`);
        const match = result.match(/(\d+)/);
        const count = match ? parseInt(match[1], 10) : 0;
        const passed = count >= minCount;
        return { criterion, passed, detail: `${item}: ${count} in inventory (need >= ${minCount})` };
      }
      case 'pickup_success_rate': {
        const threshold = (criterion.params.threshold as number) || 0.5;
        const successCount = (runLog.match(/acquire_material.*status=success/g) || []).length;
        const failCount = (runLog.match(/pickup_failed_after_dig/g) || []).length;
        const total = successCount + failCount;
        const rate = total > 0 ? successCount / total : 0;
        const passed = rate >= threshold;
        return { criterion, passed, detail: `${successCount}/${total} = ${(rate * 100).toFixed(0)}% (threshold ${(threshold * 100).toFixed(0)}%)` };
      }
      default:
        return { criterion, passed: false, detail: `unknown type: ${criterion.type}` };
    }
  } catch (err) {
    return { criterion, passed: false, detail: `error: ${err}` };
  }
}

// ─── Exported Pipeline Functions ────────────────────────────────────────────

/**
 * Phase 1+3+4: Set up world, apply bot state (requires bot online), verify invariants.
 * Returns run directory path and invariant results.
 */
export async function setupScenario(
  manifest: ScenarioManifest,
): Promise<{ runDir: string; invariantsPassed: boolean; results: InvariantResult[]; initialState: any }> {
  const runDir = createRunDir(manifest.id);
  setupTranscript.length = 0;

  console.log(`\n=== Scenario: ${manifest.id} — ${manifest.name} ===`);
  console.log(`Run directory: ${runDir}\n`);

  // Phase 0: Wait for bot to be online (required for reset commands)
  console.log('[Phase 0] Waiting for bot connection...');
  const botReady = await waitForBot(60000);
  if (!botReady) {
    console.error('Bot not connected after 60s. Is the bot running?');
    console.log('Start the bot first: pnpm start --debug --skip-install --skip-build');
    writeArtifact(runDir, 'setup-transcript.log', setupTranscript.join('\n'));
    return { runDir, invariantsPassed: false, results: [], initialState: null };
  }

  // Phase 0b: Hard reset — destroy all carryover from previous runs
  console.log('[Phase 0b] Hard reset — clearing carryover state...');
  hardReset();

  // Phase 1: Apply world fixture on clean slate
  console.log('[Phase 1] Applying world fixture...');
  applyWorldSetup(manifest);
  writeArtifact(runDir, 'manifest.json', manifest);

  // Phase 2: Apply bot state (bot is already online from Phase 0)
  console.log('[Phase 2] Applying bot state...');
  applyBotState(manifest);

  // Phase 3: Verify ALL invariants (world + bot state)
  console.log('[Phase 3] Verifying invariants...');
  const { passed, results } = await verifyAllInvariants(manifest);

  // Capture initial state snapshot
  const rawState = await fetchBotState();
  const initialState = extractBotSnapshot(rawState);

  for (const r of results) {
    const icon = r.passed ? 'PASS' : 'FAIL';
    console.log(`  [${icon}] ${r.invariant.description}: ${r.detail}`);
  }

  // Write artifacts
  writeArtifact(runDir, 'setup-transcript.log', setupTranscript.join('\n'));
  writeArtifact(runDir, 'initial-state.json', initialState);
  writeArtifact(runDir, 'invariant-results.json', results);

  if (!passed) {
    console.error('\nInvariants FAILED. Scenario not ready.\n');
  } else {
    console.log('\nAll invariants passed. Scenario ready.\n');
    console.log(`Start capture: pnpm start --debug --capture-logs=${manifest.maxDurationSeconds} --skip-install --skip-build`);
    console.log(`  (or if bot is already running, wait ${manifest.maxDurationSeconds}s then check)`);
    console.log(`\nAfter run: npx tsx scenarios/run-scenario.ts ${manifest.id} --check --run-dir ${runDir}`);
  }

  return { runDir, invariantsPassed: passed, results, initialState };
}

/**
 * Phase 6: Evaluate acceptance criteria against run artifacts.
 */
export async function evaluateScenario(
  manifest: ScenarioManifest,
  runDir: string,
  runLogPath?: string,
): Promise<{ passed: boolean; results: AcceptanceResult[] }> {
  console.log(`\n=== Evaluating: ${manifest.id} — ${manifest.name} ===`);
  console.log(`Run directory: ${runDir}\n`);

  // Read run log — prefer the run-dir copy if it exists (per-run isolation)
  const runDirLog = path.join(runDir, 'run.log');
  const logPath = fs.existsSync(runDirLog)
    ? runDirLog
    : (runLogPath || path.join(process.cwd(), 'run.log'));
  if (!fs.existsSync(logPath)) {
    console.error(`Run log not found: ${logPath}`);
    return { passed: false, results: [] };
  }
  const runLog = fs.readFileSync(logPath, 'utf-8');

  // Copy run log to artifact directory if not already there
  if (logPath !== runDirLog) {
    fs.copyFileSync(logPath, runDirLog);
  }

  // Capture final state
  const rawState = await fetchBotState();
  const finalState = rawState ? extractBotSnapshot(rawState) : null;
  writeArtifact(runDir, 'final-state.json', finalState);

  // Capture scenario task state from /tasks (task artifact dump)
  try {
    const tasksRes = await fetch(`${BOT_URL.replace(':3005', ':3002')}/tasks`);
    if (tasksRes.ok) {
      const tasksData = await tasksRes.json() as any;
      const allTasks = [
        ...(tasksData?.tasks?.current || []),
        ...(tasksData?.tasks?.completed || []),
        ...(tasksData?.tasks?.failed || []),
      ];
      const scenarioTasks = allTasks.filter((t: any) =>
        t.title?.includes('[cert]') || t.metadata?.scenarioRunId
      );
      writeArtifact(runDir, 'task-state.json', scenarioTasks);
    }
  } catch {
    // non-fatal — task state is supplementary evidence
  }

  // Extract dig coordinates from log for target-approval verification
  const digCoords = [...runLog.matchAll(/digPos=\(([^)]+)\)/g)]
    .map(m => {
      const [x, y, z] = m[1].split(',').map(Number);
      return { x, y, z };
    });
  writeArtifact(runDir, 'dig-coordinates.json', digCoords);

  // Check acceptance criteria
  const results = manifest.acceptance.map((c) => checkAcceptance(c, runLog));

  for (const r of results) {
    const icon = r.passed ? 'PASS' : 'FAIL';
    console.log(`  [${icon}] ${r.criterion.id}: ${r.criterion.description}`);
    console.log(`         ${r.detail}`);
  }

  const allPassed = results.every((r) => r.passed);

  // Write acceptance results
  writeArtifact(runDir, 'acceptance-results.json', results);

  // Write summary
  const grade = allPassed ? 'CERT_PASS' : 'FAIL';
  const summary = {
    scenario: manifest.id,
    name: manifest.name,
    grade,
    timestamp: new Date().toISOString(),
    acceptance: results.map((r) => ({
      id: r.criterion.id,
      passed: r.passed,
      detail: r.detail,
    })),
    evidence: {
      digCoordinates: digCoords,
      digCount: digCoords.length,
      finalInventory: finalState?.inventory || [],
      harvestSuccessCount: (runLog.match(/harvest_complete/g) || []).length,
      pickupFailCount: (runLog.match(/pickup_failed_after_dig/g) || []).length,
    },
    artifacts: fs.readdirSync(runDir),
  };
  writeArtifact(runDir, 'summary.json', summary);

  console.log(`\nGrade: ${grade}`);
  console.log(`Artifacts: ${runDir}\n`);

  return { passed: allPassed, results };
}
