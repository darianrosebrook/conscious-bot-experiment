# Iteration Two Implementation Plan

**Author:** @darianrosebrook  
**Status:** Planning Phase  
**Target:** Dynamic Behavior Tree Composition with MCP-Style Registry  
**Dependencies:** Core MCP Capabilities, Planning Module, Minecraft Interface  

## Overview

This implementation plan transforms the current static capability system into a dynamic, composable behavior tree architecture where the bot can propose and register new skills while maintaining safety through strict contracts and validation.

## Cross-cutting Governance (Apply Before Stage 1)

### C0. Versioning, Provenance, and Rollback (Must-Have)

**Problem:** Dynamic registration without immutable versioning = hard-to-debug runs.

**Change**
- Require `{id, version}` **immutable** at registration; disallow overwrites
- Add **provenance** & **signing** fields now; don't bolt on later

**Working Spec — `enhanced-capability-registry.ts`**

```typescript
type CapabilityId = `${string}@${string}`; // name@semver

interface Provenance {
  authoredBy: 'human'|'llm';
  parent?: CapabilityId;         // fork lineage
  codeHash?: string;             // for leaves, build artifact hash
  testsHash?: string;
  signedBy?: string;             // key id (humans/leaves only)
  createdAt: string;
}

interface RegistryRecord<T> {
  id: CapabilityId;
  spec: T;
  provenance: Provenance;
  status: 'shadow'|'active'|'retired'|'revoked';
}
```

**Acceptance**
- New registrations start in **`shadow`**; promotion to `active` requires CI gates (see C2)

### C1. Permission Model: Least Privilege from Day One

**Problem:** Compositions could accidentally escalate capability (e.g., chest access while mining).

**Change**
- **LeafSpec.permissions** is authoritative; **Options** inherit **intersection** of their leaves
- Registry linter rejects BT-DSL referencing a leaf not permitted by policy for the registering module

**Working Spec — `bt-dsl-linter.ts`**

```typescript
if (!subset(option.requestedPermissions, intersect(allLeafPermissions))) {
  fail('option-permission-escalation');
}
```

**Acceptance**
- Any option that tries to use a leaf with a permission outside the option's declared set is rejected

### C2. Shadow Runs & Automatic Rollback (Safety Net)

**Problem:** First run of a new option in production can regress behavior.

**Change**
- **Shadow mode** (A/B): run new option alongside a known-good option; compare postconditions and key metrics; auto-promote on success, auto-retire on failure

**Working Spec — `registration-pipeline.ts`**

```typescript
// After sandbox tests:
record.status = 'shadow'; // needs runtime trials
// Promotion condition (configurable):
// ≥ N successful shadow episodes, Δsuccess ≥ X pp, no safety violations.
```

**Acceptance**
- No LLM-authored option can be `active` without passing **sandbox tests + shadow threshold**

### C3. Error Taxonomy (Normalize Mineflayer/World Failures)

**Problem:** Without a common taxonomy, planners can't repair reliably.

**Change**
- Centralize an **error code enum** used by all leaves; bind specific Mineflayer exceptions/timeouts to deterministic codes

**Working Spec — `resource-guards.ts`**

```typescript
export type ExecErrorCode =
  | 'path.stuck'|'path.unreachable'|'path.unloaded'
  | 'dig.blockChanged'|'dig.toolInvalid'|'dig.timeout'
  | 'place.invalidFace'|'place.fallRisk'|'place.timeout'
  | 'craft.missingInput'|'craft.uiTimeout'|'craft.containerBusy'
  | 'sense.apiError'|'unknown';

export interface ExecError { code: ExecErrorCode; detail?: string; retryable: boolean; }
```

**Acceptance**
- All leaf failures map to an `ExecErrorCode`; planner repair rules key off codes

## Current State Analysis

