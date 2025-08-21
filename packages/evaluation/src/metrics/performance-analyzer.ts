/**
 * Performance Analyzer
 * 
 * Analyzes evaluation results across multiple dimensions to assess
 * the cognitive architecture's performance on complex reasoning tasks
 * 
 * @author @darianrosebrook
 */

import { 
  EvaluationSession, 
  EvaluationResults, 
  MetricResult, 
  MetricType,
  Scenario,
  AgentConfig
} from '../types';

export interface PerformanceProfile {
  agentId: string;
  totalSessions: number;
  successRate: number;
  averageLatency: number;
  domainPerformance: Record<string, {
    successRate: number;
    averageScore: number;
    averageLatency: number;
    sessionCount: number;
  }>;
  complexityPerformance: Record<string, {
    successRate: number;
    averageScore: number;
    sessionCount: number;
  }>;
  strengthsAndWeaknesses: {
    strengths: MetricType[];
    weaknesses: MetricType[];
    recommendations: string[];
  };
  improvementTrends: {
    metric: MetricType;
    trend: 'improving' | 'declining' | 'stable';
    confidence: number;
  }[];
}

export interface ComparativeAnalysis {
  configurations: string[];
  winMatrix: Record<string, Record<string, number>>; // config A vs config B win rates
  significanceTests: Record<string, {
    pValue: number;
    significant: boolean;
    effectSize: number;
  }>;
  bestPerformers: {
    overall: string;
    byDomain: Record<string, string>;
    byComplexity: Record<string, string>;
  };
}

/**
 * Comprehensive performance analysis system
 */
export class PerformanceAnalyzer {
  private sessionHistory: EvaluationSession[] = [];
  private scenarioLibrary: Map<string, Scenario> = new Map();
  private agentConfigurations: Map<string, AgentConfig> = new Map();

  /**
   * Add evaluation session to analysis
   */
  addSession(session: EvaluationSession): void {
    this.sessionHistory.push(session);
  }

  /**
   * Add multiple sessions
   */
  addSessions(sessions: EvaluationSession[]): void {
    this.sessionHistory.push(...sessions);
  }

  /**
   * Register scenario for analysis context
   */
  registerScenario(scenario: Scenario): void {
    this.scenarioLibrary.set(scenario.id, scenario);
  }

  /**
   * Register agent configuration for analysis
   */
  registerAgentConfig(config: AgentConfig): void {
    this.agentConfigurations.set(config.id, config);
  }

  /**
   * Generate comprehensive evaluation results for a session
   */
  generateEvaluationResults(session: EvaluationSession): EvaluationResults {
    const scenario = this.scenarioLibrary.get(session.scenarioId);
    const agentConfig = this.agentConfigurations.get(session.agentId);
    
    if (!scenario) {
      throw new Error(`Scenario ${session.scenarioId} not found`);
    }

    // Calculate detailed metrics
    const metrics = this.calculateDetailedMetrics(session, scenario);
    const overallScore = this.calculateOverallScore(metrics, scenario);

    // Analyze performance dimensions
    const planningPerformance = this.analyzePlanningPerformance(session);
    const executionPerformance = this.analyzeExecutionPerformance(session);
    const cognitivePerformance = this.analyzeCognitivePerformance(session, scenario);

    // Generate qualitative assessment
    const { strengths, weaknesses, recommendations } = this.generateQualitativeAssessment(
      metrics, 
      planningPerformance, 
      executionPerformance, 
      cognitivePerformance
    );

    return {
      sessionId: session.id,
      scenarioId: session.scenarioId,
      agentConfiguration: agentConfig ? this.sanitizeAgentConfig(agentConfig) : {},
      
      overallScore,
      success: session.success || false,
      
      metrics,
      
      planningPerformance,
      executionPerformance,
      cognitivePerformance,
      
      strengths,
      weaknesses,
      recommendations,
      
      timestamp: Date.now()
    };
  }

