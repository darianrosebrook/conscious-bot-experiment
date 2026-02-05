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

/**
 * BASELINE: Grandfathered files allowed to import from llm-output-sanitizer.
 *
 * This Set is the PERMANENT BASELINE for the ratchet. It never changes unless
 * you intentionally relax the policy (which you shouldn't).
 *
 * The actual grandfathered list (below) must be a subset of this baseline.
 * - Shrinking the actual list is allowed (migration progress)
 * - Adding to the actual list is blocked (can't exceed baseline)
 *
 * When you migrate a file, remove it from GRANDFATHERED_LEGACY_SANITIZER_IMPORTS.
 * Do NOT edit this baseline set unless the policy itself changes.
 */
const BASELINE_GRANDFATHERED_FILES = new Set([
  'reasoning-surface/goal-extractor.ts',  // DELETED (Migration A)
  'reasoning-surface/grounder.ts',
  'reasoning-surface/eligibility.ts',
  'thought-generator.ts',
  'types.ts',                              // MIGRATED (Migration C partial)
  'index.ts',
  'cognitive-core/llm-interface.ts',       // MIGRATED (Migration B)
]);

/**
 * GRANDFATHERED LEGACY SANITIZER IMPORTS
 *
 * These files are allowed to import from llm-output-sanitizer during migration.
 * This Map must be a subset of BASELINE_GRANDFATHERED_FILES.
 *
 * Each entry includes migration metadata (execution plan):
 * - Current usage (what's being imported)
 * - Migration target (what to use from language-io instead)
 * - Priority (order of migration)
 */
const GRANDFATHERED_LEGACY_SANITIZER_IMPORTS = new Map<string, {
  currentUsage: string;
  migrationTarget: string;
  priority: 'high' | 'medium' | 'low';
}>([
  // DELETED (Migration A): reasoning-surface/goal-extractor.ts - file deleted
  // MIGRATED (Migration C): reasoning-surface/grounder.ts - now uses ReductionProvenance
  // MIGRATED (Migration C): reasoning-surface/eligibility.ts - now uses ReductionProvenance
  // MIGRATED (Migration C): thought-generator.ts - now uses ReductionProvenance
  // MIGRATED (Migration C partial): types.ts - now imports from language-io
  ['index.ts', {
    currentUsage: 'Re-exports for package API',
    migrationTarget: 'Export language-io module, deprecate legacy exports',
    priority: 'low',
  }],
  // MIGRATED (Migration B): cognitive-core/llm-interface.ts - now uses language-io
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

        // Skip grandfathered legacy imports
        if (GRANDFATHERED_LEGACY_SANITIZER_IMPORTS.has(relPath)) {
          continue;
        }

        it(`${relPath} does not import from llm-output-sanitizer`, () => {
          const content = fs.readFileSync(filePath, 'utf-8');

          // Check for ALL import forms from llm-output-sanitizer
          // Matches:
          // - import { x } from '../llm-output-sanitizer'
          // - import type { x } from '../llm-output-sanitizer'
          // - export { x } from '../llm-output-sanitizer'
          // - export type { x } from '../llm-output-sanitizer'
          // - import '../llm-output-sanitizer' (side-effect import)
          // - import('../llm-output-sanitizer') (dynamic import)
          // - require('../llm-output-sanitizer') (CommonJS)
          const legacyImportPatterns = [
            /\bimport\s+(?:type\s+)?{[^}]+}\s+from\s+['"][^'"]*llm-output-sanitizer['"]/,
            /\bimport\s+(?:type\s+)?\*\s+as\s+\w+\s+from\s+['"][^'"]*llm-output-sanitizer['"]/,
            /\bimport\s+['"][^'"]*llm-output-sanitizer['"]/,
            /\bexport\s+(?:type\s+)?{[^}]+}\s+from\s+['"][^'"]*llm-output-sanitizer['"]/,
            /\bexport\s+\*\s+from\s+['"][^'"]*llm-output-sanitizer['"]/,
            /\bimport\s*\(\s*['"][^'"]*llm-output-sanitizer['"]\s*\)/,  // Dynamic import
            /\brequire\s*\(\s*['"][^'"]*llm-output-sanitizer['"]\s*\)/,  // CommonJS require
          ];

          const violations = legacyImportPatterns.filter(pattern => pattern.test(content));

          if (violations.length > 0) {
            expect.fail(
              `${relPath} imports from deprecated llm-output-sanitizer.\n` +
              `This violates I-MIGRATION-1.\n\n` +
              `Use language-io module instead:\n` +
              `  - buildLanguageIOEnvelope() for envelope construction\n` +
              `  - extractVerbatimMarkers() for marker extraction\n` +
              `  - SterlingLanguageIOClient.reduce() for semantic processing\n\n` +
              `CRITICAL: Do NOT add new entries to GRANDFATHERED_LEGACY_SANITIZER_IMPORTS.\n` +
              `The grandfather list must only shrink. If this is a new file, migrate it\n` +
              `to language-io immediately. If this is an existing file being modified,\n` +
              `migrate it as part of this change.`
            );
          }

          expect(violations).toHaveLength(0);
        });
      }
    });
  }
});