### Existing Infrastructure
- **MCP Capabilities Registry**: `packages/core/src/mcp-capabilities/capability-registry.ts` ✅
- **Behavior Tree Runner**: `packages/planning/src/behavior-trees/BehaviorTreeRunner.ts` ✅  
- **Minecraft Interface**: `packages/minecraft-interface/src/action-translator.ts` ✅
- **Planning Integration**: `packages/planning/src/skill-integration/skill-planner-adapter.ts` ✅

### Gaps to Address
1. **Leaf Contract System**: Missing the strict leaf contract with Mineflayer integration
2. **BT-DSL Parser**: No JSON-based behavior tree domain-specific language
3. **Dynamic Registration Pipeline**: Missing the validation and registration pipeline
4. **Option/Skill Composition**: No way to compose leaves into reusable options
5. **Task Timeframe Management**: Missing bucket-based time management system
6. **Example Flow Implementation**: Missing end-to-end torch corridor example

### Additional Requirements from Documentation
- **Example Flow**: Complete torch corridor option creation and execution flow
- **Task Timeframes**: Bucket-based time management with pause/resume capabilities

## Implementation Stages

### Stage 1 — Leaf Contract System (Foundation)

#### S1.1 Tighten the Leaf Contract

**Problem:** The current contract lacks bounded resource & determinism guarantees.

**Change**
- Add **hard concurrency cap**, **rate limit**, and **idempotency key**; make **postconditions** first-class and machine-checked

**Working Spec — `leaf-contracts.ts`**

```typescript
export interface LeafSpec {
  name: string;
  version: string;
  inputSchema: JSONSchema7;
  postconditions?: JSONSchema7;         // inventory/world delta contract
  timeoutMs: number;
  retries: number;
  permissions: ('movement'|'dig'|'place'|'craft'|'container'|'chat')[];
  rateLimitPerMin?: number;             // default 60
  maxConcurrent?: number;               // default 1
}

export interface LeafRunOptions {
  idempotencyKey?: string;              // dedupe accidental repeats
}
```

**Acceptance**
- Postconditions actually checked (inventory diff / world probe) before returning `success`

#### S1.2 Movement Leaves: Pathfinder Invariants

**Change**
- Movement leaves must **stop()** pathfinder on cancel; expose **replan_count** metric; fail on `unloaded chunk` after N attempts

**Working Spec — `movement-leaves.ts` (excerpt)**

```typescript
run(ctx, {pos}) {
  return withTimeout(this.spec.timeoutMs, async (signal) => {
    const res = await pathTo(ctx.bot, pos, { signal });
    if (!res.ok && res.reason === 'unloaded') return fail('path.unloaded');
    if (!res.ok && res.reason === 'stuck') return fail('path.stuck');
    return ok();
  });
}
```

**Acceptance**
- Cancellation always leaves bot in a **non-moving** state

#### S1.3 Crafting Leaves: Transactional Wrapper

**Change**
- Wrap mineflayer crafting with **pre-check → perform → verify**; classify UI stalls as `craft.uiTimeout`

**Acceptance**
- Craft succeeds iff inventory increased by expected amounts; otherwise returns a typed error

#### 1.1 Create Leaf Contract Types
**Location**: `packages/core/src/mcp-capabilities/leaf-contracts.ts`

```typescript
export type LeafStatus = 'success' | 'failure' | 'running';

export interface LeafContext {
  bot: Mineflayer.Bot;
  abortSignal: AbortSignal;
  now(): number;
  snapshot(): Promise<WorldSnapshot>;
  inventory(): Promise<InventoryState>;
  emitMetric(name: string, value: number, tags?: Record<string, string>): void;
}

export interface LeafSpec {
  name: string;
  version: string;
  description?: string;
  inputSchema: JSONSchema7;
  outputSchema?: JSONSchema7;
  timeoutMs: number;
  retries: number;
  postconditions?: JSONSchema7;
  permissions: ('movement' | 'dig' | 'place' | 'craft' | 'container' | 'chat')[];
  rateLimitPerMin?: number;             // default 60
  maxConcurrent?: number;               // default 1
}

export interface LeafImpl {
  spec: LeafSpec;
  run(ctx: LeafContext, args: unknown): Promise<{status: LeafStatus, result?: unknown, error?: string}>;
  cancel?(): void;
}
```

