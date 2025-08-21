# Forward Model Implementation Plan

**Module:** `modules/planning/forward_model/`  
**Purpose:** Predictive simulation and counterfactual replay for action evaluation  
**Author:** @darianrosebrook

## Architecture Overview

The forward model provides lightweight predictive simulation that runs off-tick to evaluate action candidates without blocking the main execution loop. It enables error-driven learning by comparing predictions with actual outcomes, supporting both planning optimization and risk assessment.

### Core Responsibilities
- **Predictive simulation**: Fast rollout of action sequences to estimate outcomes
- **Action candidate scoring**: Evaluate multiple options before commitment
- **Prediction error tracking**: Learn from differences between expected and actual results
- **Risk assessment**: CVaR analysis for tail-risk management
- **Counterfactual analysis**: "What if" scenarios for learning and debugging

## Core Components

### 1. Lightweight Simulator
```typescript
interface SimulationState {
  position: Position;
  inventory: Map<string, number>;
  health: number;
  hunger: number;
  timeOfDay: number;
  threatLevel: number;
  
  // Simplified world state for fast simulation
  nearbyBlocks: Map<Position, BlockType>;
  nearbyEntities: Entity[];
  lightLevel: number;
}

interface SimulationResult {
  finalState: SimulationState;
  trajectory: SimulationStep[];
  estimatedReward: number;
  estimatedRisk: number;
  confidence: number;          // How reliable is this prediction?
  computeTime: number;         // Simulation budget used
}

class LightweightSimulator {
  private physics: PhysicsModel;
  private inventory: InventoryModel;
  private combat: CombatModel;
  private environment: EnvironmentModel;
  
  /**
   * Fast forward simulation with budget constraints
   * Runs off-tick to avoid blocking main execution
   */
  async rollout(
    initialState: SimulationState,
    actions: Action[],
    horizon: number,
    budget: number = 10 // ms
  ): Promise<SimulationResult> {
    
    const startTime = performance.now();
    let currentState = this.cloneState(initialState);
    const trajectory: SimulationStep[] = [];
    let totalReward = 0;
    let maxRisk = 0;
    
    for (let step = 0; step < Math.min(actions.length, horizon); step++) {
      if (performance.now() - startTime > budget) {
        // Budget exceeded - return partial simulation
        return {
          finalState: currentState,
          trajectory,
          estimatedReward: totalReward,
          estimatedRisk: maxRisk,
          confidence: step / actions.length, // Partial confidence
          computeTime: performance.now() - startTime
        };
      }
      
      const action = actions[step];
      const stepResult = await this.simulateAction(currentState, action);
      
      currentState = stepResult.newState;
      totalReward += stepResult.reward;
      maxRisk = Math.max(maxRisk, stepResult.risk);
      
      trajectory.push({
        action,
        stateBefore: stepResult.stateBefore,
        stateAfter: currentState,
        reward: stepResult.reward,
        risk: stepResult.risk
      });
      
      // Early termination for dangerous outcomes
      if (stepResult.risk > 0.8 || currentState.health <= 0) {
        break;
      }
    }
    
    return {
      finalState: currentState,
      trajectory,
      estimatedReward: totalReward,
      estimatedRisk: maxRisk,
      confidence: 1.0,
      computeTime: performance.now() - startTime
    };
  }
  
  private async simulateAction(
    state: SimulationState, 
    action: Action
  ): Promise<ActionSimulationResult> {
    
    const stateBefore = this.cloneState(state);
    let newState = this.cloneState(state);
    let reward = 0;
    let risk = 0;
    
    switch (action.type) {
      case 'move':
        newState = await this.simulateMovement(newState, action);
        risk = this.assessMovementRisk(newState, action);
        reward = this.assessMovementReward(newState, action);
        break;
        
      case 'mine':
        newState = await this.simulateMining(newState, action);
        risk = this.assessMiningRisk(newState, action);
        reward = this.assessMiningReward(newState, action);
        break;
        
      case 'craft':
        newState = await this.simulateCrafting(newState, action);
        risk = 0.1; // Crafting is generally safe
        reward = this.assessCraftingReward(newState, action);
        break;
        
      case 'combat':
        newState = await this.simulateCombat(newState, action);
        risk = this.assessCombatRisk(newState, action);
        reward = this.assessCombatReward(newState, action);
        break;
    }
    
    // Universal state updates
    newState = this.applyTimeProgression(newState, action.estimatedTime);
    newState = this.applyHungerDecay(newState, action.estimatedTime);
    
    return {
      stateBefore,
      newState,
      reward,
      risk
    };
  }
  
  private async simulateMovement(
    state: SimulationState, 
    action: MoveAction
  ): Promise<SimulationState> {
    
    const newState = this.cloneState(state);
    
    // Simple pathfinding simulation
    const path = await this.physics.calculatePath(
      state.position, 
      action.target,
      state.nearbyBlocks
    );
    
    if (path.length === 0) {
      return newState; // No movement possible
    }
    
    // Simulate movement along path
    newState.position = action.target;
    
    // Update nearby environment based on new position
    newState.nearbyBlocks = this.environment.getBlocksNear(action.target);
    newState.nearbyEntities = this.environment.getEntitiesNear(action.target);
    newState.lightLevel = this.environment.getLightLevel(action.target);
    
    // Update threat level based on new location
    newState.threatLevel = this.assessLocationThreat(newState);
    
    return newState;
  }
  
  private async simulateMining(
    state: SimulationState, 
    action: MineAction
  ): Promise<SimulationState> {
    
    const newState = this.cloneState(state);
    
    // Check if mining is possible
    if (!this.canMineBlock(state, action.target)) {
      return newState;
    }
    
    // Simulate block breaking
    const blockType = state.nearbyBlocks.get(action.target);
    const drops = this.getBlockDrops(blockType, state.inventory.get('tool'));
    
    // Add drops to inventory
    for (const [item, quantity] of drops) {
      const current = newState.inventory.get(item) || 0;
      newState.inventory.set(item, current + quantity);
    }
    
    // Remove block from world
    newState.nearbyBlocks.delete(action.target);
    
    // Tool durability (simplified)
    const tool = newState.inventory.get('tool');
    if (tool && tool > 0) {
      newState.inventory.set('tool', tool - 1);
    }
    
    return newState;
  }
}
```

