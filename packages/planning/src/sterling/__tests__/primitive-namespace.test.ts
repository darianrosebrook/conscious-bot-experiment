/**
 * Primitive Namespace Tests
 *
 * Proves:
 * - Qualified IDs pass validation
 * - Bare IDs are rejected
 * - Dependency mapping is well-formed
 * - Type narrowing prevents bare IDs in SterlingDomainDeclaration
 */

import { describe, it, expect } from 'vitest';
import {
  isQualifiedPrimitiveId,
  assertQualifiedPrimitiveIds,
  getEngineDependencies,
  CB_PRIMITIVES,
  ST_PRIMITIVES,
  CB_REQUIRES_ST,
  type QualifiedPrimitiveId,
  type CBPrimitiveId,
  type STPrimitiveId,
} from '../primitive-namespace';

describe('isQualifiedPrimitiveId', () => {
  it('accepts CB-prefixed IDs', () => {
    expect(isQualifiedPrimitiveId('CB-P01')).toBe(true);
    expect(isQualifiedPrimitiveId('CB-P04')).toBe(true);
    expect(isQualifiedPrimitiveId('CB-P21')).toBe(true);
  });

  it('accepts ST-prefixed IDs', () => {
    expect(isQualifiedPrimitiveId('ST-P01')).toBe(true);
    expect(isQualifiedPrimitiveId('ST-P05')).toBe(true);
  });

  it('rejects bare IDs', () => {
    expect(isQualifiedPrimitiveId('p01')).toBe(false);
    expect(isQualifiedPrimitiveId('P01')).toBe(false);
    expect(isQualifiedPrimitiveId('01')).toBe(false);
  });

  it('rejects malformed IDs', () => {
    expect(isQualifiedPrimitiveId('CB-P')).toBe(false);
    expect(isQualifiedPrimitiveId('CB-P1')).toBe(false); // single digit
    expect(isQualifiedPrimitiveId('XX-P01')).toBe(false);
    expect(isQualifiedPrimitiveId('')).toBe(false);
    expect(isQualifiedPrimitiveId('CB-P001')).toBe(false); // three digits
  });
});

describe('assertQualifiedPrimitiveIds', () => {
  it('passes for valid qualified IDs', () => {
    expect(() => {
      assertQualifiedPrimitiveIds(['CB-P01', 'CB-P04', 'ST-P01']);
    }).not.toThrow();
  });

  it('passes for empty array', () => {
    expect(() => {
      assertQualifiedPrimitiveIds([]);
    }).not.toThrow();
  });

  it('throws for bare ID "p01"', () => {
    expect(() => {
      assertQualifiedPrimitiveIds(['CB-P01', 'p01']);
    }).toThrow('Primitive ID "p01" is not namespace-qualified');
  });

  it('throws for bare ID "P01"', () => {
    expect(() => {
      assertQualifiedPrimitiveIds(['P01']);
    }).toThrow('Primitive ID "P01" is not namespace-qualified');
  });

  it('error message suggests correct format', () => {
    try {
      assertQualifiedPrimitiveIds(['p03']);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect((e as Error).message).toContain('CB-Pxx');
      expect((e as Error).message).toContain('ST-Pxx');
    }
  });
});

describe('CB_PRIMITIVES constants', () => {
  it('all CB primitives are valid qualified IDs', () => {
    const ids = Object.values(CB_PRIMITIVES);
    expect(ids.length).toBe(21);
    for (const id of ids) {
      expect(isQualifiedPrimitiveId(id)).toBe(true);
      expect(id).toMatch(/^CB-P\d{2}$/);
    }
  });
});

describe('ST_PRIMITIVES constants', () => {
  it('all ST primitives are valid qualified IDs', () => {
    const ids = Object.values(ST_PRIMITIVES);
    expect(ids.length).toBe(5);
    for (const id of ids) {
      expect(isQualifiedPrimitiveId(id)).toBe(true);
      expect(id).toMatch(/^ST-P\d{2}$/);
    }
  });
});

describe('CB_REQUIRES_ST dependency mapping', () => {
  it('all keys are valid CB primitive IDs', () => {
    for (const key of Object.keys(CB_REQUIRES_ST)) {
      expect(isQualifiedPrimitiveId(key)).toBe(true);
      expect(key).toMatch(/^CB-P\d{2}$/);
    }
  });

  it('all values are valid ST primitive IDs', () => {
    for (const deps of Object.values(CB_REQUIRES_ST)) {
      for (const dep of deps) {
        expect(isQualifiedPrimitiveId(dep)).toBe(true);
        expect(dep).toMatch(/^ST-P\d{2}$/);
      }
    }
  });

  it('CB-P01 requires ST-P01 (deterministic transitions)', () => {
    expect(CB_REQUIRES_ST['CB-P01']).toEqual(['ST-P01']);
  });

  it('CB-P03 requires ST-P01 + ST-P02 (transitions + observation)', () => {
    expect(CB_REQUIRES_ST['CB-P03']).toEqual(['ST-P01', 'ST-P02']);
  });

  it('CB-P05 requires ST-P01 + ST-P05 (transitions + macro composition)', () => {
    expect(CB_REQUIRES_ST['CB-P05']).toEqual(['ST-P01', 'ST-P05']);
  });

  it('CB-P16 has no engine dependency (pure domain-level)', () => {
    expect(CB_REQUIRES_ST['CB-P16']).toBeUndefined();
  });

  it('CB-P17 has no engine dependency (pure domain-level)', () => {
    expect(CB_REQUIRES_ST['CB-P17']).toBeUndefined();
  });
});

describe('getEngineDependencies', () => {
  it('returns dependencies for mapped primitive', () => {
    expect(getEngineDependencies('CB-P01')).toEqual(['ST-P01']);
  });

  it('returns empty array for unmapped primitive', () => {
    expect(getEngineDependencies('CB-P16')).toEqual([]);
  });

  it('returns multiple dependencies for CB-P03', () => {
    const deps = getEngineDependencies('CB-P03');
    expect(deps).toContain('ST-P01');
    expect(deps).toContain('ST-P02');
    expect(deps.length).toBe(2);
  });
});

describe('SterlingDomainDeclaration type safety', () => {
  it('type system accepts qualified IDs in implementsPrimitives', () => {
    // This is a compile-time check — if it compiles, the type constraint works.
    const declaration: { implementsPrimitives: QualifiedPrimitiveId[] } = {
      implementsPrimitives: ['CB-P01', 'CB-P04', 'ST-P01'],
    };
    expect(declaration.implementsPrimitives).toHaveLength(3);
  });

  // Note: bare IDs like 'p01' would be rejected at compile time by the
  // QualifiedPrimitiveId type (template literal type CB-P* | ST-P*).
  // This cannot be tested at runtime without assertQualifiedPrimitiveIds.
});
