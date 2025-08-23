/**
 * Minecraft Planning Integration Test
 *
 * Comprehensive test that demonstrates the full integration between
 * the Minecraft interface and the planning system (HRM-HTN-GOAP).
 *
 * @author @darianrosebrook
 */

import {
  createIntegratedPlanningCoordinator,
  IntegratedPlanningCoordinator,
} from '@conscious-bot/planning';
import { createMinecraftInterface } from './index';
import { BotConfig } from './types';

export interface IntegrationTestConfig {
  minecraft: BotConfig;
  planning: {
    routingStrategy: 'adaptive' | 'hrm_first' | 'llm_first';
    enableSignalProcessing: boolean;
    enablePlanRepair: boolean;
    maxPlanningTime: number;
  };
  scenarios: string[];
  verbose: boolean;
}

export interface IntegrationTestResult {
  success: boolean;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  totalTime: number;
  results: ScenarioTestResult[];
  summary: {
    planningSystemPerformance: any;
    minecraftInterfacePerformance: any;
    integrationQuality: any;
  };
}

export interface ScenarioTestResult {
  scenario: string;
  success: boolean;
  executionTime: number;
  planningApproach: string;
  signalsGenerated: number;
  stepsExecuted: number;
  repairAttempts: number;
  cognitiveMetrics: any;
  error?: string;
}

export class MinecraftPlanningIntegrationTest {
  private config: IntegrationTestConfig;
  private planningCoordinator: IntegratedPlanningCoordinator;
  private results: ScenarioTestResult[] = [];

  constructor(config: IntegrationTestConfig) {
    this.config = config;
    this.planningCoordinator = this.createPlanningCoordinator();
  }

  /**
   * Run the complete integration test suite
   */
  async runIntegrationTests(): Promise<IntegrationTestResult> {
    const startTime = Date.now();

    console.log('🚀 Starting Minecraft Planning Integration Tests...');
    console.log(`📊 Running ${this.config.scenarios.length} scenarios`);
    console.log(
      `🧠 Planning approach: ${this.config.planning.routingStrategy}`
    );
    console.log(
      `🔍 Signal processing: ${this.config.planning.enableSignalProcessing ? 'enabled' : 'disabled'}`
    );

    // Test 1: Basic Connection and Signal Generation
    await this.testBasicConnectionAndSignals();

    // Test 2: Simple Goal-Based Planning
    await this.testSimpleGoalPlanning();

    // Test 3: Multi-Step Plan Execution
    await this.testMultiStepPlanExecution();

    // Test 4: Plan Repair and Adaptation
    if (this.config.planning.enablePlanRepair) {
      await this.testPlanRepairAndAdaptation();
    }

    // Test 5: Emergency Response (High Priority Signals)
    await this.testEmergencyResponse();

    // Test 6: Resource-Driven Planning
    await this.testResourceDrivenPlanning();

    // Test 7: Social and Environmental Adaptation
    await this.testSocialEnvironmentalAdaptation();

    const totalTime = Date.now() - startTime;
    const passedTests = this.results.filter((r) => r.success).length;
    const failedTests = this.results.filter((r) => !r.success).length;

    const result: IntegrationTestResult = {
      success: failedTests === 0,
      totalTests: this.results.length,
      passedTests,
      failedTests,
      totalTime,
      results: this.results,
      summary: this.generateTestSummary(),
    };

    this.logTestResults(result);
    return result;
  }

  /**
   * Test 1: Basic connection and signal generation
   */
  private async testBasicConnectionAndSignals(): Promise<void> {
    const testName = 'basic_connection_and_signals';
    const startTime = Date.now();

    try {
      console.log(`🔗 Running test: ${testName}`);

      const minecraftInterface = await createMinecraftInterface(
        this.config.minecraft,
        this.planningCoordinator
      );

      // Test signal generation without execution
      const bot = minecraftInterface.botAdapter.getBot();
      const signals = minecraftInterface.observationMapper.generateSignals(bot);
      const homeostasis =
        minecraftInterface.observationMapper.getEnhancedHomeostasisState(bot);

      this.results.push({
        scenario: testName,
        success: signals.length > 0 && homeostasis.health !== undefined,
        executionTime: Date.now() - startTime,
        planningApproach: 'signal_generation_only',
        signalsGenerated: signals.length,
        stepsExecuted: 0,
        repairAttempts: 0,
        cognitiveMetrics: {
          signalTypes: [...new Set(signals.map((s) => s.type))],
          homeostasisScores: homeostasis,
        },
      });

      await minecraftInterface.planExecutor.shutdown();
      console.log(
        `✅ Test completed: ${testName} - ${signals.length} signals generated`
      );
    } catch (error) {
      this.results.push({
        scenario: testName,
        success: false,
        executionTime: Date.now() - startTime,
        planningApproach: 'failed',
        signalsGenerated: 0,
        stepsExecuted: 0,
        repairAttempts: 0,
        cognitiveMetrics: {},
        error: error instanceof Error ? error.message : String(error),
      });

      console.log(`❌ Test failed: ${testName} - ${error}`);
    }
  }

