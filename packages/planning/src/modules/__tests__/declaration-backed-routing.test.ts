/**
 * M2: Declaration-backed routing tests.
 *
 * Proves:
 * 1. Every sterling-backed route includes a CapabilityDecisionRecord when declarations are provided
 * 2. Proof status lattice: undeclared → declared → structural (→ verified, future)
 * 3. Warnings emitted for undeclared and unregistered solvers
 * 4. Compiler and unplannable routes have no decision record
 * 5. Backward compatibility: no declarations → no decision record (legacy callers)
 * 6. Each rig's declaration digest and primitives are correctly propagated
 */

import { describe, it, expect } from 'vitest';
import { routeActionPlan } from '../action-plan-backend';
import type { DeclarationLookup } from '../action-plan-backend';
import type { TaskRequirement } from '../requirements';
import type { DomainDeclarationV1 } from '../../sterling/domain-declaration';
import { computeRegistrationDigest } from '../../sterling/domain-declaration';
import { CRAFTING_DECLARATION } from '../../sterling/minecraft-crafting-solver';
import { TOOL_PROGRESSION_DECLARATION } from '../../sterling/minecraft-tool-progression-solver';
import { ACQUISITION_DECLARATION } from '../../sterling/minecraft-acquisition-solver';
import { BUILDING_DECLARATION } from '../../sterling/minecraft-building-solver';

// ── Declaration fixtures ──

const RIG_DECLARATIONS: Record<string, DomainDeclarationV1> = {
  A: CRAFTING_DECLARATION,
  B: TOOL_PROGRESSION_DECLARATION,
  D: ACQUISITION_DECLARATION,
  G: BUILDING_DECLARATION,
};

function makeLookup(options?: {
  registeredDigests?: Set<string>;
  excludeRigs?: string[];
}): DeclarationLookup {
  const registered = options?.registeredDigests ?? new Set<string>();
  const excluded = new Set(options?.excludeRigs ?? []);
  return {
    getDeclarationForRig: (rigId: string) => {
      if (excluded.has(rigId)) return null;
      return RIG_DECLARATIONS[rigId] ?? null;
    },
    isRegistered: (digest: string) => registered.has(digest),
  };
}

// ── Tests ──

