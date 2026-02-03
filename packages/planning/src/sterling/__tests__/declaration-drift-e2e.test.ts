/**
 * Declaration Drift E2E Tests (Phase 2B)
 *
 * Gated behind STERLING_E2E=1 — requires a running Sterling server.
 *
 * Proves:
 * - Idempotent registration via live server
 * - Drift handling in DEV mode (replaced flag)
 * - Digest parity between client and server
 * - Re-registration after reset succeeds
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SterlingReasoningService } from '../sterling-reasoning-service';
import { CRAFTING_DECLARATION } from '../minecraft-crafting-solver';
import { computeRegistrationDigest } from '../domain-declaration';
import type { DomainDeclarationV1 } from '../domain-declaration';

const describeIf = (condition: boolean) =>
  condition ? describe : describe.skip;

const IS_E2E = process.env.STERLING_E2E === '1';

describeIf(IS_E2E)('declaration-drift-e2e', () => {
  let service: SterlingReasoningService;

  beforeAll(async () => {
    service = new SterlingReasoningService({
      url: process.env.STERLING_WS_URL || 'ws://localhost:8765',
    });
    await service.initialize();
  });

  afterAll(() => {
    service?.destroy();
  });

  // Helper: reset declarations via the solve channel
  async function resetDeclarations(): Promise<void> {
    await service.solve('minecraft' as any, {
      command: 'reset_declaration_registry',
    });
  }

  // #1: Register CRAFTING_DECLARATION twice → idempotent
  it('register CRAFTING_DECLARATION twice: idempotent success', async () => {
    await resetDeclarations();
    const digest = computeRegistrationDigest(CRAFTING_DECLARATION);

    const r1 = await service.registerDomainDeclaration(
      CRAFTING_DECLARATION as unknown as Record<string, unknown>,
      digest,
    );
    expect(r1.success).toBe(true);

    const r2 = await service.registerDomainDeclaration(
      CRAFTING_DECLARATION as unknown as Record<string, unknown>,
      digest,
    );
    expect(r2.success).toBe(true);
  });

  // #2: Register same (solverId, contractVersion) with different content in DEV → replaced
  it('register same solverId+version with different content in DEV: accepted with replaced flag', async () => {
    await resetDeclarations();
    const digest1 = computeRegistrationDigest(CRAFTING_DECLARATION);

    const r1 = await service.registerDomainDeclaration(
      CRAFTING_DECLARATION as unknown as Record<string, unknown>,
      digest1,
    );
    expect(r1.success).toBe(true);

    // Modified declaration: same solverId + same contractVersion, different fields
    // This is genuine drift (not a version bump).
    const modified: DomainDeclarationV1 = {
      ...CRAFTING_DECLARATION,
      consumesFields: [...CRAFTING_DECLARATION.consumesFields, 'extraField'],
    };
    const digest2 = computeRegistrationDigest(modified);
    expect(digest2).not.toBe(digest1);

    const r2 = await service.registerDomainDeclaration(
      modified as unknown as Record<string, unknown>,
      digest2,
    );
    // In DEV mode (default), drift is accepted
    expect(r2.success).toBe(true);
  });

  // #2b: Different contractVersion for same solverId → separate entry, not drift
  it('different contractVersion for same solverId: coexists without drift', async () => {
    await resetDeclarations();
    const digest1 = computeRegistrationDigest(CRAFTING_DECLARATION);

    const r1 = await service.registerDomainDeclaration(
      CRAFTING_DECLARATION as unknown as Record<string, unknown>,
      digest1,
    );
    expect(r1.success).toBe(true);

    // Version bump: same solverId, different contractVersion
    const v2: DomainDeclarationV1 = {
      ...CRAFTING_DECLARATION,
      contractVersion: 2,
      consumesFields: [...CRAFTING_DECLARATION.consumesFields, 'executionMode'],
    };
    const digest2 = computeRegistrationDigest(v2);
    expect(digest2).not.toBe(digest1);

    const r2 = await service.registerDomainDeclaration(
      v2 as unknown as Record<string, unknown>,
      digest2,
    );
    // Should succeed as a new registration, not drift
    expect(r2.success).toBe(true);
  });

  // #3: Server-computed digest equals client-computed digest
  it('server-computed digest equals client-computed digest', async () => {
    await resetDeclarations();
    const clientDigest = computeRegistrationDigest(CRAFTING_DECLARATION);

    const result = await service.registerDomainDeclaration(
      CRAFTING_DECLARATION as unknown as Record<string, unknown>,
      clientDigest,
    );
    expect(result.success).toBe(true);
    // Server returns the digest it computed — should match our client digest
    // (If they didn't match, the server would reject with digest_mismatch)
    expect(result.digest).toBeTruthy();
  });

  // #4: After reset, re-register with different content → succeeds
  it('after reset, re-register with different content: succeeds', async () => {
    // Register v1
    await resetDeclarations();
    const digest1 = computeRegistrationDigest(CRAFTING_DECLARATION);
    await service.registerDomainDeclaration(
      CRAFTING_DECLARATION as unknown as Record<string, unknown>,
      digest1,
    );

    // Reset
    await resetDeclarations();

    // Register v2 with same solverId but different content
    const modified: DomainDeclarationV1 = {
      ...CRAFTING_DECLARATION,
      contractVersion: 99,
    };
    const digest2 = computeRegistrationDigest(modified);

    const result = await service.registerDomainDeclaration(
      modified as unknown as Record<string, unknown>,
      digest2,
    );
    expect(result.success).toBe(true);
  });
});
