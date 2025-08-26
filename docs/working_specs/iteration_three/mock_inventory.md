# Mock Object Inventory - Iteration Three

## Overview

This document catalogs all mock objects, incomplete implementations, and hardcoded fallbacks found in the conscious-bot codebase.

**Author:** @darianrosebrook  
**Last Updated:** 2024-08-26  
**Status:** Complete Inventory  

## Critical Mock Objects (Production Code)

### 1. Planning System (`packages/planning/src/server.ts`)

#### Mock planningSystem Object (Lines 182-422)
```typescript
const planningSystem = {
  goalFormulation: {
    _tasks: [] as any[],
    _lastTaskExecution: 0,
    _failedTaskCount: 0,
    _maxConsecutiveFailures: 3,
    // ... mock methods
  },
  hierarchicalPlanner: {
    getCurrentPlan: () => ({ /* hardcoded plan */ }),
    // ... mock methods
  },
  reactiveExecutor: {
    executeNextTask: async () => { /* simplified execution */ },
    // ... mock methods
  }
}
```

**Issues:**
- In-memory task storage (no persistence)
- Hardcoded plan responses
- Simplified execution logic
- No real integration with HRM components

**Replacement Needed:**
- `IntegratedPlanningCoordinator`
- `EnhancedGoalManager`
- `EnhancedReactiveExecutor`
- Database persistence layer

#### Mock Autonomous Task Generation (Lines 697-969)
```typescript
async function generateAutonomousTask() {
  // Hardcoded threat assessment
  // Simplified task generation
  // No real goal formulation
}
```

**Issues:**
- Hardcoded threat assessment
- Random task selection
- No goal-driven behavior
- Missing proper planning pipeline

### 2. Dashboard Fallbacks (`packages/dashboard/src/app/api/tasks/route.ts`)

#### Demo Data Generation (Lines 129-147)
```typescript
// Return demo data on error
return NextResponse.json({
  tasks: [{
    id: `demo-task-${Date.now()}`,
    title: 'Find and collect resources',
    // ... hardcoded demo data
  }],
  timestamp: new Date().toISOString(),
});
```

**Issues:**
- Hardcoded fallback responses
- No graceful degradation
- Misleading user experience

## Test Mock Objects

### 1. Planning Tests (`packages/planning/src/__tests__/`)

#### Mock Planning System (autonomous-task-execution.test.ts)
```typescript
const mockPlanningSystem = {
  goalFormulation: {
    _tasks: [] as any[],
    _lastTaskExecution: 0,
    _failedTaskCount: 0,
    _maxConsecutiveFailures: 3,
    addTask: jest.fn(),
    getCurrentTasks: jest.fn(),
  },
  reactiveExecutor: {
    executeNextTask: jest.fn(),
  },
};
```

**Issues:**
- Mock objects not properly isolated
- Potential leakage into production
- Inconsistent mock patterns

#### Mock Planning System (planning-integration.test.ts)
```typescript
const mockPlanningSystem = {
  goalFormulation: {
    _failedTaskCount: 0,
    _maxConsecutiveFailures: 3,
    _lastTaskExecution: 0,
    _tasks: [],
    addTask: jest.fn(),
    getCompletedTasks: jest.fn(() => []),
  },
  reactiveExecutor: {
    executeNextTask: jest.fn(),
  },
};
```

### 2. Cognition Tests (`packages/cognition/src/intrusion-interface/__tests__/`)

#### Mock LLM Interface (intrusion-interface.test.ts)
```typescript
class MockLLMInterface {
  generateResponse = jest.fn();
  // ... mock methods
}

class MockConstitutionalFilter {
  evaluateCompliance = jest.fn();
  // ... mock methods
}
```

**Issues:**
- Mock classes not properly isolated
- Complex mock setup required

### 3. Dashboard Tests (`packages/dashboard/src/__tests__/`)

#### Mock Cognitive Feedback (cognitive-stream.test.ts)
```typescript
const mockCognitiveFeedback = {
  taskId: 'test-task-1',
  success: true,
  reasoning: 'Test reasoning',
  // ... mock data
};

const mockTask = {
  id: 'test-task-1',
  type: 'mine',
  // ... mock data
};
```

