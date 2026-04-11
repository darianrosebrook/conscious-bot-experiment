/**
 * Exhaustive blocked-reason usage test.
 *
 * Scans production source files for all `blocked_*` string literals and ensures
 * each one is either:
 * (a) Present in BLOCKED_REASON_REGISTRY (expansion taxonomy), or
 * (b) Documented as belonging to a separate taxonomy (DecisionReason, HoldAction, IdleReason)
 *
 * This closes the "typo compiles but becomes unclassified" hole: a developer adding
 * a new `blocked_foo` literal that isn't in any known taxonomy will fail this test.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { globSync } from 'glob';
import { BLOCKED_REASON_REGISTRY } from '../../task-lifecycle/task-block-evaluator';

// ============================================================================
// Separate taxonomies: blocked_* literals that are NOT expansion reasons
// ============================================================================
// These live in type-level unions (DecisionReason, HoldAction, IdleReason) and
// are intentionally outside the BLOCKED_REASON_REGISTRY. Each entry documents
// where it's defined and why it's not in the registry.

const SEPARATE_TAXONOMY_REASONS: Record<string, { taxonomy: string; definedIn: string }> = {
  // thought-to-task-converter.ts DecisionReason union
  blocked_guard: {
    taxonomy: 'DecisionReason',
    definedIn: 'task-integration/thought-to-task-converter.ts',
  },
  blocked_not_eligible: {
    taxonomy: 'DecisionReason',
    definedIn: 'task-integration/thought-to-task-converter.ts',
  },

  // goal-hold-manager.ts HoldAction union
  blocked_manual_pause: {
    taxonomy: 'HoldAction',
    definedIn: 'goals/goal-hold-manager.ts',
  },

  // modular-server.ts IdleReason union
  // Note: registry has `waiting_on_prereq`; this is the idle-level equivalent
  blocked_on_prereq: {
    taxonomy: 'IdleReason',
    definedIn: 'modular-server.ts',
  },

  // Sterling-side block reason (emitted by intent_reducer_v1 when the
  // reducer cannot commit a goal). Surfaces via the language-io client's
  // ReduceResult.blockReason field. TS side only consumes it.
  blocked_no_action: {
    taxonomy: 'SterlingBlockReason',
    definedIn: 'sterling/python/core/linguistics/reducers/intent_reducer_v1.py',
  },

  // golden-run-recorder.ts feature flag (not a blocked reason at all)
  blocked_throttle_v1: {
    taxonomy: 'FeatureFlag',
    definedIn: 'golden-run-recorder.ts',
  },

  // modular-server.ts executor action validation (invalid leaf args)
  blocked_invalid_action_args: {
    taxonomy: 'ExecutorActionValidation',
    definedIn: 'planning/src/modular-server.ts',
  },

  // task-integration.ts expansion-failure code. Returned when
  // sterlingExecutorService.buildResolveRequest(...) returns null because
  // the bot state snapshot isn't available at expansion time. Used as a
  // `blocked_reason` on golden-run expansion records and as a
  // task-level block reason, but is NOT a BLOCKED_REASON_REGISTRY entry
  // because the registry is for task-block-evaluator ingestion codes,
  // not for expansion-layer infra failures.
  blocked_bot_context_unavailable: {
    taxonomy: 'ExpansionBlockReason',
    definedIn: 'task-integration.ts',
  },

  // sterling-planner.ts uses this as a `meta.source` provenance tag on
  // TaskStep objects generated in response to a Sterling `blocked_info`
  // signal (missing prereqs identified by the solver). It identifies
  // the origin of the step, not a blocked-reason code — the scanner
  // matches it only because the string literally starts with `blocked_`.
  blocked_info_prereq: {
    taxonomy: 'PrereqSourceTag',
    definedIn: 'task-integration/sterling-planner.ts',
  },

  // idle-engine/idle-episode-payload.ts uses `blocked_tasks` as a JSON
  // field name on the IDLE_EPISODE_V1 wire contract (snake_case to match
  // Sterling's Python parser expectations). The scanner catches it
  // because the JSDoc at the top of the file references the field in
  // a backtick-wrapped inline code block. It's a payload field name,
  // not a blocked-reason code, and is forwarded to Sterling's idle-
  // episode reducer as part of executor state passthrough.
  blocked_tasks: {
    taxonomy: 'PayloadFieldName',
    definedIn: 'idle-engine/idle-episode-payload.ts',
  },
};

// ============================================================================
// Source file scanning
// ============================================================================

// packages/planning (3 levels up from __tests__)
const PLANNING_PKG_ROOT = join(__dirname, '..', '..', '..');
// packages/ (4 levels up — scan sibling packages too for cross-package usage)
const PACKAGES_ROOT = join(__dirname, '..', '..', '..', '..');

/**
 * Extract all `blocked_*` string literals from TypeScript source files.
 * Matches both single-quoted and double-quoted strings.
 * Excludes test files and node_modules.
 */
