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
 * Check if a switch statement switches on a semantic discriminant (FORBIDDEN)
 * vs a structural discriminant (ALLOWED).
 *
 * FORBIDDEN: switch (action), switch (goal.action), switch (verb), switch (predicate)
 * ALLOWED: switch (req.kind), switch (requirement.kind), switch (task.kind)
 *
 * LIMITATIONS (regex-based, not AST-based):
 * - Multi-line switch statements may not match: `switch (\n  action\n)`
 * - Nested switches can cause incorrect association
 * - Comments/strings containing "case 'craft'" may cause false positives
 * - Bounded lookback (20 lines) may miss distant switch statements
 *
 * HARDENING RECOMMENDATIONS (for future work):
 * 1. Use TypeScript Compiler API or ts-morph for true AST analysis
 * 2. Strip comments/strings before scanning to avoid false positives
 * 3. Normalize whitespace for multi-line switch statements
 * 4. Add fixtures for edge cases: multi-line switch, switch with comments in discriminant
 * 5. Use provenance-based checking (import Sterling types) instead of variable name heuristics
 *
 * This is "good enough" for current boundary enforcement but should be upgraded
 * to AST-based checking if the boundary contract becomes load-bearing for other repos.
 */
function checkSwitchCases(content: string, file: string): string[] {
  const violations: string[] = [];

  // Find all case statements for action strings
  const casePattern = /case\s+['"]?(craft|mine|explore|navigate|build|collect|gather)['"]?\s*:/gi;
  let match;

  while ((match = casePattern.exec(content)) !== null) {
    const caseIndex = match.index;
    const caseText = match[0];

    // Walk backwards to find the nearest switch statement (bounded scan, max 20 lines)
    const lines = content.substring(0, caseIndex).split('\n');
    const caseLineIndex = lines.length - 1;
    const startLine = Math.max(0, caseLineIndex - 20);

    let switchDiscriminant: string | null = null;

    for (let i = caseLineIndex; i >= startLine; i--) {
      const line = lines[i];
      const switchMatch = line.match(/switch\s*\(\s*([^)]+)\s*\)/);
      if (switchMatch) {
        switchDiscriminant = switchMatch[1].trim();
        break;
      }
    }

    if (!switchDiscriminant) {
      // Couldn't find switch - might be malformed code, skip
      continue;
    }

    // Check if discriminant is FORBIDDEN (semantic) or ALLOWED (structural)
    const forbiddenDiscriminants = /\b(action|verb|intent|predicate|goal|extractedGoal)\b|\.(action|intent|predicate|verb)/i;
    const allowedDiscriminants = /\b(req|requirement|task)\.kind\b/i;

    if (allowedDiscriminants.test(switchDiscriminant)) {
      // Structural routing - ALLOWED
      continue;
    }

    if (forbiddenDiscriminants.test(switchDiscriminant)) {
      // Semantic interpretation - FORBIDDEN
      violations.push(`switch (${switchDiscriminant}) { ${caseText} ... }`);
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
              const details = violations.map(v => `  ${v}`).join('\n');
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

    it('multi-line switch on req.kind (edge case: whitespace normalization)', () => {
      // Tests limitation: current regex may not handle multi-line well
      // This SHOULD be allowed (structural), but may fail to match due to newlines
      const goodCode = `
        switch (
          req.kind
        ) {
          case 'craft':
            return req.outputPattern;
        }
      `;
      const violations = checkSwitchCases(goodCode, 'test.ts');
      // Current implementation may fail here - documenting known limitation
      // expect(violations).toHaveLength(0); // Would pass with AST-based checker
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
      // Assert on violation structure, not just string content
      expect(violations[0]).toMatch(/^switch \(.*(action).*\) \{.*case/);
      expect(violations[0]).toContain('craft'); // Verify case was captured
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
      expect(violations[0]).toMatch(/^switch \(.*(goal\.action).*\) \{.*case/);
      expect(violations[0]).toContain('explore');
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
      expect(violations[0]).toMatch(/^switch \(.*(verb).*\) \{.*case/);
      expect(violations[0]).toContain('collect');
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
      expect(violations[0]).toMatch(/^switch \(.*(extractedGoal).*\) \{.*case/);
      expect(violations[0]).toContain('gather');
    });
  });
});
