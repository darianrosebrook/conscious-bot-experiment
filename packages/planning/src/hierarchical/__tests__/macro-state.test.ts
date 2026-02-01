/**
 * Rig E Certification Tests — Macro State
 *
 * Context registry rejects unregistered IDs
 * Content-addressed edge/plan IDs
 * Schema version in digests
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';
import {
  ContextRegistry,
  computeEdgeId,
  computeMacroPlanDigest,
  MACRO_STATE_SCHEMA_VERSION,
} from '../macro-state';
import type { ContextDefinition } from '../macro-state';

// ============================================================================
// Tests
// ============================================================================

describe('Macro State — Rig E Certification', () => {
  describe('Context registry', () => {
    it('accepts registered context IDs', () => {
      const registry = new ContextRegistry();
      registry.register('at_base', {
        id: 'at_base',
        description: 'At home base',
        abstract: true,
      });

      const result = registry.validate('at_base');
      expect(result.kind).toBe('ok');
      if (result.kind === 'ok') {
        expect(result.value).toBe('at_base');
      }
    });

    it('rejects unregistered context IDs with blocked:unknown_context', () => {
      const registry = new ContextRegistry();
      registry.register('at_base', {
        id: 'at_base',
        description: 'At home base',
        abstract: true,
      });

      const result = registry.validate('at_nether');
      expect(result.kind).toBe('blocked');
      if (result.kind === 'blocked') {
        expect(result.reason).toBe('unknown_context');
        expect(result.detail).toContain('at_nether');
      }
    });

    it('tracks registered contexts', () => {
      const registry = new ContextRegistry();
      registry.register('at_base', { id: 'at_base', description: 'Base', abstract: true });
      registry.register('at_mine', { id: 'at_mine', description: 'Mine', abstract: true });

      expect(registry.size).toBe(2);
      expect(registry.has('at_base')).toBe(true);
      expect(registry.has('at_mine')).toBe(true);
      expect(registry.has('at_nether')).toBe(false);
    });

    it('getAll returns all registered contexts', () => {
      const registry = new ContextRegistry();
      registry.register('at_base', { id: 'at_base', description: 'Base', abstract: true });
      registry.register('at_mine', { id: 'at_mine', description: 'Mine', abstract: true });

      const all = registry.getAll();
      expect(all.length).toBe(2);
    });
  });

  describe('Content-addressed edge IDs', () => {
    it('produces stable IDs for same from/to', () => {
      const id1 = computeEdgeId('at_base', 'at_mine');
      const id2 = computeEdgeId('at_base', 'at_mine');
      expect(id1).toBe(id2);
    });

    it('produces different IDs for different from/to', () => {
      const id1 = computeEdgeId('at_base', 'at_mine');
      const id2 = computeEdgeId('at_mine', 'at_base');
      expect(id1).not.toBe(id2);
    });

    it('produces different IDs for different endpoints', () => {
      const id1 = computeEdgeId('at_base', 'at_mine');
      const id2 = computeEdgeId('at_base', 'at_forest');
      expect(id1).not.toBe(id2);
    });
  });

  describe('Content-addressed plan digests', () => {
    it('same edge sequence → same digest', () => {
      const edges = ['edge1', 'edge2', 'edge3'];
      const d1 = computeMacroPlanDigest(edges, 'goal-1');
      const d2 = computeMacroPlanDigest(edges, 'goal-1');
      expect(d1).toBe(d2);
    });

    it('different edge order → different digest', () => {
      const d1 = computeMacroPlanDigest(['edge1', 'edge2'], 'goal-1');
      const d2 = computeMacroPlanDigest(['edge2', 'edge1'], 'goal-1');
      expect(d1).not.toBe(d2);
    });

    it('different goalId → different digest', () => {
      const edges = ['edge1', 'edge2'];
      const d1 = computeMacroPlanDigest(edges, 'goal-1');
      const d2 = computeMacroPlanDigest(edges, 'goal-2');
      expect(d1).not.toBe(d2);
    });
  });

  describe('Schema version', () => {
    it('MACRO_STATE_SCHEMA_VERSION is 1', () => {
      expect(MACRO_STATE_SCHEMA_VERSION).toBe(1);
    });
  });
});
