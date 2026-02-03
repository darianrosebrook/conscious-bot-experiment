/**
 * Centralized Task → Action Parameter Resolver
 *
 * Every execution path (reactive, autonomous, BT tool executor) must use this
 * resolver to turn a task into gateway-ready action args. If the resolver
 * cannot produce valid args, it fails deterministically (no backoff, no retries).
 *
 * Design principles:
 * 1. Fail-closed: Unknown/missing is NOT a valid value — it's a classification result
 * 2. Explicit precedence: Resolution order is documented and deterministic
 * 3. Evidence-rich: Every result includes what was checked for debugging
 * 4. Non-retryable: Mapping failures are deterministic defects, not stochastic
 *
 * @see docs/testing/live-execution-evaluation-phase2.md for the problem this solves
 */

import type { Task, TaskStep } from '../types/task';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Failure categories — each maps to a distinct remediation path.
 */
export type ResolveCategory =
  | 'mapping_missing'    // No resolvable args found in any known location
  | 'mapping_ambiguous'  // Multiple conflicting sources (reserved for future)
  | 'mapping_invalid';   // Value found but not in contract registry

/**
 * Successful resolution — contains gateway-ready action.
 */
export interface ResolveOk {
  readonly ok: true;
  readonly action: {
    type: string;
    parameters: Record<string, unknown>;
    timeout?: number;
  };
  /** Which source provided the args (for debugging/metrics) */
  readonly resolvedFrom: 'legacy' | 'requirementCandidate' | 'stepMetaArgs' | 'inferred';
  /** Full evidence of what was checked */
  readonly evidence: ResolveEvidence;
}

/**
 * Failed resolution — deterministic, non-retryable.
 */
export interface ResolveErr {
  readonly ok: false;
  readonly category: ResolveCategory;
  readonly reason: string;
  readonly evidence: ResolveEvidence;
  /** Always false — mapping failures are deterministic defects */
  readonly retryable: false;
  /** Structured failure code for logs/metrics: e.g. "mapping_missing:craft:item" */
  readonly failureCode: string;
}

export type ResolveResult = ResolveOk | ResolveErr;

/**
 * Evidence object — always included for debugging "why did this fail?"
 */
export interface ResolveEvidence {
  taskId: string;
  taskType: string;
  taskTitle: string;
  checked: {
    legacy_item?: unknown;
    legacy_block?: unknown;
    legacy_recipe?: unknown;
    legacy_resource?: unknown;
    legacy_target?: unknown;
    requirementCandidate_kind?: unknown;
    requirementCandidate_outputPattern?: unknown;
    requirementCandidate_quantity?: unknown;
    step0_leaf?: unknown;
    step0_args?: unknown;
    title_inference?: string;
  };
}

/**
 * Supported action types for resolution.
 */
export type ResolvableActionType =
  | 'craft'
  | 'mine'
  | 'gather'
  | 'explore'
  | 'move'
  | 'navigate'
  | 'place'
  | 'find';

// ─────────────────────────────────────────────────────────────────────────────
// Resolution Precedence (documented and deterministic)
// ─────────────────────────────────────────────────────────────────────────────
//
// For each task type, we check sources in this order:
//
// 1. Legacy parameters: task.parameters.item, task.parameters.block, etc.
//    - Supports older task creation paths
//
// 2. Requirement candidate: task.parameters.requirementCandidate
//    - Canonical shape from buildTaskFromRequirement()
//    - Contains: { kind, outputPattern, quantity }
//
// 3. Step meta.args: task.steps[0].meta.args
//    - Pre-derived by Sterling solvers at step-creation time
//    - Contains: { recipe, block, item, count, etc. }
//
// 4. Title inference: heuristic extraction from task.title
//    - Last resort fallback
//    - Only for well-known patterns like "Craft wooden_pickaxe"
//
// If none found → ResolveErr with category 'mapping_missing'
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map task.type to the canonical action type for resolution.
 */
const TASK_TYPE_TO_ACTION: Record<string, ResolvableActionType> = {
  crafting: 'craft',
  craft: 'craft',
  mining: 'mine',
  mine: 'mine',
  gathering: 'gather',
  gather: 'gather',
  collect: 'gather',
  exploration: 'explore',
  explore: 'explore',
  movement: 'move',
  move: 'move',
  navigation: 'navigate',
  navigate: 'navigate',
  placement: 'place',
  place: 'place',
  building: 'place',
  find: 'find',
  search: 'find',
};

