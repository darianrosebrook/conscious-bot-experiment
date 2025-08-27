/**
 * Minecraft Interface for Conscious Bot Planning System
 *
 * Main entry point for the Minecraft integration layer.
 *
 * @author @darianrosebrook
 */

// Core components
export { BotAdapter } from './bot-adapter';
export { ObservationMapper } from './observation-mapper';
export { ActionTranslator } from './action-translator';
export { PlanExecutor } from './plan-executor';
export { ChatProcessor } from './chat-processor';
export { MemoryIntegrationService } from './memory-integration';
export type {
  BotConfig,
  MinecraftWorldState,
  MinecraftAction,
  ActionResult,
  BotEvent,
  BotEventType,
  SimulationState,
} from './types';

// Standalone interface (no planning system dependency)
export {
  StandaloneMinecraftInterface,
  createStandaloneMinecraftInterface,
  DEFAULT_STANDALONE_CONFIG,
} from './standalone';

// Simple interface (minimal dependencies)
export {
  SimpleMinecraftInterface,
  createSimpleMinecraftInterface,
  DEFAULT_SIMPLE_CONFIG,
  SimpleBotConfig,
  SimpleGameState,
  SimpleAction,
} from './standalone-simple';

// Simulation stub for offline testing
export {
  SimulatedMinecraftInterface,
  createSimulatedMinecraftInterface,
  DEFAULT_SIMULATION_CONFIG,
  SimulationConfig,
  SimulatedGameState,
} from './simulation-stub';

// Types
export * from './types';

// Leaf implementations
export * from './leaves/movement-leaves';
export * from './leaves/interaction-leaves';
export * from './leaves/sensing-leaves';
export * from './leaves/crafting-leaves';

// Utility functions
export { createDefaultBotConfig, validateBotConfig } from './utils';

// Hybrid Arbiter Integration
export {
  HybridArbiterIntegration,
  type HybridArbiterConfig,
  type GameStateSnapshot,
  type SignalGenerationResult,
} from './hybrid-arbiter-integration';

// Action Executor
export {
  ActionExecutor,
  type ActionPlan,
  type ExecutionResult,
} from './action-executor';

// Factory function for quick setup
import { BotAdapter } from './bot-adapter';
import { ObservationMapper } from './observation-mapper';
import { ActionTranslator } from './action-translator';
import { PlanExecutor } from './plan-executor';
import { BotConfig } from './types';
import { IntegratedPlanningCoordinator } from '@conscious-bot/planning';

/**
 * Create a fully configured Minecraft interface
 */
export async function createMinecraftInterface(
  config: BotConfig,
  planningCoordinator: IntegratedPlanningCoordinator
): Promise<{
  botAdapter: BotAdapter;
  observationMapper: ObservationMapper;
  planExecutor: PlanExecutor;
}> {
  const observationMapper = new ObservationMapper(config);
  const planExecutor = new PlanExecutor(config, planningCoordinator);

  // Initialize the plan executor (which handles bot connection)
  await planExecutor.initialize();

  // Use the bot adapter from the plan executor to ensure consistency
  const botAdapter = (planExecutor as any).botAdapter;

  return {
    botAdapter,
    observationMapper,
    planExecutor,
  };
}

/**
 * Create a Minecraft interface without auto-connecting
 */
export async function createMinecraftInterfaceWithoutConnect(
  config: BotConfig,
  planningCoordinator: IntegratedPlanningCoordinator
): Promise<{
  botAdapter: BotAdapter;
  observationMapper: ObservationMapper;
  planExecutor: PlanExecutor;
}> {
  const observationMapper = new ObservationMapper(config);
  const planExecutor = new PlanExecutor(config, planningCoordinator);

  // Don't initialize (which would auto-connect)
  // await planExecutor.initialize();

  // Use the bot adapter from the plan executor to ensure consistency
  const botAdapter = (planExecutor as any).botAdapter;

  return {
    botAdapter,
    observationMapper,
    planExecutor,
  };
}

/**
 * Quick interface for simple scenarios
 */
export async function runMinecraftScenario(
  config: BotConfig,
  scenario: {
    name: string;
    signals: any[];
    timeout?: number;
  }
): Promise<any> {
  const { createIntegratedPlanningCoordinator } = await import(
    '@conscious-bot/planning'
  );

  const planningCoordinator = createIntegratedPlanningCoordinator({
    coordinatorConfig: {
      routingStrategy: 'adaptive',
      fallbackTimeout: scenario.timeout || 30000,
      enablePlanMerging: true,
      enableCrossValidation: false,
    },
  });

  const minecraftInterface = await createMinecraftInterface(
    config,
    planningCoordinator
  );

  try {
    const result = await minecraftInterface.planExecutor.executePlanningCycle(
      scenario.signals
    );

    return {
      scenario: scenario.name,
      success: result.success,
      executionTime: result.endTime - result.startTime,
      stepsExecuted: result.executedSteps,
      totalSteps: result.totalSteps,
      repairAttempts: result.repairAttempts,
      error: result.error,
    };
  } finally {
    await minecraftInterface.planExecutor.shutdown();
  }
}
