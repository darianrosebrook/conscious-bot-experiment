# Safety & Monitoring

Privacy protection, performance monitoring, and fail-safe systems.

## Modules

### Privacy (`privacy/`)
**Purpose:** Data protection and server safety compliance
- Chat log anonymization with configurable retention
- Player ID hashing and data protection
- Geofences and write-locks for protected regions
- Revert journal for reversible actions
- **Key Files:** `anonymizer.py`, `data_protection.py`, `geofence_manager.py`, `revert_journal.py`

### Monitoring (`monitoring/`)
**Purpose:** Telemetry, performance tracking, and diagnostics
- OpenTelemetry + Langfuse traces for propose→plan→act cycles
- Loop-time p50/p95/p99 performance metrics
- Repair:replan ratio and safe-mode invocation tracking
- Router accuracy vs. oracle monitoring
- **Key Files:** `telemetry.py`, `performance_tracker.py`, `dashboard.py`, `diagnostic_tools.py`

### Fail-Safes (`fail_safes/`)
**Purpose:** Watchdogs, preemption, and graceful degradation
- Module overrun detection and safe-mode triggers
- Preemption ladder enforcement
- Graceful degradation pathways (LLM→HRM→GOAP→reflex)
- Emergency response coordination
- **Key Files:** `watchdog.py`, `preemption_manager.py`, `degradation_controller.py`, `emergency_coordinator.py`

## Implementation Notes

- Rate limiting for world edits and player interactions
- Server rule compliance and ethical boundary enforcement
- Real-time monitoring without performance impact
- Automated failover and recovery mechanisms

Author: @darianrosebrook