#### Mock Setup (setup.ts)
```typescript
jest.mock('next/router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    // ... mock router
  }),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    // ... mock navigation
  }),
}));
```

### 4. World Tests (`packages/world/src/sensorimotor/__tests__/`)

#### Mock Action Executor (sensorimotor-integration.test.ts)
```typescript
let mockActionExecutor: any;

mockActionExecutor = {
  executeMovement: jest.fn(),
  executeManipulation: jest.fn(),
  executePerception: jest.fn(),
  // ... mock methods
};
```

### 5. Evaluation Tests (`packages/evaluation/src/__tests__/`)

#### Mock Results (phase5-integration.test.ts)
```typescript
const mockResult = {
  scenarioId: 'test-scenario',
  success: true,
  // ... mock evaluation data
};

const mockBenchmarkResult = {
  benchmarkId: 'test-benchmark',
  performance: 0.85,
  // ... mock benchmark data
};
```

## Incomplete Implementations

### 1. Evaluation System (`packages/evaluation/src/scenarios/scenario-manager.ts`)

#### Empty Planning System (Line 86)
```typescript
const planningSystem = {} as IntegratedPlanningSystem;
```

**Issues:**
- Empty object cast to type
- No real implementation
- Missing integration

### 2. Dashboard API (`packages/dashboard/src/app/api/tasks/route.ts`)

#### Hardcoded Demo Tasks (Lines 60-80)
```typescript
// If no tasks found, create a demo task
if (tasks.length === 0) {
  tasks.push({
    id: `demo-task-${Date.now()}`,
    title: 'Find and collect resources',
    priority: 0.8,
    progress: 0.2,
    source: 'planner' as const,
    steps: [
      { id: 'step-1', label: 'Explore surroundings', done: true },
      { id: 'step-2', label: 'Look for trees', done: false },
      { id: 'step-3', label: 'Gather wood', done: false },
    ],
  });
}
```

## Mock Object Categories

### By Priority

#### Critical (Production Code)
1. **Planning System Mocks** - Core functionality affected
2. **Autonomous Task Generation** - Bot behavior affected
3. **Dashboard Fallbacks** - User experience affected

#### Medium (Test Infrastructure)
1. **Test Mock Objects** - Development workflow affected
2. **Mock Setup Utilities** - Test reliability affected

#### Low (Incomplete Features)
1. **Evaluation System** - Not core functionality
2. **Demo Data** - User experience only

### By Type

#### In-Memory Storage
- `planningSystem.goalFormulation._tasks`
- `planningSystem.goalFormulation._lastTaskExecution`
- `planningSystem.goalFormulation._failedTaskCount`

#### Hardcoded Responses
- `hierarchicalPlanner.getCurrentPlan()`
- Dashboard demo tasks
- Test mock data

#### Simplified Logic
- `reactiveExecutor.executeNextTask()`
- `generateAutonomousTask()`
- Task validation functions

#### Empty Implementations
- `scenario-manager.ts` planning system
- Some test mock objects

## Impact Assessment

### Functional Impact
- **Bot Behavior:** Limited by mock autonomous system
- **Planning:** No real goal formulation or plan repair
- **Persistence:** No state persistence across restarts
- **Integration:** Missing proper system coordination

### Performance Impact
- **Response Time:** Mock objects may be faster than real implementations
- **Memory Usage:** In-memory storage limits scalability
- **Reliability:** No persistence means state loss on restart

### Development Impact
- **Testing:** Mock objects may not reflect real behavior
- **Debugging:** Hard to trace issues through mock layers
- **Maintenance:** Mock objects require separate maintenance

## Replacement Strategy

### Phase 1: Critical Mocks
1. Replace `planningSystem` object with real components
2. Implement proper goal formulation pipeline
3. Add persistent storage layer

### Phase 2: Test Infrastructure
1. Create proper test utilities
2. Isolate mock objects
3. Improve test reliability

### Phase 3: User Experience
1. Improve dashboard fallbacks
2. Add graceful degradation
3. Better error handling

## Conclusion

The codebase contains 15+ mock objects across 8+ files, with the most critical being in the planning system. The replacement strategy focuses on maintaining system stability while progressively eliminating mocks with proper implementations.

