# Mock Object Eradication Plan - Iteration Three

## Overview

This document outlines the comprehensive plan to identify, catalog, and replace all mock objects and incomplete implementations in the conscious-bot system with proper, production-ready components.

**Author:** @darianrosebrook  
**Status:** Planning Phase  
**Priority:** Critical  

## Current State Analysis

### Mock Objects Identified

#### 1. Planning System Mocks (Critical)
**Location:** `packages/planning/src/server.ts`

**Mock Components:**
- `planningSystem` object (lines 182-422)
- `goalFormulation._tasks` array (in-memory storage)
- `goalFormulation._lastTaskExecution` timestamp
- `hierarchicalPlanner.getCurrentPlan()` (hardcoded plan)
- `reactiveExecutor.executeNextTask()` (simplified execution)

**Issues:**
- No persistent storage
- Hardcoded responses
- No real integration with HRM
- Missing proper goal formulation pipeline
- No plan repair or adaptation

#### 2. Test Mocks (Medium Priority)
**Locations:**
- `packages/planning/src/__tests__/autonomous-task-execution.test.ts`
- `packages/planning/src/__tests__/planning-integration.test.ts`
- `packages/cognition/src/intrusion-interface/__tests__/intrusion-interface.test.ts`
- `packages/dashboard/src/__tests__/cognitive-stream.test.ts`

**Issues:**
- Mock objects not properly isolated
- Some mocks leaking into production code
- Inconsistent mock patterns

#### 3. Dashboard Fallbacks (Medium Priority)
**Location:** `packages/dashboard/src/app/api/tasks/route.ts`

**Issues:**
- Demo data when services unavailable
- No graceful degradation
- Hardcoded fallback responses

#### 4. Evaluation System Mocks (Low Priority)
**Location:** `packages/evaluation/src/scenarios/scenario-manager.ts`

**Issues:**
- Empty planning system object
- No real integration

## Implementation Plan

### Phase 1: Planning System Overhaul (Week 1-2)

#### 1.1 Replace Mock Planning System
**Target:** `packages/planning/src/server.ts`

**Actions:**
1. **Remove mock planningSystem object**
   - Replace with proper `IntegratedPlanningCoordinator`
   - Integrate `EnhancedGoalManager`
   - Integrate `EnhancedReactiveExecutor`

2. **Implement proper goal formulation pipeline**
   - Signals → Needs → Goals → Plans → Execution
   - Real-time goal generation
   - Dynamic priority scoring

3. **Add persistent storage**
   - Database integration for tasks and goals
   - State persistence across restarts
   - Historical data tracking

4. **Implement proper plan execution**
   - Real plan repair and adaptation
   - Safety reflexes integration
   - Performance monitoring

#### 1.2 Integration Points
**Required Components:**
- `IntegratedPlanningCoordinator` (exists, needs integration)
- `EnhancedGoalManager` (exists, needs integration)
- `EnhancedReactiveExecutor` (exists, needs integration)
- Database layer (needs implementation)
- State management (needs implementation)

### Phase 2: Autonomous Behavior Enhancement (Week 2-3)

#### 2.1 Continuous Goal Pursuit
**Target:** Replace current autonomous system

**Actions:**
1. **Implement continuous execution loop**
   - 5-second intervals (not 2-minute delays)
   - Real-time goal assessment
   - Dynamic task generation

2. **Add goal-driven behavior**
   - Remove random task selection
   - Implement proper goal formulation
   - Add context-aware decision making

3. **Integrate with planning pipeline**
   - Use proper `planAndExecute` method
   - Implement plan repair and adaptation
   - Add performance monitoring

#### 2.2 Required Components
- Continuous execution coordinator
- Real-time goal assessment
- Dynamic task generation
- Performance monitoring

### Phase 3: Test Infrastructure Cleanup (Week 3-4)

#### 3.1 Isolate Test Mocks
**Actions:**
1. **Create proper test utilities**
   - Mock factories for tests
   - Isolated test environments
   - Consistent mock patterns

2. **Remove mock leakage**
   - Ensure mocks don't affect production
   - Proper cleanup after tests
   - Clear separation of concerns

#### 3.2 Dashboard Fallback Improvements
**Actions:**
1. **Implement graceful degradation**
   - Service health monitoring
   - Progressive enhancement
   - User-friendly error states

2. **Remove hardcoded fallbacks**
   - Dynamic fallback generation
   - Context-aware defaults
   - Better error handling

### Phase 4: Integration and Validation (Week 4-5)

#### 4.1 System Integration
**Actions:**
1. **End-to-end testing**
   - Full pipeline validation
   - Performance benchmarking
   - Error scenario testing

2. **Documentation updates**
   - API documentation
   - Architecture diagrams
   - Integration guides

#### 4.2 Validation Criteria
- No mock objects in production code
- All systems properly integrated
- Performance meets requirements
- Error handling robust

## Success Metrics

### Quantitative Metrics
- **Mock Objects:** 0 remaining in production code
- **Integration Coverage:** 100% of planned integrations
- **Performance:** <100ms response time for planning operations
- **Reliability:** 99.9% uptime for autonomous operation

### Qualitative Metrics
- **Code Quality:** All mock objects replaced with proper implementations
- **System Behavior:** Bot demonstrates intelligent, goal-driven behavior
- **Maintainability:** Clear separation of concerns, no mock leakage
- **Documentation:** Complete and accurate system documentation

## Risk Assessment

### High Risk
- **Planning system complexity:** Large refactoring required
- **Integration challenges:** Multiple systems need coordination
- **Performance impact:** Real implementations may be slower

### Mitigation Strategies
- **Incremental implementation:** Replace mocks one at a time
- **Comprehensive testing:** Validate each replacement
- **Performance monitoring:** Track impact of changes
- **Rollback plan:** Ability to revert if issues arise

## Timeline

### Week 1: Planning System Foundation
- [ ] Replace mock planningSystem object
- [ ] Implement basic goal formulation
- [ ] Add persistent storage layer

### Week 2: Autonomous Behavior
- [ ] Implement continuous execution
- [ ] Add goal-driven task generation
- [ ] Integrate with planning pipeline

### Week 3: Test Infrastructure
- [ ] Clean up test mocks
- [ ] Improve dashboard fallbacks
- [ ] Add comprehensive testing

### Week 4: Integration
- [ ] End-to-end validation
- [ ] Performance optimization
- [ ] Documentation updates

### Week 5: Validation
- [ ] Final testing and validation
- [ ] Performance benchmarking
- [ ] Deployment preparation

## Next Steps

1. **Immediate:** Begin Phase 1 implementation
2. **Short-term:** Complete planning system overhaul
3. **Medium-term:** Implement autonomous behavior
4. **Long-term:** Full system integration and validation

## Conclusion

This plan provides a comprehensive roadmap for eliminating all mock objects and implementing proper, production-ready components. The focus is on maintaining system stability while progressively replacing mocks with real implementations.