### 2. Action Candidate Scoring
```typescript
class CandidateScorer {
  private simulator: LightweightSimulator;
  private riskAnalyzer: RiskAnalyzer;
  
  /**
   * Parallel evaluation of action candidates with budget constraints
   */
  async scoreActionCandidates(
    candidates: Action[][],
    currentState: SimulationState,
    horizon: number = 5,
    totalBudget: number = 10 // ms
  ): Promise<ScoredCandidate[]> {
    
    const budgetPerCandidate = totalBudget / candidates.length;
    const scoringPromises = candidates.map(async (actionSequence, index) => {
      
      const result = await this.simulator.rollout(
        currentState,
        actionSequence,
        horizon,
        budgetPerCandidate
      );
      
      const score = this.computeCandidateScore(result, currentState);
      
      return {
        index,
        actionSequence,
        simulationResult: result,
        score,
        riskAdjustedScore: score - this.computeRiskPenalty(result),
        latencyPenalty: this.computeLatencyPenalty(result)
      };
    });
    
    const scoredCandidates = await Promise.all(scoringPromises);
    
    // Sort by risk-adjusted score with latency penalty
    return scoredCandidates.sort((a, b) => {
      const scoreA = a.riskAdjustedScore - a.latencyPenalty;
      const scoreB = b.riskAdjustedScore - b.latencyPenalty;
      return scoreB - scoreA;
    });
  }
  
  private computeCandidateScore(
    result: SimulationResult, 
    initialState: SimulationState
  ): number {
    
    let score = result.estimatedReward;
    
    // Progress toward goals
    const progressScore = this.assessGoalProgress(result.finalState, initialState);
    score += progressScore * 10;
    
    // Resource efficiency
    const resourceScore = this.assessResourceEfficiency(result.trajectory);
    score += resourceScore * 5;
    
    // Safety maintenance
    const safetyScore = this.assessSafetyMaintenance(result.finalState);
    score += safetyScore * 3;
    
    // Confidence penalty for incomplete simulations
    score *= result.confidence;
    
    return score;
  }
  
  private computeRiskPenalty(result: SimulationResult): number {
    // CVaR (Conditional Value at Risk) for tail risk management
    const riskThreshold = 0.7;
    
    if (result.estimatedRisk > riskThreshold) {
      // Heavy penalty for high-risk outcomes
      const excessRisk = result.estimatedRisk - riskThreshold;
      return excessRisk * 50; // CVaR penalty coefficient
    }
    
    return result.estimatedRisk * 5; // Normal risk penalty
  }
  
  private computeLatencyPenalty(result: SimulationResult): number {
    const budgetMs = 10;
    const overage = Math.max(0, result.computeTime - budgetMs);
    return overage * 2; // Penalty for exceeding computation budget
  }
}
```

