/**
 * Capability-Claim Registry E2E Test
 *
 * Proves the full register → get round-trip against a live Sterling server.
 *
 * Prerequisites: Sterling unified server running at ws://localhost:8766
 * Start with: cd sterling && python scripts/utils/sterling_unified_server.py
 *
 * Run with:
 *   STERLING_E2E=1 npx vitest run packages/planning/src/sterling/__tests__/capability-claim-registry-e2e.test.ts
 *
 * This test exercises the capability-claim pipeline orthogonal to solve.
 * Declaration plumbing cannot contaminate solver reliability.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { SterlingReasoningService } from '../sterling-reasoning-service';
import {
  computeDeclarationDigest,
  buildRegisterMessage,
  type DomainDeclarationV1,
} from '../domain-declaration';

const STERLING_URL = 'ws://localhost:8766';

// ---------------------------------------------------------------------------
// Environment gate
// ---------------------------------------------------------------------------

const shouldRun = !!process.env.STERLING_E2E;

function describeIf(condition: boolean) {
  return condition ? describe : describe.skip;
}

// ---------------------------------------------------------------------------
// Fresh service per test
// ---------------------------------------------------------------------------

const services: SterlingReasoningService[] = [];

async function freshService(): Promise<{ service: SterlingReasoningService; available: boolean }> {
  const service = new SterlingReasoningService({
    url: STERLING_URL,
    enabled: true,
    solveTimeout: 30000,
    connectTimeout: 5000,
    maxReconnectAttempts: 1,
  });

  await service.initialize();
  await new Promise((r) => setTimeout(r, 500));

  services.push(service);

  return { service, available: service.isAvailable() };
}

afterAll(() => {
  for (const svc of services) {
    svc.destroy();
  }
});

// ---------------------------------------------------------------------------
// Test declarations
// ---------------------------------------------------------------------------

const CRAFTING_DECLARATION: DomainDeclarationV1 = {
  declarationVersion: 1,
  solverId: 'minecraft.crafting',
  contractVersion: 1,
  implementsPrimitives: ['CB-P01', 'CB-P02', 'ST-P01'],
  consumesFields: ['state.inventory', 'goal.item', 'goal.quantity'],
  producesFields: ['steps', 'planId', 'solveMeta'],
};

const BUILDING_DECLARATION: DomainDeclarationV1 = {
  declarationVersion: 1,
  solverId: 'minecraft.building',
  contractVersion: 1,
  implementsPrimitives: ['CB-P07', 'CB-P08', 'ST-P01', 'ST-P05'],
  consumesFields: ['state.inventory', 'goal.structure'],
  producesFields: ['steps', 'planId', 'solveMeta'],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describeIf(shouldRun)('Capability-Claim Registry — E2E', () => {

  it('register → get round-trip returns identical declaration', async () => {
    const { service, available } = await freshService();
    if (!available) {
      console.log('  [SKIPPED] Sterling server not available');
      return;
    }

    const msg = buildRegisterMessage(CRAFTING_DECLARATION);
    const expectedDigest = computeDeclarationDigest(CRAFTING_DECLARATION);

    // Register
    const regResult = await service.registerDomainDeclaration(
      msg.declaration as unknown as Record<string, unknown>,
      msg.digest,
    );

    expect(regResult.success).toBe(true);
    expect(regResult.digest).toBe(expectedDigest);

    // Get by digest
    const getResult = await service.getDomainDeclaration(expectedDigest);

    expect(getResult.found).toBe(true);
    expect(getResult.digest).toBe(expectedDigest);
    expect(getResult.declaration).toBeDefined();

    // Deep equality: retrieved declaration matches what we sent
    const retrieved = getResult.declaration!;
    expect(retrieved.declarationVersion).toBe(CRAFTING_DECLARATION.declarationVersion);
    expect(retrieved.solverId).toBe(CRAFTING_DECLARATION.solverId);
    expect(retrieved.contractVersion).toBe(CRAFTING_DECLARATION.contractVersion);
    expect(retrieved.implementsPrimitives).toEqual(CRAFTING_DECLARATION.implementsPrimitives);
    expect(retrieved.consumesFields).toEqual(CRAFTING_DECLARATION.consumesFields);
    expect(retrieved.producesFields).toEqual(CRAFTING_DECLARATION.producesFields);
  });

  it('digest is deterministic across TS client and Python server', async () => {
    const { service, available } = await freshService();
    if (!available) {
      console.log('  [SKIPPED] Sterling server not available');
      return;
    }

    const msg = buildRegisterMessage(CRAFTING_DECLARATION);
    const tsDigest = msg.digest;

    // Register — server computes its own digest and verifies it matches
    const regResult = await service.registerDomainDeclaration(
      msg.declaration as unknown as Record<string, unknown>,
      msg.digest,
    );

    // If registration succeeds, it means server digest matched client digest.
    // The server returns the digest it computed; verify it matches TS-side.
    expect(regResult.success).toBe(true);
    expect(regResult.digest).toBe(tsDigest);
  });

  it('get for unknown digest returns not found', async () => {
    const { service, available } = await freshService();
    if (!available) {
      console.log('  [SKIPPED] Sterling server not available');
      return;
    }

    const getResult = await service.getDomainDeclaration('0000000000000000');

    expect(getResult.found).toBe(false);
  });

  it('multiple declarations coexist in registry', async () => {
    const { service, available } = await freshService();
    if (!available) {
      console.log('  [SKIPPED] Sterling server not available');
      return;
    }

    const craftMsg = buildRegisterMessage(CRAFTING_DECLARATION);
    const buildMsg = buildRegisterMessage(BUILDING_DECLARATION);

    // Register both
    const reg1 = await service.registerDomainDeclaration(
      craftMsg.declaration as unknown as Record<string, unknown>,
      craftMsg.digest,
    );
    const reg2 = await service.registerDomainDeclaration(
      buildMsg.declaration as unknown as Record<string, unknown>,
      buildMsg.digest,
    );

    expect(reg1.success).toBe(true);
    expect(reg2.success).toBe(true);
    expect(reg1.digest).not.toBe(reg2.digest);

    // Retrieve both — each has distinct content
    const get1 = await service.getDomainDeclaration(reg1.digest!);
    const get2 = await service.getDomainDeclaration(reg2.digest!);

    expect(get1.found).toBe(true);
    expect(get2.found).toBe(true);
    expect((get1.declaration as any).solverId).toBe('minecraft.crafting');
    expect((get2.declaration as any).solverId).toBe('minecraft.building');
  });

  it('rejects declaration with bare primitive IDs', async () => {
    const { service, available } = await freshService();
    if (!available) {
      console.log('  [SKIPPED] Sterling server not available');
      return;
    }

    // Send a declaration with bare IDs directly to the server
    // (bypassing TS-side validation to test server-side fail-closed)
    const badDeclaration = {
      declarationVersion: 1,
      solverId: 'test.bad',
      contractVersion: 1,
      implementsPrimitives: ['p01', 'CB-P02'],
      consumesFields: ['state.inventory'],
      producesFields: ['steps'],
    };

    // Compute a digest manually (won't match server's since content differs,
    // but server validates the declaration before checking digest)
    const regResult = await service.registerDomainDeclaration(
      badDeclaration,
      'fake_digest_value_',
    );

    // Server should reject: bare "p01" is not namespace-qualified
    expect(regResult.success).toBe(false);
    expect(regResult.error).toBeDefined();
    expect(regResult.error).toContain('not namespace-qualified');
  });

  it('rejects digest mismatch (canonicalization drift detection)', async () => {
    const { service, available } = await freshService();
    if (!available) {
      console.log('  [SKIPPED] Sterling server not available');
      return;
    }

    const msg = buildRegisterMessage(CRAFTING_DECLARATION);

    // Send correct declaration but wrong digest
    const regResult = await service.registerDomainDeclaration(
      msg.declaration as unknown as Record<string, unknown>,
      'aaaaaaaaaaaaaaaa',
    );

    expect(regResult.success).toBe(false);
    expect(regResult.error).toContain('Digest mismatch');
  });

  it('register without explicit digest succeeds (service layer computes)', async () => {
    const { service, available } = await freshService();
    if (!available) {
      console.log('  [SKIPPED] Sterling server not available');
      return;
    }

    // Omit digest — service layer computes it locally before sending,
    // so the server still receives a digest and verifies parity.
    const regResult = await service.registerDomainDeclaration(
      CRAFTING_DECLARATION as unknown as Record<string, unknown>,
    );

    expect(regResult.success).toBe(true);
    const expectedDigest = computeDeclarationDigest(CRAFTING_DECLARATION);
    expect(regResult.digest).toBe(expectedDigest);

    // Verify we can retrieve it
    const getResult = await service.getDomainDeclaration(expectedDigest);
    expect(getResult.found).toBe(true);
  });

  it('cross-language canonicalization corpus — edge-case declaration', async () => {
    const { service, available } = await freshService();
    if (!available) {
      console.log('  [SKIPPED] Sterling server not available');
      return;
    }

    // Edge-case declaration: unicode, special characters, large contract version
    const edgeDecl: DomainDeclarationV1 = {
      declarationVersion: 1,
      solverId: 'test.canon-edge-⚔️',
      contractVersion: 999,
      implementsPrimitives: ['CB-P01', 'ST-P99'],
      consumesFields: ['field.with.dots', 'field-with-dashes', 'field_with_underscores'],
      producesFields: ['output'],
      notes: 'Edge case: "quotes" & <brackets> — newline\ntab\there',
    };

    const tsDigest = computeDeclarationDigest(edgeDecl);

    // Register — server computes its own digest
    const regResult = await service.registerDomainDeclaration(
      edgeDecl as unknown as Record<string, unknown>,
      tsDigest,
    );

    // Success means server's Python canonicalize + hash matched TS's
    expect(regResult.success).toBe(true);
    expect(regResult.digest).toBe(tsDigest);
  });

  it('concurrent declaration ops are isolated by requestId', async () => {
    const { service, available } = await freshService();
    if (!available) {
      console.log('  [SKIPPED] Sterling server not available');
      return;
    }

    const craftMsg = buildRegisterMessage(CRAFTING_DECLARATION);
    const buildMsg = buildRegisterMessage(BUILDING_DECLARATION);

    // Fire both in parallel — requestId correlation prevents cross-contamination
    const [reg1, reg2] = await Promise.all([
      service.registerDomainDeclaration(
        craftMsg.declaration as unknown as Record<string, unknown>,
        craftMsg.digest,
      ),
      service.registerDomainDeclaration(
        buildMsg.declaration as unknown as Record<string, unknown>,
        buildMsg.digest,
      ),
    ]);

    expect(reg1.success).toBe(true);
    expect(reg2.success).toBe(true);
    // Each got its own digest, not the other's
    expect(reg1.digest).toBe(craftMsg.digest);
    expect(reg2.digest).toBe(buildMsg.digest);
    expect(reg1.digest).not.toBe(reg2.digest);
  });
});