#### 1.2 Implement Core Leaf Set
**Location**: `packages/minecraft-interface/src/leaves/`

Create the minimal leaf set as specified:

1. **`packages/minecraft-interface/src/leaves/movement-leaves.ts`**
   - `move_to(GoalBlock|GoalNear|GoalFollow)`
   - `follow_entity({id, range})`

2. **`packages/minecraft-interface/src/leaves/interaction-leaves.ts`**
   - `dig_block({pos, expect})`
   - `place_block({item, against|pos})`

3. **`packages/minecraft-interface/src/leaves/crafting-leaves.ts`**
   - `craft_recipe({recipe, qty})`
   - `smelt({input, fuel, qty})`

4. **`packages/minecraft-interface/src/leaves/sensing-leaves.ts`**
   - `sense_hostiles({radius})`
   - `chat({message})`
   - `wait({ms})`

#### 1.3 Leaf Factory Implementation
**Location**: `packages/core/src/mcp-capabilities/leaf-factory.ts`

```typescript
export class LeafFactory {
  private ajv = new Ajv({allErrors: true, useDefaults: true});
  private registry: Map<string, LeafImpl> = new Map();

  register(leaf: LeafImpl): RegistrationResult {
    // Compile schemas once
    this.ajv.compile(leaf.spec.inputSchema);
    if (leaf.spec.outputSchema) this.ajv.compile(leaf.spec.outputSchema);
    
    const key = `${leaf.spec.name}@${leaf.spec.version}`;
    if (this.registry.has(key)) return {ok: false, error: 'version_exists'};
    
    this.registry.set(key, leaf);
    return {ok: true, id: key};
  }

  get(name: string, version?: string): LeafImpl | undefined {
    // Implementation with semver resolution
  }
}
```

**Testing Strategy**: 
- Unit tests for schema validation
- Integration tests with mock Mineflayer bot
- Performance tests for leaf execution timing

### Stage 2 — BT-DSL Parser and Compiler

#### S2.1 Keep the DSL Deliberately Small (Phase 1)

**Problem:** Rich DSLs explode surface area.

**Change**
- Allow only: `Sequence`, `Selector`, `Repeat.Until`, `Decorator.Timeout`, `Decorator.FailOnTrue`, `Leaf`
- Ban user-defined conditionals/functions; predicates must be **named sensors** the runner knows (`distance_to`, `hostiles_present`, etc.)

**Working Spec — `bt-dsl-schema.ts`**

```typescript
type NodeType = 'Sequence'|'Selector'|'Repeat.Until'|'Decorator.Timeout'|'Decorator.FailOnTrue'|'Leaf';
```

**Acceptance**
- Linter rejects any other node types or inline JS

#### S2.2 Deterministic Compilation

**Change**
- Compilation outcome must be **pure** for the same input; seed any randomized policies explicitly

**Acceptance**
- Compiler function is referentially transparent: same JSON ⇒ same bytecode/tree hash

#### 2.1 BT-DSL Schema Definition
**Location**: `packages/planning/src/behavior-trees/bt-dsl-schema.ts`

```typescript
export const BTDSLSchema = z.object({
  id: z.string(),
  version: z.string(),
  argsSchema: z.any(), // JSONSchema7
  pre: z.array(z.string()),
  post: z.array(z.string()),
  tree: z.object({
    type: z.enum(['Sequence', 'Selector', 'Repeat.Until', 'Decorator.Timeout', 'Decorator.FailOnTrue', 'Leaf']),
    children: z.array(z.lazy(() => BTDSLSchema.shape.tree)).optional(),
    child: z.lazy(() => BTDSLSchema.shape.tree).optional(),
    name: z.string().optional(), // For Leaf nodes
    args: z.record(z.any()).optional(),
    ms: z.number().optional(), // For timeout decorators
    predicate: z.string().optional(), // For named sensor predicates only
  }),
});
```

