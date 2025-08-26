# Iteration Two Testing and Validation Plan

**Author:** @darianrosebrook  
**Status:** Planning Phase  
**Target:** Comprehensive Testing Strategy for Dynamic BT Composition  
**Dependencies:** Implementation Plan, Existing Test Infrastructure  

## Overview

This testing and validation plan ensures the iteration two implementation meets safety, performance, and functional requirements through systematic testing at all levels.

## Testing Strategy Overview

### Testing Pyramid
```
┌─────────────────────────────────────┐
│           E2E Integration           │  ← Few, Critical Paths
├─────────────────────────────────────┤
│         Component Integration       │  ← Module Boundaries
├─────────────────────────────────────┤
│            Unit Tests               │  ← Individual Functions
└─────────────────────────────────────┘
```

### Test Categories
1. **Unit Tests**: Individual functions and classes
2. **Integration Tests**: Module interactions
3. **End-to-End Tests**: Complete user workflows
4. **Performance Tests**: Timing and resource usage
5. **Safety Tests**: Security and trust validation
6. **Regression Tests**: Existing functionality preservation

## Leaf Contract System Testing

### 1.1 Leaf Contract Types Testing
**Location**: `packages/core/src/mcp-capabilities/__tests__/leaf-contracts.test.ts`

```typescript
describe('Leaf Contract Types', () => {
  test('should validate LeafSpec schema', () => {
    const validSpec: LeafSpec = {
      name: 'move_to',
      version: '1.0.0',
      description: 'Move to target position',
      inputSchema: { type: 'object', properties: { pos: { type: 'array' } } },
      outputSchema: { type: 'object', properties: { success: { type: 'boolean' } } },
      timeoutMs: 5000,
      retries: 3,
      permissions: ['movement']
    };
    
    expect(() => validateLeafSpec(validSpec)).not.toThrow();
  });

  test('should reject invalid LeafSpec', () => {
    const invalidSpec = { name: 'test' }; // Missing required fields
    expect(() => validateLeafSpec(invalidSpec)).toThrow();
  });
});
```

### 1.2 Core Leaf Set Testing
**Location**: `packages/minecraft-interface/src/leaves/__tests__/`

#### Movement Leaves Tests
```typescript
describe('Movement Leaves', () => {
  let mockBot: jest.Mocked<Bot>;
  let leafContext: LeafContext;

  beforeEach(() => {
    mockBot = createMockBot();
    leafContext = createLeafContext(mockBot);
  });

  test('move_to should reach target position', async () => {
    const moveToLeaf = new MoveToLeaf();
    const result = await moveToLeaf.run(leafContext, { pos: [10, 64, 10] });
    
    expect(result.status).toBe('success');
    expect(mockBot.pathfinder.setGoal).toHaveBeenCalledWith(
      expect.objectContaining({ x: 10, y: 64, z: 10 })
    );
  });

  test('move_to should handle pathfinding failures', async () => {
    mockBot.pathfinder.setGoal.mockRejectedValue(new Error('No path'));
    
    const moveToLeaf = new MoveToLeaf();
    const result = await moveToLeaf.run(leafContext, { pos: [1000, 64, 1000] });
    
    expect(result.status).toBe('failure');
    expect(result.error).toContain('No path');
  });
});
```

#### Interaction Leaves Tests
```typescript
describe('Interaction Leaves', () => {
  test('dig_block should remove target block', async () => {
    const digLeaf = new DigBlockLeaf();
    const result = await digLeaf.run(leafContext, { pos: [5, 64, 5] });
    
    expect(result.status).toBe('success');
    expect(mockBot.dig).toHaveBeenCalledWith(
      expect.objectContaining({ position: { x: 5, y: 64, z: 5 } })
    );
  });

  test('place_block should place item at target', async () => {
    const placeLeaf = new PlaceBlockLeaf();
    const result = await placeLeaf.run(leafContext, { 
      item: 'torch', 
      against: [5, 64, 5] 
    });
    
    expect(result.status).toBe('success');
    expect(mockBot.placeBlock).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'torch' })
    );
  });
});
```

### 1.3 Leaf Factory Testing
**Location**: `packages/core/src/mcp-capabilities/__tests__/leaf-factory.test.ts`

