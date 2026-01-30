/**
 * Solve Bundle Computation
 *
 * Content-addressed hashing utilities and bundle computation for Sterling
 * solve round-trips. Uses SHA-256 truncated to 16 hex chars via Node crypto.
 *
 * Canonicalization contract (see Design Decision #3):
 * - Objects: sort keys lexicographically at every nesting level
 * - Arrays: preserve insertion order (never sort)
 * - undefined values in objects: omit the key entirely
 * - undefined in arrays: encode as null
 * - NaN, Infinity, -Infinity: reject (throw CanonicalizeError)
 * - -0: normalize to 0
 * - function, symbol, BigInt: reject (throw CanonicalizeError)
 * - Numbers: JSON.stringify default
 *
 * @author @darianrosebrook
 */

import { createHash } from 'node:crypto';
import type {
  ContentHash,
  SolveBundleInput,
  SolveBundleOutput,
  SolveBundle,
  CompatReport,
  SearchHealthMetrics,
} from './solve-bundle-types';

/** Package version — keep in sync with package.json */
const CODE_VERSION = '0.1.0';

// ============================================================================
// Canonicalization
// ============================================================================

export class CanonicalizeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CanonicalizeError';
  }
}

/**
 * Canonicalize a value to a deterministic JSON string.
 *
 * Objects are sorted by key at every nesting level. Arrays preserve
 * insertion order. Non-JSON-safe values are rejected.
 */
export function canonicalize(value: unknown): string {
  return canonicalizeValue(value);
}

function canonicalizeValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'null';

  const type = typeof value;

  if (type === 'boolean') return JSON.stringify(value);

  if (type === 'number') {
    const n = value as number;
    if (Number.isNaN(n)) throw new CanonicalizeError('NaN is not canonicalizable');
    if (!Number.isFinite(n)) throw new CanonicalizeError(`${n} is not canonicalizable`);
    // Normalize -0 to 0
    if (Object.is(n, -0)) return '0';
    return JSON.stringify(n);
  }

  if (type === 'string') return JSON.stringify(value);

  if (type === 'function') throw new CanonicalizeError('Functions are not canonicalizable');
  if (type === 'symbol') throw new CanonicalizeError('Symbols are not canonicalizable');
  if (type === 'bigint') throw new CanonicalizeError('BigInt values are not canonicalizable');

  if (Array.isArray(value)) {
    const items = value.map((item) => canonicalizeValue(item === undefined ? null : item));
    return `[${items.join(',')}]`;
  }

  // Plain object: sort keys lexicographically, omit undefined values
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const pairs: string[] = [];
  for (const key of keys) {
    const v = obj[key];
    if (v === undefined) continue; // omit undefined keys
    pairs.push(`${JSON.stringify(key)}:${canonicalizeValue(v)}`);
  }
  return `{${pairs.join(',')}}`;
}

// ============================================================================
// Hashing
// ============================================================================

/** SHA-256 → first 16 hex chars */
export function contentHash(input: string): ContentHash {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

/**
 * Hash a definition array (rules or modules).
 *
 * Sorts a COPY by `action` (or first string key) for deterministic hashing.
 * The original array is NOT mutated.
 */
export function hashDefinition(definitions: unknown[]): ContentHash {
  const sorted = [...definitions].sort((a, b) => {
    const aKey = extractSortKey(a);
    const bKey = extractSortKey(b);
    return aKey.localeCompare(bKey);
  });
  return contentHash(canonicalize(sorted));
}

function extractSortKey(item: unknown): string {
  if (item !== null && typeof item === 'object') {
    const obj = item as Record<string, unknown>;
    if (typeof obj.action === 'string') return obj.action;
    if (typeof obj.moduleId === 'string') return obj.moduleId;
  }
  return '';
}

/**
 * Hash inventory state. Omits zero-valued entries and sorts keys.
 *
 * Documented: missing key === 0 for inventory semantics.
 * This zero-omission is specific to inventory hashing, NOT part of
 * the general canonicalize() function.
 */
export function hashInventoryState(inventory: Record<string, number>): ContentHash {
  const filtered: Record<string, number> = {};
  for (const [key, value] of Object.entries(inventory)) {
    if (value !== 0) {
      filtered[key] = value;
    }
  }
  return contentHash(canonicalize(filtered));
}

/** Hash a goal record (sorted keys, no zero filtering) */
export function hashGoal(goal: Record<string, number>): ContentHash {
  return contentHash(canonicalize(goal));
}

/** Hash nearby blocks array (order preserved) */
export function hashNearbyBlocks(blocks: string[]): ContentHash {
  return contentHash(canonicalize(blocks));
}

/** Hash ordered action IDs from solve steps */
export function hashSteps(steps: Array<{ action: string }>): ContentHash {
  const actions = steps.map((s) => s.action);
  return contentHash(canonicalize(actions));
}

// ============================================================================
// Bundle Computation
// ============================================================================

export function computeBundleInput(params: {
  solverId: string;
  executionMode?: string;
  contractVersion: number;
  definitions: unknown[];
  inventory: Record<string, number>;
  goal: Record<string, number>;
  nearbyBlocks: string[];
  tierMatrixVersion?: string;
}): SolveBundleInput {
  return {
    solverId: params.solverId,
    executionMode: params.executionMode,
    contractVersion: params.contractVersion,
    definitionHash: hashDefinition(params.definitions),
    initialStateHash: hashInventoryState(params.inventory),
    goalHash: hashGoal(params.goal),
    nearbyBlocksHash: hashNearbyBlocks(params.nearbyBlocks),
    codeVersion: CODE_VERSION,
    tierMatrixVersion: params.tierMatrixVersion,
    definitionCount: params.definitions.length,
  };
}

export function computeBundleOutput(params: {
  planId: string | null;
  solved: boolean;
  steps: Array<{ action: string }>;
  totalNodes: number;
  durationMs: number;
  solutionPathLength: number;
  searchHealth?: SearchHealthMetrics;
}): SolveBundleOutput {
  const searchHealth = params.searchHealth
    ? { ...params.searchHealth, searchHealthVersion: 1 }
    : undefined;
  return {
    planId: params.planId,
    solved: params.solved,
    stepsDigest: hashSteps(params.steps),
    searchStats: {
      totalNodes: params.totalNodes,
      durationMs: params.durationMs,
      solutionPathLength: params.solutionPathLength,
    },
    searchHealth,
  };
}

// ============================================================================
// Bundle Creation
// ============================================================================

/**
 * Strip nondeterministic fields before hashing for content-addressed identity.
 * Excluded: timestamp, checkedAt
 */
function hashableBundlePayload(
  input: SolveBundleInput,
  output: SolveBundleOutput,
  compatReport: CompatReport
): string {
  const hashableReport: Record<string, unknown> = {
    valid: compatReport.valid,
    issues: compatReport.issues,
    definitionCount: compatReport.definitionCount,
    // checkedAt excluded
  };
  return canonicalize({ input, output, compatReport: hashableReport });
}

/**
 * Create a content-addressed SolveBundle.
 *
 * bundleId = `${solverId}:${bundleHash}` where bundleHash excludes
 * nondeterministic fields (timestamp, checkedAt).
 */
export function createSolveBundle(
  input: SolveBundleInput,
  output: SolveBundleOutput,
  compatReport: CompatReport
): SolveBundle {
  const payload = hashableBundlePayload(input, output, compatReport);
  const bundleHash = contentHash(payload);
  return {
    bundleId: `${input.solverId}:${bundleHash}`,
    bundleHash,
    timestamp: Date.now(),
    input,
    output,
    compatReport,
  };
}