#### 2.2 BT-DSL Compiler
**Location**: `packages/planning/src/behavior-trees/bt-dsl-compiler.ts`

```typescript
export function compileOption(def: OptionDefJson, leafFactory: LeafFactory): CompiledOption {
  // 1) Validate JSON with schema
  // 2) Walk tree; for every Leaf node ensure leafFactory.get(name)
  // 3) Cap depth/width; attach timeouts
  // 4) Return an executable node tree
  return buildTree(def.tree, leafFactory);
}
```

#### 2.3 DSL Linter
**Location**: `packages/planning/src/behavior-trees/bt-dsl-linter.ts`

```typescript
export class BTDSLLinter {
  validateTree(tree: BTNode, leafFactory: LeafFactory): LintResult[] {
    // Check for cycles
    // Validate leaf references exist
    // Ensure timeouts are present
    // Check permission escalation
  }
}
```

**Testing Strategy**:
- Schema validation tests
- Compilation tests with sample BT-DSL
- Linting tests for various error conditions
- Performance tests for large trees

### Stage 3 — Enhanced Capability Registry

#### S3.1 Separate Leaf vs Option Registration Paths

**Change**
- **Leaves** require signed human builds; **Options** can be LLM-authored but must pass sandbox + shadow

**Working Spec — `server.ts` (routes)**

```
POST /capabilities/leaf/register      // requires signer
POST /capabilities/option/register    // LLM allowed; enforced pipeline
POST /capabilities/:id/promote        // shadow → active (policy gate)
POST /capabilities/:id/retire
```

#### S3.2 Health Checks & Quotas

**Change**
- Per-id rate limits; max active versions per option; global cap on shadow options

**Acceptance**
- Registry rejects registration if **quota** exceeded; emits `resource.quotaExceeded`

#### 3.1 Extend Capability Registry
**Location**: `packages/core/src/mcp-capabilities/enhanced-capability-registry.ts`

```typescript
export interface EnhancedCapabilityRegistry extends CapabilityRegistry {
  // Leaves (primitives)
  registerLeaf(impl: LeafImpl): RegistrationResult;
  getLeaf(name: string, version?: string): LeafImpl | undefined;

  // Options (compositions)
  registerOption(def: OptionDefJson): RegistrationResult;
  getOption(id: string, version?: string): OptionDefJson | undefined;

  // Health & provenance
  list(): CapabilitySummary[];
  health(nameOrId: string): CapabilityHealth;
}
```

#### 3.2 Registration Pipeline
**Location**: `packages/core/src/mcp-capabilities/registration-pipeline.ts`

```typescript
export class RegistrationPipeline {
  async registerLeaf(spec: LeafSpec, impl: LeafImpl): Promise<RegistrationResult> {
    // 1. Static checks (schema validation)
    // 2. Sandboxed tests
    // 3. Policy check (human review for new primitives)
    // 4. Registry write
  }

  async registerOption(def: OptionDefJson): Promise<RegistrationResult> {
    // 1. Static checks (DSL linting)
    // 2. Dry-run compilation
    // 3. Sandboxed tests
    // 4. Auto-approve if tests pass
    // 5. Start in shadow mode
  }
}
```

#### 3.3 Server APIs
**Location**: `packages/core/src/server.ts`

Add endpoints:
- `POST /capabilities/leaf/register` - For trusted signers only
- `POST /capabilities/option/register` - Open to LLM proposals
- `POST /capabilities/:id/promote` - Shadow → active (policy gate)
- `POST /capabilities/:id/retire` - Retire capability
- `GET /capabilities/:id` - Retrieve capability details

**Testing Strategy**:
- API endpoint tests
- Registration pipeline tests
- Security tests for leaf registration
- Performance tests for option registration

### Stage 4 — Dynamic Creation Flow

#### S4.1 Impasse Detector: Specify the Bar

**Change**
- Treat an **impasse** as: `(k failures with same ExecErrorCode) OR (⟨utility/step⟩ below threshold for N minutes)`. Don't over-trigger proposals