/**
 * Main resolver entry point.
 *
 * @param task - The task to resolve action args from
 * @returns ResolveOk with gateway-ready action, or ResolveErr with failure details
 */
export function resolveActionFromTask(task: Task): ResolveResult {
  const actionType = TASK_TYPE_TO_ACTION[task.type?.toLowerCase() ?? ''];

  // Build evidence first — we'll populate as we check sources
  const evidence: ResolveEvidence = {
    taskId: task.id,
    taskType: task.type,
    taskTitle: task.title,
    checked: {},
  };

  // Unknown task type
  if (!actionType) {
    return {
      ok: false,
      category: 'mapping_invalid',
      reason: `Unknown task type: '${task.type}'`,
      evidence,
      retryable: false,
      failureCode: `mapping_invalid:unknown_type:${task.type}`,
    };
  }

  // Dispatch to type-specific resolver
  switch (actionType) {
    case 'craft':
      return resolveCraftAction(task, evidence);
    case 'mine':
      return resolveMineAction(task, evidence);
    case 'gather':
      return resolveGatherAction(task, evidence);
    case 'explore':
      return resolveExploreAction(task, evidence);
    case 'move':
      return resolveMoveAction(task, evidence);
    case 'navigate':
      return resolveNavigateAction(task, evidence);
    case 'place':
      return resolvePlaceAction(task, evidence);
    case 'find':
      return resolveFindAction(task, evidence);
    default:
      return {
        ok: false,
        category: 'mapping_invalid',
        reason: `Unhandled action type: '${actionType}'`,
        evidence,
        retryable: false,
        failureCode: `mapping_invalid:unhandled:${actionType}`,
      };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Type-Specific Resolvers
// ─────────────────────────────────────────────────────────────────────────────

function resolveCraftAction(task: Task, evidence: ResolveEvidence): ResolveResult {
  const params = task.parameters ?? {};
  const reqCandidate = params.requirementCandidate;
  const step0 = task.steps?.[0];
  const step0Args = step0?.meta?.args as Record<string, unknown> | undefined;

  // Populate evidence
  evidence.checked.legacy_item = params.item;
  evidence.checked.legacy_recipe = params.recipe;
  evidence.checked.requirementCandidate_kind = reqCandidate?.kind;
  evidence.checked.requirementCandidate_outputPattern = reqCandidate?.outputPattern;
  evidence.checked.requirementCandidate_quantity = reqCandidate?.quantity;
  evidence.checked.step0_leaf = step0?.meta?.leaf;
  evidence.checked.step0_args = step0Args;

  // 1. Legacy: task.parameters.item or task.parameters.recipe
  if (typeof params.item === 'string' && params.item && params.item !== 'item') {
    return {
      ok: true,
      action: {
        type: 'craft_item',
        parameters: {
          item: params.item,
          quantity: typeof params.quantity === 'number' ? params.quantity : 1,
        },
      },
      resolvedFrom: 'legacy',
      evidence,
    };
  }

  if (typeof params.recipe === 'string' && params.recipe && params.recipe !== 'item') {
    return {
      ok: true,
      action: {
        type: 'craft_recipe',
        parameters: {
          recipe: params.recipe,
          count: typeof params.count === 'number' ? params.count : (typeof params.quantity === 'number' ? params.quantity : 1),
        },
      },
      resolvedFrom: 'legacy',
      evidence,
    };
  }

  // 2. Requirement candidate: task.parameters.requirementCandidate.outputPattern
  if (reqCandidate && typeof reqCandidate.outputPattern === 'string' && reqCandidate.outputPattern) {
    return {
      ok: true,
      action: {
        type: 'craft_recipe',
        parameters: {
          recipe: reqCandidate.outputPattern,
          count: typeof reqCandidate.quantity === 'number' ? reqCandidate.quantity : 1,
        },
      },
      resolvedFrom: 'requirementCandidate',
      evidence,
    };
  }

  // 3. Step meta.args: task.steps[0].meta.args.recipe or .item
  if (step0Args) {
    const recipe = step0Args.recipe ?? step0Args.item;
    if (typeof recipe === 'string' && recipe) {
      return {
        ok: true,
        action: {
          type: 'craft_recipe',
          parameters: {
            recipe,
            count: typeof step0Args.count === 'number' ? step0Args.count : 1,
          },
        },
        resolvedFrom: 'stepMetaArgs',
        evidence,
      };
    }
  }

  // 4. Title inference (last resort)
  const titleItem = inferItemFromTitle(task.title, 'craft');
  if (titleItem) {
    evidence.checked.title_inference = titleItem;
    return {
      ok: true,
      action: {
        type: 'craft_recipe',
        parameters: {
          recipe: titleItem,
          count: 1,
        },
      },
      resolvedFrom: 'inferred',
      evidence,
    };
  }

  // Failed — no valid source found
  return {
    ok: false,
    category: 'mapping_missing',
    reason: 'No craftable item found in task.parameters.item, requirementCandidate.outputPattern, steps[0].meta.args, or title',
    evidence,
    retryable: false,
    failureCode: 'mapping_missing:craft:item',
  };
}

function resolveMineAction(task: Task, evidence: ResolveEvidence): ResolveResult {
  const params = task.parameters ?? {};
  const reqCandidate = params.requirementCandidate;
  const step0 = task.steps?.[0];
  const step0Args = step0?.meta?.args as Record<string, unknown> | undefined;

  // Populate evidence
  evidence.checked.legacy_block = params.block ?? params.blockType;
  evidence.checked.requirementCandidate_kind = reqCandidate?.kind;
  evidence.checked.requirementCandidate_outputPattern = reqCandidate?.outputPattern;
  evidence.checked.step0_leaf = step0?.meta?.leaf;
  evidence.checked.step0_args = step0Args;

  // 1. Legacy: task.parameters.block or task.parameters.blockType
  const legacyBlock = params.block ?? params.blockType;
  if (typeof legacyBlock === 'string' && legacyBlock && legacyBlock !== 'stone') {
    return {
      ok: true,
      action: {
        type: 'dig_block',
        parameters: {
          block: legacyBlock,
          position: params.position ?? 'nearby',
        },
        timeout: 30000,
      },
      resolvedFrom: 'legacy',
      evidence,
    };
  }

  // 2. Requirement candidate
  if (reqCandidate && typeof reqCandidate.outputPattern === 'string' && reqCandidate.outputPattern) {
    return {
      ok: true,
      action: {
        type: 'dig_block',
        parameters: {
          block: reqCandidate.outputPattern,
          position: 'nearby',
        },
        timeout: 30000,
      },
      resolvedFrom: 'requirementCandidate',
      evidence,
    };
  }

  // 3. Step meta.args
  if (step0Args) {
    const block = step0Args.block ?? step0Args.blockType;
    if (typeof block === 'string' && block) {
      return {
        ok: true,
        action: {
          type: 'dig_block',
          parameters: {
            block,
            position: step0Args.position ?? 'nearby',
          },
          timeout: 30000,
        },
        resolvedFrom: 'stepMetaArgs',
        evidence,
      };
    }
  }

  // 4. Title inference
  const titleBlock = inferItemFromTitle(task.title, 'mine');
  if (titleBlock) {
    evidence.checked.title_inference = titleBlock;
    return {
      ok: true,
      action: {
        type: 'dig_block',
        parameters: {
          block: titleBlock,
          position: 'nearby',
        },
        timeout: 30000,
      },
      resolvedFrom: 'inferred',
      evidence,
    };
  }

  // Failed
  return {
    ok: false,
    category: 'mapping_missing',
    reason: 'No mineable block found in task.parameters.block, requirementCandidate.outputPattern, steps[0].meta.args, or title',
    evidence,
    retryable: false,
    failureCode: 'mapping_missing:mine:block',
  };
}

function resolveGatherAction(task: Task, evidence: ResolveEvidence): ResolveResult {
  const params = task.parameters ?? {};
  const reqCandidate = params.requirementCandidate;
  const step0 = task.steps?.[0];
  const step0Args = step0?.meta?.args as Record<string, unknown> | undefined;

  // Populate evidence
  evidence.checked.legacy_resource = params.resource ?? params.item ?? params.target;
  evidence.checked.requirementCandidate_kind = reqCandidate?.kind;
  evidence.checked.requirementCandidate_outputPattern = reqCandidate?.outputPattern;
  evidence.checked.step0_leaf = step0?.meta?.leaf;
  evidence.checked.step0_args = step0Args;

  // 1. Legacy
  const legacyResource = params.resource ?? params.item ?? params.target;
  if (typeof legacyResource === 'string' && legacyResource) {
    return {
      ok: true,
      action: {
        type: 'gather',
        parameters: {
          resource: legacyResource,
          amount: typeof params.amount === 'number' ? params.amount : (typeof params.quantity === 'number' ? params.quantity : 1),
        },
      },
      resolvedFrom: 'legacy',
      evidence,
    };
  }

  // 2. Requirement candidate
  if (reqCandidate && typeof reqCandidate.outputPattern === 'string' && reqCandidate.outputPattern) {
    return {
      ok: true,
      action: {
        type: 'gather',
        parameters: {
          resource: reqCandidate.outputPattern,
          amount: typeof reqCandidate.quantity === 'number' ? reqCandidate.quantity : 1,
        },
      },
      resolvedFrom: 'requirementCandidate',
      evidence,
    };
  }

  // 3. Step meta.args
  if (step0Args) {
    const resource = step0Args.resource ?? step0Args.item ?? step0Args.target;
    if (typeof resource === 'string' && resource) {
      return {
        ok: true,
        action: {
          type: 'gather',
          parameters: {
            resource,
            amount: typeof step0Args.amount === 'number' ? step0Args.amount : 1,
          },
        },
        resolvedFrom: 'stepMetaArgs',
        evidence,
      };
    }
  }

  // 4. Title inference
  const titleResource = inferItemFromTitle(task.title, 'gather');
  if (titleResource) {
    evidence.checked.title_inference = titleResource;
    return {
      ok: true,
      action: {
        type: 'gather',
        parameters: {
          resource: titleResource,
          amount: 1,
        },
      },
      resolvedFrom: 'inferred',
      evidence,
    };
  }

  // Failed
  return {
    ok: false,
    category: 'mapping_missing',
    reason: 'No gatherable resource found in task.parameters.resource, requirementCandidate.outputPattern, steps[0].meta.args, or title',
    evidence,
    retryable: false,
    failureCode: 'mapping_missing:gather:resource',
  };
}

function resolveExploreAction(task: Task, evidence: ResolveEvidence): ResolveResult {
  const params = task.parameters ?? {};
  const step0 = task.steps?.[0];
  const step0Args = step0?.meta?.args as Record<string, unknown> | undefined;

  // Populate evidence
  evidence.checked.legacy_target = params.target ?? params.direction;
  evidence.checked.step0_leaf = step0?.meta?.leaf;
  evidence.checked.step0_args = step0Args;

  // Explore actions are more permissive — can run with minimal args
  const target = params.target ?? step0Args?.target ?? 'random';
  const radius = typeof params.radius === 'number' ? params.radius : (typeof step0Args?.radius === 'number' ? step0Args.radius : 32);

  return {
    ok: true,
    action: {
      type: 'explore',
      parameters: {
        target,
        radius,
        avoidHazards: params.avoidHazards ?? true,
      },
    },
    resolvedFrom: params.target ? 'legacy' : (step0Args?.target ? 'stepMetaArgs' : 'inferred'),
    evidence,
  };
}

function resolveMoveAction(task: Task, evidence: ResolveEvidence): ResolveResult {
  const params = task.parameters ?? {};
  const step0 = task.steps?.[0];
  const step0Args = step0?.meta?.args as Record<string, unknown> | undefined;

  // Populate evidence
  evidence.checked.legacy_target = params.distance ?? params.direction;
  evidence.checked.step0_leaf = step0?.meta?.leaf;
  evidence.checked.step0_args = step0Args;

  // Move actions are permissive
  const distance = typeof params.distance === 'number' ? params.distance : (typeof step0Args?.distance === 'number' ? step0Args.distance : 1);

  return {
    ok: true,
    action: {
      type: 'move_forward',
      parameters: {
        distance,
      },
    },
    resolvedFrom: params.distance ? 'legacy' : (step0Args?.distance ? 'stepMetaArgs' : 'inferred'),
    evidence,
  };
}

function resolveNavigateAction(task: Task, evidence: ResolveEvidence): ResolveResult {
  const params = task.parameters ?? {};
  const step0 = task.steps?.[0];
  const step0Args = step0?.meta?.args as Record<string, unknown> | undefined;

  // Populate evidence
  evidence.checked.legacy_target = params.target ?? params.position ?? params.destination;
  evidence.checked.step0_leaf = step0?.meta?.leaf;
  evidence.checked.step0_args = step0Args;

  // 1. Legacy position/target/destination
  const legacyTarget = params.target ?? params.position ?? params.destination;
  if (legacyTarget && typeof legacyTarget === 'object' && 'x' in legacyTarget) {
    return {
      ok: true,
      action: {
        type: 'navigate',
        parameters: {
          target: legacyTarget,
        },
      },
      resolvedFrom: 'legacy',
      evidence,
    };
  }

  // 2. Step meta.args
  if (step0Args) {
    const target = step0Args.target ?? step0Args.position ?? step0Args.destination;
    if (target && typeof target === 'object' && 'x' in target) {
      return {
        ok: true,
        action: {
          type: 'navigate',
          parameters: {
            target,
          },
        },
        resolvedFrom: 'stepMetaArgs',
        evidence,
      };
    }
  }

  // Failed — navigate requires a position
  return {
    ok: false,
    category: 'mapping_missing',
    reason: 'No navigation target found in task.parameters.target/position/destination or steps[0].meta.args',
    evidence,
    retryable: false,
    failureCode: 'mapping_missing:navigate:target',
  };
}

function resolvePlaceAction(task: Task, evidence: ResolveEvidence): ResolveResult {
  const params = task.parameters ?? {};
  const reqCandidate = params.requirementCandidate;
  const step0 = task.steps?.[0];
  const step0Args = step0?.meta?.args as Record<string, unknown> | undefined;

  // Populate evidence
  evidence.checked.legacy_block = params.block ?? params.item;
  evidence.checked.requirementCandidate_outputPattern = reqCandidate?.outputPattern;
  evidence.checked.step0_leaf = step0?.meta?.leaf;
  evidence.checked.step0_args = step0Args;

  // 1. Legacy
  const legacyBlock = params.block ?? params.item;
  if (typeof legacyBlock === 'string' && legacyBlock) {
    return {
      ok: true,
      action: {
        type: 'place_block',
        parameters: {
          block: legacyBlock,
          position: params.position ?? 'nearby',
        },
      },
      resolvedFrom: 'legacy',
      evidence,
    };
  }

  // 2. Requirement candidate
  if (reqCandidate && typeof reqCandidate.outputPattern === 'string' && reqCandidate.outputPattern) {
    return {
      ok: true,
      action: {
        type: 'place_block',
        parameters: {
          block: reqCandidate.outputPattern,
          position: 'nearby',
        },
      },
      resolvedFrom: 'requirementCandidate',
      evidence,
    };
  }

  // 3. Step meta.args
  if (step0Args) {
    const block = step0Args.block ?? step0Args.item;
    if (typeof block === 'string' && block) {
      return {
        ok: true,
        action: {
          type: 'place_block',
          parameters: {
            block,
            position: step0Args.position ?? 'nearby',
          },
        },
        resolvedFrom: 'stepMetaArgs',
        evidence,
      };
    }
  }

  // Failed
  return {
    ok: false,
    category: 'mapping_missing',
    reason: 'No placeable block found in task.parameters.block, requirementCandidate.outputPattern, or steps[0].meta.args',
    evidence,
    retryable: false,
    failureCode: 'mapping_missing:place:block',
  };
}

function resolveFindAction(task: Task, evidence: ResolveEvidence): ResolveResult {
  const params = task.parameters ?? {};
  const reqCandidate = params.requirementCandidate;
  const step0 = task.steps?.[0];
  const step0Args = step0?.meta?.args as Record<string, unknown> | undefined;

  // Populate evidence
  evidence.checked.legacy_target = params.target ?? params.resource ?? params.block;
  evidence.checked.requirementCandidate_outputPattern = reqCandidate?.outputPattern;
  evidence.checked.step0_leaf = step0?.meta?.leaf;
  evidence.checked.step0_args = step0Args;

  // 1. Legacy
  const legacyTarget = params.target ?? params.resource ?? params.block;
  if (typeof legacyTarget === 'string' && legacyTarget) {
    return {
      ok: true,
      action: {
        type: 'find_resource',
        parameters: {
          resource: legacyTarget,
          range: typeof params.range === 'number' ? params.range : 32,
        },
      },
      resolvedFrom: 'legacy',
      evidence,
    };
  }

  // 2. Requirement candidate
  if (reqCandidate && typeof reqCandidate.outputPattern === 'string' && reqCandidate.outputPattern) {
    return {
      ok: true,
      action: {
        type: 'find_resource',
        parameters: {
          resource: reqCandidate.outputPattern,
          range: 32,
        },
      },
      resolvedFrom: 'requirementCandidate',
      evidence,
    };
  }

  // 3. Step meta.args
  if (step0Args) {
    const resource = step0Args.resource ?? step0Args.target ?? step0Args.block;
    if (typeof resource === 'string' && resource) {
      return {
        ok: true,
        action: {
          type: 'find_resource',
          parameters: {
            resource,
            range: typeof step0Args.range === 'number' ? step0Args.range : 32,
          },
        },
        resolvedFrom: 'stepMetaArgs',
        evidence,
      };
    }
  }

  // Failed
  return {
    ok: false,
    category: 'mapping_missing',
    reason: 'No findable resource found in task.parameters.target, requirementCandidate.outputPattern, or steps[0].meta.args',
    evidence,
    retryable: false,
    failureCode: 'mapping_missing:find:resource',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Title Inference (last resort)
// ─────────────────────────────────────────────────────────────────────────────

const TITLE_PATTERNS: Record<string, RegExp[]> = {
  craft: [
    /craft\s+(\w+)/i,
    /make\s+(\w+)/i,
    /create\s+(\w+)/i,
  ],
  mine: [
    /mine\s+(\w+)/i,
    /dig\s+(\w+)/i,
    /break\s+(\w+)/i,
  ],
  gather: [
    /gather\s+(\w+)/i,
    /collect\s+(\w+)/i,
    /get\s+(\w+)/i,
    /acquire\s+(\w+)/i,
  ],
};

function inferItemFromTitle(title: string | undefined, actionType: string): string | undefined {
  if (!title) return undefined;

  const patterns = TITLE_PATTERNS[actionType];
  if (!patterns) return undefined;

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match && match[1]) {
      // Normalize: "oak logs" → "oak_log"
      const item = match[1]
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/s$/, ''); // Remove trailing 's'
      return item;
    }
  }

  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility: Check if a result is a mapping failure (deterministic, non-retryable)
// ─────────────────────────────────────────────────────────────────────────────

export function isMappingFailure(result: ResolveResult): result is ResolveErr {
  return !result.ok && result.category.startsWith('mapping_');
}

/**
 * Check if a failure code represents a deterministic (non-retryable) failure.
 *
 * Deterministic failures are defects in the task definition or execution setup,
 * NOT transient environmental conditions. Retrying them will always fail the same way.
 *
 * Categories:
 * - mapping_* : Parameter resolution failed (no valid args found)
 * - contract_* : Leaf contract violation (invalid args shape)
 * - postcondition_* : Leaf postcondition failed (state didn't change as expected)
 *
 * Non-deterministic (retryable) failures include:
 * - timeout, stuck, busy: transient execution state
 * - acquire.noneCollected: resource might spawn/become available
 * - navigate.unreachable: player might move, path might clear
 *
 * @param failureCode - The structured failure code from action result
 * @returns true if this failure should NOT trigger retry/backoff
 */
export function isDeterministicFailure(failureCode: string | undefined): boolean {
  if (!failureCode) return false;

  // Mapping failures are always deterministic (resolver couldn't find valid args)
  if (failureCode.startsWith('mapping_')) return true;

  // Contract violations are deterministic (args don't match leaf schema)
  if (failureCode.startsWith('contract_')) return true;

  // Postcondition failures are deterministic (action ran but didn't achieve expected state)
  // Note: This is a policy decision. Some postcondition failures *could* be retried,
  // but we treat them as deterministic to surface the real problem.
  if (failureCode.startsWith('postcondition_')) return true;

  // Explicit terminal codes from leaf-contracts taxonomy
  const TERMINAL_CODES = new Set([
    'invalid_input',
    'tool_invalid',
    'missing_ingredient',
    'inventory_full',
    'unloaded_chunks',
    'unknown_recipe',
    'unknown_block',
    'unknown_item',
  ]);

  // Check both exact match and suffix match (e.g., 'craft.missing_ingredient')
  const codeSuffix = failureCode.split('.').pop() ?? '';
  if (TERMINAL_CODES.has(failureCode) || TERMINAL_CODES.has(codeSuffix)) {
    return true;
  }

  return false;
}

/**
 * Create a deterministic failure response for the reactive executor.
 * This should be returned instead of dispatching to the gateway.
 */
export function createDeterministicFailure(err: ResolveErr): {
  success: false;
  shadow: false;
  error: string;
  failureCode: string;
  evidence: ResolveEvidence;
  retryable: false;
} {
  return {
    success: false,
    shadow: false,
    error: err.reason,
    failureCode: err.failureCode,
    evidence: err.evidence,
    retryable: false,
  };
}
