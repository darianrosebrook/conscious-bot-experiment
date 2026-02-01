# Rig Documentation Enrichment Status

**Last updated**: 2026-01-31

**Purpose**: Track which rigs have been enriched with concrete implementation details, code anchors, pivots, transfer surfaces, and certification tests.

**Reference**: See `RIG_DOCUMENTATION_ENRICHMENT_GUIDE.md` for enrichment criteria and templates.

---

## Enrichment criteria summary

A rig is considered **ENRICHED** when it has:

1. ✅ Concrete code anchors (file paths, line numbers, function signatures)
2. ✅ Explicit conscious-bot vs Sterling split
3. ✅ At least 3 implementation pivots with code examples and acceptance checks
4. ✅ At least 2 transfer surfaces defined
5. ✅ At least 5 concrete test code blocks (TypeScript with describe/it/expect)
6. ✅ Testable definition of done referencing pivots and tests

---

## Overall enrichment status

| Track | Rigs | Enriched | Partial | Not Started |
|-------|------|----------|---------|-------------|
| **Track 1** (Certification) | 3 | 2 | 0 | 1 |
| **Track 2** (Belief + Perception) | 3 | 1 | 0 | 2 |
| **Track 3** (Widening) | 6 | 0 | 0 | 6 |
| **Total** | 12 | 3 | 0 | 9 |

**Progress**: 3/12 enriched (25%) | Track 1: 67% complete

---

## Track 1: Certification (A, B, C)

### Rig A: Certification Hardening (P1)

**Status**: ✅ **ENRICHED** (2026-01-31)

**What exists**:
- ✅ Target invariant and formal signature
- ✅ Section 3: Current code anchors with file paths, line numbers, and TypeScript snippets
- ✅ Section 4: conscious-bot vs Sterling split (table with explicit contract)
- ✅ Section 5: Concrete "what to implement" with file paths and function signatures
- ✅ Section 6: 5 implementation pivots with Problem/Pivot/Code/Acceptance
- ✅ Section 7: 3 transfer surfaces (BOM assembly, build graph, data pipeline)
- ✅ Section 9: 5 concrete test code blocks with TypeScript (12 test cases total)
- ✅ Section 10: Testable definition of done with pivot acceptance checklist
- ✅ Section 12: Implementation files summary (new files to create, files to modify)

**Companion approach**: ✅ **ENRICHED** (has detailed validation, hashing, credit, explanations code)

**Enrichment quality**: 🟢 **TEMPLATE QUALITY** (use as reference for Track 1 rigs)

**Next action**: None (complete); ready for implementation.

---

### Rig B: Capability Gating (P2)

**Status**: ✅ **ENRICHED** (recently upgraded)

**What exists**:
- ✅ Target invariant and formal signature
- ✅ Section 3: Code anchors with exact file paths and TypeScript snippets
- ✅ Section 4: conscious-bot vs Sterling split (table with explicit contract)
- ✅ Section 5: Concrete "what to implement" with file paths and function signatures
- ✅ Section 6: 5 implementation pivots with Problem/Pivot/Code/Acceptance
- ✅ Section 7: 3 transfer surfaces (enterprise permissions, robotics levels, deployment gates)
- ✅ Section 8: 5 concrete test code blocks with TypeScript
- ✅ Section 9: Testable definition of done with pivot acceptance checklist

**Companion approach**: ✅ **ENRICHED** (has detailed pivots, DO/DO NOT, code examples)

**Gold standard level**: 🟢 **TEMPLATE QUALITY** (use as reference for Track 1 rigs)

**Next action**: None (complete); use as template for A and C.

---

### Rig C: Temporal Planning (P3)

**Status**: 🔴 **NOT STARTED** (needs full enrichment)

**What exists**:
- ✅ Target invariant (basic)
- ✅ Formal signature (basic)
- ✅ High-level problem statement
- ⚠️ Abstract "what to implement"

**What's missing for ENRICHED**:
- ❌ Section 3: Current code anchors
- ❌ Section 4: conscious-bot vs Sterling split
- ❌ Section 6: Implementation pivots
- ❌ Section 7: Transfer surfaces
- ❌ Section 8: Concrete certification tests
- ❌ Section 9: Updated definition of done

**Next action**: Full enrichment pass using Rig B as template.

**Priority**: 🔴 **CRITICAL** (blocks Track 1 completion)

**Estimated effort**: 4-5 hours (less baseline than Rig A; temporal semantics are complex)

---

## Track 2: Belief + Perception (I, I-ext, J)

### Rig I: Epistemic Planning (P11)

**Status**: 🔴 **NOT STARTED** (needs enrichment)

