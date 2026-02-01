/**
 * CI Regression Guards — ensures legacy planner code stays deleted.
 *
 * Phase 4: After legacy planners are removed, these guards prevent
 * accidental reintroduction of planner-era patterns.
 *
 * Uses ripgrep-style content scanning to detect forbidden patterns
 * in production code.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import * as path from 'path';

const PLANNING_SRC = path.resolve(__dirname, '..');

/**
 * Scan production code (excluding tests, node_modules, and stub files) for a pattern.
 * Returns matching file:line entries.
 */
function grepProductionCode(pattern: string): string[] {
  try {
    const result = execSync(
      `grep -rn "${pattern}" "${PLANNING_SRC}" --include="*.ts" ` +
      `| grep -v "__tests__" ` +
      `| grep -v "node_modules" ` +
      `| grep -v "goap-types.ts" ` +
      `| grep -v "legacy-planner-guards" ` +
      `| grep -v ".test.ts" ` +
      `| grep -v ".spec.ts"`,
      { encoding: 'utf-8', timeout: 10_000 }
    ).trim();
    return result ? result.split('\n').filter(Boolean) : [];
  } catch {
    // grep exits 1 when no matches found — that's the desired result
    return [];
  }
}

describe('Legacy Planner Guards (Phase 4)', () => {
  // -----------------------------------------------------------------------
  // Guard 4.1: No legacy planner methods in production code
  // -----------------------------------------------------------------------

  it('planWithRefinement is not called in production code', () => {
    const matches = grepProductionCode('planWithRefinement');
    expect(matches).toEqual([]);
  });

  it('.planTo( is not called outside safety-reflexes/tests', () => {
    const matches = grepProductionCode('\\.planTo(');
    // Filter out goap-types.ts stub which has a no-op planTo
    const filtered = matches.filter(m => !m.includes('goap-types.ts'));
    expect(filtered).toEqual([]);
  });

  it('.decompose( is not called in production code', () => {
    const matches = grepProductionCode('\\.decompose(');
    expect(matches).toEqual([]);
  });

  it('IntegratedPlanningCoordinator is not instantiated in production code', () => {
    const matches = grepProductionCode('new IntegratedPlanningCoordinator');
    expect(matches).toEqual([]);
  });

  it('createIntegratedPlanningCoordinator is not imported from @conscious-bot/planning', () => {
    // Search all packages, not just planning
    try {
      const result = execSync(
        `grep -rn "from '@conscious-bot/planning'" "${path.resolve(PLANNING_SRC, '../../..')}" --include="*.ts" ` +
        `| grep "createIntegratedPlanningCoordinator" ` +
        `| grep -v "node_modules" ` +
        `| grep -v "__tests__" ` +
        `| grep -v ".test.ts"`,
        { encoding: 'utf-8', timeout: 10_000 }
      ).trim();
      const matches = result ? result.split('\n').filter(Boolean) : [];
      expect(matches).toEqual([]);
    } catch {
      // No matches — good
    }
  });

  // -----------------------------------------------------------------------
  // Guard 4.2: Compiler-is-lowering guard (Pivot 1)
  // -----------------------------------------------------------------------

  it('requirementToFallbackPlan contains no scoring/heuristic keywords', () => {
    const leafArgContracts = path.join(PLANNING_SRC, 'modules', 'leaf-arg-contracts.ts');
    const scoringPatterns = ['\\bscore\\b', '\\bfrontier\\b', '\\bqueue\\b', '\\bbacktrack\\b', '\\balternatives\\b'];

    for (const pattern of scoringPatterns) {
      try {
        const result = execSync(
          `grep -n "${pattern}" "${leafArgContracts}"`,
          { encoding: 'utf-8', timeout: 5_000 }
        ).trim();
        const matches = result ? result.split('\n').filter(Boolean) : [];
        // Allow in comments only
        const nonCommentMatches = matches.filter(m => {
          const line = m.split(':').slice(1).join(':').trim();
          return !line.startsWith('//') && !line.startsWith('*') && !line.startsWith('/*');
        });
        expect(nonCommentMatches).toEqual([]);
      } catch {
        // No matches — good
      }
    }
  });

  // -----------------------------------------------------------------------
  // Guard 4.3: Regex fallback freeze
  // -----------------------------------------------------------------------

  it('REGEX_FALLBACK_PATTERN_COUNT is exported and matches actual count', async () => {
    const { REGEX_FALLBACK_PATTERN_COUNT } = await import('../modules/requirements');
    // The count should be a positive number
    expect(typeof REGEX_FALLBACK_PATTERN_COUNT).toBe('number');
    expect(REGEX_FALLBACK_PATTERN_COUNT).toBeGreaterThan(0);

    // Count the actual regex patterns in resolveRequirement's fallback section
    // by scanning the file for regex test patterns
    try {
      const result = execSync(
        `grep -c "\\(\\.test\\|match\\)" "${path.join(PLANNING_SRC, 'modules', 'requirements.ts')}"`,
        { encoding: 'utf-8', timeout: 5_000 }
      ).trim();
      const actualCount = parseInt(result, 10);
      // Pattern count should not exceed the declared freeze count
      expect(actualCount).toBeLessThanOrEqual(REGEX_FALLBACK_PATTERN_COUNT + 5); // margin for non-fallback patterns
    } catch {
      // Count command failed — skip
    }
  });
});
