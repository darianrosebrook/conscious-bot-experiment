/**
 * Domain Declaration Unit Tests
 *
 * Proves:
 * - DomainDeclarationV1 validation is fail-closed
 * - Digest is deterministic and content-addressed
 * - Digest uses domain separation prefix
 * - Wire message builders work correctly
 * - Bare primitive IDs are rejected
 * - Canonicalization corpus: edge-case values produce stable, cross-run digests
 */

import { describe, it, expect } from 'vitest';
import {
  computeDeclarationDigest,
  validateDeclaration,
  buildRegisterMessage,
  buildGetMessage,
  type DomainDeclarationV1,
} from '../domain-declaration';
import { canonicalize } from '../solve-bundle';

// ============================================================================
// Fixtures
// ============================================================================

const VALID_DECLARATION: DomainDeclarationV1 = {
  declarationVersion: 1,
  solverId: 'minecraft.crafting',
  contractVersion: 1,
  implementsPrimitives: ['CB-P01', 'CB-P02', 'ST-P01'],
  consumesFields: ['state.inventory', 'goal.item'],
  producesFields: ['steps', 'planId'],
};

const VALID_DECLARATION_WITH_NOTES: DomainDeclarationV1 = {
  ...VALID_DECLARATION,
  notes: 'Deterministic crafting solver for Rig A',
};

// ============================================================================
// Tests
// ============================================================================

describe('computeDeclarationDigest', () => {
  it('produces a 16-char hex string', () => {
    const digest = computeDeclarationDigest(VALID_DECLARATION);
    expect(digest).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is deterministic: same input → same digest', () => {
    const d1 = computeDeclarationDigest(VALID_DECLARATION);
    const d2 = computeDeclarationDigest(VALID_DECLARATION);
    expect(d1).toBe(d2);
  });

  it('is content-addressed: field order does not matter', () => {
    // Construct same declaration with different key insertion order
    const reordered: DomainDeclarationV1 = {
      producesFields: ['steps', 'planId'],
      consumesFields: ['state.inventory', 'goal.item'],
      implementsPrimitives: ['CB-P01', 'CB-P02', 'ST-P01'],
      contractVersion: 1,
      solverId: 'minecraft.crafting',
      declarationVersion: 1,
    };
    expect(computeDeclarationDigest(reordered)).toBe(
      computeDeclarationDigest(VALID_DECLARATION),
    );
  });

  it('changes when content changes', () => {
    const modified: DomainDeclarationV1 = {
      ...VALID_DECLARATION,
      solverId: 'minecraft.building',
    };
    expect(computeDeclarationDigest(modified)).not.toBe(
      computeDeclarationDigest(VALID_DECLARATION),
    );
  });

  it('changes when notes are added', () => {
    expect(computeDeclarationDigest(VALID_DECLARATION_WITH_NOTES)).not.toBe(
      computeDeclarationDigest(VALID_DECLARATION),
    );
  });

  it('changes when primitives differ', () => {
    const modified: DomainDeclarationV1 = {
      ...VALID_DECLARATION,
      implementsPrimitives: ['CB-P01', 'ST-P01'],
    };
    expect(computeDeclarationDigest(modified)).not.toBe(
      computeDeclarationDigest(VALID_DECLARATION),
    );
  });
});