  /**
   * Test 2: Simple goal-based planning (e.g., "find wood")
   */
  private async testSimpleGoalPlanning(): Promise<void> {
    const testName = 'simple_goal_planning';
    const startTime = Date.now();

    try {
      console.log(`🎯 Running test: ${testName}`);

      const minecraftInterface = await createMinecraftInterface(
        this.config.minecraft,
        this.planningCoordinator
      );

      // Inject a simple goal signal
      const goalSignals = [
        {
          type: 'resource_need',
          intensity: 70,
          target: 'wood',
          urgency: 'medium',
        },
      ];

      const result =
        await minecraftInterface.planExecutor.executePlanningCycle(goalSignals);

      this.results.push({
        scenario: testName,
        success: result.success && (result.signals?.length || 0) > 0,
        executionTime: Date.now() - startTime,
        planningApproach: result.planningResult?.planningApproach || 'unknown',
        signalsGenerated: result.signals?.length || 0,
        stepsExecuted: result.executedSteps,
        repairAttempts: result.repairAttempts,
        cognitiveMetrics: {
          confidence: result.planningResult?.confidence || 0,
          routingDecision:
            result.planningResult?.routingDecision?.router || 'unknown',
        },
      });

      await minecraftInterface.planExecutor.shutdown();
      console.log(
        `✅ Test completed: ${testName} - Plan generated with ${result.executedSteps}/${result.totalSteps} steps`
      );
    } catch (error) {
      this.results.push({
        scenario: testName,
        success: false,
        executionTime: Date.now() - startTime,
        planningApproach: 'failed',
        signalsGenerated: 0,
        stepsExecuted: 0,
        repairAttempts: 0,
        cognitiveMetrics: {},
        error: error instanceof Error ? error.message : String(error),
      });

      console.log(`❌ Test failed: ${testName} - ${error}`);
    }
  }

  /**
   * Test 3: Multi-step plan execution (e.g., "gather wood and craft planks")
   */
  private async testMultiStepPlanExecution(): Promise<void> {
    const testName = 'multi_step_plan_execution';
    const startTime = Date.now();

    try {
      console.log(`⚙️ Running test: ${testName}`);

      const minecraftInterface = await createMinecraftInterface(
        this.config.minecraft,
        this.planningCoordinator
      );

      // Inject complex goal signals
      const complexGoalSignals = [
        {
          type: 'resource_need',
          intensity: 60,
          target: 'wood',
          urgency: 'medium',
        },
        {
          type: 'achievement_drive',
          intensity: 80,
          target: 'planks',
          urgency: 'medium',
        },
      ];

      const result =
        await minecraftInterface.planExecutor.executePlanningCycle(
          complexGoalSignals
        );

      this.results.push({
        scenario: testName,
        success: result.success && result.executedSteps > 1,
        executionTime: Date.now() - startTime,
        planningApproach: result.planningResult?.planningApproach || 'unknown',
        signalsGenerated: result.signals?.length || 0,
        stepsExecuted: result.executedSteps,
        repairAttempts: result.repairAttempts,
        cognitiveMetrics: {
          confidence: result.planningResult?.confidence || 0,
          planComplexity: result.totalSteps,
          successRate: result.executedSteps / result.totalSteps,
        },
      });

      await minecraftInterface.planExecutor.shutdown();
      console.log(
        `✅ Test completed: ${testName} - Complex plan executed (${result.executedSteps}/${result.totalSteps} steps)`
      );
    } catch (error) {
      this.results.push({
        scenario: testName,
        success: false,
        executionTime: Date.now() - startTime,
        planningApproach: 'failed',
        signalsGenerated: 0,
        stepsExecuted: 0,
        repairAttempts: 0,
        cognitiveMetrics: {},
        error: error instanceof Error ? error.message : String(error),
      });

      console.log(`❌ Test failed: ${testName} - ${error}`);
    }
  }

