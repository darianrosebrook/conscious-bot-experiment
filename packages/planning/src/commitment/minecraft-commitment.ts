/**
 * Minecraft Commitment Definitions
 *
 * Defines irreversibility tags, verification operators, and commitment
 * constraints for Minecraft villager trading and other one-way actions.
 * Uses the domain-agnostic P13 capsule types.
 */

import type {
  P13CommitmentConstraintV1,
  P13IrreversibilityTagV1,
  P13VerificationOperatorV1,
} from '../sterling/primitives/p13/p13-capsule-types.js';

/**
 * Minecraft operator irreversibility tags.
 *
 * Tags classify every relevant operator's reversibility:
 * - fully_reversible: pick_up, drop, walk
 * - costly_reversible: place_block, break_block (waste materials)
 * - irreversible: lock_trade, level_up, consume_totem, break_workstation
 */
export const MINECRAFT_IRREVERSIBILITY_TAGS: readonly P13IrreversibilityTagV1[] = [
  {
    operatorId: 'pick_up_item',
    reversibility: 'fully_reversible',
    rollbackCost: 0,
    commitmentCost: 0,
    optionValueLost: 0,
  },
  {
    operatorId: 'place_block',
    reversibility: 'costly_reversible',
    rollbackCost: 3,
    commitmentCost: 1,
    optionValueLost: 0,
  },
  {
    operatorId: 'lock_villager_trade',
    reversibility: 'irreversible',
    rollbackCost: Infinity,
    commitmentCost: 20,
    optionValueLost: 5,
  },
  {
    operatorId: 'level_up_villager',
    reversibility: 'irreversible',
    rollbackCost: Infinity,
    commitmentCost: 15,
    optionValueLost: 3,
  },
  {
    operatorId: 'consume_totem',
    reversibility: 'irreversible',
    rollbackCost: Infinity,
    commitmentCost: 30,
    optionValueLost: 1,
  },
  {
    operatorId: 'break_workstation',
    reversibility: 'irreversible',
    rollbackCost: Infinity,
    commitmentCost: 5,
    optionValueLost: 2,
  },
];

/**
 * Minecraft verification operators.
 *
 * These are pre-commit checks the bot can perform before
 * executing irreversible actions.
 */
export const MINECRAFT_VERIFICATIONS: readonly P13VerificationOperatorV1[] = [
  {
    id: 'inspect_trade_offers',
    name: 'Inspect villager trade offers',
    verifies: ['lock_villager_trade', 'level_up_villager'],
    cost: 2,
    confidenceGain: 0.3,
  },
  {
    id: 'check_emerald_cost',
    name: 'Check emerald cost vs available',
    verifies: ['lock_villager_trade'],
    cost: 1,
    confidenceGain: 0.4,
  },
  {
    id: 'preview_next_level',
    name: 'Preview next level trades',
    verifies: ['level_up_villager'],
    cost: 3,
    confidenceGain: 0.5,
  },
];

/**
 * Minecraft commitment constraints.
 *
 * Defines what each irreversible action requires (confidence)
 * and what it blocks (foreclosed options).
 */
export const MINECRAFT_COMMITMENT_CONSTRAINTS: readonly P13CommitmentConstraintV1[] = [
  {
    operatorId: 'lock_villager_trade',
    requiredConfidence: 0.8,
    blocksOperators: ['reroll_villager_trade', 'break_workstation'],
  },
  {
    operatorId: 'level_up_villager',
    requiredConfidence: 0.7,
    blocksOperators: ['reroll_villager_trade'],
  },
  {
    operatorId: 'break_workstation',
    requiredConfidence: 0.5,
    blocksOperators: ['lock_villager_trade', 'level_up_villager'],
  },
  {
    operatorId: 'consume_totem',
    requiredConfidence: 0.9,
    blocksOperators: [],
  },
];
