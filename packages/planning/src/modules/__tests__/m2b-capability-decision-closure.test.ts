/**
 * M2b: Capability decision persistence, Rig D upgrade path, C/E policy.
 *
 * Proves:
 * 1. Capability decision persists into task metadata (reconstructable after the fact)
 * 2. Rig D upgrade path produces its own decision record
 * 3. Rig C (furnace) and Rig E (navigation) are now declared, not undeclared
 * 4. Shared assertion helper catches regressions
 * 5. All six rigs have explicit policy state (no ambiguous warnings)
 */

import { describe, it, expect } from 'vitest';
import { routeActionPlan, buildDecisionRecordForRig } from '../action-plan-backend';
import type { DeclarationLookup } from '../action-plan-backend';
import type { TaskRequirement } from '../requirements';
import type { DomainDeclarationV1 } from '../../sterling/domain-declaration';
import { computeRegistrationDigest } from '../../sterling/domain-declaration';
import { CRAFTING_DECLARATION } from '../../sterling/minecraft-crafting-solver';
import { TOOL_PROGRESSION_DECLARATION } from '../../sterling/minecraft-tool-progression-solver';
import { ACQUISITION_DECLARATION } from '../../sterling/minecraft-acquisition-solver';
import { BUILDING_DECLARATION } from '../../sterling/minecraft-building-solver';
import { FURNACE_DECLARATION } from '../../sterling/minecraft-furnace-solver';
import { NAVIGATION_DECLARATION } from '../../sterling/minecraft-navigation-solver';
import { assertCapabilityDecision } from './capability-decision-assertions';

const ALL_DECLARATIONS: Record<string, DomainDeclarationV1> = {
  A: CRAFTING_DECLARATION,
  B: TOOL_PROGRESSION_DECLARATION,
  C: FURNACE_DECLARATION,
  D: ACQUISITION_DECLARATION,
  E: NAVIGATION_DECLARATION,
  G: BUILDING_DECLARATION,
};

function makeLookup(options?: {
  registeredDigests?: Set<string>;
}): DeclarationLookup {
  const registered = options?.registeredDigests ?? new Set<string>();
  return {
    getDeclarationForRig: (rigId: string) => ALL_DECLARATIONS[rigId] ?? null,
    isRegistered: (digest: string) => registered.has(digest),
  };
}

function allDigests(): Set<string> {
  return new Set(Object.values(ALL_DECLARATIONS).map(computeRegistrationDigest));
}