```typescript
describe('Leaf Factory', () => {
  let factory: LeafFactory;

  beforeEach(() => {
    factory = new LeafFactory();
  });

  test('should register valid leaf', () => {
    const leaf = createTestLeaf();
    const result = factory.register(leaf);
    
    expect(result.ok).toBe(true);
    expect(result.id).toBe('test_leaf@1.0.0');
  });

  test('should reject duplicate version', () => {
    const leaf1 = createTestLeaf('test_leaf', '1.0.0');
    const leaf2 = createTestLeaf('test_leaf', '1.0.0');
    
    factory.register(leaf1);
    const result = factory.register(leaf2);
    
    expect(result.ok).toBe(false);
    expect(result.error).toBe('version_exists');
  });

  test('should resolve semver correctly', () => {
    const leaf1 = createTestLeaf('test_leaf', '1.0.0');
    const leaf2 = createTestLeaf('test_leaf', '1.1.0');
    
    factory.register(leaf1);
    factory.register(leaf2);
    
    const latest = factory.get('test_leaf');
    expect(latest?.spec.version).toBe('1.1.0');
  });
});
```

## BT-DSL Parser Testing

### 2.1 Schema Validation Testing
**Location**: `packages/planning/src/behavior-trees/__tests__/bt-dsl-schema.test.ts`

```typescript
describe('BT-DSL Schema Validation', () => {
  test('should validate simple sequence', () => {
    const validDSL = {
      id: 'opt.simple_sequence',
      version: '1.0.0',
      argsSchema: { type: 'object', properties: {} },
      pre: ['has(torch)>=1'],
      post: ['light>=8'],
      tree: {
        type: 'Sequence',
        children: [
          { type: 'Leaf', name: 'place_torch', args: { pos: [0, 64, 0] } }
        ]
      }
    };
    
    expect(() => BTDSLSchema.parse(validDSL)).not.toThrow();
  });

  test('should reject invalid node types', () => {
    const invalidDSL = {
      id: 'opt.invalid',
      version: '1.0.0',
      argsSchema: { type: 'object' },
      pre: [],
      post: [],
      tree: {
        type: 'InvalidNodeType', // Not allowed
        children: []
      }
    };
    
    expect(() => BTDSLSchema.parse(invalidDSL)).toThrow();
  });
});
```

### 2.2 Compiler Testing
**Location**: `packages/planning/src/behavior-trees/__tests__/bt-dsl-compiler.test.ts`

```typescript
describe('BT-DSL Compiler', () => {
  let leafFactory: LeafFactory;
  let compiler: BTDSLCompiler;

  beforeEach(() => {
    leafFactory = new LeafFactory();
    compiler = new BTDSLCompiler(leafFactory);
    
    // Register test leaves
    leafFactory.register(createTestLeaf('place_torch', '1.0.0'));
    leafFactory.register(createTestLeaf('sense_hostiles', '1.0.0'));
  });

  test('should compile valid option', () => {
    const dsl = createValidDSL();
    const compiled = compiler.compile(dsl);
    
    expect(compiled).toBeDefined();
    expect(compiled.root.type).toBe('Sequence');
    expect(compiled.root.children).toHaveLength(1);
  });

  test('should reject option with missing leaf', () => {
    const dsl = createDSLWithMissingLeaf();
    
    expect(() => compiler.compile(dsl)).toThrow('Leaf not found: missing_leaf');
  });

  test('should enforce depth limits', () => {
    const deepDSL = createDeeplyNestedDSL(20); // Exceeds limit
    
    expect(() => compiler.compile(deepDSL)).toThrow('Tree depth exceeds limit');
  });
});
```

### 2.3 Linter Testing
**Location**: `packages/planning/src/behavior-trees/__tests__/bt-dsl-linter.test.ts`

