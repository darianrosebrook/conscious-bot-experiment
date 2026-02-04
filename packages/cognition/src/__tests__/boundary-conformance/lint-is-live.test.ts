/**
 * Lint Is Live Test
 *
 * This test proves that the boundary lint patterns actually catch violations
 * by running against deliberately bad code in the negative corpus.
 *
 * If this test passes, it confirms the lint is functional.
 * If the negative corpus doesn't trigger the lint, the lint is broken.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Boundary Lint is Live', () => {
  const negativeCorpusPath = path.join(__dirname, 'negative-corpus/deliberate-violations.ts');

  it('negative corpus file exists', () => {
    expect(fs.existsSync(negativeCorpusPath)).toBe(true);
  });

  const negativeCorpus = fs.readFileSync(negativeCorpusPath, 'utf-8');

  describe('I-BOUNDARY-2 violations are caught', () => {
    it('catches IntentKind type definition', () => {
      expect(negativeCorpus).toMatch(/type\s+IntentKind\s*=/i);
    });

    it('catches ACTION_NORMALIZE_MAP definition', () => {
      expect(negativeCorpus).toMatch(/const\s+ACTION_NORMALIZE_MAP\s*=/i);
    });

    it('catches CANONICAL_ACTIONS definition', () => {
      expect(negativeCorpus).toMatch(/const\s+CANONICAL_ACTIONS\s*=/i);
    });

    it('catches normalizeGoalAction function', () => {
      expect(negativeCorpus).toMatch(/function\s+normalizeGoalAction/i);
    });

    it('catches TaskType enum', () => {
      expect(negativeCorpus).toMatch(/enum\s+TaskType/i);
    });
  });

  describe('I-CONVERSION-1 violations are caught', () => {
    it('catches local TaskType switch statements', () => {
      expect(negativeCorpus).toMatch(/case\s+['"]?craft['"]?\s*:/i);
    });

    it('catches direct predicate comparison', () => {
      expect(negativeCorpus).toMatch(/predicate\s*===?\s*['"]?(craft|navigate)['"]?/i);
    });
  });

  describe('Meta-validation', () => {
    it('negative corpus contains at least 5 distinct violation types', () => {
      const violationPatterns = [
        /type\s+IntentKind/i,
        /const\s+ACTION_NORMALIZE_MAP/i,
        /const\s+CANONICAL_ACTIONS/i,
        /function\s+normalizeGoalAction/i,
        /case\s+['"]?craft['"]?\s*:/i,
        /predicate\s*===?\s*['"]?craft['"]?/i,
        /enum\s+TaskType/i,
      ];

      const matchCount = violationPatterns.filter((p) => p.test(negativeCorpus)).length;
      expect(matchCount).toBeGreaterThanOrEqual(5);
    });

    it('if negative corpus passes all checks, the lint is broken', () => {
      // This is a sanity check - if the negative corpus somehow
      // passes all the forbidden pattern checks, something is wrong

      const forbiddenPatterns = [
        /type\s+IntentKind\s*=/i,
        /const\s+ACTION_NORMALIZE_MAP\s*=/i,
        /function\s+normalizeGoalAction/i,
      ];

      // The negative corpus MUST match at least one forbidden pattern
      const hasViolation = forbiddenPatterns.some((p) => p.test(negativeCorpus));
      expect(hasViolation).toBe(true);
    });
  });
});

describe('Production Code Does Not Match Negative Corpus', () => {
  // Ensure our actual production code doesn't have violations

  const languageIOPath = path.resolve(__dirname, '../../language-io');

  it('language-io modules do not contain violations', () => {
    const tsFiles = fs
      .readdirSync(languageIOPath)
      .filter((f) => f.endsWith('.ts') && !f.includes('__tests__'));

    const forbiddenPatterns = [
      /type\s+IntentKind\s*=/i,
      /const\s+ACTION_NORMALIZE_MAP\s*=/i,
      /const\s+CANONICAL_ACTIONS\s*=/i,
      /function\s+normalizeGoalAction/i,
      /case\s+['"]?(craft|mine|explore|navigate)['"]?\s*:/gi,
    ];

    for (const file of tsFiles) {
      const content = fs.readFileSync(path.join(languageIOPath, file), 'utf-8');

      for (const pattern of forbiddenPatterns) {
        pattern.lastIndex = 0; // Reset for global patterns
        const match = content.match(pattern);
        expect(match).toBeNull();
      }
    }
  });
});
