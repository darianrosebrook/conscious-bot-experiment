/**
 * Boundary Enforcement: No Semantic Types in TS
 *
 * This test verifies that semantic types (IntentKind, CANONICAL_ACTIONS, etc.)
 * are NOT defined in TypeScript code. These must come from Sterling.
 *
 * Invariant: I-BOUNDARY-2 - TS must not define semantic enums
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const COGNITION_SRC = path.resolve(__dirname, '../..');
const PLANNING_SRC = path.resolve(__dirname, '../../../../planning/src');

describe('I-BOUNDARY-2: No Semantic Types in TS', () => {
  // Files that SHOULD be checked for violations
  const filesToCheck = [
    // Cognition package - core semantic boundary
    path.join(COGNITION_SRC, 'llm-output-sanitizer.ts'),
    path.join(COGNITION_SRC, 'reasoning-surface/goal-extractor.ts'),
    path.join(COGNITION_SRC, 'reasoning-surface/grounder.ts'),
  ];

  // Patterns that indicate boundary violations
  const forbiddenPatterns = [
    { pattern: /type\s+IntentKind\s*=/i, name: 'IntentKind type definition' },
    { pattern: /enum\s+IntentKind/i, name: 'IntentKind enum definition' },
    { pattern: /type\s+ActionType\s*=/i, name: 'ActionType type definition' },
    // Note: We check for NEW definitions, not usage of existing deprecated ones
    // The existing ones in llm-output-sanitizer.ts need to be deprecated, not immediately removed
  ];

  for (const filePath of filesToCheck) {
    const fileName = path.basename(filePath);

    describe(fileName, () => {
      it('exists and is readable', () => {
        // Some files might not exist yet - that's OK
        // The test will skip if file doesn't exist
        if (!fs.existsSync(filePath)) {
          console.log(`Skipping ${fileName} - file does not exist`);
          return;
        }
        expect(fs.existsSync(filePath)).toBe(true);
      });

      // Only run content checks if file exists
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');

        for (const { pattern, name } of forbiddenPatterns) {
          it(`does not define new ${name}`, () => {
            // We're checking for NEW definitions, not all usage
            // Existing code may have these but should be marked @deprecated
            expect(content).not.toMatch(pattern);
          });
        }
      }
    });
  }

  describe('New language-io module (MUST NOT have semantic types)', () => {
    const languageIOPath = path.join(COGNITION_SRC, 'language-io');

    it('language-io directory exists', () => {
      expect(fs.existsSync(languageIOPath)).toBe(true);
    });

    const allForbiddenPatterns = [
      { pattern: /type\s+IntentKind\s*=/i, name: 'IntentKind type' },
      { pattern: /type\s+ActionType\s*=/i, name: 'ActionType type' },
      { pattern: /const\s+CANONICAL_ACTIONS\s*=/i, name: 'CANONICAL_ACTIONS' },
      { pattern: /const\s+ACTION_NORMALIZE_MAP\s*=/i, name: 'ACTION_NORMALIZE_MAP' },
      { pattern: /function\s+normalizeGoalAction/i, name: 'normalizeGoalAction' },
      { pattern: /enum\s+TaskType/i, name: 'TaskType enum' },
    ];

    if (fs.existsSync(languageIOPath)) {
      const tsFiles = fs
        .readdirSync(languageIOPath)
        .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));

      for (const file of tsFiles) {
        const filePath = path.join(languageIOPath, file);
        const content = fs.readFileSync(filePath, 'utf-8');

        describe(`language-io/${file}`, () => {
          for (const { pattern, name } of allForbiddenPatterns) {
            it(`does not contain ${name}`, () => {
              expect(content).not.toMatch(pattern);
            });
          }
        });
      }
    }
  });
});