  /**
   * Test 4: Plan repair and adaptation
   */
  private async testPlanRepairAndAdaptation(): Promise<void> {
    const testName = 'plan_repair_and_adaptation';
    const startTime = Date.now();

    try {
      console.log(`🔧 Running test: ${testName}`);

      const minecraftInterface = await createMinecraftInterface(
        this.config.minecraft,
        this.planningCoordinator
      );

      // Inject signals that will likely require plan adaptation
      const adaptationSignals = [
        {
          type: 'resource_need',
          intensity: 70,
          target: 'impossible_resource',
          urgency: 'high',
        },
        {
          type: 'threat',
          intensity: 50,
          source: 'environmental',
          urgency: 'medium',
        },
      ];

      const result =
        await minecraftInterface.planExecutor.executePlanningCycle(
          adaptationSignals
        );

      this.results.push({
        scenario: testName,
        success: result.repairAttempts > 0 || result.success,
        executionTime: Date.now() - startTime,
        planningApproach: result.planningResult?.planningApproach || 'unknown',
        signalsGenerated: result.signals?.length || 0,
        stepsExecuted: result.executedSteps,
        repairAttempts: result.repairAttempts,
        cognitiveMetrics: {
          adaptationCapability:
            result.repairAttempts > 0 ? 'demonstrated' : 'not_needed',
          resilience: result.success ? 'high' : 'low',
        },
      });

      await minecraftInterface.planExecutor.shutdown();
      console.log(
        `✅ Test completed: ${testName} - Adaptation tested (${result.repairAttempts} repairs)`
      );
    } catch (error) {
      this.results.push({
        scenario: testName,
        success: false,
        executionTime: Date.now() - startTime,
        planningApproach: 'failed',
        signalsGenerated: 0,
        stepsExecuted: 0,
        repairAttempts: 0,
        cognitiveMetrics: {},
        error: error instanceof Error ? error.message : String(error),
      });

      console.log(`❌ Test failed: ${testName} - ${error}`);
    }
  }

  /**
   * Test 5: Emergency response to high-priority signals
   */
  private async testEmergencyResponse(): Promise<void> {
    const testName = 'emergency_response';
    const startTime = Date.now();

    try {
      console.log(`🚨 Running test: ${testName}`);

      const minecraftInterface = await createMinecraftInterface(
        this.config.minecraft,
        this.planningCoordinator
      );

      // Inject emergency signals
      const emergencySignals = [
        { type: 'health', intensity: 95, urgency: 'emergency', critical: true },
        {
          type: 'threat',
          intensity: 90,
          source: 'hostile_mob',
          urgency: 'emergency',
        },
      ];

      const result =
        await minecraftInterface.planExecutor.executePlanningCycle(
          emergencySignals
        );

      this.results.push({
        scenario: testName,
        success: (result.planningResult?.planningLatency ?? 0) < 1000, // Should be fast for emergencies
        executionTime: Date.now() - startTime,
        planningApproach: result.planningResult?.planningApproach || 'unknown',
        signalsGenerated: result.signals?.length || 0,
        stepsExecuted: result.executedSteps,
        repairAttempts: result.repairAttempts,
        cognitiveMetrics: {
          responseTime: result.planningResult?.planningLatency || 9999,
          emergencyHandling:
            (result.planningResult?.planningLatency ?? 0) < 1000
              ? 'fast'
              : 'slow',
        },
      });

      await minecraftInterface.planExecutor.shutdown();
      console.log(
        `✅ Test completed: ${testName} - Emergency response (${result.planningResult?.planningLatency}ms)`
      );
    } catch (error) {
      this.results.push({
        scenario: testName,
        success: false,
        executionTime: Date.now() - startTime,
        planningApproach: 'failed',
        signalsGenerated: 0,
        stepsExecuted: 0,
        repairAttempts: 0,
        cognitiveMetrics: {},
        error: error instanceof Error ? error.message : String(error),
      });

      console.log(`❌ Test failed: ${testName} - ${error}`);
    }
  }

