/**
 * Scenario Harness Types
 *
 * Declarative types for governed test environments. A scenario manifest
 * describes the world state, bot state, and acceptance criteria for a
 * single validation run. The harness owns environment authority — the
 * bot runtime does not shape the world during validation.
 */

// ─── World Fixture ──────────────────────────────────────────────────────────

export interface BlockPlacement {
  /** Block type (e.g., 'minecraft:oak_log', 'minecraft:stone') */
  block: string;
  /** Position in the world */
  pos: { x: number; y: number; z: number };
}

export interface FillRegion {
  /** Block type to fill with */
  block: string;
  /** Corner 1 */
  from: { x: number; y: number; z: number };
  /** Corner 2 */
  to: { x: number; y: number; z: number };
}

export interface WorldFixture {
  /** Named regions to clear (fill with air) before placing blocks */
  clearRegions?: FillRegion[];
  /** Blocks to fill in bulk (ground, underground resources) */
  fillRegions?: FillRegion[];
  /** Individual block placements */
  blocks?: BlockPlacement[];
  /** RCON commands for things the structured API can't express (trees, features) */
  commands?: string[];
}

// ─── Bot Initial State ──────────────────────────────────────────────────────

export interface BotInitialState {
  /** Spawn position */
  position: { x: number; y: number; z: number };
  /** Game mode */
  gameMode: 'survival' | 'creative' | 'adventure';
  /** Health (0-20, default 20) */
  health?: number;
  /** Food level (0-20, default 20) */
  food?: number;
  /** Items to give the bot */
  inventory?: Array<{ item: string; count: number }>;
  /** Effects to apply */
  effects?: Array<{ effect: string; duration: number; amplifier: number }>;
}

// ─── Gamerules ──────────────────────────────────────────────────────────────

export interface WorldRules {
  difficulty?: 'peaceful' | 'easy' | 'normal' | 'hard';
  doDaylightCycle?: boolean;
  doMobSpawning?: boolean;
  doWeatherCycle?: boolean;
  time?: number;
  weather?: 'clear' | 'rain' | 'thunder';
}

// ─── Invariants ─────────────────────────────────────────────────────────────

export interface WorldInvariant {
  /** What to check */
  type: 'block_present' | 'block_absent' | 'inventory_contains' | 'inventory_empty' | 'bot_at_position';
  /** Description for diagnostics */
  description: string;
  /** Check parameters */
  params: Record<string, unknown>;
}

// ─── Acceptance Criteria ────────────────────────────────────────────────────

export interface AcceptanceCriterion {
  /** Unique ID for this criterion */
  id: string;
  /** Human-readable description */
  description: string;
  /** What to check in the run log or final state */
  type:
    | 'log_contains'        // run.log contains a pattern
    | 'log_absent'          // run.log does NOT contain a pattern
    | 'inventory_has'       // bot inventory contains item
    | 'task_completed'      // a task with this title/type completed
    | 'pickup_success_rate' // pickup_diag success rate >= threshold
    | 'custom';             // custom check function
  /** Check parameters */
  params: Record<string, unknown>;
}

// ─── Scenario Manifest ──────────────────────────────────────────────────────

export interface ScenarioManifest {
  /** Unique scenario ID (e.g., 'SCN-001') */
  id: string;
  /** Human-readable name */
  name: string;
  /** What this scenario validates */
  description: string;
  /** Capabilities being tested */
  capabilities: string[];

  /** World baseline — which baseline world to start from */
  baseline: 'flat' | 'void' | 'custom';

  /** World fixture — modifications to apply on top of baseline */
  fixture: WorldFixture;

  /** World rules */
  rules: WorldRules;

  /** Bot initial state */
  bot: BotInitialState;

  /** Pre-run invariants — verified before the bot starts */
  preRunInvariants: WorldInvariant[];

  /**
   * Direct action injection for certification scenarios.
   * When set, the harness dispatches this action directly to the MC interface
   * /action endpoint instead of waiting for idle-episode goal selection.
   * The action goes through the same LeafFactory dispatch path as normal
   * executor tasks — same validation, same result format.
   */
  directAction?: {
    type: string;
    parameters: Record<string, unknown>;
    timeoutMs?: number;
  };

  /** Acceptance criteria — checked after the run */
  acceptance: AcceptanceCriterion[];

  /** Maximum run duration in seconds */
  maxDurationSeconds: number;

  /** Tags for filtering */
  tags?: string[];
}