**What exists**:
- ✅ Target invariant (basic)
- ✅ Formal signature (basic)
- ✅ High-level problem statement

**What's missing for ENRICHED**:
- ❌ All sections 3-9 (no concrete details)

**Next action**: Full enrichment pass using Rig I-ext as template (related primitive).

**Priority**: 🟡 **HIGH** (needed for Track 2)

**Estimated effort**: 5-6 hours (can reuse patterns from I-ext)

---

### Rig I-ext: Entity Belief Tracking (P21)

**Status**: ✅ **ENRICHED** (gold standard)

**What exists**:
- ✅ Target invariant with critical boundary
- ✅ Section 1b: Ownership rule and Belief Bus architecture
- ✅ Section 2: Detailed investigation checklist (20+ items)
- ✅ Section 2b: Architecture drift accelerants (9 pivots!)
- ✅ Section 3: Extremely detailed "what to implement" with file paths, types, operators
- ✅ Section 4: Implicit conscious-bot vs Sterling split (Belief Bus in conscious-bot)
- ✅ Complete implementation pivots with anti-patterns
- ✅ Staged delivery (Stage 1 ship fast, Stage 2 discrimination)

**Companion approach**: ✅ **ENRICHED** (8 pivots with detailed code examples)

**Gold standard level**: 🌟 **EXEMPLAR** (most comprehensive; use as reference for all Track 2-3)

**Next action**: None (complete); use as template for I and J.

---

### Rig J: Invariant Maintenance (P12)

**Status**: 🔴 **NOT STARTED** (needs enrichment)

**What exists**:
- ✅ Target invariant (basic)
- ✅ Formal signature (basic)
- ✅ High-level problem statement

**What's missing for ENRICHED**:
- ❌ All sections 3-9 (no concrete details)

**Next action**: Full enrichment pass using Rig I-ext patterns.

**Priority**: 🟡 **HIGH** (needed for Track 2; complements I-ext)

**Estimated effort**: 4-5 hours (invariant semantics simpler than epistemic)

---

## Track 3: Representational Widening (D, E, F, G, H, K)

### Rig D: Multi-Strategy (P4)

**Status**: 🔴 **NOT STARTED**

**Priority**: 🟢 **MEDIUM** (defer until Track 1-2 complete)

**What's missing**: All enrichment sections 3-9

**Next action**: Defer; enrich after Track 1-2 proven.

**Estimated effort**: 4-5 hours

---

### Rig E: Hierarchical Planning (P5)

**Status**: 🔴 **NOT STARTED**

**Priority**: 🟢 **MEDIUM** (defer until Track 1-2 complete)

**What's missing**: All enrichment sections 3-9

**Next action**: Defer; enrich after Track 1-2 proven.

**Estimated effort**: 5-6 hours (hierarchical semantics complex)

---

### Rig F: Valuation under Scarcity (P6)

**Status**: 🔴 **NOT STARTED**

**Priority**: 🟢 **MEDIUM** (defer until Track 1-2 complete)

**What's missing**: All enrichment sections 3-9

**Next action**: Defer; enrich after Track 1-2 proven.

**Estimated effort**: 4-5 hours

---

### Rig G: Partial-Order Structure (P7)

**Status**: 🔴 **NOT STARTED**

**Priority**: 🟢 **MEDIUM** (defer until Track 1-2 complete)

**What's missing**: All enrichment sections 3-9

**Next action**: Defer; enrich after Track 1-2 proven.

**Estimated effort**: 5-6 hours (partial-order semantics complex)

---

### Rig H: Systems Synthesis (P8)

**Status**: 🔴 **NOT STARTED**

**Priority**: 🟢 **MEDIUM** (defer until Track 1-2 complete)

**What's missing**: All enrichment sections 3-9

**Next action**: Defer; enrich after Track 1-2 proven.

**Estimated effort**: 6-7 hours (synthesis + evaluation complex)

---

### Rig K: Irreversibility (P13)

**Status**: 🔴 **NOT STARTED**

**Priority**: 🟢 **MEDIUM** (defer until Track 1-2 complete)

**What's missing**: All enrichment sections 3-9

**Next action**: Defer; enrich after Track 1-2 proven.

**Estimated effort**: 4-5 hours

---

## Enrichment roadmap

### Phase 1: Track 1 completion (CRITICAL - blocks implementation)

**Goal**: All Track 1 rigs (A, B, C) enriched to enable Sterling + conscious-bot coordinated development.

**Status**: 2/3 complete (Rig A ✅, Rig B ✅)

