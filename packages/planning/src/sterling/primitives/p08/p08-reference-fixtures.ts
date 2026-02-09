/**
 * P08 Reference Fixtures — Two-Domain Portability Proof
 *
 * Domain 1: Farm Layout — water sources, farmland, torches
 * Domain 2: Circuit Design — sources, wires, outputs
 *
 * Both domains use the same P08 capsule contract, proving domain-agnosticism.
 *
 * Zero Minecraft runtime imports. Zero vitest imports.
 */

import type {
  P08BehavioralSpecV1,
  P08DesignOperatorV1,
} from './p08-capsule-types.js';

// ── Domain 1: Farm Layout ────────────────────────────────────────────

export const FARM_OPERATORS: readonly P08DesignOperatorV1[] = [
  {
    id: 'place_water',
    name: 'Place water source',
    cellType: 'water',
    cost: 5,
  },
  {
    id: 'place_farmland',
    name: 'Place farmland',
    cellType: 'farmland',
    cost: 1,
  },
  {
    id: 'place_torch',
    name: 'Place torch for light',
    cellType: 'torch',
    cost: 2,
  },
  {
    id: 'place_hopper',
    name: 'Place collection hopper',
    cellType: 'hopper',
    cost: 10,
  },
];

export const FARM_SPEC: P08BehavioralSpecV1 = {
  id: 'basic_farm',
  name: 'Basic Farm Layout',
  params: {
    water: 1,       // At least 1 water source
    farmland: 8,    // At least 8 farmland cells
    torch: 2,       // At least 2 torches
  },
  maxFootprint: { width: 9, depth: 9 },
};

export const SMALL_FARM_SPEC: P08BehavioralSpecV1 = {
  id: 'small_farm',
  name: 'Small Farm Layout',
  params: {
    water: 1,
    farmland: 4,
  },
  maxFootprint: { width: 5, depth: 5 },
};

// ── Domain 2: Circuit Design ─────────────────────────────────────────

export const CIRCUIT_OPERATORS: readonly P08DesignOperatorV1[] = [
  {
    id: 'place_source',
    name: 'Place signal source',
    cellType: 'source',
    cost: 3,
  },
  {
    id: 'place_wire',
    name: 'Place wire',
    cellType: 'wire',
    cost: 1,
  },
  {
    id: 'place_gate',
    name: 'Place logic gate',
    cellType: 'gate',
    cost: 5,
  },
  {
    id: 'place_output',
    name: 'Place output',
    cellType: 'output',
    cost: 2,
  },
];

export const CIRCUIT_SPEC: P08BehavioralSpecV1 = {
  id: 'basic_circuit',
  name: 'Basic Signal Circuit',
  params: {
    source: 1,    // At least 1 signal source
    wire: 3,      // At least 3 wire segments
    output: 1,    // At least 1 output
  },
  maxFootprint: { width: 7, depth: 7 },
};
