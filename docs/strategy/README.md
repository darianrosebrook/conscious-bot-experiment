# Strategic Planning Documents

**Author:** @darianrosebrook

> **Status:** The original strategy documents (integration_strategy.md, verification_framework.md, risk_management.md) were removed as they described an early architecture (HRM+HTN, CoreArbiter) that no longer matches the current implementation. Strategic guidance now lives closer to the code:

## Current Strategic References

- **Module specifications** — `docs/plans/modules/` (canonical per-package documentation)
- **Rig implementation plans** — `docs/planning/RIG_*.md` (phased capability specifications A-K)
- **Sterling capability tracker** — `docs/planning/sterling-capability-tracker.md` (live solver status)
- **Evidence-first review contract** — `CLAUDE.md` (reviewer instructions for solver observability)

## Strategic Principles

### 1. Safety First
- Constitutional constraints on behavior
- Human oversight and intervention capabilities
- Fail-safe monitoring in `packages/safety/`

### 2. Modular Architecture
- Clear module boundaries and contracts
- Independent testing and deployment
- Graceful degradation under failure

### 3. Evidence-Based Development
- Rigorous testing and validation (vitest)
- SolveBundle evidence artifacts with content-addressed hashing
- Continuous monitoring and feedback

### 4. Responsible AI
- Ethical behavior through constitutional constraints
- Transparent decision-making processes
- Explainable AI reasoning

## Related Documentation

- [Module Implementation Plans](../plans/modules/README.md) — detailed technical specifications
- [Project Overview](../../readme.md) — high-level project description and goals
