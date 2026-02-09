# Rig H: Systems Synthesis — Companion Approach

**Implementation**: HARDENING-COMPLETE (2026-02-09) — P08 capsule types, reference adapter, 2-domain fixtures, Minecraft synthesis module, 37 certification tests

This companion document distills the implementation plan with design decisions, boundaries, and implementation construction constraints. Read alongside `RIG_H_SYSTEMS_SYNTHESIS_PLAN.md`.

---

## 1. Executive summary

Rig H proves **Primitive 8** (Systems synthesis) by implementing design-space search that:

1. Models **partial designs as state** (component graph)
2. Uses **operators that add/modify components**
3. **Evaluates** designs against behavioral specifications
4. **Reuses** successful design motifs

**Critical boundary**: Sterling searches design space, not just trajectory space.

---

## 2. Implementation construction constraints (pivots)

### Pivot 1: Deterministic simulation

**Problem:** Non-deterministic evaluation (e.g., random) causes same design to pass/fail across runs.

**Pivot:** Simulator is deterministic. Same design → same metrics. No `Math.random()` in evaluation path.

**Acceptance check:** Same design evaluated twice → identical metrics.

---

### Pivot 2: Canonicalize for symmetry

**Problem:** Rotated/reflected designs are duplicates; search explores redundant space.

**Pivot:** `canonicalizeDesign(design)` picks smallest hash among rotations; use canonical form for dedup.

**Acceptance check:** Design and its 90° rotation map to same canonical hash.

---

### Pivot 3: Bounded design space

**Problem:** Unbounded grid or components; search never terminates.

**Pivot:** `maxFootprint`, `maxComponents`; reject operators that exceed.

**Acceptance check:** No design exceeds spec max footprint.

---

### Pivot 4: Motif instantiation deterministic

**Problem:** Same motif instantiated differently; non-reproducible.

**Pivot:** Motif cells have relative offsets; instantiation adds (offsetX, offsetZ) deterministically.

**Acceptance check:** Same motif + same offset → identical instantiated cells.

---

### Summary: Acceptance check table

| Pivot | Acceptance check |
|-------|------------------|
| 1 | Same design → same evaluation. |
| 2 | Symmetric designs canonicalize to same hash. |
| 3 | Design space bounded. |
| 4 | Motif instantiation deterministic. |

---

## 3. Primary design decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Domain | Farm layout first | Simpler than redstone |
| Design representation | Grid + component list | Compact, hashable |
| Evaluation | Deterministic simulation | Reproducible |
| Motif storage | Sub-design patterns | Reusable |
| Symmetry handling | Canonical rotation | Reduces duplicates |

---

## 3. Design state representation

### 3.1 Design grid

```ts
// packages/planning/src/synthesis/design-state.ts

export interface GridCell {
  x: number;
  z: number;
  blockType: string;
  metadata?: Record<string, unknown>;
}

export interface DesignGrid {
  width: number;
  depth: number;
  cells: Map<string, GridCell>;  // "x,z" → cell
}

export function hashGrid(grid: DesignGrid): string {
  const sortedCells = Array.from(grid.cells.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v.blockType}`)
    .join('|');
  return createHash('sha256').update(sortedCells).digest('hex').slice(0, 12);
}
```

### 3.2 Component list

```ts
export interface DesignComponent {
  id: string;
  type: 'water_source' | 'farmland' | 'crop' | 'light' | 'hopper' | 'chest';
  position: { x: number; z: number };
  connections: string[];  // IDs of connected components
}

export interface DesignState {
  grid: DesignGrid;
  components: Map<string, DesignComponent>;
  metrics: DesignMetrics;
}

export interface DesignMetrics {
  farmlandCount: number;
  waterCoverage: number;  // % of farmland with water nearby
  lightCoverage: number;  // % of area with sufficient light
  accessPaths: number;    // Harvestable positions
}
```

---

## 4. Design operators

### 4.1 Operator definitions

```ts
// packages/planning/src/synthesis/design-operators.ts

export interface DesignOperator {
  id: string;
  name: string;
  type: 'add' | 'remove' | 'modify';
  componentType: string;
  cost: number;
  preconditions: (state: DesignState) => boolean;
  apply: (state: DesignState, params: Record<string, unknown>) => DesignState;
}

export const DESIGN_OPERATORS: DesignOperator[] = [
  {
    id: 'add_water_source',
    name: 'Add water source',
    type: 'add',
    componentType: 'water_source',
    cost: 5,
    preconditions: (state) => countComponents(state, 'water_source') < 4,
    apply: (state, params) => addWaterSource(state, params.x as number, params.z as number),
  },
  {
    id: 'add_farmland_row',
    name: 'Add farmland row',
    type: 'add',
    componentType: 'farmland',
    cost: 1,
    preconditions: () => true,
    apply: (state, params) => addFarmlandRow(state, params.x as number, params.z as number, params.length as number),
  },
  {
    id: 'add_torch',
    name: 'Add torch for light',
    type: 'add',
    componentType: 'light',
    cost: 2,
    preconditions: (state) => state.metrics.lightCoverage < 1.0,
    apply: (state, params) => addTorch(state, params.x as number, params.z as number),
  },
  {
    id: 'add_collection_hopper',
    name: 'Add hopper for collection',
    type: 'add',
    componentType: 'hopper',
    cost: 10,
    preconditions: () => true,
    apply: (state, params) => addHopper(state, params.x as number, params.z as number),
  },
];