describe('Grandfathered Legacy Imports (Strict Ratchet)', () => {
  it('enforces monotonic decrease (subset of baseline, never exceeds)', () => {
    const actualFiles = new Set(GRANDFATHERED_LEGACY_SANITIZER_IMPORTS.keys());

    // RATCHET CONSTRAINT 1: No additions allowed (strict subset)
    // Any file in actualFiles that's NOT in baseline violates the ratchet
    const unauthorizedAdditions = [...actualFiles].filter(f => !BASELINE_GRANDFATHERED_FILES.has(f));

    if (unauthorizedAdditions.length > 0) {
      expect.fail(
        `RATCHET VIOLATION: Unauthorized files in GRANDFATHERED_LEGACY_SANITIZER_IMPORTS:\n` +
        `  ${unauthorizedAdditions.join('\n  ')}\n\n` +
        `These files are NOT in BASELINE_GRANDFATHERED_FILES.\n` +
        `The grandfather list can ONLY shrink. Do NOT add new entries.\n` +
        `If a file needs legacy imports, migrate it to language-io instead.`
      );
    }

    // RATCHET CONSTRAINT 2: Count must not exceed baseline
    expect(actualFiles.size).toBeLessThanOrEqual(BASELINE_GRANDFATHERED_FILES.size);

    // When you migrate a file:
    // 1. Remove it from GRANDFATHERED_LEGACY_SANITIZER_IMPORTS
    // 2. Do NOT edit BASELINE_GRANDFATHERED_FILES (baseline is permanent)
    // 3. This test will pass as long as actual ⊆ baseline
  });

  it('requires migration metadata for all grandfathered files', () => {
    // Every entry must have complete migration metadata
    for (const [file, metadata] of GRANDFATHERED_LEGACY_SANITIZER_IMPORTS) {
      expect(metadata.currentUsage).toBeTruthy();
      expect(metadata.migrationTarget).toBeTruthy();
      expect(['high', 'medium', 'low']).toContain(metadata.priority);
    }
  });

  it('documents migration order by priority', () => {
    const highPriority: string[] = [];
    const mediumPriority: string[] = [];
    const lowPriority: string[] = [];

    for (const [file, metadata] of GRANDFATHERED_LEGACY_SANITIZER_IMPORTS) {
      if (metadata.priority === 'high') highPriority.push(file);
      else if (metadata.priority === 'medium') mediumPriority.push(file);
      else lowPriority.push(file);
    }

    // Document migration order for visibility
    // UPDATED (Migration C): grounder, eligibility, thought-generator migrated
    // Only index.ts remains (blocked on packages/planning consumers)
    expect(highPriority).toEqual([
      // All high-priority migrations complete!
    ]);

    expect(mediumPriority).toEqual([
      // All medium-priority migrations complete!
      // grounder.ts, eligibility.ts, thought-generator.ts now use ReductionProvenance
    ]);

    expect(lowPriority).toEqual([
      'index.ts',                             // Package API (re-exports deprecated)
    ]);
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