### 3. Prediction Error Tracking
```typescript
interface PredictionRecord {
  id: string;
  timestamp: number;
  predictedOutcome: SimulationResult;
  actualOutcome: ActionResult;
  predictionError: number;
  errorBreakdown: ErrorBreakdown;
}

interface ErrorBreakdown {
  positionError: number;        // Spatial prediction accuracy
  inventoryError: number;       // Item quantity prediction accuracy
  healthError: number;          // Health change prediction accuracy
  timingError: number;          // Time estimation accuracy
  riskError: number;           // Risk assessment accuracy
}

class PredictionTracker {
  private predictionHistory: Map<string, PredictionRecord> = new Map();
  private errorAnalyzer: ErrorAnalyzer;
  private modelUpdater: ModelUpdater;
  
  /**
   * Record a prediction for later comparison with actual outcome
   */
  recordPrediction(
    actionId: string,
    prediction: SimulationResult,
    context: PredictionContext
  ): void {
    
    this.predictionHistory.set(actionId, {
      id: actionId,
      timestamp: Date.now(),
      predictedOutcome: prediction,
      actualOutcome: null, // Will be filled when action completes
      predictionError: 0,
      errorBreakdown: null
    });
  }
  
  /**
   * Update prediction record with actual outcome and compute error
   */
  recordActualOutcome(
    actionId: string,
    actualResult: ActionResult
  ): void {
    
    const record = this.predictionHistory.get(actionId);
    if (!record) return;
    
    record.actualOutcome = actualResult;
    record.predictionError = this.computePredictionError(
      record.predictedOutcome,
      actualResult
    );
    record.errorBreakdown = this.analyzeErrorBreakdown(
      record.predictedOutcome,
      actualResult
    );
    
    // Update model based on error
    this.modelUpdater.updateFromError(record);
    
    // Clean up old predictions
    this.cleanupOldPredictions();
  }
  
  private computePredictionError(
    predicted: SimulationResult,
    actual: ActionResult
  ): number {
    
    let totalError = 0;
    let errorCount = 0;
    
    // Position error
    if (predicted.finalState.position && actual.finalPosition) {
      const posError = this.distance(
        predicted.finalState.position,
        actual.finalPosition
      );
      totalError += Math.min(posError / 10, 1.0); // Normalize to [0,1]
      errorCount++;
    }
    
    // Health error
    const healthError = Math.abs(
      predicted.finalState.health - actual.finalHealth
    ) / 100;
    totalError += healthError;
    errorCount++;
    
    // Inventory errors
    for (const [item, predictedQty] of predicted.finalState.inventory) {
      const actualQty = actual.finalInventory.get(item) || 0;
      const itemError = Math.abs(predictedQty - actualQty) / 
                       Math.max(predictedQty, actualQty, 1);
      totalError += itemError;
      errorCount++;
    }
    
    // Risk prediction error
    const riskError = Math.abs(predicted.estimatedRisk - actual.actualRisk);
    totalError += riskError;
    errorCount++;
    
    return errorCount > 0 ? totalError / errorCount : 0;
  }
  
  /**
   * Get prediction accuracy metrics for model performance monitoring
   */
  getAccuracyMetrics(): PredictionAccuracyMetrics {
    const recentRecords = Array.from(this.predictionHistory.values())
      .filter(r => r.actualOutcome !== null)
      .filter(r => Date.now() - r.timestamp < 300000) // Last 5 minutes
      .slice(-100); // Last 100 predictions
    
    if (recentRecords.length === 0) {
      return { averageError: 1.0, confidence: 0.0, sampleSize: 0 };
    }
    
    const averageError = recentRecords.reduce((sum, r) => sum + r.predictionError, 0) 
                        / recentRecords.length;
    
    const confidence = Math.max(0, 1.0 - averageError);
    
    return {
      averageError,
      confidence,
      sampleSize: recentRecords.length,
      errorTrend: this.computeErrorTrend(recentRecords),
      errorBreakdown: this.aggregateErrorBreakdown(recentRecords)
    };
  }
}
```

### 4. Risk Assessment with CVaR
```typescript
class RiskAnalyzer {
  /**
   * Conditional Value at Risk analysis for tail event protection
   */
  computeCVaR(
    outcomes: SimulationResult[],
    alpha: number = 0.05 // 5% worst cases
  ): CVaRAnalysis {
    
    // Sort outcomes by risk (descending)
    const sortedByRisk = outcomes.sort((a, b) => b.estimatedRisk - a.estimatedRisk);
    
    // Take worst alpha% of outcomes
    const tailSize = Math.ceil(outcomes.length * alpha);
    const tailOutcomes = sortedByRisk.slice(0, tailSize);
    
    // Compute conditional expectation of tail
    const tailMeanRisk = tailOutcomes.reduce((sum, outcome) => 
      sum + outcome.estimatedRisk, 0) / tailOutcomes.length;
    
    const tailMeanReward = tailOutcomes.reduce((sum, outcome) => 
      sum + outcome.estimatedReward, 0) / tailOutcomes.length;
    
    return {
      cvarRisk: tailMeanRisk,
      cvarReward: tailMeanReward,
      tailScenarios: tailOutcomes,
      riskAdjustedUtility: this.computeRiskAdjustedUtility(
        outcomes, 
        tailMeanRisk, 
        alpha
      )
    };
  }
  
  private computeRiskAdjustedUtility(
    outcomes: SimulationResult[],
    cvarRisk: number,
    alpha: number
  ): number {
    
    const meanReward = outcomes.reduce((sum, o) => sum + o.estimatedReward, 0) 
                      / outcomes.length;
    
    const riskPenalty = cvarRisk * this.getRiskAversionParameter();
    
    // Risk-adjusted utility: E[return] - λ * CVaR_α[risk]
    return meanReward - riskPenalty;
  }
  
  private getRiskAversionParameter(): number {
    // Could be adaptive based on agent's current situation
    return 2.0; // Conservative risk aversion
  }
}
```

