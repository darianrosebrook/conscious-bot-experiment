/**
 * Truthfulness Tripwire — validates that manifest helpers produce
 * truthful manifests when given a run handle with actual test outcomes.
 *
 * This test exercises the exact helper functions used by afterAll hooks
 * in all proving surfaces. If the wiring regresses (e.g., surfaceResults
 * is omitted or patchExecutionResults is skipped), this test fails.
 */

import { describe, it, expect } from 'vitest';
import { createRunHandle } from '../run-handle';
import type { P21RunHandle } from '../run-handle';
import { P21A_INVARIANT_IDS, P21B_INVARIANT_IDS, CONDITIONAL_INVARIANTS } from '../invariant-ids';
import {
  createSurfaceResultsFromHandle,
  patchExecutionResults,
  assertManifestTruthfulness,
} from '../manifest-helpers';
import { generateP21AManifest, generateP21BManifest } from '../proof-manifest';

describe('proof artifact truthfulness', () => {
  it('P21A manifest reflects all-pass handle state', () => {
    const handle = createRunHandle('test-surface', [...P21A_INVARIANT_IDS]);

    // Simulate all base invariants passing (skip conditional ones)
    for (const id of P21A_INVARIANT_IDS) {
      if (!CONDITIONAL_INVARIANTS.has(id)) {
        handle.record(id, () => { /* pass */ });
      }
    }

    const surfaceResults = createSurfaceResultsFromHandle(handle);
    const manifest = generateP21AManifest({
      contract_version: '1.0.0',
      adapters: [{ name: 'test-surface', path: 'test.ts' }],
      config: {},
      surfaceResults,
    });
    patchExecutionResults(handle, manifest);

    // Base invariants are proven
    for (const inv of manifest.invariants) {
      if (!CONDITIONAL_INVARIANTS.has(inv.id)) {
        expect(inv.status).toBe('proven');
        expect(inv.provingSurfaces).toContain('test-surface');
      }
    }

    // Conditional invariants that didn't run stay not_started
    for (const inv of manifest.invariants) {
      if (CONDITIONAL_INVARIANTS.has(inv.id)) {
        expect(inv.status).toBe('not_started');
      }
    }

    // run_passed is true: no exercised invariant failed
    expect(manifest.results.run_passed).toBe(true);
    // fully_proven is false: conditional invariants are not_started
    expect(manifest.results.fully_proven).toBe(false);
    // invariants_failed is empty: no actual failures (not_started ≠ failed)
    expect(manifest.results.invariants_failed).toEqual([]);
    // invariants_not_started lists exactly the conditional invariants
    expect(new Set(manifest.results.invariants_not_started)).toEqual(CONDITIONAL_INVARIANTS);

    // Tripwire must not throw for all-pass handle
    expect(() => assertManifestTruthfulness(handle, manifest)).not.toThrow();
  });

  it('P21B manifest reflects all-pass handle state', () => {
    const handle = createRunHandle('test-surface-b', [...P21B_INVARIANT_IDS]);

    for (const id of P21B_INVARIANT_IDS) {
      handle.record(id, () => { /* pass */ });
    }

    const surfaceResults = createSurfaceResultsFromHandle(handle);
    const manifest = generateP21BManifest({
      contract_version: '1.0.0',
      adapters: [{ name: 'test-surface-b', path: 'test.ts' }],
      config: {},
      surfaceResults,
    });
    patchExecutionResults(handle, manifest);

    expect(manifest.results.run_passed).toBe(true);
    expect(manifest.results.fully_proven).toBe(true);
    expect(manifest.results.invariants_failed).toEqual([]);
    expect(manifest.results.invariants_not_started).toEqual([]);

    for (const inv of manifest.invariants) {
      expect(inv.status).toBe('proven');
      expect(inv.provingSurfaces).toContain('test-surface-b');
    }

    expect(() => assertManifestTruthfulness(handle, manifest)).not.toThrow();
  });

  it('tripwire detects manifest without surfaceResults (blank template regression)', () => {
    const handle = createRunHandle('test-surface', [...P21A_INVARIANT_IDS]);

    // All base invariants pass
    for (const id of P21A_INVARIANT_IDS) {
      if (!CONDITIONAL_INVARIANTS.has(id)) {
        handle.record(id, () => { /* pass */ });
      }
    }

    // Generate manifest WITHOUT surfaceResults — the exact regression we're preventing
    const manifest = generateP21AManifest({
      contract_version: '1.0.0',
      adapters: [{ name: 'test-surface', path: 'test.ts' }],
      config: {},
      // surfaceResults intentionally omitted
    });
    patchExecutionResults(handle, manifest);

    // Blank template: no surface results, so nothing is proven
    // run_passed is still true (handle has no failures), but fully_proven is false
    expect(manifest.results.run_passed).toBe(true);
    expect(manifest.results.fully_proven).toBe(false);

    // Tripwire catches: handle recorded passes that aren't in invariants_passed
    expect(() => assertManifestTruthfulness(handle, manifest)).toThrow(
      /Manifest wiring regression/,
    );
  });

  it('failing run: patchExecutionResults propagates handle failures into manifest', async () => {
    // Construct a fake handle that satisfies P21RunHandle with one failure
    const fakeStatus: Record<string, 'pass' | 'fail' | 'not_started'> = {
      'P21B-INV-01': 'pass',
      'P21B-INV-02': 'fail',  // simulated failure
      'P21B-INV-03': 'pass',
      'P21B-INV-04': 'not_started',
    };
    const fakeHandle: P21RunHandle = {
      surfaceName: 'fake-surface',
      status: fakeStatus,
      passedIds() {
        const s = new Set<string>();
        for (const [id, v] of Object.entries(fakeStatus)) if (v === 'pass') s.add(id);
        return s;
      },
      async record() { /* unused */ },
    };

    // surfaceResults only contains passes
    const surfaceResults = createSurfaceResultsFromHandle(fakeHandle);
    const manifest = generateP21BManifest({
      contract_version: '1.0.0',
      adapters: [{ name: 'fake-surface', path: 'test.ts' }],
      config: {},
      surfaceResults,
    });

    // Before patching: generator defaults are wrong for execution truth
    expect(manifest.results.execution_patched).toBe(false);
    expect(manifest.results.run_passed).toBe(true); // generator can't know about failures
    expect(manifest.results.invariants_failed).toEqual([]); // generator can't know

    // After patching: execution truth from handle
    patchExecutionResults(fakeHandle, manifest);

    expect(manifest.results.execution_patched).toBe(true);
    expect(manifest.results.run_passed).toBe(false);
    expect(manifest.results.invariants_failed).toEqual(['P21B-INV-02']);
    expect(manifest.results.invariants_not_started).toEqual(['P21B-INV-04']);

    // fully_proven is certification truth — still false (not all proven)
    expect(manifest.results.fully_proven).toBe(false);
    // invariants_passed is certification truth — still has the proven ones
    expect(manifest.results.invariants_passed).toEqual(['P21B-INV-01', 'P21B-INV-03']);

    // Tripwire validates consistency
    expect(() => assertManifestTruthfulness(fakeHandle, manifest)).not.toThrow();
  });

  it('tripwire detects missing patchExecutionResults when handle has failures', async () => {
    const fakeStatus: Record<string, 'pass' | 'fail' | 'not_started'> = {
      'P21B-INV-01': 'pass',
      'P21B-INV-02': 'fail',
      'P21B-INV-03': 'pass',
      'P21B-INV-04': 'pass',
    };
    const fakeHandle: P21RunHandle = {
      surfaceName: 'fake-surface',
      status: fakeStatus,
      passedIds() {
        const s = new Set<string>();
        for (const [id, v] of Object.entries(fakeStatus)) if (v === 'pass') s.add(id);
        return s;
      },
      async record() { /* unused */ },
    };

    const surfaceResults = createSurfaceResultsFromHandle(fakeHandle);
    const manifest = generateP21BManifest({
      contract_version: '1.0.0',
      adapters: [{ name: 'fake-surface', path: 'test.ts' }],
      config: {},
      surfaceResults,
    });

    // Deliberately skip patchExecutionResults — tripwire catches via execution_patched sentinel
    expect(() => assertManifestTruthfulness(fakeHandle, manifest)).toThrow(
      /execution_patched is false/,
    );
  });

  it('handle records async probe failures correctly', async () => {
    const handle = createRunHandle('async-test', ['ASYNC-01']);

    await expect(
      handle.record('ASYNC-01', async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        throw new Error('async failure');
      }),
    ).rejects.toThrow('async failure');

    expect(handle.status['ASYNC-01']).toBe('fail');
  });

  it('handle records async probe success correctly', async () => {
    const handle = createRunHandle('async-test', ['ASYNC-01']);

    await handle.record('ASYNC-01', async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      // no throw = pass
    });

    expect(handle.status['ASYNC-01']).toBe('pass');
  });

  it('unexecuted invariants stay not_started', () => {
    const handle = createRunHandle('partial-test', ['A', 'B', 'C']);

    handle.record('A', () => { /* pass */ });
    // B and C never executed

    expect(handle.status['A']).toBe('pass');
    expect(handle.status['B']).toBe('not_started');
    expect(handle.status['C']).toBe('not_started');
    expect(handle.passedIds()).toEqual(new Set(['A']));
  });

  it('invariant ID constants match proof-manifest catalog length', () => {
    // If someone adds an invariant to proof-manifest.ts but not invariant-ids.ts,
    // this fails. The reverse (adding to IDs but not catalog) will cause manifest
    // generation to produce an ID mismatch.
    const p21aManifest = generateP21AManifest({
      contract_version: '1.0.0',
      adapters: [],
      config: {},
    });
    expect(p21aManifest.invariants.length).toBe(P21A_INVARIANT_IDS.length);

    const p21bManifest = generateP21BManifest({
      contract_version: '1.0.0',
      adapters: [],
      config: {},
    });
    expect(p21bManifest.invariants.length).toBe(P21B_INVARIANT_IDS.length);
  });

  it('invariant ID constants match proof-manifest catalog IDs exactly', () => {
    const p21aManifest = generateP21AManifest({
      contract_version: '1.0.0',
      adapters: [],
      config: {},
    });
    const catalogIds = p21aManifest.invariants.map((inv) => inv.id);
    expect(catalogIds).toEqual([...P21A_INVARIANT_IDS]);

    const p21bManifest = generateP21BManifest({
      contract_version: '1.0.0',
      adapters: [],
      config: {},
    });
    const bCatalogIds = p21bManifest.invariants.map((inv) => inv.id);
    expect(bCatalogIds).toEqual([...P21B_INVARIANT_IDS]);
  });
});
