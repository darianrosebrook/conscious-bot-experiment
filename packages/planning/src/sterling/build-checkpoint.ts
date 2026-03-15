/**
 * M5: Build Checkpoint Computation
 *
 * Helpers for creating, verifying, and persisting build checkpoints.
 * These implement the Stage 1 checkpoint lifecycle from the
 * Structure Build Protocol v0.
 *
 * @author @darianrosebrook
 */

import { createHash } from 'node:crypto';
import type { ContentHash } from './solve-bundle-types';
import type {
  BuildMetadata,
  BuildCheckpoint,
  ModuleWitnessV1,
  SiteSignature,
  StationEntry,
} from '../types/build-checkpoint';

// ============================================================================
// Content Addressing
// ============================================================================

function contentHash(input: string): ContentHash {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

function canonicalize(obj: unknown): string {
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(canonicalize).join(',')}]`;
  const sorted = Object.keys(obj as Record<string, unknown>).sort();
  return `{${sorted.map(k => `${JSON.stringify(k)}:${canonicalize((obj as any)[k])}`).join(',')}}`;
}

// ============================================================================
// Module Witness
// ============================================================================

/**
 * Compute the witness digest for a ModuleWitnessV1.
 * Deterministic: same placements + empties → same digest.
 */
export function computeWitnessDigest(
  expectedPlacements: ModuleWitnessV1['expectedPlacements'],
  requiredEmpty: ModuleWitnessV1['requiredEmpty'],
): ContentHash {
  const sorted = [...expectedPlacements].sort((a, b) =>
    a.dx !== b.dx ? a.dx - b.dx : a.dy !== b.dy ? a.dy - b.dy : a.dz - b.dz,
  );
  const sortedEmpty = [...requiredEmpty].sort((a, b) =>
    a.dx !== b.dx ? a.dx - b.dx : a.dy !== b.dy ? a.dy - b.dy : a.dz - b.dz,
  );
  return contentHash(`witness:v1:${canonicalize(sorted)}:${canonicalize(sortedEmpty)}`);
}

/**
 * Build a ModuleWitnessV1 from placement data.
 */
export function buildModuleWitness(
  moduleId: string,
  refCorner: { x: number; y: number; z: number },
  facing: 'N' | 'S' | 'E' | 'W',
  expectedPlacements: ModuleWitnessV1['expectedPlacements'],
  requiredEmpty: ModuleWitnessV1['requiredEmpty'] = [],
): ModuleWitnessV1 {
  return {
    moduleId,
    refCorner,
    facing,
    expectedPlacements,
    requiredEmpty,
    witnessDigest: computeWitnessDigest(expectedPlacements, requiredEmpty),
  };
}

// ============================================================================
// Build Checkpoint
// ============================================================================

/**
 * Compute the checkpoint ID from its content.
 * Deterministic: same template + cursor + modules → same ID.
 */
export function computeCheckpointId(
  templateDigest: ContentHash,
  moduleCursor: number,
  completedModules: string[],
): ContentHash {
  return contentHash(
    `checkpoint:v1:${templateDigest}:${moduleCursor}:${canonicalize([...completedModules].sort())}`,
  );
}

/**
 * Create a build checkpoint after verifying a module.
 */
export function createBuildCheckpoint(
  templateDigest: ContentHash,
  moduleCursor: number,
  completedModules: string[],
  stationSnapshot: StationEntry[],
  invariantResults: BuildCheckpoint['invariantResults'],
  inventorySummary: Record<string, number>,
  openDeltas: BuildCheckpoint['openDeltas'] = [],
): BuildCheckpoint {
  return {
    checkpointId: computeCheckpointId(templateDigest, moduleCursor, completedModules),
    templateDigest,
    moduleCursor,
    completedModules: [...completedModules],
    stationSnapshot: [...stationSnapshot],
    invariantResults,
    openDeltas,
    inventorySummary: { ...inventorySummary },
    savedAt: Date.now(),
  };
}

// ============================================================================
// Build Metadata Initialization
// ============================================================================

/**
 * Initialize empty build metadata for a new build task.
 */
export function initBuildMetadata(
  templateDigest: ContentHash,
  siteSignature: SiteSignature,
): BuildMetadata {
  return {
    templateDigest,
    siteSignature,
    moduleCursor: 0,
    completedModules: [],
    checkpoints: [],
    stationRegistry: [],
    witnesses: {},
    invariantSetVersion: 1,
  };
}

/**
 * Advance build metadata after a module checkpoint passes.
 * Returns a new metadata object (immutable update).
 */
export function advanceBuildMetadata(
  metadata: BuildMetadata,
  moduleId: string,
  checkpoint: BuildCheckpoint,
  witness?: ModuleWitnessV1,
): BuildMetadata {
  const updated: BuildMetadata = {
    ...metadata,
    moduleCursor: metadata.moduleCursor + 1,
    completedModules: [...metadata.completedModules, moduleId],
    checkpoints: [...metadata.checkpoints, checkpoint],
    witnesses: witness
      ? { ...metadata.witnesses, [moduleId]: witness }
      : metadata.witnesses,
  };
  return updated;
}

// ============================================================================
// Resume Decision
// ============================================================================

/**
 * Resume decision: what to do when a build task is re-entered.
 */
export type ResumeDecision =
  | { action: 'continue'; fromCursor: number; reason: string }
  | { action: 'repair'; fromCursor: number; deltas: BuildCheckpoint['openDeltas']; reason: string }
  | { action: 'replan'; reason: string };

/**
 * Determine the resume action for a build task.
 *
 * The decision is based on:
 * - Whether checkpoints exist
 * - Whether the site signature is still valid
 * - Whether the last checkpoint has open deltas
 */
export function computeResumeDecision(
  metadata: BuildMetadata | undefined,
  currentTemplateDigest: ContentHash,
  siteStillValid: boolean,
): ResumeDecision {
  // No metadata → fresh start
  if (!metadata || metadata.checkpoints.length === 0) {
    return { action: 'continue', fromCursor: 0, reason: 'no_checkpoints' };
  }

  // Template changed → replan
  if (metadata.templateDigest !== currentTemplateDigest) {
    return { action: 'replan', reason: 'template_changed' };
  }

  // Site not valid → replan from scratch
  if (!siteStillValid) {
    return { action: 'replan', reason: 'site_unrecognizable' };
  }

  const lastCheckpoint = metadata.checkpoints[metadata.checkpoints.length - 1];

  // Check for blocking deltas
  const blockingDeltas = lastCheckpoint.openDeltas.filter(d => d.severity === 'blocking');
  if (blockingDeltas.length > 0) {
    return {
      action: 'repair',
      fromCursor: lastCheckpoint.moduleCursor,
      deltas: blockingDeltas,
      reason: 'blocking_deltas',
    };
  }

  // All good → continue from last checkpoint
  return {
    action: 'continue',
    fromCursor: lastCheckpoint.moduleCursor,
    reason: 'checkpoint_clean',
  };
}