**Remaining work**:
1. ~~**Rig A enrichment** (3-4 hours)~~ ✅ **COMPLETE** (2026-01-31)
   - ✅ Added sections 3-10 using Rig B as template
   - ✅ Trace hashing, rule validation, execution-based credit
   - ✅ Transfer surfaces: BOM assembly, build graph, data pipeline
   - ✅ 5 pivots, 5 test suites (12 test cases), implementation files summary

2. **Rig C enrichment** (4-5 hours)
   - Add sections 3-9 using Rig B as template
   - Focus on temporal semantics, batching, capacity constraints
   - Transfer surfaces: job shop scheduling, manufacturing, ETL orchestration

**Total estimated effort**: ~~7-9~~ **4-5 hours** (Rig C only)

**Blocker for**: All Track 1 implementation work

**Completion criteria**:
- ✅ All 3 rigs pass enrichment quality checklist
- ✅ Each has concrete code anchors, pivots, transfer surfaces, tests
- ✅ conscious-bot vs Sterling split is explicit for all 3
- ✅ Sterling team can implement P1-P3 without ambiguity

---

### Phase 2: Track 2 completion (HIGH - observation spam fix)

**Goal**: All Track 2 rigs (I, I-ext, J) enriched to enable belief layer implementation.

**Status**: 1/3 complete (Rig I-ext done)

**Remaining work**:
1. **Rig I enrichment** (5-6 hours)
   - Add sections 3-9 using Rig I-ext as template
   - Focus on belief-state representation, probe selection, hypothesis collapse
   - Transfer surfaces: fault diagnosis, structure localization

2. **Rig J enrichment** (4-5 hours)
   - Add sections 3-9 using Rig I-ext patterns
   - Focus on invariant metrics, drift dynamics, receding horizon
   - Transfer surfaces: SRE maintenance, control systems, SLO hygiene

**Total estimated effort**: 9-11 hours

**Blocker for**: Observation spam fix, entity belief tracking, reflexive safety

**Completion criteria**:
- ✅ All 3 rigs pass enrichment quality checklist
- ✅ Belief Bus contract defined (I-ext)
- ✅ Epistemic probe semantics defined (I)
- ✅ Invariant maintenance semantics defined (J)
- ✅ Transfer surfaces prove domain-agnosticism

---

### Phase 3: Track 3 enrichment (DEFERRED)

**Goal**: All Track 3 rigs (D, E, F, G, H, K) enriched for widening capabilities.

**Status**: 0/6 complete

**Estimated effort**: 28-34 hours total (4-7 hours per rig)

**Trigger**: Defer until Tracks 1-2 are implemented and proven in Minecraft rig.

**Rationale**: Foundational primitives (determinism, capability gating, temporal, epistemic, invariant) must be certified before widening to multi-strategy, hierarchical, valuation, partial-order, synthesis, irreversibility.

---

## Critical path to implementation

```
Phase 1 (Track 1 enrichment)
├─ Rig A enrichment (3-4h) ────✅ COMPLETE (2026-01-31)
├─ Rig B enrichment ───────────✅ COMPLETE (baseline)
├─ Rig C enrichment (4-5h) ────🔴 REMAINING
└─ Total: ~~7-9~~ 4-5 hours   │
                                ├─> Track 1 READY FOR IMPLEMENTATION
                                │
Phase 2 (Track 2 enrichment)   │
├─ Rig I enrichment (5-6h) ────┤
├─ Rig I-ext enrichment ───────✅ COMPLETE (gold standard)
├─ Rig J enrichment (4-5h) ────┤
└─ Total: 9-11 hours           │
                                ├─> Track 2 READY FOR IMPLEMENTATION
                                │
Track 1 + Track 2 implementation (parallel)
├─ Sterling: P1, P2, P3 ───────┤
├─ Conscious-bot: Rigs A, B, C │
├─ Sterling: P11, P21, P12 ────┤
├─ Conscious-bot: Rigs I, I-ext, J
└─ Certification tests for all │
                                ├─> Tracks 1-2 PROVEN
                                │
Phase 3 (Track 3 enrichment)   │
└─ 6 rigs × 4-7h = 28-34h ─────┴─> Track 3 READY FOR IMPLEMENTATION
```

**Progress update (2026-01-31)**:
- ✅ Rig A enrichment complete (3.5h actual)
- Track 1: 67% complete (2/3 rigs enriched)
- Remaining: 4-5h (Rig C only)

**Bottleneck**: ~~Documentation enrichment for Tracks 1-2 (16-20 hours total)~~ **Rig C enrichment (4-5 hours)** must complete BEFORE Track 1 implementation can proceed.

**Updated critical path**: ~~16-20h~~ **13-16h** remaining (4-5h Track 1 + 9-11h Track 2)

---

## Enrichment assignment recommendations