**Working Spec — `impasse-detector.ts`**

```typescript
if (rollingWindow('opt.ore_ladder_iron').error('zombie_swarm') >= 3) triggerProposal();
if (emaUtilityPerStep(activity) < θ && elapsed > τ) triggerProposal();
```

**Acceptance**
- Detector rate-limited to 1 proposal per goal per 15 minutes; debounced by success

#### S4.2 Auto-Retirement: Define the Kill Switch

**Change**
- Retire option if **win-rate** < θ after M shadow+active runs, or if safety violation occurs

**Acceptance**
- Registry flips to `retired` automatically; planner disallows selection immediately

#### Deliverables
- [ ] LLM integration for option proposals
- [ ] Planning impasse detection
- [ ] Option integration in GOAP/HTN planning
- [ ] Auto-retirement of low-performing options
- [ ] **Example Flow Implementation**: Complete torch corridor scenario
- [ ] **impasse-detector thresholds & debouncing**, **auto-retirement policy**, **win-rate dashboard panel**

#### Key Files to Create/Modify
- `packages/cognition/src/option-proposer.ts` (NEW)
- `packages/planning/src/reactive-executor/enhanced-goap-planner.ts` (MODIFY)
- `packages/planning/src/skill-integration/skill-planner-adapter.ts` (MODIFY)
- `packages/integration-tests/src/e2e/torch-corridor-example.test.ts` (NEW)
- `packages/planning/src/impasse-detector.ts` (NEW)

#### Success Criteria
- LLM can propose valid options
- Planning system detects and handles impasses
- New options integrate seamlessly with planning
- Auto-retirement works correctly
- **Torch corridor example works end-to-end**

### Stage 5 — Task Timeframe Management

#### S5.1 Budget is Not Just Timeout—Also Checkpoint Cadence and Pause Trailer

**Change**
- Every bucket maps to `{maxMs, checkpointEveryMs, trailer}` where **trailer** enforces a safe pause (e.g., `retreat_and_block`)

**Working Spec — `bucket-policy.ts`**

```typescript
type Bucket = 'Tactical'|'Short'|'Standard'|'Long'|'Expedition';
interface BucketCfg { maxMs:number; checkpointEveryMs:number; trailerOptionId: string; }
```

**Acceptance**
- On timeout: trailer always runs; a **resume ticket** is emitted with a safe waypoint

#### S5.2 Explainable Selection

**Change**
- Record `defaultBucket → rules → finalBucket` for each step; surface on dashboard

**Acceptance**
- 100% of planned steps show a bucket decision trace

#### Deliverables
- [ ] Bucket taxonomy and policy system
- [ ] Bucket selection heuristics
- [ ] Timeout and checkpoint decorators
- [ ] Pause/resume ticket system
- [ ] Integration with planning and execution
- [ ] **Default bucket assignments**: Activity-to-bucket mappings
- [ ] **bucket trailers**, **bucket decision trace**, **resume-ticket schema**

#### Key Files to Create/Modify
- `packages/core/src/time-management/bucket-system.ts` (NEW)
- `packages/core/src/time-management/bucket-policy.ts` (NEW)
- `packages/planning/src/behavior-trees/timeout-decorators.ts` (NEW)
- `packages/planning/src/behavior-trees/checkpoint-decorators.ts` (NEW)
- `packages/planning/src/resume-ticket-manager.ts` (NEW)

#### Success Criteria
- Bucket selection works correctly based on risk/readiness
- Timeouts are enforced at all levels
- Checkpoints are created regularly
- Pause/resume tickets are generated and processed
- No task runs past its time cap

### Safety and Trust Model (Security Framework)

#### 5.1 Trust Tiers Implementation
**Location**: `packages/safety/src/trust-tiers.ts`

