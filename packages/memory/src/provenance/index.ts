/**
 * Provenance Memory System
 * 
 * Provides decision tracking, evidence management, audit trails,
 * and explanation generation for accountability and transparency.
 * 
 * @author @darianrosebrook
 */

export * from './types';
export * from './decision-tracker';
export * from './evidence-manager';
export * from './audit-trail';
export * from './explanation-generator';
export * from './provenance-system';

import { ProvenanceSystem } from './provenance-system';

/**
 * Create a complete provenance memory system
 */
export function createProvenanceSystem(config = {}) {
  return new ProvenanceSystem(config);
}
