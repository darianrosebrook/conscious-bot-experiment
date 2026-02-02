# Conscious Bot Documentation

**Author:** @darianrosebrook

## Structure

```
docs/
├── README.md                          # This file
├── environment-controls.md            # Environment variable contracts
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
│   ├── RIG_*_*.md                     # Rig specifications (A-D)
│   └── sterling-*.md                  # Sterling boundary contracts and specs
│
├── integration/                       # System integration documentation
│   ├── observation-thought-action-flow.md  # End-to-end pipeline and service ports
│   └── ...                            # MCP integration, MLX sidecar, etc.
│
├── internal/                          # Protocol documentation
│   ├── goal-binding-protocol.md       # Goal-task binding protocol
│   └── long-horizon-build.md          # Checkpoint/resume substrate
│
└── strategy/                          # Strategic reference documents
    ├── integration_strategy.md        # Cross-module coordination
    ├── verification_framework.md      # Quality assurance methodology
    ├── risk_management.md             # Risk assessment and mitigation
    └── HRM_INTEGRATION_APPROACH.md    # HRM integration strategy
```

## Navigation

### Canonical Module Documentation
Start at **[plans/modules/README.md](plans/modules/README.md)** — the master index mapping every package to its documentation.

### Active Specifications
- **[planning/](planning/)** — Sterling solver specs, Rig specifications (A-D), capability primitives
- **[internal/](internal/)** — protocol specs (goal binding, long-horizon builds)
- **[integration/](integration/)** — service architecture and cross-system integration

### Operational References
- **[leaf-execution-pipeline.md](leaf-execution-pipeline.md)** — full inventory of 40+ leaves with end-to-end flows
- **[multi-step-scenarios.md](multi-step-scenarios.md)** — scenario definitions with capability matrix
- **[environment-controls.md](environment-controls.md)** — environment variable contracts
- **[logging-configuration.md](logging-configuration.md)** — logging setup

### Strategic Reference
- **[strategy/](strategy/)** — integration strategy, verification framework, risk management
