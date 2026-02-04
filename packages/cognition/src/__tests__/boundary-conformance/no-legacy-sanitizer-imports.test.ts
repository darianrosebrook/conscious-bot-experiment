/**
 * Boundary Enforcement: No Legacy Sanitizer Imports
 *
 * This test enforces PR4 migration: new code must not import from the
 * deprecated llm-output-sanitizer module. Use language-io module instead.
 *
 * Invariant: I-MIGRATION-1 - Deprecated modules must not gain new consumers
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Modules that should NOT import from llm-output-sanitizer
const ENFORCED_MODULES = [
  path.resolve(__dirname, '../../cognitive-core'),
  path.resolve(__dirname, '../../keep-alive'),
  path.resolve(__dirname, '../../server-utils'),
  path.resolve(__dirname, '../../environmental'),
  path.resolve(__dirname, '../../social-cognition'),
];

// Allowed legacy imports (grandfathered, should shrink over time)
const ALLOWED_LEGACY_IMPORTS = new Set<string>([
  'reasoning-surface/goal-extractor.ts',  // Re-export shim (will be deleted)
  'reasoning-surface/grounder.ts',        // Uses GoalTagV1 type (migrate next)
  'reasoning-surface/eligibility.ts',     // Uses GoalTagV1 type (migrate next)
  'thought-generator.ts',                 // Uses GoalTagV1 type (migrate next)
  'types.ts',                             // Re-exports types (migrate next)
  'index.ts',                             // Re-exports for package API (migrate next)
  'cognitive-core/llm-interface.ts',      // Direct consumer (migrate next)
  'server-utils/thought-stream-helpers.ts', // Uses isUsableContent (migrate next)
]);

describe('I-MIGRATION-1: No Legacy Sanitizer Imports', () => {
  for (const moduleDir of ENFORCED_MODULES) {
    if (!fs.existsSync(moduleDir)) {
      continue;
    }

    const moduleName = path.basename(moduleDir);

    describe(moduleName, () => {
      const tsFiles = getAllTsFiles(moduleDir);

      for (const filePath of tsFiles) {
        const relPath = path.relative(path.resolve(__dirname, '../..'), filePath);

        // Skip test files
        if (relPath.includes('__tests__') || relPath.includes('.test.')) {
          continue;
        }

        // Skip allowed legacy imports
        if (ALLOWED_LEGACY_IMPORTS.has(relPath)) {
          continue;
        }

        it(`${relPath} does not import from llm-output-sanitizer`, () => {
          const content = fs.readFileSync(filePath, 'utf-8');

          // Check for imports from llm-output-sanitizer
          const legacyImportPattern = /from\s+['"]\.\.\/llm-output-sanitizer['"]/;
          const hasLegacyImport = legacyImportPattern.test(content);

          if (hasLegacyImport) {
            expect.fail(
              `${relPath} imports from deprecated llm-output-sanitizer.\n` +
              `This violates I-MIGRATION-1.\n\n` +
              `Use language-io module instead:\n` +
              `  - buildLanguageIOEnvelope() for envelope construction\n` +
              `  - extractVerbatimMarkers() for marker extraction\n` +
              `  - SterlingLanguageIOClient.reduce() for semantic processing\n\n` +
              `If this file MUST use legacy exports during migration:\n` +
              `  1. Add it to ALLOWED_LEGACY_IMPORTS in no-legacy-sanitizer-imports.test.ts\n` +
              `  2. File a migration issue to remove it from the allowlist\n` +
              `  3. Add a @deprecated comment explaining why it's grandfathered`
            );
          }

          expect(hasLegacyImport).toBe(false);
        });
      }
    });
  }
});

describe('Allowed Legacy Imports (Grandfathered)', () => {
  it('documents why each file is allowed to import legacy sanitizer', () => {
    const allowedFiles = Array.from(ALLOWED_LEGACY_IMPORTS);

    // This test is purely documentary - it lists what's grandfathered
    expect(allowedFiles).toEqual([
      'reasoning-surface/goal-extractor.ts',  // Re-export shim
      'reasoning-surface/grounder.ts',        // Type usage
      'reasoning-surface/eligibility.ts',     // Type usage
      'thought-generator.ts',                 // Type usage
      'types.ts',                             // Type re-export
      'index.ts',                             // Package API
      'cognitive-core/llm-interface.ts',      // Direct consumer
      'server-utils/thought-stream-helpers.ts', // Uses isUsableContent
    ]);

    // Migration plan: Each of these should migrate to language-io,
    // then be removed from ALLOWED_LEGACY_IMPORTS
  });

  it('allowlist shrinks over time (ratchet mechanism)', () => {
    // When files are migrated, remove them from ALLOWED_LEGACY_IMPORTS
    // This test will fail if someone adds files back to the allowlist
    // without explicit justification

    const currentAllowlistSize = ALLOWED_LEGACY_IMPORTS.size;

    // Baseline (current state): 8 grandfathered files
    // This number should only decrease, never increase
    expect(currentAllowlistSize).toBeLessThanOrEqual(8);

    // When a file is migrated, update this assertion to the new (lower) count
    // and document which file was migrated in the commit message
  });
});

/**
 * Recursively get all .ts files in a directory
 */
function getAllTsFiles(dir: string): string[] {
  const results: string[] = [];

  function scan(currentDir: string) {
    const entries = fs.readdirSync(currentDir);

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        scan(fullPath);
      } else if (entry.endsWith('.ts')) {
        results.push(fullPath);
      }
    }
  }

  scan(dir);
  return results;
}