```typescript
export enum TrustTier {
  TIER_0 = 'human_authored_leaves',
  TIER_1 = 'llm_composed_options',
  TIER_2 = 'llm_proposed_leaves'
}

export class TrustModel {
  validateCapability(capability: CapabilitySpec): TrustValidation;
  enforcePolicy(capability: CapabilitySpec): PolicyResult;
}
```

#### 5.2 Sandboxed Testing
**Location**: `packages/core/src/mcp-capabilities/sandbox-tester.ts`

```typescript
export class SandboxTester {
  async testOption(option: OptionDefJson): Promise<TestResult> {
    // Run in simulated world
    // Verify postconditions
    // Check timeout compliance
    // Validate cancellation
  }
}
```

#### 5.3 Resource Guards
**Location**: `packages/core/src/mcp-capabilities/resource-guards.ts`

```typescript
export class ResourceGuards {
  rateLimitRegistrations(): boolean;
  capActiveVersions(capabilityId: string): void;
  garbageCollectOldVersions(): void;
}
```

**Testing Strategy**:
- Trust tier validation tests
- Sandbox testing accuracy tests
- Resource guard effectiveness tests
- Policy enforcement tests

## Integration Points

### 1. Minecraft Interface Integration
**Files to modify**:
- `packages/minecraft-interface/src/action-translator.ts` - Replace with leaf-based execution
- `packages/minecraft-interface/src/standalone-simple.ts` - Add leaf factory integration

### 2. Planning Module Integration
**Files to modify**:
- `packages/planning/src/behavior-trees/BehaviorTreeRunner.ts` - Add BT-DSL support
- `packages/planning/src/skill-integration/skill-planner-adapter.ts` - Use new option system

### 3. Core Module Integration
**Files to modify**:
- `packages/core/src/mcp-capabilities/capability-registry.ts` - Extend for leaves/options
- `packages/core/src/mcp-capabilities/capability-specs.ts` - Add leaf specifications

## Testing and Validation Strategy

### Unit Testing
- **Leaf Contracts**: Test each leaf implementation with mock Mineflayer
- **BT-DSL Parser**: Test schema validation and compilation
- **Registration Pipeline**: Test validation stages and error handling
- **Trust Model**: Test policy enforcement and tier validation

### Integration Testing
- **End-to-End Option Creation**: Test full flow from LLM proposal to registration
- **Minecraft Integration**: Test leaf execution with real Mineflayer bot
- **Planning Integration**: Test option usage in GOAP/HTN planning

### Performance Testing
- **Leaf Execution**: Measure timing and resource usage
- **BT Compilation**: Test compilation speed for large trees
- **Registry Operations**: Test registration and discovery performance

### Safety Testing
- **Sandbox Validation**: Test option behavior in isolated environment
- **Permission Escalation**: Verify no capability can exceed its declared permissions
- **Resource Limits**: Test rate limiting and resource guards

## Validation Scenarios

### Scenario 1: Torch Corridor Option Creation
1. Bot encounters repeated "night mining" failures
2. LLM proposes `opt.torch_corridor` BT-DSL
3. Registration pipeline validates and tests
4. Option becomes available for planning
5. Bot successfully uses option in future scenarios
6. **Time management**: Option runs within Standard bucket (8-12 min)
7. **Checkpoints**: Progress saved every 60s during execution

### Scenario 2: New Leaf Proposal
1. Bot needs new primitive capability
2. LLM proposes new leaf with implementation
3. Human review required (Tier 2)
4. After approval, leaf becomes available
5. Bot can compose new options using the leaf

### Scenario 3: Auto-Retirement
1. Option shows poor performance over time
2. Telemetry system detects low win rate
3. Option automatically retired
4. Planner no longer considers the option

### Scenario 4: Task Timeframe Management
1. Bot starts mining operation with Standard bucket (10 min)
2. Risk increases (nightfall, low food) → bucket shrinks to Short
3. Operation pauses at 4 minutes with checkpoint
4. Resume ticket created with safe waypoint
5. Bot returns to base, restocks, resumes operation
6. **Success**: No task exceeds time cap, all checkpoints saved

## Success Metrics

