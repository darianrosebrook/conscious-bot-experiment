/**
 * Tests for the IdleEpisode payload builder.
 *
 * Fences the wire contract between TS and Sterling's
 * intent_reducer_v1.py `_reduce_idle_episode` parser. If any of these
 * assertions fail, Sterling's parser will silently fall through to its
 * fail-closed branch and IdleEngine will get `no_policy` responses for
 * every call — hard to diagnose, easy to prevent.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';
import {
  buildIdleEpisodePayload,
  type BotStateSnapshot,
  type ExecutorIdleState,
} from '../idle-episode-payload';

function makeBotState(overrides: Partial<BotStateSnapshot> = {}): BotStateSnapshot {
  return {
    position: { x: 10, y: 64, z: -20 },
    health: 20,
    food: 20,
    timeOfDay: 6000,
    biome: 'plains',
    dimension: 'overworld',
    nearbyHostiles: 0,
    nearbyPassives: 2,
    inventory: [],
    ...overrides,
  };
}

function makeExecutorState(overrides: Partial<ExecutorIdleState> = {}): ExecutorIdleState {
  return {
    idleReason: 'no_tasks',
    activeTasks: 0,
    eligibleTasks: 0,
    ...overrides,
  };
}

describe('buildIdleEpisodePayload', () => {
  describe('wire contract (header + JSON shape)', () => {
    it('raw text starts with the unbracketed IDLE_EPISODE_V1 header', () => {
      // Load-bearing: Sterling's parser routes on the exact header string.
      // A prior version used '[IDLE_EPISODE_V1]' and silently misrouted.
      const { rawText } = buildIdleEpisodePayload(makeExecutorState(), makeBotState(), 1_700_000_000_000);
      expect(rawText.startsWith('IDLE_EPISODE_V1\n')).toBe(true);
      expect(rawText.startsWith('[IDLE_EPISODE_V1]')).toBe(false);
    });

    it('body after the header parses as JSON with kind=idle_episode_v1', () => {
      const { rawText } = buildIdleEpisodePayload(makeExecutorState(), makeBotState(), 1_700_000_000_000);
      const newlineIdx = rawText.indexOf('\n');
      const body = rawText.slice(newlineIdx + 1);
      const parsed = JSON.parse(body);
      expect(parsed).toBeTypeOf('object');
      expect(parsed.kind).toBe('idle_episode_v1');
    });

    it('has all top-level fields Sterling expects', () => {
      const { rawText } = buildIdleEpisodePayload(makeExecutorState(), makeBotState(), 1_700_000_000_000);
      const parsed = JSON.parse(rawText.slice(rawText.indexOf('\n') + 1));
      // The payload MUST have these fields — Sterling's parser reads them
      // or passes them through to its logging/provenance.
      expect(parsed).toHaveProperty('kind');
      expect(parsed).toHaveProperty('run_id');
      expect(parsed).toHaveProperty('idle_reason');
      expect(parsed).toHaveProperty('timestamp_ms');
      expect(parsed).toHaveProperty('bot_state');
      expect(parsed).toHaveProperty('blocked_tasks');
      expect(parsed).toHaveProperty('budgets');
    });
  });

  describe('bot_state canonicalization (what Sterling reads)', () => {
    it('floors position coordinates to integers', () => {
      const { canonicalBotState } = buildIdleEpisodePayload(
        makeExecutorState(),
        makeBotState({ position: { x: 10.9, y: 64.2, z: -20.8 } }),
        1_700_000_000_000
      );
      // Floor of negative numbers: -20.8 → -21, not -20.
      expect(canonicalBotState.position).toEqual({ x: 10, y: 64, z: -21 });
    });

    it('uses TS→Python field renames (timeOfDay→time_of_day, etc.)', () => {
      const { canonicalBotState } = buildIdleEpisodePayload(
        makeExecutorState(),
        makeBotState({
          timeOfDay: 12000,
          nearbyHostiles: 3,
          nearbyPassives: 5,
          inventory: [{ name: 'stone', count: 4 }],
        }),
        1_700_000_000_000
      );
      // Python-side snake_case keys.
      expect(canonicalBotState).toHaveProperty('time_of_day', 12000);
      expect(canonicalBotState).toHaveProperty('nearby_hostiles', 3);
      expect(canonicalBotState).toHaveProperty('nearby_passives', 5);
      expect(canonicalBotState).toHaveProperty('inventory_summary');
      // TS-side camelCase keys MUST NOT leak into the Python payload.
      expect(canonicalBotState).not.toHaveProperty('timeOfDay');
      expect(canonicalBotState).not.toHaveProperty('nearbyHostiles');
      expect(canonicalBotState).not.toHaveProperty('nearbyPassives');
      expect(canonicalBotState).not.toHaveProperty('inventory');
    });

    it('sorts inventory_summary by name for canonicalization stability', () => {
      const { canonicalBotState } = buildIdleEpisodePayload(
        makeExecutorState(),
        makeBotState({
          inventory: [
            { name: 'stone', count: 4 },
            { name: 'apple', count: 2 },
            { name: 'log', count: 8 },
          ],
        }),
        1_700_000_000_000
      );
      expect(canonicalBotState.inventory_summary).toEqual([
        { name: 'apple', count: 2 },
        { name: 'log', count: 8 },
        { name: 'stone', count: 4 },
      ]);
    });

    it('inventory_summary strips displayName field (keeps only name+count)', () => {
      const { canonicalBotState } = buildIdleEpisodePayload(
        makeExecutorState(),
        makeBotState({
          inventory: [{ name: 'wooden_pickaxe', count: 1, displayName: 'Wooden Pickaxe' }],
        }),
        1_700_000_000_000
      );
      const items = canonicalBotState.inventory_summary as Array<Record<string, unknown>>;
      expect(items[0]).toEqual({ name: 'wooden_pickaxe', count: 1 });
      expect(items[0]).not.toHaveProperty('displayName');
    });

    it('defaults health and food to 20 when unset (healthy, no false vitals triggers)', () => {
      // Load-bearing: missing state MUST NOT cause Sterling to think the
      // bot is dying. Default full health and full food so the priority
      // ladder falls through to inventory/exploration, not vitals.
      const { canonicalBotState } = buildIdleEpisodePayload(
        makeExecutorState(),
        makeBotState({ health: undefined, food: undefined }),
        1_700_000_000_000
      );
      expect(canonicalBotState.health).toBe(20);
      expect(canonicalBotState.food).toBe(20);
    });

    it('defaults nearby_hostiles to 0 when unset (no false safety triggers)', () => {
      const { canonicalBotState } = buildIdleEpisodePayload(
        makeExecutorState(),
        makeBotState({ nearbyHostiles: undefined }),
        1_700_000_000_000
      );
      expect(canonicalBotState.nearby_hostiles).toBe(0);
    });
  });

  describe('run_id determinism', () => {
    it('identical inputs produce identical run_ids', () => {
      const executor = makeExecutorState();
      const bot = makeBotState();
      const t = 1_700_000_000_000;
      const a = buildIdleEpisodePayload(executor, bot, t);
      const b = buildIdleEpisodePayload(executor, bot, t);
      expect(a.runId).toBe(b.runId);
    });

    it('different timestamps produce different run_ids', () => {
      const executor = makeExecutorState();
      const bot = makeBotState();
      const a = buildIdleEpisodePayload(executor, bot, 1_700_000_000_000);
      const b = buildIdleEpisodePayload(executor, bot, 1_700_000_001_000);
      expect(a.runId).not.toBe(b.runId);
    });

    it('different idle reasons produce different run_ids', () => {
      const t = 1_700_000_000_000;
      const bot = makeBotState();
      const a = buildIdleEpisodePayload(makeExecutorState({ idleReason: 'no_tasks' }), bot, t);
      const b = buildIdleEpisodePayload(
        makeExecutorState({ idleReason: 'blocked_on_prereq' }),
        bot,
        t
      );
      expect(a.runId).not.toBe(b.runId);
    });

    it('run_id encodes the idle reason for grep-ability', () => {
      const { runId } = buildIdleEpisodePayload(
        makeExecutorState({ idleReason: 'blocked_on_prereq' }),
        makeBotState(),
        1_700_000_000_000
      );
      expect(runId).toContain('idle_engine_');
      expect(runId).toContain('blocked_on_prereq');
    });
  });

  describe('blocked_tasks passthrough', () => {
    it('forwards blocked task summaries with snake_case field names', () => {
      const { rawText } = buildIdleEpisodePayload(
        makeExecutorState({
          idleReason: 'blocked_on_prereq',
          blockedTasks: [
            { taskId: 'task-1', blockedReason: 'missing_mcdata', nextEligibleAt: 5000 },
            { taskId: 'task-2', blockedReason: 'missing_item', nextEligibleAt: 10000 },
          ],
        }),
        makeBotState(),
        1_700_000_000_000
      );
      const parsed = JSON.parse(rawText.slice(rawText.indexOf('\n') + 1));
      expect(parsed.blocked_tasks).toHaveLength(2);
      expect(parsed.blocked_tasks[0]).toEqual({
        task_id: 'task-1',
        blocked_reason: 'missing_mcdata',
        next_eligible_at: 5000,
      });
      // TS camelCase MUST NOT leak.
      expect(parsed.blocked_tasks[0]).not.toHaveProperty('taskId');
      expect(parsed.blocked_tasks[0]).not.toHaveProperty('blockedReason');
      expect(parsed.blocked_tasks[0]).not.toHaveProperty('nextEligibleAt');
    });

    it('defaults to empty array when executor has no blocked tasks', () => {
      const { rawText } = buildIdleEpisodePayload(makeExecutorState(), makeBotState(), 1_700_000_000_000);
      const parsed = JSON.parse(rawText.slice(rawText.indexOf('\n') + 1));
      expect(parsed.blocked_tasks).toEqual([]);
    });
  });

  describe('budgets', () => {
    it('emits fixed max_steps and max_ms budgets', () => {
      const { rawText } = buildIdleEpisodePayload(makeExecutorState(), makeBotState(), 1_700_000_000_000);
      const parsed = JSON.parse(rawText.slice(rawText.indexOf('\n') + 1));
      expect(parsed.budgets).toEqual({ max_steps: 8, max_ms: 2000 });
    });
  });
});