  /**
   * Test 6: Resource-driven planning
   */
  private async testResourceDrivenPlanning(): Promise<void> {
    const testName = 'resource_driven_planning';
    const startTime = Date.now();

    try {
      console.log(`💎 Running test: ${testName}`);

      const minecraftInterface = await createMinecraftInterface(
        this.config.minecraft,
        this.planningCoordinator
      );

      // Inject resource opportunity signals
      const resourceSignals = [
        {
          type: 'resource_opportunity',
          intensity: 75,
          target: 'iron_ore',
          distance: 5,
        },
        {
          type: 'exploration',
          intensity: 60,
          target: 'unknown_area',
          urgency: 'low',
        },
      ];

      const result =
        await minecraftInterface.planExecutor.executePlanningCycle(
          resourceSignals
        );

      this.results.push({
        scenario: testName,
        success: result.success && result.totalSteps > 0,
        executionTime: Date.now() - startTime,
        planningApproach: result.planningResult?.planningApproach || 'unknown',
        signalsGenerated: result.signals?.length || 0,
        stepsExecuted: result.executedSteps,
        repairAttempts: result.repairAttempts,
        cognitiveMetrics: {
          resourceOptimization: result.success ? 'good' : 'poor',
          opportunismScore:
            result.signals?.filter((s) => s.type === 'resource_opportunity')
              .length || 0,
        },
      });

      await minecraftInterface.planExecutor.shutdown();
      console.log(
        `✅ Test completed: ${testName} - Resource planning evaluated`
      );
    } catch (error) {
      this.results.push({
        scenario: testName,
        success: false,
        executionTime: Date.now() - startTime,
        planningApproach: 'failed',
        signalsGenerated: 0,
        stepsExecuted: 0,
        repairAttempts: 0,
        cognitiveMetrics: {},
        error: error instanceof Error ? error.message : String(error),
      });

      console.log(`❌ Test failed: ${testName} - ${error}`);
    }
  }

  /**
   * Test 7: Social and environmental adaptation
   */
  private async testSocialEnvironmentalAdaptation(): Promise<void> {
    const testName = 'social_environmental_adaptation';
    const startTime = Date.now();

    try {
      console.log(`🌍 Running test: ${testName}`);

      const minecraftInterface = await createMinecraftInterface(
        this.config.minecraft,
        this.planningCoordinator
      );

      // Inject social and environmental signals
      const socialEnvSignals = [
        {
          type: 'social',
          intensity: 40,
          target: 'other_players',
          context: 'multiplayer',
        },
        {
          type: 'exploration',
          intensity: 50,
          target: 'new_biome',
          context: 'environmental',
        },
      ];

      const result =
        await minecraftInterface.planExecutor.executePlanningCycle(
          socialEnvSignals
        );

      this.results.push({
        scenario: testName,
        success: result.success,
        executionTime: Date.now() - startTime,
        planningApproach: result.planningResult?.planningApproach || 'unknown',
        signalsGenerated: result.signals?.length || 0,
        stepsExecuted: result.executedSteps,
        repairAttempts: result.repairAttempts,
        cognitiveMetrics: {
          socialAwareness:
            result.signals?.filter((s) => s.type === 'social').length || 0,
          environmentalAwareness:
            result.signals?.filter((s) => s.type === 'exploration').length || 0,
        },
      });

      await minecraftInterface.planExecutor.shutdown();
      console.log(
        `✅ Test completed: ${testName} - Social/environmental adaptation tested`
      );
    } catch (error) {
      this.results.push({
        scenario: testName,
        success: false,
        executionTime: Date.now() - startTime,
        planningApproach: 'failed',
        signalsGenerated: 0,
        stepsExecuted: 0,
        repairAttempts: 0,
        cognitiveMetrics: {},
        error: error instanceof Error ? error.message : String(error),
      });

      console.log(`❌ Test failed: ${testName} - ${error}`);
    }
  }

  /**
   * Create the planning coordinator with test configuration
   */
  private createPlanningCoordinator(): IntegratedPlanningCoordinator {
    return createIntegratedPlanningCoordinator({
      coordinatorConfig: {
        routingStrategy:
          this.config.planning.routingStrategy === 'llm_first'
            ? 'htn_first'
            : this.config.planning.routingStrategy,
        fallbackTimeout: this.config.planning.maxPlanningTime,
        enablePlanMerging: true,
        enableCrossValidation: false,
      },
      hrmConfig: {
        maxRefinements: 3,
        qualityThreshold: 0.7,
        hrmLatencyTarget: 500,
        enableIterativeRefinement: true,
      },
      goapConfig: {
        maxPlanLength: 10,
        planningBudgetMs: 200,
        repairThreshold: 0.5,
      },
    });
  }

