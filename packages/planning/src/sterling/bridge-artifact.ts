/**
 * M3: Bridge Artifact Computation
 *
 * Builds content-addressed BridgeEdgeV1 artifacts for the two production
 * bridge types: acquire_for_craft and craft_for_build.
 *
 * @author @darianrosebrook
 */

import { createHash } from 'node:crypto';
import type { ContentHash, SolveBundle } from './solve-bundle-types';
import type { CapabilityDecisionRecord } from '../modules/solve-contract';
import type {
  BridgeEdgeV1,
  BridgeKind,
  SegmentRef,
  PreconditionWitness,
  PostconditionWitness,
} from './bridge-artifact-types';
import { BRIDGE_SEMANTICS_VERSION } from './bridge-artifact-types';

// ============================================================================
// Content Addressing
// ============================================================================

function contentHash(input: string): ContentHash {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

function canonicalize(obj: unknown): string {
  return JSON.stringify(obj, Object.keys(obj as object).sort(), 0);
}

function witnessHash(kind: string, items: Record<string, number>): ContentHash {
  return contentHash(`witness:${kind}:${canonicalize(items)}`);
}

// ============================================================================
// Segment Reference Builder
// ============================================================================

/**
 * Build a SegmentRef from a SolveBundle.
 */
export function segmentRefFromBundle(bundle: SolveBundle): SegmentRef {
  return {
    solverId: bundle.input.solverId,
    bundleHash: bundle.bundleHash,
    traceBundleHash: bundle.output.sterlingIdentity?.traceBundleHash,
    planId: bundle.output.planId ?? undefined,
  };
}

// ============================================================================
// acquire_for_craft Bridge
// ============================================================================

/**
 * Build an acquire_for_craft bridge edge.
 *
 * Created when Rig D's mine/craft delegation produces items that
 * satisfy a crafting goal. The upstream is the acquisition segment
 * (parent bundle), the downstream is the crafting segment (child bundle).
 *
 * @param upstreamBundle - Rig D parent (orchestration) bundle
 * @param downstreamBundle - Rig A child (crafting) bundle
 * @param acquiredItems - Items that were produced by acquisition
 * @param requiredItems - Items that crafting needed
 * @param options - Capability decisions for provenance
 */
export function buildAcquireForCraftBridge(
  upstreamBundle: SolveBundle,
  downstreamBundle: SolveBundle,
  acquiredItems: Record<string, number>,
  requiredItems: Record<string, number>,
  options?: {
    upstreamDecision?: CapabilityDecisionRecord;
    downstreamDecision?: CapabilityDecisionRecord;
  },
): BridgeEdgeV1 {
  const upstreamRef = segmentRefFromBundle(upstreamBundle);
  const downstreamRef = segmentRefFromBundle(downstreamBundle);

  const precondition: PreconditionWitness = {
    witnessHash: witnessHash('items_available', requiredItems),
    kind: 'items_available',
    requiredItems,
  };

  const postcondition: PostconditionWitness = {
    witnessHash: witnessHash('items_produced', acquiredItems),
    kind: 'items_produced',
    producedItems: acquiredItems,
    solved: upstreamBundle.output.solved,
  };

  const bridgeHash = computeBridgeHash(
    'acquire_for_craft',
    upstreamRef,
    downstreamRef,
    precondition,
    postcondition,
  );

  return {
    semanticsVersion: BRIDGE_SEMANTICS_VERSION,
    kind: 'acquire_for_craft',
    bridgeHash,
    createdAt: Date.now(),
    upstreamRef,
    downstreamRef,
    precondition,
    postcondition,
    upstreamDecision: options?.upstreamDecision,
    downstreamDecision: options?.downstreamDecision,
  };
}

// ============================================================================
// craft_for_build Bridge
// ============================================================================

/**
 * Build a craft_for_build bridge edge.
 *
 * Created when Rig G detects a material deficit (needsMaterials) and
 * the planner generates acquisition steps to satisfy it. The upstream
 * is whatever solved the material acquisition, the downstream is the
 * building solver's deficit declaration.
 *
 * @param upstreamBundle - Bundle from the acquisition/crafting that provided materials
 * @param downstreamBundle - Rig G building bundle that declared the deficit
 * @param producedItems - Materials that were acquired/crafted
 * @param deficit - The material deficit declared by Rig G
 * @param options - Capability decisions for provenance
 */
export function buildCraftForBuildBridge(
  upstreamBundle: SolveBundle,
  downstreamBundle: SolveBundle,
  producedItems: Record<string, number>,
  deficit: Record<string, number>,
  options?: {
    upstreamDecision?: CapabilityDecisionRecord;
    downstreamDecision?: CapabilityDecisionRecord;
  },
): BridgeEdgeV1 {
  const upstreamRef = segmentRefFromBundle(upstreamBundle);
  const downstreamRef = segmentRefFromBundle(downstreamBundle);

  const precondition: PreconditionWitness = {
    witnessHash: witnessHash('material_deficit_resolved', deficit),
    kind: 'material_deficit_resolved',
    requiredItems: deficit,
  };

  const postcondition: PostconditionWitness = {
    witnessHash: witnessHash('items_produced', producedItems),
    kind: 'items_produced',
    producedItems,
    solved: upstreamBundle.output.solved,
  };

  const bridgeHash = computeBridgeHash(
    'craft_for_build',
    upstreamRef,
    downstreamRef,
    precondition,
    postcondition,
  );

  return {
    semanticsVersion: BRIDGE_SEMANTICS_VERSION,
    kind: 'craft_for_build',
    bridgeHash,
    createdAt: Date.now(),
    upstreamRef,
    downstreamRef,
    precondition,
    postcondition,
    upstreamDecision: options?.upstreamDecision,
    downstreamDecision: options?.downstreamDecision,
  };
}

// ============================================================================
// Bridge Hash
// ============================================================================

/**
 * Compute content-addressed bridge hash.
 * Deterministic: same inputs → same hash. Excludes createdAt.
 */
function computeBridgeHash(
  kind: BridgeKind,
  upstreamRef: SegmentRef,
  downstreamRef: SegmentRef,
  precondition: PreconditionWitness,
  postcondition: PostconditionWitness,
): ContentHash {
  const preimage = [
    `bridge:v1:${kind}`,
    `upstream:${upstreamRef.solverId}:${upstreamRef.bundleHash}`,
    `downstream:${downstreamRef.solverId}:${downstreamRef.bundleHash}`,
    `pre:${precondition.witnessHash}`,
    `post:${postcondition.witnessHash}`,
  ].join(':');

  return contentHash(preimage);
}