### If working sequentially (one person)

**Week 1** (UPDATED 2026-01-31):
- ~~Day 1-2: Rig A enrichment (3-4h)~~ ✅ COMPLETE
- Day 1: Rig C enrichment (4-5h)
- Day 2: Track 1 validation and cross-check

**Week 2**:
- Day 1-2: Rig I enrichment (5-6h)
- Day 3: Rig J enrichment (4-5h)
- Day 4: Track 2 validation and cross-check

**Week 3**: Implement Track 1 (Sterling + conscious-bot in parallel)

**Week 4**: Implement Track 2 (Sterling + conscious-bot in parallel)

---

### If working in parallel (two people)

**Person 1 (Track 1 focus)**:
- Rig A enrichment (3-4h)
- Rig C enrichment (4-5h)
- Total: 7-9 hours over 2-3 days

**Person 2 (Track 2 focus)**:
- Rig I enrichment (5-6h)
- Rig J enrichment (4-5h)
- Total: 9-11 hours over 2-3 days

**Timeline**: Both tracks enriched within 3-4 days, enabling parallel Track 1 + Track 2 implementation.

---

## Quality gates for enrichment

Before marking a rig as **ENRICHED**, it must pass this checklist:

### Structural completeness
- [ ] Has sections 1-9 (or 1-11 if extended like I-ext)
- [ ] Each section has required subsections per enrichment guide
- [ ] Cross-references are valid (files exist, sections exist)

### Concreteness (no vague instructions)
- [ ] Every "What to implement" item has explicit file path
- [ ] Every component has function/class/interface signature
- [ ] No "add logic" without showing exact signature
- [ ] At least 10 specific file paths mentioned

### Code examples
- [ ] At least 5 TypeScript code blocks showing implementation
- [ ] At least 5 test code blocks with describe/it/expect
- [ ] Pivot examples show correct implementation pattern

### Implementation pivots
- [ ] At least 3 pivots defined
- [ ] Each pivot has Problem/Pivot/Code/Acceptance
- [ ] Acceptance checks are testable (not "works")

### Transfer surfaces
- [ ] At least 2 distinct non-Minecraft surfaces
- [ ] Each surface maps all rig semantics to different domain
- [ ] "Prove:" section states certification gates

### conscious-bot vs Sterling split
- [ ] Table showing what goes where
- [ ] Contract defined (what conscious-bot sends, Sterling returns)
- [ ] "No Sterling changes" explicitly stated if applicable
- [ ] File paths for both projects

### Testability
- [ ] Every acceptance criterion is testable
- [ ] Tests reference specific functions/files
- [ ] Definition of done has concrete pass/fail criteria

### Sterling alignment
- [ ] Formal signature matches Sterling P0X spec
- [ ] Cross-reference to Sterling primitive spec exists
- [ ] Any deltas from Sterling spec documented with rationale

---

## Tracking enrichment work

### How to mark a rig as enriched

1. Complete all sections 3-9 per enrichment guide
2. Validate against quality checklist (all items pass)
3. Update this file:
   - Change status from 🔴/🟡 to ✅
   - Add "What exists" checklist confirming all sections
   - Set "Next action" to "None (complete)"
4. Update `RIG_DOCUMENTATION_INDEX.md` coverage matrix
5. Commit with message: `docs(rig-X): enrich with code anchors, pivots, tests`

### How to track enrichment in progress

1. Create a branch: `docs/enrich-rig-X`
2. Add sections incrementally (3, 4, 6, 7, 8, 9)
3. Update status in this file to 🟡 **PARTIAL**
4. List completed sections in "What exists"
5. List missing sections in "What's missing"
6. When all sections complete + quality check passes → merge and mark ✅

---

## Summary

**Current state**:
- 2 of 12 rigs enriched (Rig B, Rig I-ext)
- 1 rig has baseline (Rig A)
- 9 rigs need full enrichment

**Immediate priorities**:
1. Enrich Rig A (Track 1) - 3-4 hours
2. Enrich Rig C (Track 1) - 4-5 hours
3. Enrich Rig I (Track 2) - 5-6 hours
4. Enrich Rig J (Track 2) - 4-5 hours

**Total to unblock Tracks 1-2**: 16-20 hours

**Benefit**:
- Sterling team can implement P1-P3, P11, P21, P12 without ambiguity
- conscious-bot team can implement rigs A-C, I, I-ext, J with explicit file paths
- Parallel development without constant clarification questions
- Domain-agnosticism proven through transfer surfaces
- Certification tests ready to run as implementation proceeds

**Next action**: Assign Track 1 enrichment (Rigs A, C) to unblock Sterling determinism work.
