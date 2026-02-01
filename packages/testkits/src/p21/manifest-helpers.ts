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

  const inHandleNotCatalog = [...handleIds].filter((id) => !catalogIds.has(id));
  const inCatalogNotHandle = [...catalogIds].filter((id) => !handleIds.has(id));

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

  const passedIds = handle.passedIds();
  const manifestPassedSet = new Set(manifest.results.invariants_passed);

  // Every invariant the handle recorded as 'pass' must appear in the manifest's passed list.
  // If not, surfaceResults was likely omitted (blank template regression).
  const missingFromManifest: string[] = [];
  for (const id of passedIds) {
    if (!manifestPassedSet.has(id)) {
      missingFromManifest.push(id);
    }
  }
  if (missingFromManifest.length > 0) {
    throw new Error(
      `Manifest wiring regression: handle shows ${missingFromManifest.join(', ')} as passed but manifest does not include them in invariants_passed. Was surfaceResults omitted from generateManifest()?`,
    );
  }

  // Every invariant the handle recorded as 'fail' must NOT appear in the manifest's passed list.
  const handleFailedIds = Object.entries(handle.status)
    .filter(([, s]) => s === 'fail')
    .map(([id]) => id);
  const falselyPassed: string[] = [];
  for (const id of handleFailedIds) {
    if (manifestPassedSet.has(id)) {
      falselyPassed.push(id);
    }
  }
  if (falselyPassed.length > 0) {
    throw new Error(
      `Manifest wiring regression: handle shows ${falselyPassed.join(', ')} as failed but manifest lists them as passed`,
    );
  }

  // ── Execution consistency ──────────────────────────────────────────

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
 * Replaces the two-call sequence:
 *   patchExecutionResults(handle, manifest);
 *   assertManifestTruthfulness(handle, manifest);
 */
export function finalizeManifest(handle: P21RunHandle, manifest: CapabilityProofManifest): void {
  patchExecutionResults(handle, manifest);
  assertManifestTruthfulness(handle, manifest);
}
