/**
 * IdleEngine barrel export.
 *
 * Keep-alive subsystem replacement. See ./idle-engine.ts docstring for
 * the full rationale and contract.
 *
 * @author @darianrosebrook
 */

export { IdleEngine } from './idle-engine';
export type {
  IdleEngineClient,
  IdleEngineConfig,
  IdleGoalDecision,
} from './idle-engine';
export {
  buildIdleEpisodePayload,
} from './idle-episode-payload';
export type {
  ExecutorIdleState,
  BotStateSnapshot,
  IdleEpisodePayload,
} from './idle-episode-payload';