```typescript
describe('BT-DSL Linter', () => {
  let linter: BTDSLLinter;
  let leafFactory: LeafFactory;

  beforeEach(() => {
    leafFactory = new LeafFactory();
    linter = new BTDSLLinter(leafFactory);
  });

  test('should detect cycles', () => {
    const cyclicDSL = createCyclicDSL();
    const results = linter.validateTree(cyclicDSL.tree);
    
    expect(results.some(r => r.type === 'cycle_detected')).toBe(true);
  });

  test('should validate leaf references', () => {
    const dslWithInvalidLeaf = createDSLWithInvalidLeaf();
    const results = linter.validateTree(dslWithInvalidLeaf.tree);
    
    expect(results.some(r => r.type === 'invalid_leaf_reference')).toBe(true);
  });

  test('should check timeout presence', () => {
    const dslWithoutTimeout = createDSLWithoutTimeout();
    const results = linter.validateTree(dslWithoutTimeout.tree);
    
    expect(results.some(r => r.type === 'missing_timeout')).toBe(true);
  });
});
```

## Enhanced Registry Testing

### 3.1 Registration Pipeline Testing
**Location**: `packages/core/src/mcp-capabilities/__tests__/registration-pipeline.test.ts`

```typescript
describe('Registration Pipeline', () => {
  let pipeline: RegistrationPipeline;
  let sandboxTester: SandboxTester;

  beforeEach(() => {
    sandboxTester = new SandboxTester();
    pipeline = new RegistrationPipeline(sandboxTester);
  });

  test('should register valid leaf through pipeline', async () => {
    const leaf = createTestLeaf();
    const result = await pipeline.registerLeaf(leaf.spec, leaf);
    
    expect(result.success).toBe(true);
    expect(sandboxTester.testLeaf).toHaveBeenCalledWith(leaf);
  });

  test('should reject leaf that fails sandbox test', async () => {
    sandboxTester.testLeaf.mockResolvedValue({ 
      success: false, 
      error: 'Sandbox test failed' 
    });
    
    const leaf = createTestLeaf();
    const result = await pipeline.registerLeaf(leaf.spec, leaf);
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('Sandbox test failed');
  });

  test('should auto-approve valid option', async () => {
    const option = createValidOption();
    const result = await pipeline.registerOption(option);
    
    expect(result.success).toBe(true);
    expect(result.autoApproved).toBe(true);
  });
});
```

### 3.2 API Endpoint Testing
**Location**: `packages/core/src/__tests__/api-endpoints.test.ts`

```typescript
describe('Capability API Endpoints', () => {
  let app: Express;
  let server: Server;

  beforeAll(async () => {
    app = createTestApp();
    server = app.listen(0);
  });

  afterAll(async () => {
    await new Promise(resolve => server.close(resolve));
  });

  test('POST /capabilities/option/register should accept valid option', async () => {
    const option = createValidOption();
    const response = await request(app)
      .post('/capabilities/option/register')
      .send(option)
      .expect(200);
    
    expect(response.body.success).toBe(true);
    expect(response.body.capabilityId).toBe(option.id);
  });

  test('POST /capabilities/leaf/register should require authentication', async () => {
    const leaf = createTestLeaf();
    const response = await request(app)
      .post('/capabilities/leaf/register')
      .send(leaf)
      .expect(401);
  });

  test('GET /capabilities/:id should return capability details', async () => {
    // First register a capability
    const option = createValidOption();
    await request(app)
      .post('/capabilities/option/register')
      .send(option);
    
    // Then retrieve it
    const response = await request(app)
      .get(`/capabilities/${option.id}`)
      .expect(200);
    
    expect(response.body.id).toBe(option.id);
    expect(response.body.version).toBe(option.version);
  });
});
```

## Dynamic Creation Flow Testing

### 4.1 LLM Integration Testing
**Location**: `packages/cognition/src/__tests__/option-proposer.test.ts`

```typescript
describe('Option Proposer', () => {
  let proposer: OptionProposer;
  let mockLLM: jest.Mocked<LLMInterface>;

  beforeEach(() => {
    mockLLM = createMockLLM();
    proposer = new OptionProposer(mockLLM);
  });

  test('should propose option for planning impasse', async () => {
    const impasse: PlanningImpasse = {
      type: 'repeated_failure',
      context: 'night_mining_failures',
      attempts: 5,
      availableLeaves: ['place_torch', 'sense_hostiles']
    };
    
    mockLLM.generateOption.mockResolvedValue(createValidOptionProposal());
    
    const proposal = await proposer.proposeOption(impasse, [], {});
    
    expect(proposal).toBeDefined();
    expect(proposal.btDSL).toBeDefined();
    expect(proposal.tests).toBeDefined();
  });

  test('should include available leaves in prompt', async () => {
    const availableLeaves = ['place_torch', 'dig_block'];
    await proposer.proposeOption({} as PlanningImpasse, availableLeaves, {});
    
    expect(mockLLM.generateOption).toHaveBeenCalledWith(
      expect.objectContaining({
        availableLeaves: availableLeaves
      })
    );
  });
});
```