function extractBlockedReasonLiterals(): Map<string, string[]> {
  const sourceFiles = globSync('*/src/**/*.ts', {
    cwd: PACKAGES_ROOT,
    ignore: ['**/__tests__/**', '**/*.test.ts', '**/*.spec.ts', '**/node_modules/**'],
  });

  const reasonToFiles = new Map<string, string[]>();
  const pattern = /['"`](blocked_[a-z_]+)['"`]/g;

  for (const relPath of sourceFiles) {
    const absPath = join(PACKAGES_ROOT, relPath);
    const content = readFileSync(absPath, 'utf-8');
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(content)) !== null) {
      const reason = match[1];
      if (!reasonToFiles.has(reason)) {
        reasonToFiles.set(reason, []);
      }
      reasonToFiles.get(reason)!.push(relPath);
    }
  }

  return reasonToFiles;
}

// ============================================================================
// Tests
// ============================================================================

describe('exhaustive blocked-reason usage', () => {
  const usedReasons = extractBlockedReasonLiterals();

  it('finds at least 10 blocked_* literals in production code (sanity check)', () => {
    expect(usedReasons.size).toBeGreaterThanOrEqual(10);
  });

  it('every blocked_* literal in production code is in registry OR separate taxonomy', () => {
    const unaccounted: string[] = [];

    for (const [reason, files] of usedReasons) {
      const inRegistry = reason in BLOCKED_REASON_REGISTRY;
      const inSeparateTaxonomy = reason in SEPARATE_TAXONOMY_REASONS;

      if (!inRegistry && !inSeparateTaxonomy) {
        unaccounted.push(`${reason} (used in: ${files.join(', ')})`);
      }
    }

    expect(
      unaccounted,
      `Found blocked_* literals not in any known taxonomy:\n${unaccounted.join('\n')}\n\n` +
      'Fix: add to BLOCKED_REASON_REGISTRY in task-block-evaluator.ts, ' +
      'or add to SEPARATE_TAXONOMY_REASONS in this test if it belongs to a different taxonomy.'
    ).toHaveLength(0);
  });

  it('separate taxonomy entries document their source file', () => {
    for (const [reason, meta] of Object.entries(SEPARATE_TAXONOMY_REASONS)) {
      expect(meta.taxonomy.length).toBeGreaterThan(0);
      expect(meta.definedIn.length).toBeGreaterThan(0);
    }
  });

  it('separate taxonomy entries do not overlap with registry', () => {
    for (const reason of Object.keys(SEPARATE_TAXONOMY_REASONS)) {
      expect(
        BLOCKED_REASON_REGISTRY[reason],
        `"${reason}" is in SEPARATE_TAXONOMY_REASONS but also in BLOCKED_REASON_REGISTRY — pick one`
      ).toBeUndefined();
    }
  });

  it('registry reasons used in code are actually found by the scanner', () => {
    // Spot-check: these core reasons MUST appear in production code
    const mustBeUsed = [
      'blocked_executor_unavailable',
      'blocked_routing_disabled',
      'blocked_missing_digest',
      'blocked_crafting_no_goal_item',
    ];

    for (const reason of mustBeUsed) {
      expect(
        usedReasons.has(reason),
        `Expected "${reason}" to appear in production source but scanner didn't find it. ` +
        'Check that the scanner glob covers the right files.'
      ).toBe(true);
    }
  });
});