describe('M2b: Capability decision closure', () => {
  describe('C/E policy: furnace and navigation now declared', () => {
    it('Rig C (furnace) has declaration with CB-P03', () => {
      expect(FURNACE_DECLARATION).toBeDefined();
      expect(FURNACE_DECLARATION.solverId).toBe('minecraft.furnace');
      expect(FURNACE_DECLARATION.implementsPrimitives).toContain('CB-P03');
    });

    it('Rig E (navigation) has declaration with CB-P05', () => {
      expect(NAVIGATION_DECLARATION).toBeDefined();
      expect(NAVIGATION_DECLARATION.solverId).toBe('minecraft.navigation');
      expect(NAVIGATION_DECLARATION.implementsPrimitives).toContain('CB-P05');
    });

    it('Rig E route is declared (not undeclared) when lookup includes navigation', () => {
      const req: TaskRequirement = { kind: 'navigate', destination: 'cave', tolerance: 3, quantity: 1 };
      const route = routeActionPlan(req, { declarations: makeLookup() });

      assertCapabilityDecision(route.decision, {
        expectedProofStatus: 'declared',
        expectedSolverId: 'minecraft.navigation',
        expectedPrimitives: ['CB-P05'],
        expectWarnings: true, // Not registered yet
        label: 'Rig E navigate',
      });
    });

    it('no rig is undeclared when all declarations are in lookup', () => {
      const sterlingRequirements: TaskRequirement[] = [
        { kind: 'craft', outputPattern: 'stick', quantity: 1 },
        { kind: 'tool_progression', targetTool: 'iron_pickaxe', toolType: 'pickaxe', targetTier: 'iron', quantity: 1 },
        { kind: 'build', structure: 'shelter', quantity: 1 },
        { kind: 'navigate', destination: 'cave', tolerance: 3, quantity: 1 },
        { kind: 'explore', target: 'cave', maxSteps: 50, quantity: 1 },
        { kind: 'find', target: 'diamond', quantity: 1 },
      ];

      for (const req of sterlingRequirements) {
        const route = routeActionPlan(req, { declarations: makeLookup() });
        expect(route.decision, `${req.kind} should have decision`).toBeDefined();
        expect(route.decision!.proofStatus, `${req.kind} should not be undeclared`).not.toBe('undeclared');
      }
    });
  });

  describe('Rig D upgrade path decision record', () => {
    it('buildDecisionRecordForRig produces Rig D decision', () => {
      const decision = buildDecisionRecordForRig('D', makeLookup());
      assertCapabilityDecision(decision, {
        expectedProofStatus: 'declared',
        expectedSolverId: 'minecraft.acquisition',
        expectedPrimitives: ['CB-P01', 'CB-P04'],
        label: 'Rig D direct',
      });
    });

    it('Rig D upgrade path decision is structural when registered', () => {
      const decision = buildDecisionRecordForRig('D', makeLookup({
        registeredDigests: new Set([computeRegistrationDigest(ACQUISITION_DECLARATION)]),
      }));
      assertCapabilityDecision(decision, {
        expectedProofStatus: 'structural',
        expectedSolverId: 'minecraft.acquisition',
        expectWarnings: false,
        label: 'Rig D registered',
      });
    });
  });

  describe('all six rigs have complete decision coverage', () => {
    const rigCases: Array<{ rig: string; decl: DomainDeclarationV1; primitives: readonly string[] }> = [
      { rig: 'A', decl: CRAFTING_DECLARATION, primitives: ['CB-P01'] },
      { rig: 'B', decl: TOOL_PROGRESSION_DECLARATION, primitives: ['CB-P01', 'CB-P02'] },
      { rig: 'C', decl: FURNACE_DECLARATION, primitives: ['CB-P03'] },
      { rig: 'D', decl: ACQUISITION_DECLARATION, primitives: ['CB-P01', 'CB-P04'] },
      { rig: 'E', decl: NAVIGATION_DECLARATION, primitives: ['CB-P05'] },
      { rig: 'G', decl: BUILDING_DECLARATION, primitives: ['CB-P07'] },
    ];

    for (const { rig, decl, primitives } of rigCases) {
      it(`Rig ${rig}: structural when registered, carries correct primitives`, () => {
        const digest = computeRegistrationDigest(decl);
        const decision = buildDecisionRecordForRig(rig, makeLookup({
          registeredDigests: new Set([digest]),
        }));

        assertCapabilityDecision(decision, {
          expectedProofStatus: 'structural',
          expectedSolverId: decl.solverId,
          expectedPrimitives: primitives,
          expectWarnings: false,
          label: `Rig ${rig}`,
        });
      });
    }
  });

  describe('shared assertion helper catches regressions', () => {
    it('fails when proofStatus is below minimum', () => {
      expect(() => assertCapabilityDecision(
        { declarationDigest: null, solverId: null, proofStatus: 'undeclared', requiredPrimitives: [], warnings: ['test'] },
        { minProofStatus: 'declared', label: 'regression test' },
      )).toThrow();
    });

    it('fails when expected primitives are missing', () => {
      expect(() => assertCapabilityDecision(
        { declarationDigest: 'abc', solverId: 'test', proofStatus: 'declared', requiredPrimitives: ['CB-P01'], warnings: [] },
        { expectedPrimitives: ['CB-P01', 'CB-P02'], label: 'primitive mismatch' },
      )).toThrow();
    });

    it('fails when declarationDigest is missing for non-undeclared', () => {
      expect(() => assertCapabilityDecision(
        { declarationDigest: null, solverId: 'test', proofStatus: 'declared', requiredPrimitives: [], warnings: [] },
        { label: 'digest missing' },
      )).toThrow();
    });
  });

  describe('decision record determinism', () => {
    it('same rig + same lookup produces same digest', () => {
      const d1 = buildDecisionRecordForRig('A', makeLookup());
      const d2 = buildDecisionRecordForRig('A', makeLookup());
      expect(d1?.declarationDigest).toBe(d2?.declarationDigest);
      expect(d1?.proofStatus).toBe(d2?.proofStatus);
    });
  });
});