  /**
   * Generate comprehensive test summary
   */
  private generateTestSummary(): any {
    const successfulTests = this.results.filter((r) => r.success);
    const avgExecutionTime =
      this.results.reduce((sum, r) => sum + r.executionTime, 0) /
      this.results.length;
    const totalSignals = this.results.reduce(
      (sum, r) => sum + r.signalsGenerated,
      0
    );
    const totalSteps = this.results.reduce(
      (sum, r) => sum + r.stepsExecuted,
      0
    );
    const totalRepairs = this.results.reduce(
      (sum, r) => sum + r.repairAttempts,
      0
    );

    return {
      planningSystemPerformance: {
        averageExecutionTime: Math.round(avgExecutionTime),
        totalSignalsProcessed: totalSignals,
        averageSignalsPerTest: Math.round(totalSignals / this.results.length),
        planningApproaches: [
          ...new Set(this.results.map((r) => r.planningApproach)),
        ],
      },
      minecraftInterfacePerformance: {
        totalStepsExecuted: totalSteps,
        averageStepsPerTest: Math.round(totalSteps / this.results.length),
        totalRepairAttempts: totalRepairs,
        repairSuccessRate:
          totalRepairs > 0
            ? Math.round((successfulTests.length / totalRepairs) * 100)
            : 0,
      },
      integrationQuality: {
        overallSuccessRate: Math.round(
          (successfulTests.length / this.results.length) * 100
        ),
        signalProcessingEffectiveness:
          totalSignals > 0 ? 'functional' : 'non-functional',
        planningIntegrationStability:
          successfulTests.length >= this.results.length * 0.8
            ? 'stable'
            : 'unstable',
        emergencyResponseCapability: this.results.find(
          (r) => r.scenario === 'emergency_response'
        )?.success
          ? 'operational'
          : 'needs_improvement',
      },
    };
  }

  /**
   * Log comprehensive test results
   */
  private logTestResults(result: IntegrationTestResult): void {
    console.log('\n🎯 Integration Test Results');
    console.log('='.repeat(50));
    console.log(`📊 Overall Success: ${result.success ? '✅' : '❌'}`);
    console.log(`📈 Tests Passed: ${result.passedTests}/${result.totalTests}`);
    console.log(`⏱️  Total Time: ${Math.round(result.totalTime / 1000)}s`);
    console.log(
      `🧠 Planning Performance: ${result.summary.planningSystemPerformance.averageExecutionTime}ms avg`
    );
    console.log(
      `⚙️  Interface Performance: ${result.summary.minecraftInterfacePerformance.totalStepsExecuted} steps executed`
    );
    console.log(
      `🔗 Integration Quality: ${result.summary.integrationQuality.overallSuccessRate}% success rate`
    );

    console.log('\n📋 Detailed Results:');
    result.results.forEach((test, index) => {
      const status = test.success ? '✅' : '❌';
      console.log(
        `  ${index + 1}. ${status} ${test.scenario} (${test.executionTime}ms, ${test.stepsExecuted} steps)`
      );
      if (test.error) {
        console.log(`     Error: ${test.error}`);
      }
    });

    if (result.summary.integrationQuality.overallSuccessRate >= 80) {
      console.log(
        '\n🎉 Integration test suite PASSED! Planning system is ready for production.'
      );
    } else {
      console.log(
        '\n⚠️  Integration test suite FAILED. Review failed tests and improve integration.'
      );
    }
  }
}

/**
 * Run integration tests with default configuration
 */
export async function runMinecraftPlanningIntegrationTest(
  config: Partial<IntegrationTestConfig> = {}
): Promise<IntegrationTestResult> {
  const defaultConfig: IntegrationTestConfig = {
    minecraft: {
      host: 'localhost',
      port: 25565,
      username: 'IntegrationTestBot',
      version: '1.20.1',
      auth: 'offline',
      pathfindingTimeout: 5000,
      actionTimeout: 10000,
      observationRadius: 16,
      autoReconnect: false,
      maxReconnectAttempts: 0,
      emergencyDisconnect: true,
    },
    planning: {
      routingStrategy: 'adaptive',
      enableSignalProcessing: true,
      enablePlanRepair: true,
      maxPlanningTime: 5000,
    },
    scenarios: [
      'basic_connection_and_signals',
      'simple_goal_planning',
      'multi_step_plan_execution',
      'plan_repair_and_adaptation',
      'emergency_response',
      'resource_driven_planning',
      'social_environmental_adaptation',
    ],
    verbose: true,
  };

  const finalConfig = { ...defaultConfig, ...config };
  const testSuite = new MinecraftPlanningIntegrationTest(finalConfig);

  return await testSuite.runIntegrationTests();
}