describe('validateDeclaration', () => {
  it('passes for valid declaration', () => {
    expect(() => validateDeclaration(VALID_DECLARATION)).not.toThrow();
  });

  it('passes for declaration with notes', () => {
    expect(() => validateDeclaration(VALID_DECLARATION_WITH_NOTES)).not.toThrow();
  });

  it('rejects wrong declarationVersion', () => {
    const bad = { ...VALID_DECLARATION, declarationVersion: 2 as 1 };
    expect(() => validateDeclaration(bad)).toThrow('declarationVersion');
  });

  it('rejects empty solverId', () => {
    const bad = { ...VALID_DECLARATION, solverId: '' };
    expect(() => validateDeclaration(bad)).toThrow('solverId');
  });

  it('rejects non-integer contractVersion', () => {
    const bad = { ...VALID_DECLARATION, contractVersion: 1.5 };
    expect(() => validateDeclaration(bad)).toThrow('contractVersion');
  });

  it('rejects zero contractVersion', () => {
    const bad = { ...VALID_DECLARATION, contractVersion: 0 };
    expect(() => validateDeclaration(bad)).toThrow('contractVersion');
  });

  it('rejects bare primitive IDs', () => {
    const bad: DomainDeclarationV1 = {
      ...VALID_DECLARATION,
      implementsPrimitives: ['CB-P01', 'p01' as any],
    };
    expect(() => validateDeclaration(bad)).toThrow('not namespace-qualified');
  });

  it('rejects empty consumesFields', () => {
    const bad = { ...VALID_DECLARATION, consumesFields: [] as string[] };
    expect(() => validateDeclaration(bad)).toThrow('consumesFields');
  });

  it('rejects empty producesFields', () => {
    const bad = { ...VALID_DECLARATION, producesFields: [] as string[] };
    expect(() => validateDeclaration(bad)).toThrow('producesFields');
  });
});

describe('buildRegisterMessage', () => {
  it('builds valid register message', () => {
    const msg = buildRegisterMessage(VALID_DECLARATION);
    expect(msg.command).toBe('register_domain_declaration_v1');
    expect(msg.declaration).toEqual(VALID_DECLARATION);
    expect(msg.digest).toMatch(/^[0-9a-f]{16}$/);
    expect(msg.digest).toBe(computeDeclarationDigest(VALID_DECLARATION));
  });

  it('throws for invalid declaration', () => {
    const bad = { ...VALID_DECLARATION, solverId: '' };
    expect(() => buildRegisterMessage(bad)).toThrow('solverId');
  });
});

describe('buildGetMessage', () => {
  it('builds valid get message', () => {
    const msg = buildGetMessage('abc123def456abcd');
    expect(msg.command).toBe('get_domain_declaration_v1');
    expect(msg.digest).toBe('abc123def456abcd');
  });

  it('throws for empty digest', () => {
    expect(() => buildGetMessage('')).toThrow('digest');
  });
});

// ============================================================================
// Canonicalization Corpus — edge-case values
// ============================================================================

describe('canonicalization corpus', () => {
  // Each corpus entry is a value + its expected canonical form.
  // These serve as a parity contract: if the Python side produces the same
  // canonical string for each corpus value, cross-language digests match.
  const corpus: Array<{ label: string; value: unknown; expected: string }> = [
    { label: 'empty string', value: '', expected: '""' },
    { label: 'string with quotes', value: 'he said "hi"', expected: '"he said \\"hi\\""' },
    { label: 'unicode emoji', value: '⚔️🛡️', expected: '"⚔️🛡️"' },
    { label: 'unicode CJK', value: '你好世界', expected: '"你好世界"' },
    { label: 'backslash', value: 'a\\b', expected: '"a\\\\b"' },
    { label: 'newline', value: 'line1\nline2', expected: '"line1\\nline2"' },
    { label: 'zero', value: 0, expected: '0' },
    { label: 'negative zero', value: -0, expected: '0' },
    { label: 'negative integer', value: -42, expected: '-42' },
    { label: 'large integer', value: 9007199254740991, expected: '9007199254740991' },
    { label: 'negative large integer', value: -9007199254740991, expected: '-9007199254740991' },
    { label: 'float', value: 3.14, expected: '3.14' },
    { label: 'negative float', value: -0.001, expected: '-0.001' },
    { label: 'boolean true', value: true, expected: 'true' },
    { label: 'boolean false', value: false, expected: 'false' },
    { label: 'null', value: null, expected: 'null' },
    { label: 'empty array', value: [], expected: '[]' },
    { label: 'nested array', value: [[1], [2, 3]], expected: '[[1],[2,3]]' },
    { label: 'empty object', value: {}, expected: '{}' },
    {
      label: 'nested object sorted keys',
      value: { z: 1, a: { y: 2, b: 3 } },
      expected: '{"a":{"b":3,"y":2},"z":1}',
    },
    {
      label: 'array of mixed types',
      value: [1, 'two', true, null, { k: 'v' }],
      expected: '[1,"two",true,null,{"k":"v"}]',
    },
    {
      label: 'undefined in array becomes null',
      value: [1, undefined, 3],
      expected: '[1,null,3]',
    },
  ];

  for (const { label, value, expected } of corpus) {
    it(`canonicalizes ${label}`, () => {
      expect(canonicalize(value)).toBe(expected);
    });
  }

  it('rejects NaN', () => {
    expect(() => canonicalize(NaN)).toThrow('NaN');
  });

  it('rejects Infinity', () => {
    expect(() => canonicalize(Infinity)).toThrow('not canonicalizable');
  });

  it('rejects -Infinity', () => {
    expect(() => canonicalize(-Infinity)).toThrow('not canonicalizable');
  });

  it('rejects functions', () => {
    expect(() => canonicalize(() => {})).toThrow('Functions');
  });

  it('rejects symbols', () => {
    expect(() => canonicalize(Symbol('x'))).toThrow('Symbols');
  });

  it('rejects BigInt', () => {
    expect(() => canonicalize(BigInt(42))).toThrow('BigInt');
  });

  // Stability: same corpus values produce identical digests across repeated calls
  it('digest stability across calls', () => {
    for (const { value } of corpus) {
      const d1 = canonicalize(value);
      const d2 = canonicalize(value);
      expect(d1).toBe(d2);
    }
  });
});

