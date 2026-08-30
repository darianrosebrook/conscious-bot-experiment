import { describe, it, expect } from 'vitest';
import {
  LEAF_MANIFEST,
  deriveKnownLeaves,
  deriveIntentLeaves,
  deriveShadowOnlyLeaves,
  deriveLeafContractEntries,
  deriveLeafActionMappings,
  deriveActionContracts,
  validateLeafManifest,
} from '../leaf-manifest';

describe('leaf manifest self-consistency', () => {
  it('has no structural violations', () => {
    expect(validateLeafManifest()).toEqual([]);
  });

  it('has 42 executable leaves, 10 intent leaves, 8 shadow-only leaves', () => {
    expect(deriveKnownLeaves().size).toBe(42);
    expect(deriveIntentLeaves().size).toBe(10);
    expect(deriveShadowOnlyLeaves().size).toBe(8);
  });

  it('derives disjoint KNOWN and INTENT sets', () => {
    for (const leaf of deriveIntentLeaves()) {
      expect(deriveKnownLeaves().has(leaf)).toBe(false);
    }
  });
});

describe('deriveLeafContractEntries', () => {
  it('covers every executable leaf', () => {
    const entryNames = deriveLeafContractEntries().map(([name]) => name).sort();
    expect(entryNames).toEqual([...deriveKnownLeaves()].sort());
  });

  it('carries a fields descriptor for every entry', () => {
    for (const [, fields] of deriveLeafContractEntries()) {
      expect(Array.isArray(fields)).toBe(true);
    }
  });
});

describe('deriveLeafActionMappings', () => {
  it('maps exactly the non-shadow-only executable leaves', () => {
    const shadowOnly = deriveShadowOnlyLeaves();
    const mapped = deriveLeafActionMappings();
    for (const leaf of deriveKnownLeaves()) {
      expect(mapped.has(leaf)).toBe(!shadowOnly.has(leaf));
    }
  });

  it('keeps the canonical type equal to the leaf name except for declared overrides', () => {
    for (const [leaf, mapping] of deriveLeafActionMappings()) {
      if (mapping.type !== undefined) {
        // Intentional remap — must be one of the audited overrides.
        expect(`${leaf}->${mapping.type}`).toBe('step_forward_safely->move_forward');
      }
    }
  });
});

describe('deriveActionContracts', () => {
  it('registers every manifest leaf that carries a contract', () => {
    const registry = deriveActionContracts();
    for (const entry of LEAF_MANIFEST) {
      if (entry.intent) continue;
      if (entry.contract) {
        expect(registry[entry.name]).toBeDefined();
        expect(registry[entry.name].leafName).toBe(
          entry.contract.routesTo ?? entry.name
        );
      } else {
        expect(registry[entry.name]).toBeUndefined();
      }
    }
  });

  it('expands legacy aliases to the leaf\'s own contract data', () => {
    const registry = deriveActionContracts();
    expect(registry.smelt_item).toBe(registry.smelt);
    expect(registry.navigate).toBe(registry.move_to);
  });

  it('routes move_to to the sterling_navigate handler target', () => {
    expect(deriveActionContracts().move_to?.leafName).toBe('sterling_navigate');
  });

  it('never registers intent leaves', () => {
    const registry = deriveActionContracts();
    for (const intent of deriveIntentLeaves()) {
      expect(registry[intent]).toBeUndefined();
    }
  });
});
