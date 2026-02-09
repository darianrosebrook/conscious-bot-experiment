/**
 * P13 Reference Fixtures — Two-Domain Portability Proof
 *
 * Domain 1: Villager Trading — lock trades, level up, break workstation
 * Domain 2: Deployment Pipeline — deploy to prod, apply migration, cut release
 *
 * Both domains use the same P13 capsule contract, proving domain-agnosticism.
 *
 * Zero Minecraft runtime imports. Zero vitest imports.
 */

import type {
  P13CommitmentConstraintV1,
  P13IrreversibilityTagV1,
  P13VerificationOperatorV1,
} from './p13-capsule-types.js';

// ── Domain 1: Villager Trading ───────────────────────────────────────

export const TRADING_IRREVERSIBILITY_TAGS: readonly P13IrreversibilityTagV1[] = [
  {
    operatorId: 'pick_up_item',
    reversibility: 'fully_reversible',
    rollbackCost: 0,
    commitmentCost: 0,
    optionValueLost: 0,
  },
  {
    operatorId: 'place_workstation',
    reversibility: 'costly_reversible',
    rollbackCost: 5,
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
    operatorId: 'break_workstation',
    reversibility: 'irreversible',
    rollbackCost: Infinity,
    commitmentCost: 5,
    optionValueLost: 2,
  },
];

export const TRADING_VERIFICATIONS: readonly P13VerificationOperatorV1[] = [
  {
    id: 'inspect_villager_trade',
    name: 'Inspect villager trade offers',
    verifies: ['lock_villager_trade', 'level_up_villager'],
    cost: 2,
    confidenceGain: 0.3,
  },
  {
    id: 'check_trade_value',
    name: 'Check trade value against market',
    verifies: ['lock_villager_trade'],
    cost: 3,
    confidenceGain: 0.4,
  },
  {
    id: 'preview_level_up',
    name: 'Preview level-up trade options',
    verifies: ['level_up_villager'],
    cost: 2,
    confidenceGain: 0.5,
  },
];

export const TRADING_CONSTRAINTS: readonly P13CommitmentConstraintV1[] = [
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
];

// ── Domain 2: Deployment Pipeline ────────────────────────────────────

export const DEPLOYMENT_IRREVERSIBILITY_TAGS: readonly P13IrreversibilityTagV1[] = [
  {
    operatorId: 'write_code',
    reversibility: 'fully_reversible',
    rollbackCost: 0,
    commitmentCost: 0,
    optionValueLost: 0,
  },
  {
    operatorId: 'merge_branch',
    reversibility: 'costly_reversible',
    rollbackCost: 3,
    commitmentCost: 2,
    optionValueLost: 0,
  },
  {
    operatorId: 'deploy_to_prod',
    reversibility: 'irreversible',
    rollbackCost: Infinity,
    commitmentCost: 30,
    optionValueLost: 5,
  },
  {
    operatorId: 'apply_migration',
    reversibility: 'irreversible',
    rollbackCost: Infinity,
    commitmentCost: 25,
    optionValueLost: 4,
  },
  {
    operatorId: 'cut_release',
    reversibility: 'irreversible',
    rollbackCost: Infinity,
    commitmentCost: 10,
    optionValueLost: 2,
  },
];

export const DEPLOYMENT_VERIFICATIONS: readonly P13VerificationOperatorV1[] = [
  {
    id: 'run_tests',
    name: 'Run automated test suite',
    verifies: ['deploy_to_prod', 'apply_migration', 'cut_release'],
    cost: 5,
    confidenceGain: 0.3,
  },
  {
    id: 'canary_check',
    name: 'Run canary deployment',
    verifies: ['deploy_to_prod'],
    cost: 10,
    confidenceGain: 0.4,
  },
  {
    id: 'migration_dry_run',
    name: 'Run migration in dry-run mode',
    verifies: ['apply_migration'],
    cost: 8,
    confidenceGain: 0.5,
  },
];

export const DEPLOYMENT_CONSTRAINTS: readonly P13CommitmentConstraintV1[] = [
  {
    operatorId: 'deploy_to_prod',
    requiredConfidence: 0.9,
    blocksOperators: ['rollback_deploy'],
  },
  {
    operatorId: 'apply_migration',
    requiredConfidence: 0.8,
    blocksOperators: ['rollback_migration'],
  },
  {
    operatorId: 'cut_release',
    requiredConfidence: 0.6,
    blocksOperators: ['unrelease'],
  },
];