function addWaterSource(state: DesignState, x: number, z: number): DesignState {
  const newGrid = new Map(state.grid.cells);
  newGrid.set(`${x},${z}`, { x, z, blockType: 'water' });
  
  const newComponents = new Map(state.components);
  const id = `water_${x}_${z}`;
  newComponents.set(id, {
    id,
    type: 'water_source',
    position: { x, z },
    connections: [],
  });
  
  return {
    grid: { ...state.grid, cells: newGrid },
    components: newComponents,
    metrics: recalculateMetrics({ ...state.grid, cells: newGrid }, newComponents),
  };
}
```

---

## 5. Behavioral specification

### 5.1 Specification definition

```ts
// packages/planning/src/synthesis/specification.ts

export interface FarmSpec {
  minFarmland: number;
  minWaterCoverage: number;  // 0-1
  minLightCoverage: number;  // 0-1
  minYieldPerHour: number;
  maxFootprint: { width: number; depth: number };
}

export const DEFAULT_FARM_SPEC: FarmSpec = {
  minFarmland: 16,
  minWaterCoverage: 0.95,
  minLightCoverage: 0.80,
  minYieldPerHour: 100,
  maxFootprint: { width: 9, depth: 9 },
};
```

### 5.2 Spec evaluation

```ts
export interface SpecResult {
  satisfied: boolean;
  violations: string[];
  metrics: Record<string, number>;
}

export function evaluateSpec(design: DesignState, spec: FarmSpec): SpecResult {
  const violations: string[] = [];
  
  if (design.metrics.farmlandCount < spec.minFarmland) {
    violations.push(`Farmland ${design.metrics.farmlandCount} < required ${spec.minFarmland}`);
  }
  if (design.metrics.waterCoverage < spec.minWaterCoverage) {
    violations.push(`Water coverage ${design.metrics.waterCoverage.toFixed(2)} < required ${spec.minWaterCoverage}`);
  }
  if (design.metrics.lightCoverage < spec.minLightCoverage) {
    violations.push(`Light coverage ${design.metrics.lightCoverage.toFixed(2)} < required ${spec.minLightCoverage}`);
  }
  
  const estimatedYield = estimateYieldPerHour(design);
  if (estimatedYield < spec.minYieldPerHour) {
    violations.push(`Yield ${estimatedYield}/hr < required ${spec.minYieldPerHour}/hr`);
  }
  
  if (design.grid.width > spec.maxFootprint.width || design.grid.depth > spec.maxFootprint.depth) {
    violations.push(`Footprint ${design.grid.width}x${design.grid.depth} exceeds max ${spec.maxFootprint.width}x${spec.maxFootprint.depth}`);
  }
  
  return {
    satisfied: violations.length === 0,
    violations,
    metrics: {
      farmland: design.metrics.farmlandCount,
      waterCoverage: design.metrics.waterCoverage,
      lightCoverage: design.metrics.lightCoverage,
      estimatedYield: estimatedYield,
    },
  };
}
```

---

## 6. Deterministic simulation

### 6.1 Farm simulator

```ts
// packages/planning/src/synthesis/farm-simulator.ts

export interface SimulationResult {
  ticksSimulated: number;
  cropsGrown: number;
  yieldPerHour: number;
  bottlenecks: string[];
}

export function simulateFarm(design: DesignState, ticksToSimulate: number = 24000): SimulationResult {
  let cropsGrown = 0;
  const bottlenecks: string[] = [];
  
  // Simulate each tick (simplified)
  for (let tick = 0; tick < ticksToSimulate; tick++) {
    for (const [pos, cell] of design.grid.cells.entries()) {
      if (cell.blockType === 'farmland') {
        // Check water and light
        const hasWater = hasNearbyWater(design, cell.x, cell.z);
        const hasLight = hasAdequateLight(design, cell.x, cell.z);
        
        if (hasWater && hasLight) {
          // Growth chance per tick (simplified)
          if (Math.random() < 0.01) {  // ~1% per tick
            cropsGrown++;
          }
        }
      }
    }
  }
  
  // Check for bottlenecks
  if (design.metrics.waterCoverage < 1.0) {
    bottlenecks.push('Some farmland lacks water coverage');
  }
  if (design.metrics.lightCoverage < 1.0) {
    bottlenecks.push('Some farmland lacks adequate light');
  }
  
  const hoursSimulated = ticksToSimulate / 24000;
  return {
    ticksSimulated: ticksToSimulate,
    cropsGrown,
    yieldPerHour: cropsGrown / hoursSimulated,
    bottlenecks,
  };
}

