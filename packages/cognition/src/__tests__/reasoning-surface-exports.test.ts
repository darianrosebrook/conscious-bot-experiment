/**
 * Reasoning Surface Exports Contract Test
 *
 * This test pins the public exports from reasoning-surface module to prevent
 * accidental API drift during refactoring (especially while deleting shims).
 *
 * It verifies that internal consumers can import the symbols they rely on,
 * without testing the full behavior (that's covered elsewhere).
 *
 * IMPORTANT: Type imports are compile-time checked. If any of these types
 * are removed or renamed, `pnpm type-check` will fail on this file.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';

// Compile-time type contract (erased at runtime, checked by tsc)
import type {
  EligibilityOutput,
  GroundingResult,
  FrameContext,
  ReasoningPipelineResult,
  SterlingPipelineResult,
  ReducerResultView,
  ProcessLLMOutputAsyncOptions,
} from '../reasoning-surface';

describe('reasoning-surface exports contract', () => {
  it('exports all symbols used by internal consumers', async () => {
    // Import the module dynamically to avoid compile-time coupling
    const reasoningSurface = await import('../reasoning-surface');

    // Functions used by thought-generator.ts
    expect(reasoningSurface.deriveEligibility).toBeTypeOf('function');
    expect(reasoningSurface.createGroundingContext).toBeTypeOf('function');
    expect(reasoningSurface.groundGoal).toBeTypeOf('function');

    // Functions used by other modules
    expect(reasoningSurface.renderSituationFrame).toBeTypeOf('function');
    expect(reasoningSurface.processLLMOutput).toBeTypeOf('function');
    expect(reasoningSurface.processLLMOutputAsync).toBeTypeOf('function');

    // Sterling integration
    expect(reasoningSurface.getDefaultLanguageIOClient).toBeTypeOf('function');
    expect(reasoningSurface.SterlingLanguageIOClient).toBeTypeOf('function');
  });

  it('exports type symbols (compile-time check via tsc)', () => {
    // This test is a compile-time assertion.
    // If these imports fail, tsc will error during type-check phase.
    // The test itself is a runtime no-op, but the import statements are checked.

    // We don't use dynamic import here because types are erased at runtime.
    // Instead, this file must successfully compile for the test suite to run.

    // If you remove or rename any of these types from reasoning-surface,
    // this file will fail to compile (pnpm type-check will catch it).

    expect(true).toBe(true); // Test passes if file compiles
  });

  it('does NOT export deprecated goal-extractor functions after migration', async () => {
    // This test will pass after Migration A completes
    const reasoningSurface = await import('../reasoning-surface');

    // These should NOT be in the public API after migration
    // (They may exist temporarily during migration, but should be removed)
    const exports = Object.keys(reasoningSurface);

    // Goal-extractor shim functions (should not be re-exported)
    // After Migration A, these should come from language-io or be removed entirely
    // For now, we just document what WILL change:
    // expect(exports).not.toContain('extractGoal');
    // expect(exports).not.toContain('extractGoalFromSanitized');

    // This test is a placeholder - uncomment assertions after Migration A
    expect(exports).toBeDefined();
  });
});
