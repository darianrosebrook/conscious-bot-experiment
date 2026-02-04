/**
 * Boundary Tripwire Test: No Semantic Footholds
 *
 * This test enforces I-BOUNDARY-1 and I-BOUNDARY-2:
 * - Sterling is the ONLY source of semantic interpretation
 * - TypeScript must not define semantic enums, normalization maps, or classification logic
 *
 * This test MUST fail if anyone reintroduces semantic footholds after PR2.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { globSync } from 'glob';

const COGNITION_SRC = join(__dirname, '../..');

/**
 * Patterns that indicate semantic interpretation (forbidden in TS).
 * These are heuristics - they may produce false positives, but that's acceptable
 * for a boundary enforcement test (better to be strict).
 */
const FORBIDDEN_PATTERNS = [
  // Semantic vocabulary sets/maps
  {
    pattern: /const\s+(?:CANONICAL_|VALID_|ALLOWED_)[A-Z_]+\s*=\s*(?:new Set\(|{)/,
    description: 'Canonical/valid/allowed vocabulary set or map',
    example: 'const CANONICAL_ACTIONS = new Set([...])',
  },
  {
    pattern: /const\s+[A-Z_]+_(?:NORMALIZE|MAPPING|MAP)\s*=\s*{/,
    description: 'Normalization or mapping object',
    example: 'const ACTION_NORMALIZE_MAP = {...}',
  },

  // Intent/action classification enums
  {
    pattern: /(?:type|enum|interface)\s+Intent(?:Kind|Type|Label|Family)\s*[={]/,
    description: 'Intent classification type/enum',
    example: 'type IntentLabel = "explore" | "gather" | ...',
  },
  {
    pattern: /(?:type|enum)\s+(?:Canonical)?Action(?:Type|Kind)?\s*[={]/,
    description: 'Action classification type/enum',
    example: 'type ActionType = "collect" | "mine" | ...',
  },

  // Normalization functions
  {
    pattern: /function\s+normalize(?:Goal)?(?:Action|Intent|Verb)\s*\(/,
    description: 'Action/intent/verb normalization function',
    example: 'function normalizeGoalAction(action: string)',
  },
  {
    pattern: /(?:const|let)\s+normalize[A-Z]\w+\s*=\s*(?:function|\()/,
    description: 'Arrow/const normalization function',
    example: 'const normalizeAction = (action: string) => ...',
  },

  // Semantic validation/classification functions
  {
    pattern: /function\s+(?:is|validate|classify)(?:Valid|Canonical)?(?:Action|Intent|Goal)\s*\(/,
    description: 'Semantic validation/classification function',
    example: 'function isValidAction(action: string)',
  },
  {
    pattern: /function\s+(?:get|derive|infer)(?:Intent|Action|Semantic)\s*\(/,
    description: 'Semantic inference function',
    example: 'function deriveIntent(text: string)',
  },

  // Synonym/mapping dictionaries embedded in code
  {
    pattern: /(?:dig|break|chop|cut|mine)\s*:\s*['"](?:mine|collect|harvest)['"]/,
    description: 'Synonym mapping (verb normalization)',
    example: '"dig": "mine"',
  },

  // Goal canonicalization
  {
    pattern: /function\s+canonical(?:Goal)?Key\s*\(/,
    description: 'Goal canonicalization function',
    example: 'function canonicalGoalKey(action, target)',
  },
];

/**
 * Files that are explicitly allowed to have these patterns.
 * This allowlist should be VERY short and only include:
 * - This test file itself
 * - Deprecated stubs with error-throwing implementations
 * - Tests for the error-throwing stubs
 */
const ALLOWLIST = [
  'no-semantic-footholds.test.ts', // This test file
  'llm-output-sanitizer.ts', // Contains error-throwing stubs (canonicalGoalKey)
  'llm-output-sanitizer.test.ts', // Tests the error stubs
];

describe('Boundary Tripwire: No Semantic Footholds', () => {
  it('detects no semantic vocabulary sets or maps', () => {
    const violations = scanForViolations([
      FORBIDDEN_PATTERNS[0], // CANONICAL_/VALID_/ALLOWED_ sets
      FORBIDDEN_PATTERNS[1], // _NORMALIZE/_MAPPING maps
    ]);

    if (violations.length > 0) {
      const details = violations
        .map(v => `  ${v.file}:${v.line} - ${v.pattern.description}\n    > ${v.match}`)
        .join('\n');
      throw new Error(
        `Semantic vocabulary sets/maps detected (I-BOUNDARY-2 violation):\n${details}\n\n` +
        `Sterling owns semantic vocabulary. Remove these and use Sterling projections instead.`
      );
    }

    expect(violations).toHaveLength(0);
  });

  it('detects no intent/action classification enums', () => {
    const violations = scanForViolations([
      FORBIDDEN_PATTERNS[2], // IntentKind/Label/Type
      FORBIDDEN_PATTERNS[3], // ActionType/Kind
    ]);

    if (violations.length > 0) {
      const details = violations
        .map(v => `  ${v.file}:${v.line} - ${v.pattern.description}\n    > ${v.match}`)
        .join('\n');
      throw new Error(
        `Semantic classification types detected (I-BOUNDARY-2 violation):\n${details}\n\n` +
        `Sterling owns intent/action taxonomy. Use Sterling's IntentFamily/IntentType instead.`
      );
    }

    expect(violations).toHaveLength(0);
  });

  it('detects no normalization functions', () => {
    const violations = scanForViolations([
      FORBIDDEN_PATTERNS[4], // normalizeGoalAction, normalizeIntent, etc.
      FORBIDDEN_PATTERNS[5], // const normalizeX = ...
    ]);

    if (violations.length > 0) {
      const details = violations
        .map(v => `  ${v.file}:${v.line} - ${v.pattern.description}\n    > ${v.match}`)
        .join('\n');
      throw new Error(
        `Normalization functions detected (I-BOUNDARY-1 violation):\n${details}\n\n` +
        `Sterling normalizes language. TS may only extract verbatim markers.`
      );
    }

    expect(violations).toHaveLength(0);
  });

  it('detects no semantic validation/classification functions', () => {
    const violations = scanForViolations([
      FORBIDDEN_PATTERNS[6], // isValidAction, classifyIntent, etc.
      FORBIDDEN_PATTERNS[7], // deriveIntent, inferAction, etc.
    ]);

    if (violations.length > 0) {
      const details = violations
        .map(v => `  ${v.file}:${v.line} - ${v.pattern.description}\n    > ${v.match}`)
        .join('\n');
      throw new Error(
        `Semantic classification/inference detected (I-BOUNDARY-1 violation):\n${details}\n\n` +
        `Sterling classifies and infers semantics. TS cannot make semantic decisions.`
      );
    }

    expect(violations).toHaveLength(0);
  });

  it('detects no embedded synonym mappings', () => {
    const violations = scanForViolations([
      FORBIDDEN_PATTERNS[8], // "dig": "mine", etc.
    ]);

    if (violations.length > 0) {
      const details = violations
        .map(v => `  ${v.file}:${v.line} - ${v.pattern.description}\n    > ${v.match}`)
        .join('\n');
      throw new Error(
        `Embedded synonym mappings detected (I-BOUNDARY-2 violation):\n${details}\n\n` +
        `Sterling owns synonymy. Remove these mappings and use Sterling normalization.`
      );
    }

    expect(violations).toHaveLength(0);
  });

  it('detects no goal canonicalization', () => {
    const violations = scanForViolations([
      FORBIDDEN_PATTERNS[9], // canonicalGoalKey, etc.
    ]);

    if (violations.length > 0) {
      const details = violations
        .map(v => `  ${v.file}:${v.line} - ${v.pattern.description}\n    > ${v.match}`)
        .join('\n');
      throw new Error(
        `Goal canonicalization detected (I-BOUNDARY-3 violation):\n${details}\n\n` +
        `Sterling provides identity via committed_goal_prop_id. Use Sterling IDs, not TS canonicalization.`
      );
    }

    expect(violations).toHaveLength(0);
  });
});

// ============================================================================
// Scanner Implementation
// ============================================================================

interface Violation {
  file: string;
  line: number;
  match: string;
  pattern: (typeof FORBIDDEN_PATTERNS)[0];
}

function scanForViolations(patterns: (typeof FORBIDDEN_PATTERNS)[0][]): Violation[] {
  const violations: Violation[] = [];

  // Scan all .ts files in cognition/src (excluding __tests__, negative-corpus, node_modules, dist)
  const files = globSync('**/*.ts', {
    cwd: COGNITION_SRC,
    ignore: [
      'node_modules/**',
      'dist/**',
      'build/**',
      '**/*.test.ts',
      '**/*.spec.ts',
      '**/negative-corpus/**', // Deliberate violations for testing
    ],
    absolute: true,
  });

  for (const filePath of files) {
    const fileName = filePath.split('/').pop() || '';

    // Skip allowlisted files
    if (ALLOWLIST.some(allowed => fileName.includes(allowed))) {
      continue;
    }

    try {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        for (const pattern of patterns) {
          const match = line.match(pattern.pattern);
          if (match) {
            violations.push({
              file: filePath.replace(COGNITION_SRC, '').slice(1), // Relative path
              line: i + 1,
              match: line.trim(),
              pattern,
            });
          }
        }
      }
    } catch (error) {
      // Ignore read errors (binary files, etc.)
    }
  }

  return violations;
}
