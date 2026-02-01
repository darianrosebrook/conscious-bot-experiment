import type { P21RunHandle } from './run-handle';
import type { CapabilityProofManifest } from '../capability-proof-manifest';

export function createSurfaceResultsFromHandle(handle: P21RunHandle): Map<string, Set<string>> {
  return new Map([[handle.surfaceName, handle.passedIds()]]);
}

/**
 * Overwrite execution-facing fields on the manifest using the run-handle
 * as the source of truth. The generator only knows certification status
 * (proven/partial/not_started from surfaceResults); this function fills
 * in the execution reality (which invariants actually ran and failed).
 *
 * Arrays are sorted for deterministic artifact output regardless of
 * handle internal representation.
 */
export function patchExecutionResults(handle: P21RunHandle, manifest: CapabilityProofManifest): void {
  const handleFailedIds = Object.entries(handle.status)
    .filter(([, s]) => s === 'fail')
    .map(([id]) => id)
    .sort();

  const handleNotStartedIds = Object.entries(handle.status)
    .filter(([, s]) => s === 'not_started')
    .map(([id]) => id)
    .sort();

  manifest.results.run_passed = handleFailedIds.length === 0;
  manifest.results.invariants_failed = handleFailedIds;
  manifest.results.invariants_not_started = handleNotStartedIds;
  manifest.results.execution_patched = true;
}

/**
 * Tripwire that validates handle↔manifest consistency. Enforces:
 *
 * 0. ID alignment: handle status keys must match manifest invariant IDs
 *
 * 1. Certification consistency:
 *    - Every handle 'pass' must appear in manifest invariants_passed
 *    - No handle 'fail' may appear in manifest invariants_passed
 *
 * 2. Execution consistency (requires patchExecutionResults to have run):
 *    - If handle has failures: run_passed must be false,
 *      invariants_failed must contain exactly the failed IDs
 *    - If handle has no failures: run_passed must be true,
 *      invariants_failed must be empty
 */
export function assertManifestTruthfulness(handle: P21RunHandle, manifest: CapabilityProofManifest): void {
  // ── ID alignment ───────────────────────────────────────────────────

  const handleIds = new Set(Object.keys(handle.status));
  const catalogIds = new Set(manifest.invariants.map((inv) => inv.id));

  const inHandleNotCatalog = [...handleIds].filter((id) => !catalogIds.has(id)).sort();
  const inCatalogNotHandle = [...catalogIds].filter((id) => !handleIds.has(id)).sort();

  if (inHandleNotCatalog.length > 0 || inCatalogNotHandle.length > 0) {
    const parts: string[] = [];
    if (inHandleNotCatalog.length > 0) {
      parts.push(`in handle but not catalog: [${inHandleNotCatalog.join(', ')}]`);
    }
    if (inCatalogNotHandle.length > 0) {
      parts.push(`in catalog but not handle: [${inCatalogNotHandle.join(', ')}]`);
    }
    throw new Error(
      `Manifest ID alignment failure: ${parts.join('; ')}. Suite invariant IDs and manifest catalog must match.`,
    );
  }

  // ── Certification consistency ──────────────────────────────────────
  //
  // Use per-surface provingSurfaces (not results.invariants_passed) so
  // this check remains correct with multi-surface manifests where an
  // invariant can be 'partial' (passed on this surface but not all).

  const passedIds = handle.passedIds();
  const manifestSurfacePassSet = new Set(
    manifest.invariants
      .filter((inv) => inv.provingSurfaces.includes(handle.surfaceName))
      .map((inv) => inv.id),
  );

  // Every invariant the handle recorded as 'pass' must appear in this
  // surface's provingSurfaces. If not, surfaceResults was likely omitted.
  const missingFromManifest: string[] = [];
  for (const id of passedIds) {
    if (!manifestSurfacePassSet.has(id)) {
      missingFromManifest.push(id);
    }
  }
  if (missingFromManifest.length > 0) {
    throw new Error(
      `Manifest wiring regression: surface=${handle.surfaceName} missing_pass=[${missingFromManifest.join(', ')}] — handle recorded these as passed but manifest does not list this surface in their provingSurfaces. Was surfaceResults omitted from generateManifest()?`,
    );
  }

  // Every invariant the handle recorded as 'fail' must NOT appear in
  // this surface's provingSurfaces.
  const handleFailedIds = Object.entries(handle.status)
    .filter(([, s]) => s === 'fail')
    .map(([id]) => id);
  const falselyPassed: string[] = [];
  for (const id of handleFailedIds) {
    if (manifestSurfacePassSet.has(id)) {
      falselyPassed.push(id);
    }
  }
  if (falselyPassed.length > 0) {
    throw new Error(
      `Manifest wiring regression: surface=${handle.surfaceName} falsely_passed=[${falselyPassed.join(', ')}] — handle recorded these as failed but manifest lists this surface in their provingSurfaces`,
    );
  }

  // ── Execution consistency ──────────────────────────────────────────

  if (!manifest.results.execution_patched) {
    throw new Error(
      'Manifest execution regression: execution_patched is false. Was patchExecutionResults() or finalizeManifest() called?',
    );
  }

  // run_passed must track handle failures
  if (handleFailedIds.length > 0) {
    if (manifest.results.run_passed !== false) {
      throw new Error(
        `Manifest execution regression: handle has failures [${handleFailedIds.join(', ')}] but manifest.results.run_passed is true. Was patchExecutionResults() called?`,
      );
    }
    const manifestFailedSet = new Set(manifest.results.invariants_failed);
    const missingFailures = handleFailedIds.filter((id) => !manifestFailedSet.has(id));
    const extraFailures = manifest.results.invariants_failed.filter((id) => !handleFailedIds.includes(id));
    if (missingFailures.length > 0 || extraFailures.length > 0) {
      throw new Error(
        `Manifest execution regression: invariants_failed does not match handle. Missing: [${missingFailures.join(', ')}]. Extra: [${extraFailures.join(', ')}]. Was patchExecutionResults() called?`,
      );
    }
  } else {
    if (manifest.results.run_passed !== true) {
      throw new Error(
        `Manifest execution regression: handle has no failures but manifest.results.run_passed is false. Was patchExecutionResults() called?`,
      );
    }
    if (manifest.results.invariants_failed.length > 0) {
      throw new Error(
        `Manifest execution regression: handle has no failures but manifest.results.invariants_failed is non-empty: [${manifest.results.invariants_failed.join(', ')}]. Was patchExecutionResults() called?`,
      );
    }
  }
}

/**
 * Atomic finalize: patches execution truth from the handle then runs
 * the truthfulness tripwire. Call this after generateP21*Manifest()
 * and before writing the manifest to disk.
 *
 * Fail-closed on double call: throws if execution_patched is already
 * true, preventing silent re-patching that could mask ordering bugs.
 *
 * Replaces the two-call sequence:
 *   patchExecutionResults(handle, manifest);
 *   assertManifestTruthfulness(handle, manifest);
 */
export function finalizeManifest(handle: P21RunHandle, manifest: CapabilityProofManifest): void {
  if (manifest.results.execution_patched) {
    throw new Error(
      'finalizeManifest called twice: execution_patched is already true. This likely indicates a wiring bug in the afterAll hook.',
    );
  }
  patchExecutionResults(handle, manifest);
  assertManifestTruthfulness(handle, manifest);
}
