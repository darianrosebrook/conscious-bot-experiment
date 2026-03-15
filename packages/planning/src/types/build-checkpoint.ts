/**
 * M5: Build Checkpoint Types
 *
 * Types for checkpointed long-horizon building execution.
 * Derived from Structure Build Protocol v0 (docs/internal/long-horizon-build.md)
 * Stage 1: Checkpointed module execution.
 *
 * These types define the checkpoint schema, module witness, and site
 * signature that enable resume-by-delta for building tasks.
 *
 * @author @darianrosebrook
 */

import type { ContentHash } from '../sterling/solve-bundle-types';

// ============================================================================
// Site Signature
// ============================================================================

/**
 * Stable anchor for the build site. Set once when the build starts,
 * never changed afterward. Used for resume: if the site signature
 * can't be verified, the build must replan from bootstrap.
 */
export interface SiteSignature {
  /** Absolute position of the build origin */
  position: { x: number; y: number; z: number };
  /** Facing direction of the build */
  facing: 'N' | 'S' | 'E' | 'W';
  /** Reference corner for relative coordinate computation */
  refCorner: { x: number; y: number; z: number };
  /** Bounding box of the build footprint */
  footprintBounds: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  };
}

// ============================================================================
// Station Registry
// ============================================================================

/**
 * A workstation relevant to a build (crafting table, furnace, etc.).
 * Workstations are the earliest interruptible/resumable anchors.
 */
export interface StationEntry {
  kind: 'crafting_table' | 'furnace' | 'smoker' | 'blast_furnace' | 'anvil';
  pos: { x: number; y: number; z: number };
  reachable: boolean;
  lastVerifiedAt: number;
  provenance: {
    source: 'placed' | 'found';
    moduleIndex: number;
    stepId?: string;
  };
}

// ============================================================================
// Module Witness
// ============================================================================

/**
 * Deterministic verification witness for a single building module.
 *
 * Produced by the building solver alongside each module's steps.
 * Used by verify_module to check only the declared positions
 * (bounded scan, not full footprint).
 */
export interface ModuleWitnessV1 {
  /** Module this witness describes */
  moduleId: string;
  /** Coordinate frame: relative positions are offset from refCorner */
  refCorner: { x: number; y: number; z: number };
  facing: 'N' | 'S' | 'E' | 'W';
  /** Blocks that must exist after module completion (relative to refCorner) */
  expectedPlacements: Array<{
    dx: number;
    dy: number;
    dz: number;
    blockId: string;
  }>;
  /** Positions that must be air (doorways, interior space, corridors) */
  requiredEmpty: Array<{
    dx: number;
    dy: number;
    dz: number;
  }>;
  /** Content-addressed digest of this witness */
  witnessDigest: ContentHash;
}

// ============================================================================
// Build Checkpoint
// ============================================================================

/**
 * A checkpoint represents a verified module completion point.
 * Append-only: checkpoints are never modified or deleted.
 */
export interface BuildCheckpoint {
  /** Content-addressed: hash of {templateDigest, moduleCursor, completedModules} */
  checkpointId: ContentHash;
  /** Template digest at checkpoint time */
  templateDigest: ContentHash;
  /** moduleCursor value at checkpoint time (points to next module) */
  moduleCursor: number;
  /** Module IDs that have passed postcondition verification */
  completedModules: string[];
  /** Station state at checkpoint time */
  stationSnapshot: StationEntry[];
  /** Invariant check results */
  invariantResults: Array<{
    invariant: string;
    passed: boolean;
    evidence?: string;
  }>;
  /** Known deviations to address later */
  openDeltas: Array<{
    moduleId: string;
    issue: string;
    severity: 'blocking' | 'degraded' | 'cosmetic';
  }>;
  /** Coarse inventory summary (key materials + tools) */
  inventorySummary: Record<string, number>;
  /** When this checkpoint was taken */
  savedAt: number;
}

// ============================================================================
// Build Metadata (persisted on task.metadata.build)
// ============================================================================

/**
 * Full build state persisted in task metadata.
 *
 * This is the checkpoint surface for resume-by-delta:
 * - siteSignature: stable anchor (set once)
 * - moduleCursor: next module index
 * - completedModules: verified completions
 * - checkpoints: append-only history
 * - witnesses: per-module verification inputs
 */
export interface BuildMetadata {
  /** Content-addressed digest of template modules + goals */
  templateDigest: ContentHash;
  /** Stable anchor for the build site */
  siteSignature: SiteSignature;
  /** Index of the next module to execute (0-based) */
  moduleCursor: number;
  /** Module IDs that have passed postcondition verification */
  completedModules: string[];
  /** Append-only checkpoint list */
  checkpoints: BuildCheckpoint[];
  /** Known workstations relevant to this build */
  stationRegistry: StationEntry[];
  /** Per-module verification witnesses */
  witnesses: Record<string, ModuleWitnessV1>;
  /** Invariant set version */
  invariantSetVersion: number;
}