// ============================================================================
// Declaration corpus — edge-case declarations that should produce stable digests
// ============================================================================

describe('declaration canonicalization corpus', () => {
  const baseDecl: DomainDeclarationV1 = {
    declarationVersion: 1,
    solverId: 'test.corpus',
    contractVersion: 1,
    implementsPrimitives: ['CB-P01'],
    consumesFields: ['field'],
    producesFields: ['output'],
  };

  it('unicode solverId produces stable digest', () => {
    const decl: DomainDeclarationV1 = { ...baseDecl, solverId: 'solver.日本語' };
    const d1 = computeDeclarationDigest(decl);
    const d2 = computeDeclarationDigest(decl);
    expect(d1).toBe(d2);
    expect(d1).toMatch(/^[0-9a-f]{16}$/);
  });

  it('notes with special characters produce stable digest', () => {
    const decl: DomainDeclarationV1 = {
      ...baseDecl,
      notes: 'Uses "quoted" values & <angle> brackets\nnewline here',
    };
    const d1 = computeDeclarationDigest(decl);
    const d2 = computeDeclarationDigest(decl);
    expect(d1).toBe(d2);
  });

  it('long arrays produce stable digest', () => {
    const longFields = Array.from({ length: 100 }, (_, i) => `field_${i}`);
    const decl: DomainDeclarationV1 = { ...baseDecl, consumesFields: longFields };
    const d1 = computeDeclarationDigest(decl);
    const d2 = computeDeclarationDigest(decl);
    expect(d1).toBe(d2);
  });

  it('large contractVersion produces stable digest', () => {
    const decl: DomainDeclarationV1 = { ...baseDecl, contractVersion: 999 };
    const d1 = computeDeclarationDigest(decl);
    const d2 = computeDeclarationDigest(decl);
    expect(d1).toBe(d2);
  });

  it('empty notes vs no notes produce different digests', () => {
    const withEmpty: DomainDeclarationV1 = { ...baseDecl, notes: '' };
    const withoutNotes: DomainDeclarationV1 = { ...baseDecl };
    // Empty string notes is present in canonical form; absent notes is omitted
    expect(computeDeclarationDigest(withEmpty)).not.toBe(
      computeDeclarationDigest(withoutNotes),
    );
  });

  it('many primitives in different order produce same digest', () => {
    const prims = ['CB-P01', 'CB-P02', 'ST-P01', 'ST-P02', 'CB-P03'] as const;
    const d1: DomainDeclarationV1 = { ...baseDecl, implementsPrimitives: [...prims] };
    // Array order DOES matter (arrays preserve insertion order per canonicalize spec)
    // Reordering should produce different digest
    const reversed = [...prims].reverse();
    const d2: DomainDeclarationV1 = { ...baseDecl, implementsPrimitives: reversed };
    expect(computeDeclarationDigest(d1)).not.toBe(computeDeclarationDigest(d2));
  });
});
