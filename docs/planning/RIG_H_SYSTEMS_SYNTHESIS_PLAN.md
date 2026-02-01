# Rig H: Systems Synthesis Implementation Plan

**Primitive**: P8 — Systems synthesis (compose components to satisfy a behavioral spec)

**Status**: Planned (Track 3)

---

## 1. Target invariant (critical boundary)

**"Sterling searches a design space, not just a trajectory space; it can reuse motifs and detect near-misses."**

The system must:
- Model partial designs as state
- Use operators that add/modify components
- Evaluate designs against behavioral specifications
- Reuse successful design motifs

**What this rig proves**: Sterling can synthesize systems, not just plan sequences.

---

## 2. Formal signature

- **State is a partial design**: component graph, configuration, wiring
- **Operators add components**: place block, connect redstone, configure
- **Evaluation function checks spec satisfaction**: deterministic simulator
- **Goal is "spec holds"**: design produces desired behavior

---

## 3. Problem being solved

### 3.1 Current state (no synthesis)

Without synthesis:
- Planner can only follow pre-defined recipes
- No ability to design novel farm layouts or redstone circuits
- Creative building requires human design input

### 3.2 With synthesis

With proper synthesis:
- Goal: "design farm that produces 100 wheat/hour"
- Planner explores design space: layout, water placement, lighting
- Simulator checks if design meets spec
- Successful motifs are reused in future designs

---

## 4. What to investigate before implementing

| Step | Location | What to verify |
|------|----------|----------------|
| Building domain | `packages/planning/src/sterling/minecraft-building-solver.ts` | Building rules; placement semantics |
| World/block state | world-state, minecraft-interface | Block queries; design-as-state representation |
| Farm mechanics | Minecraft/mineflayer | Crop growth, water flow; simulator requirements |
| Sterling search | Sterling (Python) | State space for design; operator application |

**Investigation outcome (verified 2025-01-31):** No design synthesis. Building domain: `MinecraftBuildingSolver.solveBuildingPlan` (minecraft-building-solver.ts:61-80) sends modules to Sterling; `BuildingModule` has `requiresModules`, `placementFeasible`; template-based, not design exploration. World state: `world-state-manager.ts` (WorldStateSnapshot) has nearbyBlocks; no block placement map or design-as-state. Farm mechanics: Minecraft/mineflayer has block/crop APIs; no deterministic simulator for "water reaches all farmland." Sterling: building domain returns ordered steps; no design-space search. Design state would be new; simulator would require farm/circuit evaluation; motif reuse would be learning-layer extension.

### 4a. Current code anchors (verified 2025-01-31)

| File | Line(s) | What |
|------|---------|------|
| `packages/planning/src/sterling/minecraft-building-solver.ts` | 61-80 | `solveBuildingPlan()`: template + modules; Sterling returns ordered steps. No design exploration. |
| `packages/planning/src/sterling/minecraft-building-types.ts` | BuildingModule, BuildingSiteState | `requiresModules`, `placementFeasible`; template-driven. No partial design graph. |
| `packages/planning/src/world-state/world-state-manager.ts` | 16-27 | `WorldStateSnapshot`: nearbyBlocks; no design state or block placement map. |

**Gap:** No design state, design operators, specification evaluator, or motif library. Building is template application, not synthesis.

---

## 5. What to implement / change

### 5.1 Design state representation

**Location**: Sterling domain or `packages/planning/src/synthesis/`

- Partial design: placed blocks, connections, configuration
- Design is a graph structure (nodes = components, edges = connections)
- State hashing must handle symmetry (rotated designs are equivalent)

### 5.2 Design operators

- `place_component(type, position)`: add component to design
- `connect(a, b)`: establish connection between components
- `configure(component, settings)`: set component parameters

### 5.3 Specification and evaluation

- Behavioral spec: "water reaches all farmland", "redstone signal propagates"
- Deterministic simulator evaluates spec against design
- Evaluation returns pass/fail + metrics

### 5.4 Motif reuse

- Successful sub-designs are stored as motifs
- Motifs can be instantiated as macro operators
- Learning identifies useful motifs

---

## 6. Where (summary)

| Component | Location | Responsibility |
|-----------|----------|----------------|
| Design state | Sterling domain | Partial design representation |
| Design operators | Domain rules | Add/modify components |
| Simulator | Minecraft or dedicated | Evaluate spec satisfaction |
| Motif library | Learning layer | Store and reuse successful patterns |

---

## 7. Order of work (suggested)

1. **Define design state** for farm layout domain.
2. **Implement design operators** (place, connect, configure).
3. **Build deterministic simulator** for farm evaluation.
4. **Add spec checking** to search.
5. **Implement motif extraction** and reuse.
6. **Certification tests**: designs meet specs; motifs transfer.

---

## 8. Dependencies and risks

- **Rig A-G**: Builds on previous capabilities.
- **Simulator complexity**: Full Minecraft simulation is expensive.
- **Design space explosion**: Even small farms have huge design spaces.
- **Symmetry handling**: Must canonicalize designs to avoid duplicates.

---

## 9. Definition of "done"

- **Designs meet spec**: Synthesized designs satisfy behavioral requirements.
- **Motif reuse**: Successful patterns are reused.
- **Symmetry handled**: Equivalent designs are recognized.
- **Deterministic evaluation**: Same design → same spec result.
- **Tests**: Farm synthesis works; redstone is deferred to later.

---

## 10. Cross-references

- **Companion approach**: `RIG_H_SYSTEMS_SYNTHESIS_APPROACH.md`
- **Capability primitives**: `capability-primitives.md` (P8)
- **Rig definitions**: `sterling-minecraft-domains.md` (Rig H section)
