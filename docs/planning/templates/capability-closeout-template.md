# [PRIMITIVE_ID] Closeout Packet — [TRANCHE_NAME]

**Capability**: [PRIMITIVE_ID] ([Description])
**Date**: [YYYY-MM-DD]
**Contract version**: [semver]
**Template**: This template. Reference implementation: [p21-closeout-packet.md](../p21-closeout-packet.md)

---

## A. Summary

### What changed

[1-3 paragraphs describing what this tranche adds, hardens, or certifies.]

### Breaking changes

[List any API changes, renamed fields, deprecated constants. "None" if purely additive.]

### Claim statement

[Single sentence: what is newly certified, on which surfaces, under which config. What is specified-only.]

---

## B. Capability Claims + Boundary Audit

### Claims table

| Sub-primitive | contract_version | declared_extensions | budgets | mode | proving surfaces |
|---------------|-----------------|--------------------|---------|----|------------------|
| `[id]` | [version] | `[extensions]` | [budgets] | [mode] | [surfaces] |

### Boundary audit

[Exact grep commands and expected results. Scope domain vocabulary checks to contract/capsule definition files only — not fixtures, tests, or docs.]

```bash
# Domain vocabulary check (contract/capsule scope only)
grep -r "[domain_terms]" \
  [list capsule type files] \
  [list conformance suite files] \
  [list manifest type files]
# Expected: 0 matches

# Domain import check (contract/suite files must not import from domain packages)
grep -r "from.*@conscious-bot/[domain-package]" \
  [same contract files as above]
# Expected: 0 matches

# Import guard check (testkits must not appear in production code)
grep -r "@conscious-bot/testkits" packages/ --include="*.ts" -l
# Expected: only test files and testkits package
```

---

## C. Invariants Catalog

### [Sub-primitive A] ([count] invariants)

| ID | Name | Description | Surfaces | Extension |
|----|------|-------------|----------|-----------|
| [ID] | [name] | [description] | [surfaces] | [extension or —] |

### Extensions

| Extension | Activates | Fail-closed rule |
|-----------|-----------|------------------|
| [id] | [invariant IDs] | [what happens if declared but not implemented] |

---

## D. Proof Artifact Bundle

### Manifest types

| File | Purpose |
|------|---------|
| [path] | [description] |

### Convention

[How manifests are stored, hashed, and referenced.]

---

## E. Acceptance Checks

[For each test suite: exact command, expected test count, what failure means.]

```bash
# [Suite name]
[command]
# Expected: [N] tests passed
# Failure means: [explanation]
```

---

## F. Changeset Recap

### New files

| File | Purpose |
|------|---------|
| [path] | [purpose] |

### Modified files

| File | Change |
|------|--------|
| [path] | [change description] |

### Deprecations

[List deprecated identifiers and their replacements. "None" if no deprecations.]

---

## G. Open Items / Deferred Risks

[Numbered list of known gaps, deferred work, and risks. Each item should state what it is, why it's acceptable, and what the mitigation or follow-up plan is.]

1. **[Item]**: [Description]. [Mitigation].

[If multiple proving surfaces exist, explicitly distinguish what kind of portability is proven:]
- **Contract semantics portability**: same invariants satisfied by different implementations in different domains.
- **Implementation independence**: proving surfaces use decorrelated algorithms so that a bug in one does not imply a bug in the other.
[State which type the current tranche achieves and what is needed for the other.]

### Extension evolution rules

[If the primitive has extensions, state the rules that govern how extensions may be added or modified. Reference implementation: p21-closeout-packet.md.]

1. **Additive only.** Extensions may not weaken, remove, or redefine base invariants.
2. **Independently certifiable.** Each extension must be certifiable in isolation.
3. **Declaration-gated.** Extension invariants activate only when explicitly declared.
4. **Fail-closed.** Missing implementation for a declared extension must fail, not skip.
5. **No base semantics mutation.** Extensions may enrich but not alter base behavior.
6. **Surface-scoped claims.** Extension support requires passing all extension-gated invariants.

---

## H. Final Claim Statement

[Single definitive sentence stating exactly what is certified, on which surfaces, under which configuration, and what is defined but not certified.]