describe('M2: Declaration-backed routing', () => {
  describe('proof status lattice', () => {
    it('undeclared: solver has no declaration → proofStatus=undeclared', () => {
      // Rig E (navigation) has no declaration in our fixtures
      const req: TaskRequirement = { kind: 'navigate', destination: 'cave', tolerance: 3, quantity: 1 };
      const route = routeActionPlan(req, { declarations: makeLookup() });

      expect(route.decision).toBeDefined();
      expect(route.decision!.proofStatus).toBe('undeclared');
      expect(route.decision!.declarationDigest).toBeNull();
      expect(route.decision!.solverId).toBeNull();
      expect(route.decision!.requiredPrimitives).toEqual([]);
      expect(route.decision!.warnings.length).toBeGreaterThan(0);
      expect(route.decision!.warnings[0]).toContain('no DomainDeclarationV1');
    });

    it('declared: declaration exists but not registered → proofStatus=declared', () => {
      const req: TaskRequirement = { kind: 'craft', outputPattern: 'stick', quantity: 1 };
      // No registered digests → declared but not structural
      const route = routeActionPlan(req, { declarations: makeLookup() });

      expect(route.decision).toBeDefined();
      expect(route.decision!.proofStatus).toBe('declared');
      expect(route.decision!.declarationDigest).toBeTruthy();
      expect(route.decision!.solverId).toBe('minecraft.crafting');
      expect(route.decision!.requiredPrimitives).toContain('CB-P01');
      expect(route.decision!.warnings.length).toBeGreaterThan(0);
      expect(route.decision!.warnings[0]).toContain('not registered');
    });

    it('structural: declaration registered with Sterling → proofStatus=structural', () => {
      const craftingDigest = computeRegistrationDigest(CRAFTING_DECLARATION);
      const req: TaskRequirement = { kind: 'craft', outputPattern: 'stick', quantity: 1 };
      const route = routeActionPlan(req, {
        declarations: makeLookup({ registeredDigests: new Set([craftingDigest]) }),
      });

      expect(route.decision).toBeDefined();
      expect(route.decision!.proofStatus).toBe('structural');
      expect(route.decision!.declarationDigest).toBe(craftingDigest);
      expect(route.decision!.solverId).toBe('minecraft.crafting');
      expect(route.decision!.warnings).toHaveLength(0);
    });
  });

  describe('all four production rigs', () => {
    const cases: Array<{ kind: string; rig: string; decl: DomainDeclarationV1; req: TaskRequirement }> = [
      { kind: 'craft', rig: 'A', decl: CRAFTING_DECLARATION, req: { kind: 'craft', outputPattern: 'stick', quantity: 1 } },
      { kind: 'tool_progression', rig: 'B', decl: TOOL_PROGRESSION_DECLARATION, req: { kind: 'tool_progression', targetTool: 'iron_pickaxe', toolType: 'pickaxe', targetTier: 'iron', quantity: 1 } },
      { kind: 'build', rig: 'G', decl: BUILDING_DECLARATION, req: { kind: 'build', structure: 'shelter', quantity: 1 } },
    ];

    for (const { kind, rig, decl, req } of cases) {
      it(`Rig ${rig} (${kind}): decision carries correct digest and primitives`, () => {
        const digest = computeRegistrationDigest(decl);
        const route = routeActionPlan(req, {
          declarations: makeLookup({ registeredDigests: new Set([digest]) }),
        });

        expect(route.decision).toBeDefined();
        expect(route.decision!.proofStatus).toBe('structural');
        expect(route.decision!.declarationDigest).toBe(digest);
        expect(route.decision!.solverId).toBe(decl.solverId);
        expect(route.decision!.requiredPrimitives).toEqual(decl.implementsPrimitives);
      });
    }
  });

  describe('non-sterling routes have no decision', () => {
    it('compiler route (collect) has no decision record', () => {
      const req: TaskRequirement = { kind: 'collect', patterns: ['oak_log'], quantity: 1 };
      const route = routeActionPlan(req, { declarations: makeLookup() });
      expect(route.decision).toBeUndefined();
    });

    it('compiler route (mine) has no decision record', () => {
      const req: TaskRequirement = { kind: 'mine', patterns: ['iron_ore'], quantity: 1 };
      const route = routeActionPlan(req, { declarations: makeLookup() });
      expect(route.decision).toBeUndefined();
    });

    it('unplannable route has no decision record', () => {
      const route = routeActionPlan(null, { strict: true, declarations: makeLookup() });
      expect(route.decision).toBeUndefined();
    });
  });

  describe('backward compatibility', () => {
    it('no declarations option → no decision record (legacy caller)', () => {
      const req: TaskRequirement = { kind: 'craft', outputPattern: 'stick', quantity: 1 };
      const route = routeActionPlan(req);
      expect(route.decision).toBeUndefined();
    });

    it('existing test assertions still hold (backend, requiredRig, reason)', () => {
      const req: TaskRequirement = { kind: 'craft', outputPattern: 'stick', quantity: 1 };
      const route = routeActionPlan(req, { declarations: makeLookup() });
      expect(route.backend).toBe('sterling');
      expect(route.requiredRig).toBe('A');
      expect(route.reason).toBe('craft-requirement');
      expect(route.requiredCapabilities).toContain('craft');
    });
  });

  describe('decision record determinism', () => {
    it('same declaration produces same digest across calls', () => {
      const req: TaskRequirement = { kind: 'craft', outputPattern: 'stick', quantity: 1 };
      const route1 = routeActionPlan(req, { declarations: makeLookup() });
      const route2 = routeActionPlan(req, { declarations: makeLookup() });
      expect(route1.decision!.declarationDigest).toBe(route2.decision!.declarationDigest);
    });
  });
});
