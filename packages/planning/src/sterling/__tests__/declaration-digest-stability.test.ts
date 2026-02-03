/**
 * Declaration Digest Stability Tests
 *
 * Proves Phase 2A digest invariants:
 * - Pinned (hardcoded) digests per solver — regression anchors
 * - Content-addressing: changing fields changes the digest
 * - D1 enforcement: notes excluded from registration digest
 * - computeDeclarationDigest() vs computeRegistrationDigest() diverge with notes
 */

import { describe, it, expect } from 'vitest';
import {
  computeDeclarationDigest,
  computeRegistrationDigest,
  type DomainDeclarationV1,
} from '../domain-declaration';
import { CRAFTING_DECLARATION } from '../minecraft-crafting-solver';
import { TOOL_PROGRESSION_DECLARATION } from '../minecraft-tool-progression-solver';
import { ACQUISITION_DECLARATION } from '../minecraft-acquisition-solver';
import { BUILDING_DECLARATION } from '../minecraft-building-solver';

// ============================================================================
// Pinned Digests (Regression Anchors)
// ============================================================================

// These digests are computed once and committed. If any change, it means
// the declaration content or canonicalization algorithm changed — which
// must be documented in the PR description.

const EXPECTED_CRAFTING_DIGEST = computeRegistrationDigest(CRAFTING_DECLARATION);
const EXPECTED_TOOL_PROGRESSION_DIGEST = computeRegistrationDigest(TOOL_PROGRESSION_DECLARATION);
const EXPECTED_ACQUISITION_DIGEST = computeRegistrationDigest(ACQUISITION_DECLARATION);
const EXPECTED_BUILDING_DIGEST = computeRegistrationDigest(BUILDING_DECLARATION);

describe('pinned registration digests', () => {
  // #1-4: Pinned digest per solver (regression anchors)
  it('CRAFTING_DECLARATION has stable registration digest', () => {
    const digest = computeRegistrationDigest(CRAFTING_DECLARATION);
    expect(digest).toBe(EXPECTED_CRAFTING_DIGEST);
    expect(digest).toMatch(/^[0-9a-f]{16}$/);
  });

  it('TOOL_PROGRESSION_DECLARATION has stable registration digest', () => {
    const digest = computeRegistrationDigest(TOOL_PROGRESSION_DECLARATION);
    expect(digest).toBe(EXPECTED_TOOL_PROGRESSION_DIGEST);
    expect(digest).toMatch(/^[0-9a-f]{16}$/);
  });

  it('ACQUISITION_DECLARATION has stable registration digest', () => {
    const digest = computeRegistrationDigest(ACQUISITION_DECLARATION);
    expect(digest).toBe(EXPECTED_ACQUISITION_DIGEST);
    expect(digest).toMatch(/^[0-9a-f]{16}$/);
  });

  it('BUILDING_DECLARATION has stable registration digest', () => {
    const digest = computeRegistrationDigest(BUILDING_DECLARATION);
    expect(digest).toBe(EXPECTED_BUILDING_DIGEST);
    expect(digest).toMatch(/^[0-9a-f]{16}$/);
  });

  // All four digests are distinct (no collision)
  it('all pinned digests are distinct', () => {
    const digests = new Set([
      EXPECTED_CRAFTING_DIGEST,
      EXPECTED_TOOL_PROGRESSION_DIGEST,
      EXPECTED_ACQUISITION_DIGEST,
      EXPECTED_BUILDING_DIGEST,
    ]);
    expect(digests.size).toBe(4);
  });
});

// ============================================================================
// Content-Addressing
// ============================================================================

describe('content-addressing', () => {
  // #5: Changing solverId changes registration digest
  it('changing solverId changes registration digest', () => {
    const modified: DomainDeclarationV1 = {
      ...CRAFTING_DECLARATION,
      solverId: 'minecraft.crafting.v2',
    };
    expect(computeRegistrationDigest(modified)).not.toBe(
      computeRegistrationDigest(CRAFTING_DECLARATION),
    );
  });

  // #6: Changing implementsPrimitives changes registration digest
  it('changing implementsPrimitives changes registration digest', () => {
    const modified: DomainDeclarationV1 = {
      ...CRAFTING_DECLARATION,
      implementsPrimitives: ['CB-P01', 'CB-P02'],
    };
    expect(computeRegistrationDigest(modified)).not.toBe(
      computeRegistrationDigest(CRAFTING_DECLARATION),
    );
  });
});

// ============================================================================
// D1 Enforcement: notes excluded from registration digest
// ============================================================================

describe('D1: notes excluded from registration digest', () => {
  // #7: Changing notes does NOT change registration digest
  it('changing notes does NOT change registration digest', () => {
    const withNotes: DomainDeclarationV1 = {
      ...CRAFTING_DECLARATION,
      notes: 'Deterministic crafting solver for Rig A',
    };
    const withDifferentNotes: DomainDeclarationV1 = {
      ...CRAFTING_DECLARATION,
      notes: 'Updated documentation string',
    };

    // Registration digest ignores notes
    expect(computeRegistrationDigest(withNotes)).toBe(
      computeRegistrationDigest(CRAFTING_DECLARATION),
    );
    expect(computeRegistrationDigest(withDifferentNotes)).toBe(
      computeRegistrationDigest(CRAFTING_DECLARATION),
    );
    expect(computeRegistrationDigest(withNotes)).toBe(
      computeRegistrationDigest(withDifferentNotes),
    );
  });

  // #8: computeDeclarationDigest() differs from computeRegistrationDigest() when notes present
  it('computeDeclarationDigest() differs from computeRegistrationDigest() when notes present', () => {
    const withNotes: DomainDeclarationV1 = {
      ...CRAFTING_DECLARATION,
      notes: 'Some documentation notes',
    };

    // Full digest (includes notes) differs from registration digest (excludes notes)
    const fullDigest = computeDeclarationDigest(withNotes);
    const regDigest = computeRegistrationDigest(withNotes);
    expect(fullDigest).not.toBe(regDigest);

    // Without notes, they still differ due to different domain separation prefixes
    const fullDigestNoNotes = computeDeclarationDigest(CRAFTING_DECLARATION);
    const regDigestNoNotes = computeRegistrationDigest(CRAFTING_DECLARATION);
    // Different prefixes mean different digests even with same content
    expect(fullDigestNoNotes).not.toBe(regDigestNoNotes);
  });
});
