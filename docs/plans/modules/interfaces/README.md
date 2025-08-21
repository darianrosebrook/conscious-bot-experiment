# Interface Modules

External interaction, suggestion handling, and constitutional governance systems.

## Modules

### Intrusion Interface (`intrusion_interface/`)
**Purpose:** External suggestion handling with robust filtering
- API/UI for injecting external thoughts and suggestions
- Intrusion taxonomy (benign/risky/malicious) classification
- Negative priors for repeated rejected patterns
- Red-team suite with griefing and manipulation prompts
- **Key Files:** `intrusion_api.py`, `taxonomy_classifier.py`, `negative_priors.py`, `red_team_suite.py`

### Human Controls (`human_controls/`)
**Purpose:** Live oversight and debugging interface
- Web console with pause/step/approve capabilities
- Module toggling for ablation studies
- High-impact action approval gates
- Two-man rule for destructive operations
- **Key Files:** `web_console.py`, `approval_gates.py`, `module_controller.py`, `operator_interface.py`

### Constitution (`constitution/`)
**Purpose:** Ethical rules engine and norm enforcement
- YAML-configured normative rules and safety principles
- Constitutional reasoning for intrusion evaluation
- Hard-coded checks + LLM reasoning for rule compliance
- Norm internalization and habit formation tracking
- **Key Files:** `rules_engine.py`, `constitutional_reasoner.py`, `norm_enforcer.py`, `habit_tracker.py`

## Implementation Notes

- Acceptance rate tracking by risk band
- Downstream regret incident monitoring
- Real-time constitutional evaluation without performance impact
- Comprehensive logging for safety analysis and debugging

Author: @darianrosebrook
