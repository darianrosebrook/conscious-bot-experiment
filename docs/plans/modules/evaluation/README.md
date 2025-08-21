# Evaluation & Testing

Comprehensive testing framework with curriculum progression and behavioral analysis.

## Modules

### Scenarios (`scenarios/`)
**Purpose:** Test environments and structured evaluation tasks
- Progressive curriculum: Safe Plains → Forest Night → Cave Maze → Village Defense
- Fixed seeds and YAML scenario definitions
- Scripted tasks for specific competency measurement
- Open-ended scenarios for emergent behavior observation
- **Key Files:** `scenario_manager.py`, `curriculum_progression.py`, `test_environments.py`, `task_definitions.py`

### Metrics (`metrics/`)
**Purpose:** Performance measurement and behavioral analysis
- Task performance (success rate, time efficiency, resource utilization)
- Behavioral complexity index and learning curve tracking
- Memory influence factor and plan stability metrics
- Social cognition scores and norm compliance measurement
- **Key Files:** `performance_metrics.py`, `behavioral_analyzer.py`, `complexity_scorer.py`, `social_evaluator.py`

### Curriculum (`curriculum/`)
**Purpose:** Progressive skill building and regression testing
- BASALT-style tasks with pass/fail gates
- Nightly regression suite automation
- Ablation study coordination
- Stress testing protocols (sensorimotor disruption, latency injection)
- **Key Files:** `curriculum_builder.py`, `regression_suite.py`, `ablation_controller.py`, `stress_tester.py`

## Implementation Notes

- Loop-time, replan latency, and survival metrics as primary gates
- Identity drift tracking over long-horizon runs
- Narrative coherence scoring and decision justification quality
- Affective state appropriateness and prediction error analysis

Author: @darianrosebrook
