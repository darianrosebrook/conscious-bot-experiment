/**
 * Extensions Index - Export all Mineflayer extension integrations
 *
 * This module provides access to all Mineflayer extensions that have been
 * integrated with our planning system while preserving emergent behavior.
 *
 * @author @darianrosebrook
 */

// State Machine Integration
export {
  StateMachineWrapper,
  type StateMachineConfig,
  type StateDefinition,
  type StateTransition,
  type StateMachineResult,
} from './state-machine-wrapper';

// Pre-built State Definitions
export {
  createCraftingStateMachine,
  createBuildingStateMachine,
  createGatheringStateMachine,
} from './crafting-state-definitions';
