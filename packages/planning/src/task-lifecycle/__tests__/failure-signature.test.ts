/**
 * Tests for FailureSignatureV1 content-addressed identity.
 *
 * Verifies: determinism, domain separation, field discrimination,
 * timestamp exclusion, and schema marker.
 */

import { describe, it, expect } from 'vitest';
import {
  computeSignatureId,
  buildFailureSignature,
  type FailureSignatureV1,
} from '../failure-signature';

describe('computeSignatureId', () => {
  it('same inputs produce same signatureId', () => {
    const a = computeSignatureId('tool_failure', 'collect_items', 'oak_log', undefined, undefined, 'no_item_entities');
    const b = computeSignatureId('tool_failure', 'collect_items', 'oak_log', undefined, undefined, 'no_item_entities');
    expect(a).toBe(b);
  });

  it('different category produces different signatureId', () => {
    const a = computeSignatureId('tool_failure', 'collect_items');
    const b = computeSignatureId('expansion_blocked', 'collect_items');
    expect(a).not.toBe(b);
  });

  it('different leaf produces different signatureId', () => {
    const a = computeSignatureId('tool_failure', 'collect_items');
    const b = computeSignatureId('tool_failure', 'navigate_to');
    expect(a).not.toBe(b);
  });

  it('different targetParam produces different signatureId', () => {
    const a = computeSignatureId('tool_failure', 'collect_items', 'oak_log');
    const b = computeSignatureId('tool_failure', 'collect_items', 'iron_ingot');
    expect(a).not.toBe(b);
  });

  it('different diagReasonCode produces different signatureId', () => {
    const a = computeSignatureId('tool_failure', 'collect_items', undefined, undefined, undefined, 'no_item_entities');
    const b = computeSignatureId('tool_failure', 'collect_items', undefined, undefined, undefined, 'pathfinder_failed');
    expect(a).not.toBe(b);
  });

  it('different blockedReason produces different signatureId', () => {
    const a = computeSignatureId('expansion_blocked', undefined, undefined, undefined, 'blocked_invalid_steps_bundle');
    const b = computeSignatureId('expansion_blocked', undefined, undefined, undefined, 'blocked_undispatchable_steps');
    expect(a).not.toBe(b);
  });

  it('returns a 16-character hex string', () => {
    const id = computeSignatureId('tool_failure', 'collect_items');
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });

  it('undefined and missing fields are equivalent', () => {
    const a = computeSignatureId('tool_failure', undefined, undefined, undefined, undefined, undefined);
    const b = computeSignatureId('tool_failure');
    expect(a).toBe(b);
  });

  it('domain prefix prevents collision with raw SHA of same tuple', () => {
    // A raw SHA-256 of 'tool_failure\x00collect_items\x00...' without the domain prefix
    // would produce a different hash than our function which prefixes 'failure_signature_v1'
    const withDomain = computeSignatureId('tool_failure', 'collect_items');
    // Manually compute without domain prefix
    const { createHash } = require('node:crypto');
    const rawParts = ['tool_failure', 'collect_items', '', '', '', ''];
    const rawHash = createHash('sha256').update(rawParts.join('\x00')).digest('hex').slice(0, 16);
    expect(withDomain).not.toBe(rawHash);
  });
});

describe('buildFailureSignature', () => {
  it('produces a valid FailureSignatureV1', () => {
    const sig = buildFailureSignature({
      category: 'tool_failure',
      leaf: 'collect_items',
      targetParam: 'oak_log',
      diagReasonCode: 'no_item_entities',
    });

    expect(sig._schema).toBe('failure_signature_v1');
    expect(sig.signatureId).toMatch(/^[0-9a-f]{16}$/);
    expect(sig.category).toBe('tool_failure');
    expect(sig.leaf).toBe('collect_items');
    expect(sig.targetParam).toBe('oak_log');
    expect(sig.diagReasonCode).toBe('no_item_entities');
    expect(sig.firstSeenAt).toBeGreaterThan(0);
  });

  it('timestamps do not affect signatureId', () => {
    const sig1 = buildFailureSignature({ category: 'tool_failure', leaf: 'dig_block' });
    // Manually build another with same params (firstSeenAt will differ slightly)
    const sig2 = buildFailureSignature({ category: 'tool_failure', leaf: 'dig_block' });
    expect(sig1.signatureId).toBe(sig2.signatureId);
  });

  it('expansion_blocked category with blockedReason', () => {
    const sig = buildFailureSignature({
      category: 'expansion_blocked',
      blockedReason: 'blocked_invalid_steps_bundle',
    });

    expect(sig._schema).toBe('failure_signature_v1');
    expect(sig.category).toBe('expansion_blocked');
    expect(sig.blockedReason).toBe('blocked_invalid_steps_bundle');
    expect(sig.leaf).toBeUndefined();
  });

  it('signatureId matches computeSignatureId for same inputs', () => {
    const sig = buildFailureSignature({
      category: 'tool_failure',
      leaf: 'collect_items',
      targetParam: 'birch_log',
      failureCode: 'collect_failed',
      diagReasonCode: 'pathfinder_failed',
    });

    const expected = computeSignatureId(
      'tool_failure', 'collect_items', 'birch_log', 'collect_failed', undefined, 'pathfinder_failed',
    );
    expect(sig.signatureId).toBe(expected);
  });
});