  /**
   * Calculate detailed performance metrics
   */
  private calculateDetailedMetrics(session: EvaluationSession, scenario: Scenario): MetricResult[] {
    const metrics: MetricResult[] = [];

    // Success rate (binary)
    metrics.push({
      type: 'success_rate',
      value: session.success ? 1.0 : 0.0,
      weight: 0.3,
      description: 'Whether the scenario was completed successfully'
    });

    // Latency performance
    if (session.totalLatency && scenario.expectedDuration) {
      const latencyRatio = session.totalLatency / scenario.expectedDuration;
      const latencyScore = Math.max(0, 2 - latencyRatio); // Score decreases if over expected time
      metrics.push({
        type: 'latency',
        value: Math.min(1.0, latencyScore),
        weight: 0.2,
        description: `Completion time vs expected (${session.totalLatency}ms vs ${scenario.expectedDuration}ms)`,
        metadata: { actualLatency: session.totalLatency, expectedLatency: scenario.expectedDuration }
      });
    }

    // Efficiency (steps vs estimated)
    const actualSteps = session.steps.length;
    const estimatedSteps = scenario.estimatedSteps;
    const efficiencyScore = Math.max(0, 2 - (actualSteps / estimatedSteps));
    metrics.push({
      type: 'efficiency',
      value: Math.min(1.0, efficiencyScore),
      weight: 0.2,
      description: `Step efficiency (${actualSteps} vs ${estimatedSteps} estimated)`,
      metadata: { actualSteps, estimatedSteps }
    });

    // Planning quality
    const planningQuality = this.assessPlanningQuality(session);
    metrics.push({
      type: 'planning_quality',
      value: planningQuality,
      weight: 0.15,
      description: 'Quality of generated plans and reasoning'
    });

    // Consistency (error rate)
    const errorRate = session.errors.length / Math.max(1, actualSteps);
    const consistencyScore = Math.max(0, 1 - errorRate);
    metrics.push({
      type: 'consistency',
      value: consistencyScore,
      weight: 0.1,
      description: `Error consistency (${session.errors.length} errors in ${actualSteps} steps)`
    });

    // Adaptability (based on domain-specific criteria)
    const adaptabilityScore = this.assessAdaptability(session, scenario);
    metrics.push({
      type: 'adaptability',
      value: adaptabilityScore,
      weight: 0.05,
      description: 'Ability to adapt strategy based on feedback'
    });

    return metrics;
  }