function hasNearbyWater(design: DesignState, x: number, z: number): boolean {
  for (let dx = -4; dx <= 4; dx++) {
    for (let dz = -4; dz <= 4; dz++) {
      const cell = design.grid.cells.get(`${x + dx},${z + dz}`);
      if (cell?.blockType === 'water') return true;
    }
  }
  return false;
}
```

---

## 7. Motif library

### 7.1 Motif storage

```ts
// packages/planning/src/synthesis/motif-library.ts

export interface DesignMotif {
  id: string;
  name: string;
  pattern: GridCell[];  // Relative positions
  metrics: DesignMetrics;
  successCount: number;
  useCount: number;
}

export class MotifLibrary {
  private motifs: Map<string, DesignMotif> = new Map();
  
  addMotif(design: DesignState, metrics: DesignMetrics): string {
    const pattern = extractPattern(design);
    const id = hashPattern(pattern);
    
    if (this.motifs.has(id)) {
      const existing = this.motifs.get(id)!;
      existing.successCount++;
      return id;
    }
    
    this.motifs.set(id, {
      id,
      name: `Motif-${id.slice(0, 6)}`,
      pattern,
      metrics,
      successCount: 1,
      useCount: 0,
    });
    
    return id;
  }
  
  getTopMotifs(count: number = 5): DesignMotif[] {
    return Array.from(this.motifs.values())
      .sort((a, b) => b.successCount - a.successCount)
      .slice(0, count);
  }
  
  instantiateMotif(motifId: string, offsetX: number, offsetZ: number): GridCell[] {
    const motif = this.motifs.get(motifId);
    if (!motif) return [];
    
    motif.useCount++;
    return motif.pattern.map(cell => ({
      ...cell,
      x: cell.x + offsetX,
      z: cell.z + offsetZ,
    }));
  }
}
```

---

## 8. Symmetry handling

### 8.1 Canonical rotation

```ts
export function canonicalizeDesign(design: DesignState): DesignState {
  // Generate all 4 rotations
  const rotations = [
    design,
    rotateDesign(design, 90),
    rotateDesign(design, 180),
    rotateDesign(design, 270),
  ];
  
  // Choose the one with the smallest hash (canonical form)
  const hashes = rotations.map(d => hashGrid(d.grid));
  const minHashIndex = hashes.indexOf(hashes.sort()[0]);
  
  return rotations[minHashIndex];
}

function rotateDesign(design: DesignState, degrees: number): DesignState {
  // ... rotation implementation
  return design;  // Placeholder
}
```

---

## 9. DO and DO NOT

**DO:**
- **DO** model designs as compact grid + component list.
- **DO** use deterministic simulation for evaluation.
- **DO** canonicalize designs to handle symmetry.
- **DO** store successful motifs for reuse.
- **DO** start with farm layouts (simpler).

**DO NOT:**
- **DO NOT** attempt full Minecraft simulation.
- **DO NOT** ignore symmetry (causes duplicates).
- **DO NOT** use non-deterministic evaluation.
- **DO NOT** try redstone before farm is working.

---

## 10. Certification tests

### 10.1 Spec satisfaction

```ts
describe('Design synthesis', () => {
  it('synthesizes farm meeting spec', () => {
    const spec = DEFAULT_FARM_SPEC;
    const result = synthesizeFarm(spec);
    
    expect(result.found).toBe(true);
    const evaluation = evaluateSpec(result.design!, spec);
    expect(evaluation.satisfied).toBe(true);
  });
});
```

### 10.2 Motif reuse

```ts
describe('Motif library', () => {
  it('reuses successful patterns', () => {
    const library = new MotifLibrary();
    
    // Add a successful design
    const design1 = createSuccessfulDesign();
    library.addMotif(design1, design1.metrics);
    
    // Second similar success should increase count
    const design2 = createSuccessfulDesign();
    library.addMotif(design2, design2.metrics);
    
    const topMotifs = library.getTopMotifs(1);
    expect(topMotifs[0].successCount).toBeGreaterThanOrEqual(2);
  });
});
```

---

## 12. Definition of "done"

### Core boundary criteria

- **Designs meet spec:** Synthesized designs satisfy requirements.
- **Motif reuse:** Successful patterns stored and reused.
- **Symmetry handled:** Canonicalize for dedup.
- **Deterministic:** Same design → same evaluation.
- **Bounded:** Design space bounded.

### Acceptance checks (4 pivots)

All 4 pivot acceptance checks must pass.

---

## 12. Cross-references

- **Implementation plan**: `RIG_H_SYSTEMS_SYNTHESIS_PLAN.md`
- **Capability primitives**: `capability-primitives.md` (P8, P14)
- **Sterling domains**: `sterling-minecraft-domains.md` (Rig H section)
