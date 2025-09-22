# @conscious-bot/executor-contracts

Plan-Body Interface (PBI) contracts and runtime guards for reliable plan execution.

This package provides the "capability discipline" that ensures plans reliably become actions by enforcing strict contracts between planning and execution systems.

## Overview

The executor-contracts package solves the "failure-to-act loop" problem by providing:

1. **Capability Registry** - MCP-inspired discipline for executable behaviors
2. **PBI Enforcer** - Runtime enforcement of plan-body interface contracts
3. **Verification & Validation** - Schema validation, guard checks, and acceptance testing
4. **Observability** - TTFA tracking, stuck detection, and execution health metrics

## Quick Start

```ts
import { createPBIEnforcer, PBIError } from '@conscious-bot/executor-contracts';

// Create enforcer with default capabilities
const enforcer = createPBIEnforcer();

// Execute a plan step with PBI enforcement
const planStep = {
  stepId: 'step-1',
  type: 'navigate',
  args: { x: 100, y: 65, z: 200 }
};

const context = {
  threatLevel: 0.1,
  hostileCount: 0,
  nearLava: false,
  // ... other context fields
};

try {
  const result = await enforcer.executeStep(planStep, context, worldState);

  if (result.success) {
    console.log(`Step executed successfully in ${result.ttfaMs}ms`);
  } else {
    console.error('Step failed:', result.error?.message);
  }
} catch (error) {
  if (error instanceof PBIError) {
    console.error('PBI Error:', error.code, error.message);
  }
}
```

## Key Concepts

### Plan-Body Interface (PBI)

The PBI defines the contract between planning systems and execution systems:

- **Intent Objects** - Normalized input from planning systems
- **PlanStep** - Executable atoms with preconditions/effects
- **ActionResult** - Structured results from execution
- **Capability Registry** - Table of contents for executable behaviors

### Acceptance Criteria (A1-A4)

The PBI enforces specific acceptance criteria to ensure reliable execution:

- **A1**: TTFA ≤ 2s (Time-to-First-Action)
- **A2**: ≥95% completion/failure rate (no silent drops)
- **A3**: ≤2 local retries before escalation
- **A4**: Stuck detection after 3s of inactivity

### Verification Checks (V1-V4)

Before execution, the PBI verifies:

- **V1**: Step type exists in capability registry
- **V2**: Arguments match capability schema
- **V3**: Guard conditions are satisfied
- **V4**: Post-conditions can be verified

## Architecture

```
Planning Systems → Intent Objects → PBI Enforcer → Capability Registry → Execution → Verification → Metrics
```

## API Reference

### PBIEnforcer

Main interface for plan execution with contract enforcement.

```ts
class PBIEnforcer {
  async executeStep(
    step: PlanStep,
    context: ExecutionContext,
    worldState: WorldState
  ): Promise<ExecutionResult>

  async verifyStep(
    step: PlanStep,
    context: ExecutionContext
  ): Promise<PBIVerificationResult>

  getMetrics(): Record<string, any>
}
```

### CapabilityRegistry

Registry for executable capabilities with health monitoring.

```ts
class CapabilityRegistry {
  register(capability: CapabilitySpec): void
  get(name: string): CapabilitySpec | undefined
  has(name: string): boolean
  getHealthMetrics(): RegistryHealthMetrics
  validateCanonicalCoverage(): CoverageReport
}
```

## Built-in Capabilities

The package includes built-in capabilities for common Minecraft actions:

- `navigate` - Pathfinding and movement
- `craft_item` - Item crafting with validation
- `dig_block` - Block mining with safety checks
- `consume_food` - Food consumption
- `place_block` - Block placement
- `build_structure` - Structure construction
- `gather` - Resource gathering
- `explore` - Exploration behaviors
- `mine` - Mining operations
- `move_forward` - Basic movement
- `flee` - Emergency escape
- `pillar_up` - Vertical escape
- `eat_food` - Food consumption

## Error Handling

The package provides structured error handling through `PBIError`:

```ts
enum PBIErrorCode {
  UNKNOWN_VERB = 'unknown_verb',
  SCHEMA_VIOLATION = 'schema_violation',
  GUARD_FAILED = 'guard_failed',
  ACCEPTANCE_FAILED = 'acceptance_failed',
  TTFA_EXCEEDED = 'ttfa_exceeded',
  STUCK_DETECTED = 'stuck_detected',
  EXECUTION_TIMEOUT = 'execution_timeout',
  DOUBLE_DISPATCH = 'double_dispatch',
  PRECOND_UNMET = 'precond_unmet',
  CAPABILITY_UNAVAILABLE = 'capability_unavailable'
}
```

## Metrics and Observability

The package provides comprehensive metrics:

- **TTFA** (Time-to-First-Action) tracking
- **Capability SLA** monitoring
- **Stuck detection** and alerting
- **Plan repair rate** analysis
- **Method effectiveness** tracking

## Integration with Existing Codebase

This package integrates with the existing planning system:

- **Types**: Extends existing `PlanStep` and `Action` interfaces
- **Reactive Executor**: Wraps existing execution logic with PBI enforcement
- **Behavior Trees**: Provides registry for BT-based capabilities
- **GOAP Planner**: Works with existing GOAP planning infrastructure

## Installation

```bash
pnpm add @conscious-bot/executor-contracts
```

## Testing

```bash
pnpm test
pnpm test:coverage
```

## Development

```bash
pnpm dev        # Watch mode
pnpm build      # Build
pnpm lint       # Lint
pnpm lint:fix   # Fix lint issues
```

## Related Packages

- `@conscious-bot/planning` - Core planning system
- `@conscious-bot/memory` - Memory and learning systems
- `@conscious-bot/minecraft-interface` - Minecraft integration
- `@conscious-bot/cognition` - Cognitive processing

## License

MIT