  /**
   * Calculate weighted overall score
   */
  private calculateOverallScore(metrics: MetricResult[], scenario: Scenario): number {
    const weightedSum = metrics.reduce((sum, metric) => 
      sum + (metric.value * metric.weight), 0
    );
    const totalWeight = metrics.reduce((sum, metric) => sum + metric.weight, 0);
    
    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  /**
   * Analyze planning-specific performance
   */
  private analyzePlanningPerformance(session: EvaluationSession): {
    latency: number;
    qualityScore: number;
    refinementCount: number;
    routingDecisions: string[];
  } {
    const planningSteps = session.steps.filter(step => step.action === 'planning');
    
    const totalPlanningLatency = session.metrics.planningLatency || 0;
    const averagePlanningLatency = planningSteps.length > 0 
      ? totalPlanningLatency / planningSteps.length 
      : 0;

    const qualityScore = this.assessPlanningQuality(session);
    
    const refinementCount = planningSteps.reduce((count, step) => {
      const plan = step.result?.plan;
      return count + (plan?.refinementCount || 0);
    }, 0);

    const routingDecisions = planningSteps.map(step => 
      step.result?.routingDecision?.router || 'unknown'
    );

    return {
      latency: averagePlanningLatency,
      qualityScore,
      refinementCount,
      routingDecisions
    };
  }

  /**
   * Analyze execution-specific performance
   */
  private analyzeExecutionPerformance(session: EvaluationSession): {
    latency: number;
    accuracyScore: number;
    adaptationCount: number;
    errorRate: number;
  } {
    const executionSteps = session.steps.filter(step => step.action === 'execution');
    
    const totalExecutionLatency = (session.totalLatency || 0) - (session.metrics.planningLatency || 0);
    const averageExecutionLatency = executionSteps.length > 0 
      ? totalExecutionLatency / executionSteps.length 
      : 0;

    const successfulExecutions = executionSteps.filter(step => 
      step.result?.success !== false
    ).length;
    const accuracyScore = executionSteps.length > 0 
      ? successfulExecutions / executionSteps.length 
      : 0;

    const adaptationCount = executionSteps.reduce((count, step) => 
      count + (step.result?.adaptations?.length || 0), 0
    );

    const errorRate = session.errors.length / Math.max(1, session.steps.length);

    return {
      latency: averageExecutionLatency,
      accuracyScore,
      adaptationCount,
      errorRate
    };
  }

  /**
   * Analyze cognitive-specific performance
   */
  private analyzeCognitivePerformance(session: EvaluationSession, scenario: Scenario): {
    memoryUtilization: number;
    reasoningDepth: number;
    coherenceScore: number;
    creativityScore: number;
  } {
    const memoryUtilization = this.assessMemoryUtilization(session, scenario);
    const reasoningDepth = this.assessReasoningDepth(session);
    const coherenceScore = this.assessCoherence(session);
    const creativityScore = this.assessCreativity(session, scenario);

    return {
      memoryUtilization,
      reasoningDepth,
      coherenceScore,
      creativityScore
    };
  }

  /**
   * Assess planning quality based on plan characteristics
   */
  private assessPlanningQuality(session: EvaluationSession): number {
    const planningSteps = session.steps.filter(step => step.action === 'planning');
    
    if (planningSteps.length === 0) return 0;

    let totalQuality = 0;
    let validPlans = 0;

    for (const step of planningSteps) {
      const plan = step.result?.plan;
      if (plan) {
        validPlans++;
        
        // Quality factors
        let quality = 0;
        
        // Plan confidence
        quality += (plan.confidence || 0) * 0.4;
        
        // Plan structure (appropriate number of steps)
        const nodeCount = plan.nodes?.length || 0;
        const structureScore = nodeCount > 0 && nodeCount <= 10 ? 0.3 : 0.1;
        quality += structureScore;
        
        // Refinement appropriateness
        const refinements = plan.refinementCount || 0;
        const refinementScore = refinements > 0 && refinements <= 3 ? 0.3 : 0.1;
        quality += refinementScore;
        
        totalQuality += quality;
      }
    }

    return validPlans > 0 ? totalQuality / validPlans : 0;
  }

  /**
   * Assess adaptability based on response to changing conditions
   */
  private assessAdaptability(session: EvaluationSession, scenario: Scenario): number {
    // Look for evidence of strategy changes or adaptation
    const planningSteps = session.steps.filter(step => step.action === 'planning');
    
    if (planningSteps.length < 2) return 0.5; // Neutral if not enough data

    // Check for routing decision changes (adaptation to different task types)
    const routingDecisions = planningSteps.map(step => 
      step.result?.routingDecision?.router
    ).filter(Boolean);

    const uniqueRouters = new Set(routingDecisions).size;
    const adaptabilityFromRouting = Math.min(1.0, uniqueRouters / 3); // Max score for using 3+ routers

    // Check for plan refinements (internal adaptation)
    const totalRefinements = planningSteps.reduce((sum, step) => 
      sum + (step.result?.plan?.refinementCount || 0), 0
    );
    const adaptabilityFromRefinement = Math.min(1.0, totalRefinements / 5); // Max score for 5+ refinements

    return (adaptabilityFromRouting + adaptabilityFromRefinement) / 2;
  }

  /**
   * Assess memory utilization efficiency
   */
  private assessMemoryUtilization(session: EvaluationSession, scenario: Scenario): number {
    // Placeholder - would integrate with actual memory system metrics
    const memoryRequiredScenario = scenario.requiresMemory;
    const stepsWithMemoryAccess = session.steps.filter(step => 
      step.parameters?.memory || step.result?.memoryAccess
    ).length;
    
    if (!memoryRequiredScenario) return 1.0; // Full score if memory not required
    
    const memoryUtilization = stepsWithMemoryAccess / Math.max(1, session.steps.length);
    return Math.min(1.0, memoryUtilization * 2); // Scale appropriately
  }

  /**
   * Assess reasoning depth and complexity
   */
  private assessReasoningDepth(session: EvaluationSession): number {
    const stepsWithReasoning = session.steps.filter(step => 
      step.reasoning && step.reasoning.length > 20
    );
    
    const averageReasoningLength = stepsWithReasoning.length > 0
      ? stepsWithReasoning.reduce((sum, step) => sum + step.reasoning!.length, 0) / stepsWithReasoning.length
      : 0;
    
    // Normalize reasoning length to 0-1 score
    return Math.min(1.0, averageReasoningLength / 200);
  }

  /**
   * Assess logical coherence across steps
   */
  private assessCoherence(session: EvaluationSession): number {
    // Simple coherence check based on error patterns and consistency
    const totalSteps = session.steps.length;
    const errorSteps = session.errors.length;
    
    if (totalSteps === 0) return 0;
    
    const errorRate = errorSteps / totalSteps;
    return Math.max(0, 1 - errorRate * 2); // Penalize errors
  }

  /**
   * Assess creativity and novel problem-solving approaches
   */
  private assessCreativity(session: EvaluationSession, scenario: Scenario): number {
    // For creative domains, assess novelty
    if (scenario.domain === 'creative' || scenario.complexity === 'emergent') {
      // Look for non-standard approaches or routing decisions
      const routingDecisions = session.steps
        .filter(step => step.action === 'planning')
        .map(step => step.result?.routingDecision?.router);
      
      const usedCollaborative = routingDecisions.includes('collaborative');
      const routerVariety = new Set(routingDecisions).size;
      
      return (usedCollaborative ? 0.5 : 0) + Math.min(0.5, routerVariety / 3);
    }
    
    return 0.5; // Neutral for non-creative scenarios
  }

  /**
   * Generate qualitative assessment
   */
  private generateQualitativeAssessment(
    metrics: MetricResult[],
    planningPerformance: any,
    executionPerformance: any,
    cognitivePerformance: any
  ): { strengths: string[]; weaknesses: string[]; recommendations: string[] } {
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const recommendations: string[] = [];

    // Analyze metrics for strengths and weaknesses
    metrics.forEach(metric => {
      if (metric.value >= 0.8) {
        strengths.push(`Strong ${metric.type.replace('_', ' ')}: ${metric.description}`);
      } else if (metric.value <= 0.4) {
        weaknesses.push(`Weak ${metric.type.replace('_', ' ')}: ${metric.description}`);
      }
    });

    // Planning-specific insights
    if (planningPerformance.qualityScore >= 0.8) {
      strengths.push('High-quality planning with appropriate refinement');
    } else if (planningPerformance.qualityScore <= 0.4) {
      weaknesses.push('Poor planning quality or insufficient refinement');
      recommendations.push('Improve plan generation and refinement strategies');
    }

    // Execution-specific insights
    if (executionPerformance.accuracyScore >= 0.9) {
      strengths.push('Highly accurate execution with minimal errors');
    } else if (executionPerformance.accuracyScore <= 0.6) {
      weaknesses.push('Frequent execution errors or failures');
      recommendations.push('Enhance execution monitoring and error recovery');
    }

    // Cognitive-specific insights
    if (cognitivePerformance.reasoningDepth >= 0.7) {
      strengths.push('Deep reasoning with detailed justifications');
    } else if (cognitivePerformance.reasoningDepth <= 0.3) {
      weaknesses.push('Shallow reasoning with insufficient justification');
      recommendations.push('Encourage more detailed reasoning and explanation');
    }

    return { strengths, weaknesses, recommendations };
  }

  /**
   * Generate performance profile for an agent across multiple sessions
   */
  generatePerformanceProfile(agentId: string): PerformanceProfile {
    const agentSessions = this.sessionHistory.filter(session => session.agentId === agentId);
    
    if (agentSessions.length === 0) {
      throw new Error(`No sessions found for agent ${agentId}`);
    }

    // Calculate overall metrics
    const successfulSessions = agentSessions.filter(session => session.success).length;
    const successRate = successfulSessions / agentSessions.length;
    
    const totalLatency = agentSessions.reduce((sum, session) => 
      sum + (session.totalLatency || 0), 0
    );
    const averageLatency = totalLatency / agentSessions.length;

    // Group by domain and complexity
    const domainPerformance = this.groupPerformanceByDomain(agentSessions);
    const complexityPerformance = this.groupPerformanceByComplexity(agentSessions);

    // Analyze strengths and weaknesses
    const strengthsAndWeaknesses = this.analyzeAgentStrengthsWeaknesses(agentSessions);

    // Calculate improvement trends
    const improvementTrends = this.calculateImprovementTrends(agentSessions);

    return {
      agentId,
      totalSessions: agentSessions.length,
      successRate,
      averageLatency,
      domainPerformance,
      complexityPerformance,
      strengthsAndWeaknesses,
      improvementTrends
    };
  }

  /**
   * Group performance by reasoning domain
   */
  private groupPerformanceByDomain(sessions: EvaluationSession[]): Record<string, {
    successRate: number;
    averageScore: number;
    averageLatency: number;
    sessionCount: number;
  }> {
    const domainGroups: Record<string, EvaluationSession[]> = {};
    
    sessions.forEach(session => {
      const scenario = this.scenarioLibrary.get(session.scenarioId);
      if (scenario) {
        const domain = scenario.domain;
        if (!domainGroups[domain]) domainGroups[domain] = [];
        domainGroups[domain].push(session);
      }
    });

    const result: Record<string, any> = {};
    Object.keys(domainGroups).forEach(domain => {
      const domainSessions = domainGroups[domain];
      const successCount = domainSessions.filter(s => s.success).length;
      const totalLatency = domainSessions.reduce((sum, s) => sum + (s.totalLatency || 0), 0);
      
      result[domain] = {
        successRate: successCount / domainSessions.length,
        averageScore: successCount / domainSessions.length, // Simplified score
        averageLatency: totalLatency / domainSessions.length,
        sessionCount: domainSessions.length
      };
    });

    return result;
  }

  /**
   * Group performance by complexity level
   */
  private groupPerformanceByComplexity(sessions: EvaluationSession[]): Record<string, {
    successRate: number;
    averageScore: number;
    sessionCount: number;
  }> {
    const complexityGroups: Record<string, EvaluationSession[]> = {};
    
    sessions.forEach(session => {
      const scenario = this.scenarioLibrary.get(session.scenarioId);
      if (scenario) {
        const complexity = scenario.complexity;
        if (!complexityGroups[complexity]) complexityGroups[complexity] = [];
        complexityGroups[complexity].push(session);
      }
    });

    const result: Record<string, any> = {};
    Object.keys(complexityGroups).forEach(complexity => {
      const complexitySessions = complexityGroups[complexity];
      const successCount = complexitySessions.filter(s => s.success).length;
      
      result[complexity] = {
        successRate: successCount / complexitySessions.length,
        averageScore: successCount / complexitySessions.length,
        sessionCount: complexitySessions.length
      };
    });

    return result;
  }

  /**
   * Analyze agent strengths and weaknesses across sessions
   */
  private analyzeAgentStrengthsWeaknesses(sessions: EvaluationSession[]): {
    strengths: MetricType[];
    weaknesses: MetricType[];
    recommendations: string[];
  } {
    // Aggregate performance across all metric types
    const metricPerformance: Record<MetricType, number[]> = {} as any;

    sessions.forEach(session => {
      // Generate evaluation results to get metrics
      const scenario = this.scenarioLibrary.get(session.scenarioId);
      if (scenario) {
        const results = this.generateEvaluationResults(session);
        results.metrics.forEach(metric => {
          if (!metricPerformance[metric.type]) metricPerformance[metric.type] = [];
          metricPerformance[metric.type].push(metric.value);
        });
      }
    });

    // Calculate average performance per metric
    const averagePerformance: Record<MetricType, number> = {} as any;
    Object.keys(metricPerformance).forEach(metricType => {
      const values = metricPerformance[metricType as MetricType];
      averagePerformance[metricType as MetricType] = values.reduce((sum, val) => sum + val, 0) / values.length;
    });

    // Identify strengths (>0.7) and weaknesses (<0.4)
    const strengths = Object.keys(averagePerformance)
      .filter(metric => averagePerformance[metric as MetricType] > 0.7)
      .map(metric => metric as MetricType);

    const weaknesses = Object.keys(averagePerformance)
      .filter(metric => averagePerformance[metric as MetricType] < 0.4)
      .map(metric => metric as MetricType);

    // Generate recommendations based on weaknesses
    const recommendations: string[] = [];
    if (weaknesses.includes('planning_quality')) {
      recommendations.push('Focus on improving plan generation and refinement mechanisms');
    }
    if (weaknesses.includes('latency')) {
      recommendations.push('Optimize processing speed and decision-making latency');
    }
    if (weaknesses.includes('consistency')) {
      recommendations.push('Enhance error handling and improve execution reliability');
    }

    return { strengths, weaknesses, recommendations };
  }

  /**
   * Calculate improvement trends over time
   */
  private calculateImprovementTrends(sessions: EvaluationSession[]): {
    metric: MetricType;
    trend: 'improving' | 'declining' | 'stable';
    confidence: number;
  }[] {
    // Sort sessions by timestamp
    const sortedSessions = sessions.sort((a, b) => a.startTime - b.startTime);
    
    if (sortedSessions.length < 3) {
      return []; // Not enough data for trend analysis
    }

    // For each metric type, calculate trend
    const trends: { metric: MetricType; trend: 'improving' | 'declining' | 'stable'; confidence: number }[] = [];
    const metricTypes: MetricType[] = ['success_rate', 'latency', 'efficiency', 'planning_quality', 'consistency'];

    metricTypes.forEach(metricType => {
      const values: number[] = [];
      
      sortedSessions.forEach(session => {
        const scenario = this.scenarioLibrary.get(session.scenarioId);
        if (scenario) {
          const results = this.generateEvaluationResults(session);
          const metric = results.metrics.find(m => m.type === metricType);
          if (metric) values.push(metric.value);
        }
      });

      if (values.length >= 3) {
        const trend = this.calculateLinearTrend(values);
        trends.push({
          metric: metricType,
          trend: trend.slope > 0.05 ? 'improving' : trend.slope < -0.05 ? 'declining' : 'stable',
          confidence: Math.abs(trend.correlation)
        });
      }
    });

    return trends;
  }

  /**
   * Calculate linear trend for a series of values
   */
  private calculateLinearTrend(values: number[]): { slope: number; correlation: number } {
    const n = values.length;
    const indices = Array.from({ length: n }, (_, i) => i);
    
    const meanX = indices.reduce((sum, x) => sum + x, 0) / n;
    const meanY = values.reduce((sum, y) => sum + y, 0) / n;
    
    let numerator = 0;
    let denominatorX = 0;
    let denominatorY = 0;
    
    for (let i = 0; i < n; i++) {
      const deltaX = indices[i] - meanX;
      const deltaY = values[i] - meanY;
      numerator += deltaX * deltaY;
      denominatorX += deltaX * deltaX;
      denominatorY += deltaY * deltaY;
    }
    
    const slope = denominatorX !== 0 ? numerator / denominatorX : 0;
    const correlation = (denominatorX !== 0 && denominatorY !== 0) 
      ? numerator / Math.sqrt(denominatorX * denominatorY) 
      : 0;
    
    return { slope, correlation };
  }

  /**
   * Sanitize agent configuration for output
   */
  private sanitizeAgentConfig(config: AgentConfig): Record<string, any> {
    return {
      id: config.id,
      name: config.name,
      version: config.version,
      enabledFeatures: config.enabledFeatures
    };
  }

  /**
   * Get summary statistics across all sessions
   */
  getSummaryStatistics(): {
    totalSessions: number;
    uniqueAgents: number;
    uniqueScenarios: number;
    overallSuccessRate: number;
    averageSessionDuration: number;
    domainDistribution: Record<string, number>;
    complexityDistribution: Record<string, number>;
  } {
    const totalSessions = this.sessionHistory.length;
    const uniqueAgents = new Set(this.sessionHistory.map(s => s.agentId)).size;
    const uniqueScenarios = new Set(this.sessionHistory.map(s => s.scenarioId)).size;
    
    const successfulSessions = this.sessionHistory.filter(s => s.success).length;
    const overallSuccessRate = totalSessions > 0 ? successfulSessions / totalSessions : 0;
    
    const totalDuration = this.sessionHistory.reduce((sum, s) => sum + (s.totalLatency || 0), 0);
    const averageSessionDuration = totalSessions > 0 ? totalDuration / totalSessions : 0;
    
    // Domain and complexity distributions
    const domainDistribution: Record<string, number> = {};
    const complexityDistribution: Record<string, number> = {};
    
    this.sessionHistory.forEach(session => {
      const scenario = this.scenarioLibrary.get(session.scenarioId);
      if (scenario) {
        domainDistribution[scenario.domain] = (domainDistribution[scenario.domain] || 0) + 1;
        complexityDistribution[scenario.complexity] = (complexityDistribution[scenario.complexity] || 0) + 1;
      }
    });

    return {
      totalSessions,
      uniqueAgents,
      uniqueScenarios,
      overallSuccessRate,
      averageSessionDuration,
      domainDistribution,
      complexityDistribution
    };
  }
}