## Performance & Metrics

### Real-Time Constraints
- **Single rollout budget**: 10ms for 5-step simulation
- **Parallel candidate evaluation**: 50ms for 5 candidates
- **Prediction error computation**: 2ms per outcome record
- **CVaR analysis**: 5ms for 20 outcome scenarios

### Key Metrics
```typescript
interface ForwardModelMetrics {
  // Simulation Performance
  rolloutLatency: PerformanceMetric;        // Time per simulation
  candidateEvaluationLatency: PerformanceMetric; // Parallel scoring time
  simulationThroughput: number;             // Rollouts per second
  
  // Prediction Accuracy
  averagePredictionError: number;           // 0-1 error rate
  predictionConfidence: number;             // Model reliability
  errorTrend: 'improving' | 'stable' | 'degrading';
  
  // Risk Assessment Quality
  riskPredictionAccuracy: number;           // Risk assessment accuracy
  cvarEffectiveness: number;                // Tail risk avoidance success
  falsePositiveRate: number;                // Over-cautious predictions
  falseNegativeRate: number;                // Missed risks
  
  // Planning Impact
  planQualityImprovement: number;           // Better decisions from simulation
  actionSelectionAccuracy: number;         // Chosen vs optimal actions
  emergentBehaviorDetection: number;        // Novel strategy discovery
}
```

## Implementation Requirements

### Core Simulation Foundation
- [ ] Lightweight simulator for basic actions (move, mine, craft)
- [ ] Fast physics and inventory models
- [ ] Basic action candidate scoring
- [ ] Budget-constrained parallel evaluation

### Prediction Tracking Implementation
- [ ] Prediction error tracking and analysis
- [ ] Model accuracy metrics collection
- [ ] Error-driven model updates
- [ ] Prediction confidence estimation

### Risk Analysis Features
- [ ] CVaR implementation for tail risk management
- [ ] Risk-adjusted utility calculations
- [ ] Advanced risk assessment models
- [ ] Integration with planning modules

### Optimization & Testing
- [ ] Performance optimization for real-time constraints
- [ ] Adaptive simulation depth based on uncertainty
- [ ] Counterfactual analysis for debugging
- [ ] Comprehensive evaluation and testing

## File Structure
```
modules/planning/forward_model/
├── src/
│   ├── simulation/
│   │   ├── lightweight_simulator.ts    # Core simulation engine
│   │   ├── physics_model.ts           # Movement and collision
│   │   ├── inventory_model.ts         # Item and crafting simulation
│   │   ├── combat_model.ts            # Damage and threat simulation
│   │   └── environment_model.ts       # World state simulation
│   ├── scoring/
│   │   ├── candidate_scorer.ts        # Action sequence evaluation
│   │   ├── utility_calculator.ts      # Reward and cost computation
│   │   ├── risk_analyzer.ts           # CVaR and risk assessment
│   │   └── parallel_evaluator.ts      # Budget-constrained parallel scoring
│   ├── prediction/
│   │   ├── prediction_tracker.ts      # Error tracking and analysis
│   │   ├── model_updater.ts           # Learning from prediction errors
│   │   ├── accuracy_monitor.ts        # Prediction quality metrics
│   │   └── confidence_estimator.ts    # Prediction reliability assessment
│   └── metrics/
│       ├── simulation_telemetry.ts    # Performance monitoring
│       └── prediction_analytics.ts    # Accuracy and error analysis
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
└── docs/
    ├── simulation_models.md           # Physics and world model documentation
    └── risk_calibration.md            # CVaR parameter tuning guide
```

## Success Criteria
- [ ] Sub-10ms rollout for 5-step action sequences
- [ ] 80%+ prediction accuracy for basic actions
- [ ] 90%+ tail risk detection with CVaR analysis
- [ ] 95% budget compliance for real-time constraints
- [ ] Measurable improvement in plan quality from simulation

This forward model provides predictive intelligence that enables the agent to evaluate actions before commitment, learn from prediction errors, and manage risk through sophisticated analysis techniques.
