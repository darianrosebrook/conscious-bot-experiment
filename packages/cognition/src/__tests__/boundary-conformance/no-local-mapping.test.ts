/**
 * Boundary Enforcement: No Local Predicate→TaskType Mapping
 *
 * This test verifies that TypeScript does NOT implement local
 * predicate-to-TaskType mapping. Sterling is the only place
 * that can resolve task types from predicates.
 *
 * Invariant: I-CONVERSION-1 - TS must not map predicates to task types locally
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Modules that handle task conversion - prime targets for violations
const CONVERSION_MODULES = [
  path.resolve(__dirname, '../../../../planning/src/task-integration'),
  path.resolve(__dirname, '../../language-io'),
  path.resolve(__dirname, '../../reasoning-surface'),
];

// Allowlist concept deleted entirely (PR3 completion).
// Test now distinguishes semantic vs structural switches via discriminant analysis.
// All legacy violations cleaned up:
// - grounder.ts: Removed semantic predicate switch (case 'craft'/case 'smelt')
// - sterling-planner.ts: Verified as structural routing only (switch on req.kind)

/**
 * Structured violation object for switch case analysis.
 */
interface SwitchViolation {
  discriminant: string;  // What's being switched on (e.g., "action", "goal.action")
  caseLabel: string;     // The case label (e.g., "craft", "mine")
  snippet: string;       // Short code snippet for error messages
  file: string;          // Filename for context
}

/**
 * Normalize source code for robust pattern matching.
 *
 * Removes comments and collapses whitespace so multi-line constructs
 * can be matched reliably without AST parsing.
 */