### Functional Metrics
- **Option Creation Success Rate**: >90% of LLM proposals pass validation
- **Option Reuse Rate**: >70% of created options used in future planning
- **Execution Success Rate**: >95% of option executions succeed
- **Shadow promotion pass rate** ≥ 80% for LLM options

### Performance Metrics
- **Leaf Execution Time**: <100ms for simple leaves, <500ms for complex
- **BT Compilation Time**: <50ms for typical option trees
- **Registration Pipeline Time**: <2s for option registration
- **Executor p95 leaf latency** within bucket budgets

### Safety Metrics
- **Zero Permission Escalations**: No capability exceeds its declared permissions
- **Zero Resource Exhaustion**: No runaway resource usage
- **100% Sandbox Compliance**: All options pass sandbox validation
- **Zero permission escalations** verified by linter; **Auto-rollback MTTR** < 1 min

## Risk Mitigation

### Technical Risks
- **BT-DSL Complexity**: Start with simple DSL, gradually add features
- **Mineflayer Integration**: Extensive testing with real Minecraft server
- **Performance Degradation**: Monitor and optimize critical paths

### Safety Risks
- **Malicious Options**: Strict sandboxing and human review for primitives
- **Resource Abuse**: Rate limiting and resource guards
- **Permission Escalation**: Strict permission checking and tier enforcement

## Implementation Timeline

| Stage | Focus | Deliverables | Dependencies |
|-------|-------|--------------|--------------|
| 1 | Foundation | Leaf types, core leaf set, leaf factory | None |
| 2 | Language System | DSL schema, compiler, linter | Foundation |
| 3 | Registration System | Extended registry, registration pipeline, APIs | Language System |
| 4 | Intelligence Integration | LLM integration, planning integration, telemetry, example flow | Registration System |
| 5 | Time Management System | Bucket system, timeouts, checkpoints, pause/resume | Intelligence Integration |
| 6 | Security Framework | Trust tiers, sandbox testing, resource guards | Time Management System |

## Testing/CI (Tighten Gates)

### T0. Fixture Realism
**Change**
- Add **record/replay** harness to capture real Mineflayer sessions; use as fixtures in sandbox

**Acceptance**
- At least one fixture per leaf family (movement/dig/place/craft/sense)

### T1. CI Gates
**Change**
- **Promotion gate** requires: sandbox pass + shadow pass (N runs) + no safety violations + p95 latency within budget

**Acceptance**
- A failing gate auto-reverts `active` → `shadow` and alerts planner to avoid the regressed id

## Minimal Schemas (To Drop In)

### Resume Ticket

```typescript
export interface ResumeTicket {
  id: string; originOption: CapabilityId; args: any;
  waypoint: { name:string; pos:[number,number,number]; safe:boolean };
  progress: Record<string,unknown>;
  required: Record<string,unknown>;
  suggestedBucket: Bucket;
  createdAt: string;
}
```

### Bucket Decision Trace

```typescript
export interface BucketTrace {
  activity: string;
  default: Bucket;
  appliedRules: string[]; // e.g., ['nightShrinks','lowFoodShrinks']
  final: Bucket;
}
```

## Next Steps

1. **Review and Approve Plan**: Validate approach with stakeholders
2. **Set Up Development Environment**: Ensure all dependencies are available
3. **Begin Foundation Implementation**: Start with leaf contract system
4. **Establish Testing Infrastructure**: Set up automated testing pipeline
5. **Create Integration Tests**: Develop end-to-end validation scenarios

This implementation plan provides a clear path from the current static capability system to a dynamic, composable behavior tree architecture while maintaining safety and performance requirements.

## Why These Changes Matter

- **Safety/Trust**: signing + shadow mode + permission linting prevent subtle regressions and privilege creep
- **Operability**: immutable ids + rollback + error taxonomy make on-call sane
- **Performance**: small DSL & deterministic compiler reduce tail latencies and simplify caching
- **Learning loop**: impasse thresholds + win-rate policies ensure LLM creativity stays net-positive
