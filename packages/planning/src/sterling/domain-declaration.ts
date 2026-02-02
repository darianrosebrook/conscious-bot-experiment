/**
 * Domain Declaration V1
 *
 * Cross-boundary claim object that a solver sends to Sterling to register
 * what capabilities it provides. Sterling stores these in an in-memory
 * registry keyed by content-addressed digest.
 *
 * The declaration is orthogonal to solve messages — claim plumbing cannot
 * contaminate solver reliability.
 *
 * @author @darianrosebrook
 */

import type { QualifiedPrimitiveId } from './primitive-namespace';
import { assertQualifiedPrimitiveIds } from './primitive-namespace';
import { canonicalize, contentHash } from './solve-bundle';

// ============================================================================
// Declaration Shape
// ============================================================================

/**
 * V1 domain declaration — the canonical claim object.
 *
 * Every field participates in the digest. Adding optional fields
 * (like `notes`) changes the digest, which is intentional: the
 * declaration identity includes everything the solver claims.
 */
export interface DomainDeclarationV1 {
  /** Schema version. Always 1 for V1 declarations. */
  readonly declarationVersion: 1;
  /** Unique solver identifier (e.g. 'minecraft.crafting'). */
  readonly solverId: string;
  /** Contract version this solver implements. */
  readonly contractVersion: number;
  /** Qualified primitive IDs this solver claims to implement. */
  readonly implementsPrimitives: readonly QualifiedPrimitiveId[];
  /** SolveInput fields this solver consumes. */
  readonly consumesFields: readonly string[];
  /** Fields this solver produces in its output. */
  readonly producesFields: readonly string[];
  /** Optional human-readable notes. */
  readonly notes?: string;
}

// ============================================================================
// Digest Computation
// ============================================================================

/** Domain separation prefix for declaration digests. */
const DECLARATION_DIGEST_PREFIX = 'domain_declaration_v1:';

/**
 * Compute a content-addressed digest for a domain declaration.
 *
 * Uses the same canonicalize + contentHash infrastructure as SolveBundle,
 * with a domain separation prefix to prevent collision with bundle hashes.
 *
 * The digest is deterministic: same declaration fields produce the same
 * digest regardless of field insertion order (canonicalize sorts keys).
 */
export function computeDeclarationDigest(decl: DomainDeclarationV1): string {
  const canonical = canonicalize(decl);
  return contentHash(DECLARATION_DIGEST_PREFIX + canonical);
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate a DomainDeclarationV1 before sending to Sterling.
 *
 * Fail-closed: throws on any validation failure.
 * - declarationVersion must be 1
 * - solverId must be non-empty
 * - contractVersion must be a positive integer
 * - implementsPrimitives must all be qualified (CB-Pxx or ST-Pxx)
 * - consumesFields and producesFields must be non-empty arrays of strings
 *
 * Schema constraints (intentionally strict):
 * - Primitive IDs are constrained to ^(CB|ST)-P\d{2}$ — this means CB-P100+
 *   and suffixed forms like CB-P03.a are not representable. If the primitive
 *   taxonomy outgrows 99 entries per namespace, the regex must be widened.
 * - consumesFields and producesFields must be non-empty. "Marker solvers" or
 *   administrative domains that don't consume/produce solve fields will need
 *   to either use a sentinel field or relax this constraint in a future version.
 */
export function validateDeclaration(decl: DomainDeclarationV1): void {
  if (decl.declarationVersion !== 1) {
    throw new Error(
      `Invalid declarationVersion: ${decl.declarationVersion}. Expected 1.`,
    );
  }

  if (!decl.solverId || typeof decl.solverId !== 'string') {
    throw new Error('solverId must be a non-empty string.');
  }

  if (
    typeof decl.contractVersion !== 'number' ||
    !Number.isInteger(decl.contractVersion) ||
    decl.contractVersion < 1
  ) {
    throw new Error(
      `contractVersion must be a positive integer. Got: ${decl.contractVersion}`,
    );
  }

  if (!Array.isArray(decl.implementsPrimitives)) {
    throw new Error('implementsPrimitives must be an array.');
  }

  // Fail-closed: all primitive IDs must be qualified
  assertQualifiedPrimitiveIds(decl.implementsPrimitives);

  if (
    !Array.isArray(decl.consumesFields) ||
    decl.consumesFields.length === 0
  ) {
    throw new Error('consumesFields must be a non-empty array.');
  }

  if (
    !Array.isArray(decl.producesFields) ||
    decl.producesFields.length === 0
  ) {
    throw new Error('producesFields must be a non-empty array.');
  }
}

// ============================================================================
// Wire Format Helpers
// ============================================================================

/**
 * Build the WS message payload for register_domain_declaration_v1.
 *
 * Validates the declaration (fail-closed), computes the digest,
 * and returns the complete message ready for JSON serialization.
 */
export function buildRegisterMessage(decl: DomainDeclarationV1): {
  command: 'register_domain_declaration_v1';
  declaration: DomainDeclarationV1;
  digest: string;
} {
  validateDeclaration(decl);
  return {
    command: 'register_domain_declaration_v1',
    declaration: decl,
    digest: computeDeclarationDigest(decl),
  };
}

/**
 * Build the WS message payload for get_domain_declaration_v1.
 */
export function buildGetMessage(digest: string): {
  command: 'get_domain_declaration_v1';
  digest: string;
} {
  if (!digest || typeof digest !== 'string') {
    throw new Error('digest must be a non-empty string.');
  }
  return {
    command: 'get_domain_declaration_v1',
    digest,
  };
}