### 4.2 Planning Integration Testing
**Location**: `packages/planning/src/reactive-executor/__tests__/enhanced-goap-planner.test.ts`

```typescript
describe('Enhanced GOAP Planner with Dynamic Options', () => {
  let planner: EnhancedGOAPPlanner;
  let capabilityRegistry: CapabilityRegistry;

  beforeEach(() => {
    capabilityRegistry = new CapabilityRegistry();
    planner = new EnhancedGOAPPlanner(capabilityRegistry);
  });

  test('should detect planning impasse', () => {
    const worldState = createWorldState();
    const goal = createGoal();
    
    // Simulate repeated planning failures
    for (let i = 0; i < 5; i++) {
      planner.plan(worldState, goal);
    }
    
    const impasses = planner.getDetectedImpasses();
    expect(impasses.length).toBeGreaterThan(0);
  });

  test('should use registered options in planning', () => {
    // Register an option
    const option = createValidOption();
    capabilityRegistry.registerOption(option);
    
    const worldState = createWorldState();
    const goal = createGoal();
    const plan = planner.plan(worldState, goal);
    
    expect(plan.steps.some(step => step.optionId === option.id)).toBe(true);
  });
});
```

## Safety and Trust Testing

### 5.1 Trust Tier Testing
**Location**: `packages/safety/src/__tests__/trust-tiers.test.ts`

```typescript
describe('Trust Tiers', () => {
  let trustModel: TrustModel;

  beforeEach(() => {
    trustModel = new TrustModel();
  });

  test('should classify human-authored leaves as Tier 0', () => {
    const leaf = createHumanAuthoredLeaf();
    const validation = trustModel.validateCapability(leaf);
    
    expect(validation.tier).toBe(TrustTier.TIER_0);
    expect(validation.requiresApproval).toBe(false);
  });

  test('should classify LLM-composed options as Tier 1', () => {
    const option = createLLMComposedOption();
    const validation = trustModel.validateCapability(option);
    
    expect(validation.tier).toBe(TrustTier.TIER_1);
    expect(validation.requiresApproval).toBe(false);
  });

  test('should require approval for LLM-proposed leaves', () => {
    const leaf = createLLMProposedLeaf();
    const validation = trustModel.validateCapability(leaf);
    
    expect(validation.tier).toBe(TrustTier.TIER_2);
    expect(validation.requiresApproval).toBe(true);
  });
});
```

### 5.2 Sandbox Testing
**Location**: `packages/core/src/mcp-capabilities/__tests__/sandbox-tester.test.ts`

```typescript
describe('Sandbox Tester', () => {
  let sandboxTester: SandboxTester;

  beforeEach(() => {
    sandboxTester = new SandboxTester();
  });

  test('should run option in isolated environment', async () => {
    const option = createValidOption();
    const result = await sandboxTester.testOption(option);
    
    expect(result.success).toBe(true);
    expect(result.postconditionsMet).toBe(true);
    expect(result.timeoutRespected).toBe(true);
  });

  test('should detect postcondition violations', async () => {
    const optionWithBadPostcondition = createOptionWithBadPostcondition();
    const result = await sandboxTester.testOption(optionWithBadPostcondition);
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('Postcondition violation');
  });

  test('should respect timeout limits', async () => {
    const slowOption = createSlowOption();
    const result = await sandboxTester.testOption(slowOption);
    
    expect(result.timeoutRespected).toBe(false);
    expect(result.error).toContain('Timeout exceeded');
  });
});
```

## End-to-End Integration Testing

### E2E Test Scenarios
**Location**: `packages/integration-tests/src/e2e/`

