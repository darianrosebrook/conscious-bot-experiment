# Evaluation & Testing

**Package:** `packages/evaluation/`
**Purpose:** Comprehensive testing framework with benchmarking, regression monitoring, curriculum progression, and behavioral analysis
**Author:** @darianrosebrook

## Overview

The evaluation package provides statistical performance measurement, regression detection, progressive curriculum management, and structured scenario evaluation. It supports both automated CI-level regression monitoring and interactive evaluation dashboards.

## Module Inventory

### Scenarios (`scenarios/`)
**Test Environments and Structured Evaluation Tasks**
- `scenario-manager.ts` — scenario orchestration and lifecycle management
- `minedojo-scenarios.ts` — Minecraft-specific scenarios (mining, building, combat)
- `complex-reasoning-scenarios.ts` — high-complexity reasoning tasks
- Progressive curriculum: Safe Plains → Forest Night → Cave Maze → Village Defense
- Fixed seeds and structured task definitions

### Metrics (`metrics/`)
**Performance Measurement and Behavioral Analysis**
- `performance-analyzer.ts` — multi-dimensional analysis engine
  - Per-domain and per-complexity performance profiling
  - Strength/weakness identification with trend analysis
  - Comparative analysis with win matrices and significance tests
  - Session history tracking

### Curriculum (`curriculum/`)
**Progressive Skill Building and Regression Testing**
- `curriculum-manager.ts` — orchestrates builder + regression manager; generates recommendations
- `curriculum-builder.ts` — builds progressive task sequences with pass/fail gates (BASALT-style)
- `regression-suite.ts` — nightly regression automation with baseline tracking
- Ablation study coordination for component impact analysis
- Stress testing protocols (sensorimotor disruption, latency injection)

### Benchmarking (`benchmarking/`)
**Statistical Performance Evaluation**
- `performance-benchmarker.ts` — benchmarking framework with Zod-validated configuration
  - Multi-iteration runs with warmup phases
  - Statistical analysis: confidence intervals, significance thresholds
  - Regression detection against baselines (5% threshold default)
  - Results: mean, median, stdDev, P95, P99, success/completion/error rates
- `performance-benchmark-runner.ts` — execution orchestrator
- `run-benchmarks.ts` — CLI entrypoint for benchmark execution

### Dashboard (`dashboard/`)
**Real-Time Evaluation Visualization**
- `evaluation-dashboard.ts` — interactive evaluation dashboard
  - Widget system: metric, chart, table, alert, status, progress
  - Chart types: line, bar, scatter, heatmap
  - Alert severity filtering and escalation rules
  - Multi-format export (JSON, CSV, PDF)
  - Integration with RegressionMonitor for live alerts

### Regression (`regression/`)
**Continuous Degradation Monitoring**
- `regression-monitor.ts` — continuous monitoring system
  - Severity levels: INFO, WARNING, CRITICAL, EMERGENCY
  - Configurable thresholds: 5% (warning), 15% (critical), 30% (emergency)
  - Window-based statistical analysis with minimum sample requirements
  - Baseline management with update frequency control
  - Metric-specific weighting and ignored-metric support
  - Escalation rules with notification channels

### Testing (`testing/`)
**Test Infrastructure and Fixtures**
- `postgres-test-container.ts` — PostgreSQL testcontainer integration
  - MockEmbeddingService with stable 768-dimension vectors
  - Seed-based memory initialization (experience, thought, knowledge, observation, dialogue)
  - Automatic container lifecycle management

## Implementation Notes

- Loop-time, replan latency, and survival metrics as primary gates
- Identity drift tracking over long-horizon runs
- Narrative coherence scoring and decision justification quality
- Affective state appropriateness and prediction error analysis
