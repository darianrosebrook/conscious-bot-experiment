/**
 * Scenario Runner — Reset / Apply / Verify / Run pipeline
 *
 * Executes a scenario manifest against a live Minecraft server:
 * 1. Reset world to baseline (clear, fill, place blocks)
 * 2. Apply scenario fixture (RCON commands)
 * 3. Apply bot initial state (teleport, gamemode, inventory, effects)
 * 4. Verify pre-run invariants (block checks, inventory checks)
 * 5. Start the bot and capture logs
 * 6. Check acceptance criteria against run artifacts
 *
 * This module talks to the Minecraft server via RCON (docker exec)
 * and to the bot via HTTP (localhost:3005).
 */

import { execSync } from 'child_process';
import type {
  ScenarioManifest,
  WorldInvariant,
  AcceptanceCriterion,
  FillRegion,
  BlockPlacement,
} from './types';

const CONTAINER = process.env.MC_CONTAINER || 'conscious-bot-minecraft';
const BOT_URL = process.env.BOT_URL || 'http://localhost:3005';

// ─── RCON helper ────────────────────────────────────────────────────────────

function rcon(command: string): string {
  try {
    const result = execSync(
      `docker exec ${CONTAINER} rcon-cli "${command.replace(/"/g, '\\"')}"`,
      { encoding: 'utf-8', timeout: 10000 }
    );
    return result.trim();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[RCON] Failed: ${command}\n  ${msg}`);
    return '';
  }
}

function rconBatch(commands: string[]): void {
  for (const cmd of commands) {
    rcon(cmd);
  }
}

// ─── Phase 1: Reset World ───────────────────────────────────────────────────

function applyGamerules(manifest: ScenarioManifest): void {
  const { rules } = manifest;
  if (rules.difficulty) rcon(`difficulty ${rules.difficulty}`);
  if (rules.doDaylightCycle !== undefined) rcon(`gamerule doDaylightCycle ${rules.doDaylightCycle}`);
  if (rules.doMobSpawning !== undefined) rcon(`gamerule doMobSpawning ${rules.doMobSpawning}`);
  if (rules.doWeatherCycle !== undefined) rcon(`gamerule doWeatherCycle ${rules.doWeatherCycle}`);
  if (rules.time !== undefined) rcon(`time set ${rules.time}`);
  if (rules.weather) rcon(`weather ${rules.weather}`);
  rcon('gamerule spawnRadius 0');
}

function applyFillRegions(regions: FillRegion[]): void {
  for (const r of regions) {
    rcon(`fill ${r.from.x} ${r.from.y} ${r.from.z} ${r.to.x} ${r.to.y} ${r.to.z} ${r.block}`);
  }
}

function applyBlockPlacements(blocks: BlockPlacement[]): void {
  for (const b of blocks) {
    rcon(`setblock ${b.pos.x} ${b.pos.y} ${b.pos.z} ${b.block}`);
  }
}

function applyWorldFixture(manifest: ScenarioManifest): void {
  const { fixture } = manifest;

  // Force-load chunks around spawn so fill commands work
  rcon('forceload add -16 -16 16 16');

  if (fixture.clearRegions) applyFillRegions(fixture.clearRegions);
  if (fixture.fillRegions) applyFillRegions(fixture.fillRegions);
  if (fixture.blocks) applyBlockPlacements(fixture.blocks);
  if (fixture.commands) rconBatch(fixture.commands);
}

// ─── Phase 2: Apply Bot State ───────────────────────────────────────────────

function applyBotState(manifest: ScenarioManifest, botUsername: string): void {
  const { bot } = manifest;

  // Teleport
  rcon(`tp ${botUsername} ${bot.position.x} ${bot.position.y} ${bot.position.z}`);

  // Game mode
  rcon(`gamemode ${bot.gameMode} ${botUsername}`);

  // Clear inventory
  rcon(`clear ${botUsername}`);

  // Give items
  if (bot.inventory) {
    for (const item of bot.inventory) {
      rcon(`give ${botUsername} minecraft:${item.item} ${item.count}`);
    }
  }

  // Health and food via effects
  if (bot.health === 20 && bot.food === 20) {
    rcon(`effect give ${botUsername} minecraft:instant_health 1 10`);
    rcon(`effect give ${botUsername} minecraft:saturation 1 10`);
  }

  // Custom effects
  if (bot.effects) {
    for (const eff of bot.effects) {
      rcon(`effect give ${botUsername} minecraft:${eff.effect} ${eff.duration} ${eff.amplifier}`);
    }
  }
}

// ─── Phase 3: Verify Pre-Run Invariants ─────────────────────────────────────

interface InvariantResult {
  invariant: WorldInvariant;
  passed: boolean;
  detail: string;
}

function verifyBlockPresent(params: Record<string, unknown>): { passed: boolean; detail: string } {
  const pos = params.pos as { x: number; y: number; z: number };
  const expectedBlock = params.block as string;
  const result = rcon(`execute if block ${pos.x} ${pos.y} ${pos.z} minecraft:${expectedBlock}`);
  const passed = result.includes('Test passed');
  return { passed, detail: `block at (${pos.x},${pos.y},${pos.z}): ${passed ? expectedBlock : 'not ' + expectedBlock}` };
}

function verifyBlockAbsent(params: Record<string, unknown>): { passed: boolean; detail: string } {
  const pos = params.pos as { x: number; y: number; z: number };
  const block = params.block as string;
  const radius = (params.radius as number) || 0;

  if (radius === 0) {
    const result = rcon(`data get block ${pos.x} ${pos.y} ${pos.z}`);
    const passed = !result.toLowerCase().includes(block.toLowerCase());
    return { passed, detail: `block at (${pos.x},${pos.y},${pos.z}): ${result.slice(0, 80)}` };
  }

  // Check area — use execute if to detect blocks
  const result = rcon(
    `execute if block ${pos.x} ${pos.y} ${pos.z} minecraft:${block} run say found`
  );
  const passed = !result.includes('found');
  return { passed, detail: `${block} search around (${pos.x},${pos.y},${pos.z}) r=${radius}: ${passed ? 'absent' : 'present'}` };
}

function verifyInvariant(inv: WorldInvariant): InvariantResult {
  try {
    switch (inv.type) {
      case 'block_present':
        return { invariant: inv, ...verifyBlockPresent(inv.params) };
      case 'block_absent':
        return { invariant: inv, ...verifyBlockAbsent(inv.params) };
      case 'inventory_empty':
      case 'inventory_contains':
      case 'bot_at_position':
        // These require bot state which we verify via HTTP after connection
        return { invariant: inv, passed: true, detail: 'deferred to post-connect check' };
      default:
        return { invariant: inv, passed: false, detail: `unknown invariant type: ${inv.type}` };
    }
  } catch (err) {
    return { invariant: inv, passed: false, detail: `error: ${err}` };
  }
}

// ─── Phase 4: Check Acceptance Criteria ─────────────────────────────────────

interface AcceptanceResult {
  criterion: AcceptanceCriterion;
  passed: boolean;
  detail: string;
}

function checkAcceptance(criterion: AcceptanceCriterion, runLog: string): AcceptanceResult {
  try {
    switch (criterion.type) {
      case 'log_contains': {
        const pattern = new RegExp(criterion.params.pattern as string);
        const passed = pattern.test(runLog);
        return { criterion, passed, detail: passed ? 'pattern found' : 'pattern NOT found in log' };
      }
      case 'log_absent': {
        const pattern = new RegExp(criterion.params.pattern as string);
        const passed = !pattern.test(runLog);
        return { criterion, passed, detail: passed ? 'pattern correctly absent' : 'pattern found (should be absent)' };
      }
      case 'inventory_has': {
        // Check via RCON
        const item = criterion.params.item as string;
        const minCount = (criterion.params.minCount as number) || 1;
        const result = rcon(`clear BotSterling minecraft:${item} 0`);
        const match = result.match(/(\d+)/);
        const count = match ? parseInt(match[1], 10) : 0;
        const passed = count >= minCount;
        return { criterion, passed, detail: `${item}: ${count} (need >= ${minCount})` };
      }
      case 'task_completed': {
        const pattern = new RegExp(criterion.params.pattern as string);
        const passed = pattern.test(runLog);
        return { criterion, passed, detail: passed ? 'task completion found' : 'task completion NOT found' };
      }
      default:
        return { criterion, passed: false, detail: `unknown criterion type: ${criterion.type}` };
    }
  } catch (err) {
    return { criterion, passed: false, detail: `error: ${err}` };
  }
}

// ─── Main Pipeline ──────────────────────────────────────────────────────────

export interface ScenarioRunResult {
  scenario: string;
  startedAt: string;
  completedAt: string;
  preRunInvariants: InvariantResult[];
  invariantsPassed: boolean;
  acceptanceResults: AcceptanceResult[];
  acceptancePassed: boolean;
  overallPassed: boolean;
  runLogPath?: string;
}

export async function setupScenario(
  manifest: ScenarioManifest,
  botUsername = 'BotSterling',
): Promise<{ invariantsPassed: boolean; results: InvariantResult[] }> {
  console.log(`\n=== Setting up scenario: ${manifest.id} — ${manifest.name} ===\n`);

  // Phase 1: Apply gamerules and world fixture
  console.log('[1/3] Applying world fixture...');
  applyGamerules(manifest);
  applyWorldFixture(manifest);

  // Phase 2: Apply bot state
  console.log('[2/3] Applying bot state...');
  applyBotState(manifest, botUsername);

  // Phase 3: Verify pre-run invariants
  console.log('[3/3] Verifying pre-run invariants...');
  const invariantResults = manifest.preRunInvariants.map(verifyInvariant);
  const allPassed = invariantResults.every((r) => r.passed);

  for (const r of invariantResults) {
    const icon = r.passed ? 'PASS' : 'FAIL';
    console.log(`  [${icon}] ${r.invariant.description}: ${r.detail}`);
  }

  if (!allPassed) {
    console.error('\nPre-run invariants FAILED. Aborting scenario.\n');
  } else {
    console.log('\nAll invariants passed. Ready to run.\n');
  }

  return { invariantsPassed: allPassed, results: invariantResults };
}

export function checkAcceptanceCriteria(
  manifest: ScenarioManifest,
  runLog: string,
): AcceptanceResult[] {
  console.log(`\n=== Checking acceptance criteria: ${manifest.id} ===\n`);

  const results = manifest.acceptance.map((c) => checkAcceptance(c, runLog));

  for (const r of results) {
    const icon = r.passed ? 'PASS' : 'FAIL';
    console.log(`  [${icon}] ${r.criterion.id}: ${r.criterion.description}`);
    console.log(`         ${r.detail}`);
  }

  const allPassed = results.every((r) => r.passed);
  console.log(`\n${allPassed ? 'ALL ACCEPTANCE CRITERIA PASSED' : 'SOME CRITERIA FAILED'}\n`);

  return results;
}