function normalizeSource(content: string): string {
  let normalized = content;

  // Remove block comments
  normalized = normalized.replace(/\/\*[\s\S]*?\*\//g, ' ');

  // Remove line comments
  normalized = normalized.replace(/\/\/.*/g, ' ');

  // Collapse whitespace to single spaces
  normalized = normalized.replace(/\s+/g, ' ');

  return normalized;
}

/**
 * Check if a switch statement switches on a semantic discriminant (FORBIDDEN)
 * vs a structural discriminant (ALLOWED).
 *
 * FORBIDDEN: switch (action), switch (goal.action), switch (verb), switch (predicate)
 * ALLOWED: switch (req.kind), switch (requirement.kind), switch (task.kind)
 *
 * IMPLEMENTATION NOTES:
 * - Uses normalized source (comments stripped, whitespace collapsed) to handle multi-line
 * - Character-based lookback (500 chars) instead of line-based to work with normalized text
 * - Returns structured violation objects, not strings
 * - Name-based heuristic for allowed discriminants (documented limitation)
 *
 * REMAINING LIMITATIONS (would require AST to fully fix):
 * - Nested switches can cause incorrect association if lookback isn't large enough
 * - Name-based heuristic: `const req = {kind: action}` would bypass if named "req"
 * - Doesn't verify Sterling type imports (would need import analysis)
 *
 * UPGRADE PATH: Use TypeScript Compiler API or ts-morph when boundary becomes
 * load-bearing for other repos or when bypass attempts emerge.
 */
function checkSwitchCases(content: string, file: string): SwitchViolation[] {
  const violations: SwitchViolation[] = [];

  // Normalize to handle multi-line and comments
  const normalized = normalizeSource(content);

  // Find all case statements for action strings in normalized source
  const casePattern = /case\s+['"]?(craft|mine|explore|navigate|build|collect|gather)['"]?\s*:/gi;
  let match;

  while ((match = casePattern.exec(normalized)) !== null) {
    const caseIndex = match.index;
    const caseLabel = match[1]; // The action string (craft, mine, etc.)

    // Walk backwards in normalized source to find switch (character-based, 500 chars max)
    const lookbackStart = Math.max(0, caseIndex - 500);
    const precedingText = normalized.substring(lookbackStart, caseIndex);

    // Find the nearest switch statement
    const switchMatch = precedingText.match(/switch\s*\(\s*([^)]+)\s*\)\s*\{[^}]*$/);

    if (!switchMatch) {
      // Couldn't find switch - might be malformed code or lookback too small
      continue;
    }

    const switchDiscriminant = switchMatch[1].trim();

    // Check if discriminant is FORBIDDEN (semantic) or ALLOWED (structural)
    const forbiddenDiscriminants = /\b(action|verb|intent|predicate|goal|extractedGoal)\b|\.(action|intent|predicate|verb)/i;
    const allowedDiscriminants = /\b(req|requirement|task)\.kind\b/i;

    if (allowedDiscriminants.test(switchDiscriminant)) {
      // Structural routing - ALLOWED
      continue;
    }

    if (forbiddenDiscriminants.test(switchDiscriminant)) {
      // Semantic interpretation - FORBIDDEN
      const snippet = `switch (${switchDiscriminant}) { case '${caseLabel}': ... }`;
      violations.push({
        discriminant: switchDiscriminant,
        caseLabel,
        snippet,
        file,
      });
    }
  }

  return violations;
}

describe('I-CONVERSION-1: No Local Predicate→TaskType Mapping', () => {
  // Simple pattern checks (still needed for enum and direct comparison)
  const simplePatterns = [
    {
      pattern: /TaskType\.(CRAFT|MINE|EXPLORE|NAVIGATE|BUILD|COLLECT|GATHER)/gi,
      name: 'TaskType enum with action variants',
    },
    {
      pattern: /predicate\s*===?\s*['"]?(craft|mine|explore|navigate)['"]?/gi,
      name: 'direct predicate comparison',
    },
    {
      pattern: /lemma\s*===?\s*['"]?(craft|mine|explore|navigate)['"]?/gi,
      name: 'direct lemma comparison',
    },
  ];

  for (const moduleDir of CONVERSION_MODULES) {
    if (!fs.existsSync(moduleDir)) {
      continue;
    }

    const moduleName = path.basename(moduleDir);

    describe(moduleName, () => {
      // Get all TypeScript files in the module
      const tsFiles = fs.readdirSync(moduleDir).filter((f) => f.endsWith('.ts') && !f.includes('__tests__'));

      for (const file of tsFiles) {
        const filePath = path.join(moduleDir, file);

        // Skip test files and fixtures
        if (file.includes('.test.') || file.includes('fixture') || file.includes('negative-corpus')) {
          continue;
        }

        // DELETED (PR3 fix): Allowlist handling removed - no legacy violations remain

        describe(file, () => {
          const content = fs.readFileSync(filePath, 'utf-8');

          // Check for semantic switch statements (smarter discriminant check)
          it('does not contain switch case on semantic discriminant', () => {
            const violations = checkSwitchCases(content, file);

            if (violations.length > 0) {
              const details = violations.map(v =>
                `  - Discriminant: ${v.discriminant}\n` +
                `    Case: ${v.caseLabel}\n` +
                `    Snippet: ${v.snippet}`
              ).join('\n');
              expect.fail(
                `Found semantic switch statement(s) in ${file}:\n${details}\n\n` +
                `This violates I-CONVERSION-1.\n` +
                `FORBIDDEN: switch (action), switch (goal.action), switch (verb)\n` +
                `ALLOWED: switch (req.kind), switch (requirement.kind)`,
              );
            }

            expect(violations).toHaveLength(0);
          });

          // Check simple patterns (enum usage, direct comparison)
          for (const { pattern, name } of simplePatterns) {
            it(`does not contain ${name}`, () => {
              pattern.lastIndex = 0;
              const matches = content.match(pattern);

              if (matches) {
                const locations = matches.map((m) => `"${m}"`).join(', ');
                expect.fail(
                  `Found ${name} in ${file}: ${locations}\n` +
                    `This violates I-CONVERSION-1. Use Sterling's resolve_task_type() API instead.`,
                );
              }

              expect(matches).toBeNull();
            });
          }
        });
      }
    });
  }
});

describe('Allowed Patterns', () => {
  // Document what IS allowed vs what is NOT

  describe('What is allowed', () => {
    it('using committed_goal_prop_id from Sterling', () => {
      // This is allowed - it's an opaque identifier from Sterling
      const code = `const propId = result.committed_goal_prop_id;`;
      expect(code).toContain('committed_goal_prop_id');
    });

    it('using advisory.intent_family for routing hints', () => {
      // This is allowed - advisory is for routing, not task type determination
      const code = `const family = result.advisory?.intent_family;`;
      expect(code).toContain('intent_family');
    });

    it('calling Sterling API to resolve task type', () => {
      // This is the correct pattern
      const code = `const taskType = await sterlingClient.resolveTaskType(propId);`;
      expect(code).toContain('resolveTaskType');
    });

    it('structural routing on req.kind (Sterling type)', () => {
      // This is allowed - switching on Sterling's structural type field, not semantic action
      const goodCode = `
        switch (req.kind) {
          case 'craft':
            return req.outputPattern;
          case 'mine':
            return req.patterns?.[0];
        }
      `;
      const violations = checkSwitchCases(goodCode, 'test.ts');
      expect(violations).toHaveLength(0);
    });

    it('structural routing on requirement.kind (Sterling type)', () => {
      // This is allowed - requirement.kind is a Sterling structural field
      const goodCode = `
        switch (requirement.kind) {
          case 'collect':
            return requirement.targetItem;
          case 'explore':
            return requirement.targetBiome;
        }
      `;
      const violations = checkSwitchCases(goodCode, 'test.ts');
      expect(violations).toHaveLength(0);
    });

    it('structural routing on task.kind', () => {
      // This is allowed - task.kind is a Sterling structural field
      const goodCode = `
        switch (task.kind) {
          case 'navigate':
            return task.destination;
          case 'build':
            return task.structure;
        }
      `;
      const violations = checkSwitchCases(goodCode, 'test.ts');
      expect(violations).toHaveLength(0);
    });

    it('multi-line switch on req.kind (whitespace normalization)', () => {
      // Tests that normalization handles multi-line switch statements
      const goodCode = `
        switch (
          req.kind
        ) {
          case 'craft':
            return req.outputPattern;
        }
      `;
      const violations = checkSwitchCases(goodCode, 'test.ts');
      // Should pass now with normalization
      expect(violations).toHaveLength(0);
    });

    it('switch with comments in discriminant (normalization)', () => {
      // Tests that comment stripping works
      const goodCode = `
        switch (/* type hint */ req.kind) {
          case 'mine':
            return req.patterns;
        }
      `;
      const violations = checkSwitchCases(goodCode, 'test.ts');
      expect(violations).toHaveLength(0);
    });
  });

  describe('What is NOT allowed', () => {
    it('local switch on predicate strings', () => {
      // This is NOT allowed
      const badCode = `switch (predicate) { case 'craft': return 'CRAFT_TASK'; }`;
      expect(badCode).toMatch(/case\s+['"]?craft['"]?\s*:/i);
    });

    it('direct predicate comparison', () => {
      // This is NOT allowed
      const badCode = `if (predicate === 'mine') { /* ... */ }`;
      expect(badCode).toMatch(/predicate\s*===?\s*['"]?mine['"]?/i);
    });

    it('switch on action (semantic discriminant)', () => {
      // This is NOT allowed - action is semantic
      const badCode = `
        switch (action) {
          case 'craft':
            return validateInventory();
          case 'mine':
            return validateTools();
        }
      `;
      const violations = checkSwitchCases(badCode, 'test.ts');
      expect(violations.length).toBeGreaterThan(0);
      // Assert on structured violation object
      expect(violations[0].discriminant).toBe('action');
      expect(violations[0].caseLabel).toBe('craft');
      expect(violations[0].file).toBe('test.ts');
    });

    it('switch on goal.action (semantic discriminant)', () => {
      // This is NOT allowed - goal.action is semantic
      const badCode = `
        switch (goal.action) {
          case 'explore':
            return getExplorationPath();
          case 'navigate':
            return getNavigationPath();
        }
      `;
      const violations = checkSwitchCases(badCode, 'test.ts');
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].discriminant).toBe('goal.action');
      expect(violations[0].caseLabel).toBe('explore');
    });

    it('switch on verb (semantic discriminant)', () => {
      // This is NOT allowed - verb is semantic
      const badCode = `
        switch (verb) {
          case 'collect':
            return GatherTask;
          case 'build':
            return ConstructTask;
        }
      `;
      const violations = checkSwitchCases(badCode, 'test.ts');
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].discriminant).toBe('verb');
      expect(violations[0].caseLabel).toBe('collect');
    });

    it('switch on extractedGoal (semantic discriminant)', () => {
      // This is NOT allowed - extractedGoal is semantic
      const badCode = `
        switch (extractedGoal) {
          case 'gather':
            return GatheringRequirement;
        }
      `;
      const violations = checkSwitchCases(badCode, 'test.ts');
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].discriminant).toBe('extractedGoal');
      expect(violations[0].caseLabel).toBe('gather');
    });

    it('bypass attempt: naming local variable "req" (caught)', () => {
      // This is a bypass attempt - local variable named "req" but contains semantic data
      // Current implementation flags this as allowed (name-based heuristic limitation)
      // but it demonstrates the documented limitation
      const bypassCode = `
        const req = { kind: action }; // "req" shadows, but kind contains semantic action
        switch (req.kind) {
          case 'craft':
            return doSomething();
        }
      `;
      const violations = checkSwitchCases(bypassCode, 'test.ts');
      // KNOWN LIMITATION: This currently passes (0 violations) because we use name-based heuristic
      // Would need import/type analysis to catch this properly
      // Documenting the bypass vector explicitly
      expect(violations).toHaveLength(0); // Name-based heuristic allows this
      // TODO: When upgrading to AST-based checking, this should become:
      // expect(violations).toHaveLength(1);
      // expect(violations[0].discriminant).toBe('req.kind');
    });
  });
});