#### Scenario 1: Torch Corridor Option Creation
```typescript
describe('E2E: Torch Corridor Option Creation', () => {
  test('should create and use torch corridor option', async () => {
    // 1. Set up bot in dark environment
    const bot = await createTestBot();
    await bot.connect();
    await bot.moveTo([0, 64, 0]);
    
    // 2. Simulate repeated night mining failures
    for (let i = 0; i < 3; i++) {
      await bot.executeAction({ type: 'mine_block', pos: [1, 64, 1] });
      // Simulate hostile spawn
      await bot.simulateHostileSpawn();
    }
    
    // 3. Verify impasse detection
    const impasses = await bot.getPlanningImpasses();
    expect(impasses.some(i => i.context === 'night_mining_failures')).toBe(true);
    
    // 4. Verify option proposal and registration
    const proposals = await bot.getOptionProposals();
    expect(proposals.length).toBeGreaterThan(0);
    
    const torchOption = proposals.find(p => p.id.includes('torch'));
    expect(torchOption).toBeDefined();
    
    // 5. Verify option becomes available
    const capabilities = await bot.getAvailableCapabilities();
    expect(capabilities.some(c => c.id === torchOption.id)).toBe(true);
    
    // 6. Verify option works in practice
    const result = await bot.executeCapability(torchOption.id, { interval: 6 });
    expect(result.success).toBe(true);
  }, 30000);
});
```

#### Scenario 2: New Leaf Proposal and Approval
```typescript
describe('E2E: New Leaf Proposal and Approval', () => {
  test('should propose new leaf and require approval', async () => {
    // 1. Bot encounters need for new capability
    const bot = await createTestBot();
    await bot.connect();
    
    // 2. Simulate need for new leaf
    await bot.simulateNewCapabilityNeed('special_mining');
    
    // 3. Verify leaf proposal
    const proposals = await bot.getLeafProposals();
    expect(proposals.length).toBeGreaterThan(0);
    
    const miningProposal = proposals.find(p => p.name.includes('special_mining'));
    expect(miningProposal).toBeDefined();
    expect(miningProposal.requiresApproval).toBe(true);
    
    // 4. Simulate human approval
    await bot.approveLeafProposal(miningProposal.id);
    
    // 5. Verify leaf becomes available
    const leaves = await bot.getAvailableLeaves();
    expect(leaves.some(l => l.name === miningProposal.name)).toBe(true);
  });
});
```

## Performance Testing

### Performance Test Suite
**Location**: `packages/performance-tests/src/`

```typescript
describe('Performance Tests', () => {
  test('leaf execution should meet timing requirements', async () => {
    const leaf = createTestLeaf();
    const times: number[] = [];
    
    for (let i = 0; i < 100; i++) {
      const start = performance.now();
      await leaf.run(createLeafContext(), {});
      const end = performance.now();
      times.push(end - start);
    }
    
    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    expect(avgTime).toBeLessThan(100); // <100ms for simple leaves
  });

  test('BT compilation should be fast', async () => {
    const compiler = new BTDSLCompiler(new LeafFactory());
    const dsl = createComplexDSL(); // 50+ nodes
    
    const start = performance.now();
    compiler.compile(dsl);
    const end = performance.now();
    
    expect(end - start).toBeLessThan(50); // <50ms for compilation
  });

  test('option registration should complete quickly', async () => {
    const pipeline = new RegistrationPipeline();
    const option = createValidOption();
    
    const start = performance.now();
    await pipeline.registerOption(option);
    const end = performance.now();
    
    expect(end - start).toBeLessThan(2000); // <2s for registration
  });
});
```

## Safety Testing

### Security Test Suite
**Location**: `packages/safety/src/__tests__/security.test.ts`

