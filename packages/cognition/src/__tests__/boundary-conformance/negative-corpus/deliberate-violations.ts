/**
 * DELIBERATE BOUNDARY VIOLATIONS - DO NOT FIX
 *
 * This file intentionally contains boundary violations to prove
 * the lint catches them. These are test cases, not production code.
 *
 * Each violation is tagged with the invariant it breaks.
 */

// =============================================================================
// Violation 1: I-BOUNDARY-2 - Local semantic type definition
// =============================================================================

// This type definition should NOT exist in TS - Sterling owns semantic types
type IntentKind = 'plan' | 'navigate' | 'craft' | 'explore' | 'gather';

// =============================================================================
// Violation 2: I-BOUNDARY-2 - Local action mapping (normalize map)
// =============================================================================

// This mapping should NOT exist in TS - Sterling normalizes actions
const ACTION_NORMALIZE_MAP = {
  dig: 'mine',
  make: 'craft',
  get: 'collect',
  go: 'navigate',
  look: 'find',
};

// =============================================================================
// Violation 3: I-BOUNDARY-2 - Canonical actions allowlist
// =============================================================================

// This should NOT exist in TS - Sterling validates actions
const CANONICAL_ACTIONS = new Set(['craft', 'mine', 'explore', 'navigate', 'build']);

// =============================================================================
// Violation 4: I-BOUNDARY-2 - normalizeGoalAction function
// =============================================================================

// This function should NOT exist in TS - Sterling normalizes
function normalizeGoalAction(raw: string): string {
  const lower = raw.toLowerCase();
  return ACTION_NORMALIZE_MAP[lower as keyof typeof ACTION_NORMALIZE_MAP] ?? lower;
}

// =============================================================================
// Violation 5: I-CONVERSION-1 - Local predicate→TaskType switch
// =============================================================================

// This pattern MUST NOT exist in TS - Sterling resolves task types
function badConvertToTask(predicate: string) {
  switch (predicate) {
    case 'craft':
      return { type: 'CRAFT_TASK', domain: 'planning' };
    case 'mine':
      return { type: 'MINE_TASK', domain: 'resource' };
    case 'explore':
      return { type: 'EXPLORE_TASK', domain: 'navigation' };
    default:
      return { type: 'GENERIC_TASK', domain: null };
  }
}

// =============================================================================
// Violation 6: I-CONVERSION-1 - Direct predicate string comparison
// =============================================================================

// This pattern MUST NOT exist in TS - Sterling classifies
function badRouting(predicate: string) {
  if (predicate === 'craft') {
    return 'planning_domain';
  }
  if (predicate === 'navigate') {
    return 'navigation_domain';
  }
  return 'default_domain';
}

// =============================================================================
// Violation 7: I-BOUNDARY-2 - TaskType enum with action variants
// =============================================================================

// This enum MUST NOT exist in TS - Sterling owns the taxonomy
enum TaskType {
  CRAFT = 'CRAFT',
  MINE = 'MINE',
  EXPLORE = 'EXPLORE',
  NAVIGATE = 'NAVIGATE',
  BUILD = 'BUILD',
  COLLECT = 'COLLECT',
}

// Export to prevent tree-shaking
export type { IntentKind };
export {
  ACTION_NORMALIZE_MAP,
  CANONICAL_ACTIONS,
  normalizeGoalAction,
  badConvertToTask,
  badRouting,
  TaskType,
};
