# Conscious Bot Documentation

**Author:** @darianrosebrook

## Structure

```
docs/
├── README.md                          # This file
├── health-check-improvements.md       # Health check specs
├── logging-configuration.md           # Logging configuration
├── leaf-execution-pipeline.md         # Full leaf inventory and execution flows
├── multi-step-scenarios.md            # Multi-step scenario definitions (S1-S10)
│
├── plans/                             # Implementation specifications
│   └── modules/                       # Module-specific documentation
│       ├── README.md                  # Map of content and alignment tracker
│       ├── core/                      # Core: arbiter, signals, leaves, MCP, real-time
│       ├── world/                     # World: sensing, navigation, perception, sensorimotor
│       ├── memory/                    # Memory: episodic, semantic, working, provenance
│       ├── planning/                  # Planning: Sterling solvers, goals, temporal, BT
│       ├── cognition/                 # Cognition: LLM reasoning, identity, social, ReAct
│       ├── interfaces/                # Interfaces: constitution, dashboard, controls
│       ├── safety/                    # Safety: privacy, monitoring, fail-safes
│       └── evaluation/               # Evaluation: benchmarking, regression, curriculum
│
├── planning/                          # Active Sterling/capability specifications
│   ├── capability-primitives.md       # Formal primitive specifications
│   ├── RIG_*_*.md                     # Rig specifications (A-K)
│   ├── sterling-*.md                  # Sterling boundary contracts and specs
│   └── RIG_DOCUMENTATION_INDEX.md     # Rig index and enrichment status
│
├── integration/                       # System integration documentation
│   ├── observation-thought-action-flow.md  # End-to-end pipeline and service ports
│   ├── mlx-sidecar-*.md              # MLX sidecar setup and dataflow
│   ├── observation-queue-and-llm-scheduling.md
│   └── sterling-consolidation-opportunities.md  # Sterling capability gap analysis and consolidation plan
│
├── internal/                          # Protocol documentation
│   ├── goal-binding-protocol.md       # Goal-task binding protocol
│   └── long-horizon-build.md          # Checkpoint/resume substrate
│
└── strategy/                          # Strategic principles
    └── README.md                      # Principles and current references
```

## Navigation

### Canonical Module Documentation
Start at **[plans/modules/README.md](plans/modules/README.md)** — the master index mapping every package to its documentation.

### Active Specifications
- **[planning/](planning/)** — Sterling solver specs, Rig specifications (A-K), capability primitives
- **[internal/](internal/)** — protocol specs (goal binding, long-horizon builds)
- **[integration/](integration/)** — service architecture and cross-system integration
  - **[sterling-consolidation-opportunities.md](integration/sterling-consolidation-opportunities.md)** — maps duplicative systems between conscious-bot and Sterling, proposes 4-phase consolidation

### Operational References
- **[leaf-execution-pipeline.md](leaf-execution-pipeline.md)** — full inventory of 40+ leaves with end-to-end flows
- **[multi-step-scenarios.md](multi-step-scenarios.md)** — scenario definitions with capability matrix
- **[logging-configuration.md](logging-configuration.md)** — logging setup

### Strategic Reference
- **[strategy/](strategy/)** — strategic principles and current references