```typescript
describe('Security Tests', () => {
  test('should prevent permission escalation', () => {
    const lowPrivilegeOption = createOptionWithLowPrivileges();
    const highPrivilegeLeaf = createLeafWithHighPrivileges();
    
    // Try to compose high privilege leaf into low privilege option
    const maliciousOption = {
      ...lowPrivilegeOption,
      tree: {
        type: 'Sequence',
        children: [{ type: 'Leaf', name: highPrivilegeLeaf.spec.name }]
      }
    };
    
    expect(() => validateOption(maliciousOption)).toThrow('Permission escalation');
  });

  test('should prevent arbitrary code execution', () => {
    const maliciousDSL = {
      id: 'malicious',
      version: '1.0.0',
      tree: {
        type: 'Leaf',
        name: 'eval',
        args: { code: 'process.exit(1)' }
      }
    };
    
    expect(() => validateDSL(maliciousDSL)).toThrow('Invalid leaf name');
  });

  test('should enforce resource limits', () => {
    const resourceHeavyOption = createResourceHeavyOption();
    
    // Try to register multiple resource-heavy options
    for (let i = 0; i < 10; i++) {
      const result = registerOption(resourceHeavyOption);
      if (i < 5) {
        expect(result.success).toBe(true);
      } else {
        expect(result.success).toBe(false);
        expect(result.error).toContain('Resource limit exceeded');
      }
    }
  });
});
```

## Regression Testing

### Regression Test Suite
**Location**: `packages/regression-tests/src/`

```typescript
describe('Regression Tests', () => {
  test('existing capabilities should still work', async () => {
    const registry = new CapabilityRegistry();
    
    // Verify all existing capabilities are still available
    const existingCapabilities = ALL_CAPABILITIES;
    for (const capability of existingCapabilities) {
      const found = registry.getCapability(capability.id);
      expect(found).toBeDefined();
      expect(found.id).toBe(capability.id);
    }
  });

  test('existing planning should not break', async () => {
    const planner = new EnhancedGOAPPlanner();
    const worldState = createStandardWorldState();
    const goal = createStandardGoal();
    
    const plan = planner.plan(worldState, goal);
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.success).toBe(true);
  });

  test('existing Minecraft actions should work', async () => {
    const bot = await createTestBot();
    await bot.connect();
    
    // Test existing action translator
    const result = await bot.executeAction({
      type: 'place_block',
      position: [0, 64, 0],
      blockType: 'torch'
    });
    
    expect(result.success).toBe(true);
  });
});
```

## Continuous Integration Setup

### CI Pipeline Configuration
**Location**: `.github/workflows/iteration-two-tests.yml`

```yaml
name: Iteration Two Tests

on:
  push:
    branches: [main, iteration-two]
  pull_request:
    branches: [main]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:unit

  integration-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:integration

  e2e-tests:
    runs-on: ubuntu-latest
    services:
      minecraft:
        image: itzg/minecraft-server
        ports:
          - 25565:25565
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:e2e

  performance-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:performance

  safety-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:safety
```

## Test Data and Fixtures

### Test Data Management
**Location**: `packages/test-utils/src/fixtures/`

```typescript
// Leaf fixtures
export const createTestLeaf = (name = 'test_leaf', version = '1.0.0'): LeafImpl => ({
  spec: {
    name,
    version,
    description: 'Test leaf for unit testing',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean' } } },
    timeoutMs: 1000,
    retries: 2,
    permissions: ['movement']
  },
  run: jest.fn().mockResolvedValue({ status: 'success', result: { success: true } })
});

// Option fixtures
export const createValidOption = (): OptionDefJson => ({
  id: 'opt.test_option',
  version: '1.0.0',
  argsSchema: { type: 'object', properties: {} },
  pre: ['has(torch)>=1'],
  post: ['light>=8'],
  tree: {
    type: 'Sequence',
    children: [
      { type: 'Leaf', name: 'place_torch', args: { pos: [0, 64, 0] } }
    ]
  }
});

// World state fixtures
export const createWorldState = (): WorldState => ({
  position: { x: 0, y: 64, z: 0 },
  inventory: [{ item: 'torch', quantity: 5 }],
  health: 1.0,
  light: 4
});
```

## Success Criteria and Metrics

### Test Coverage Requirements
- **Unit Tests**: >90% line coverage
- **Integration Tests**: >80% module interaction coverage
- **E2E Tests**: All critical user workflows covered
- **Performance Tests**: All timing requirements met
- **Safety Tests**: 100% security requirements passed

### Quality Gates
- All tests must pass before merge
- Performance regressions must be investigated
- Security vulnerabilities must be fixed immediately
- Test coverage must not decrease

### Monitoring and Alerting
- Test failure notifications
- Performance regression alerts
- Security vulnerability alerts
- Coverage decrease warnings

This comprehensive testing and validation plan ensures the iteration two implementation is robust, safe, and performs according to specifications.
