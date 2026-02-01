/**
 * Utility functions for Minecraft interface
 *
 * @author @darianrosebrook
 */

import { BotConfig } from './types';

/**
 * Create default bot configuration
 */
export function createDefaultBotConfig(): BotConfig {
  return {
    host: 'localhost',
    port: 25565,
    username: 'ConsciousBot',
    version: '1.21.9',
    auth: 'offline',

    pathfindingTimeout: 30000,
    actionTimeout: 10000,
    observationRadius: 16,

    autoReconnect: true,
    maxReconnectAttempts: 5,
    emergencyDisconnect: true,
  };
}

/**
 * Validate bot configuration
 */
export function validateBotConfig(config: Partial<BotConfig>): BotConfig {
  const defaults = createDefaultBotConfig();
  const validated = { ...defaults, ...config };

  // Validation rules
  if (!validated.host || validated.host.trim() === '') {
    throw new Error('Host cannot be empty');
  }

  if (validated.port < 1 || validated.port > 65535) {
    throw new Error('Port must be between 1 and 65535');
  }

  if (!validated.username || validated.username.trim() === '') {
    throw new Error('Username cannot be empty');
  }

  if (validated.username.length > 16) {
    throw new Error('Username cannot be longer than 16 characters');
  }

  if (validated.pathfindingTimeout < 1000) {
    throw new Error('Pathfinding timeout must be at least 1000ms');
  }

  if (validated.actionTimeout < 1000) {
    throw new Error('Action timeout must be at least 1000ms');
  }

  if (validated.observationRadius < 1 || validated.observationRadius > 32) {
    throw new Error('Observation radius must be between 1 and 32');
  }

  if (validated.maxReconnectAttempts < 0) {
    throw new Error('Max reconnect attempts cannot be negative');
  }

  return validated;
}

/**
 * Parse command line arguments for bot configuration
 */
export function parseBotConfigFromArgs(args: string[]): Partial<BotConfig> {
  const config: Partial<BotConfig> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--host':
        config.host = args[++i];
        break;
      case '--port':
        config.port = parseInt(args[++i]);
        break;
      case '--username':
        config.username = args[++i];
        break;
      case '--version':
        config.version = args[++i];
        break;
      case '--auth':
        config.auth = args[++i] as 'mojang' | 'offline';
        break;
      case '--timeout':
        const timeout = parseInt(args[++i]);
        config.pathfindingTimeout = timeout;
        config.actionTimeout = timeout / 3;
        break;
      case '--radius':
        config.observationRadius = parseInt(args[++i]);
        break;
    }
  }

  return config;
}

/**
 * Format telemetry data for console output
 */
export function formatTelemetryOutput(telemetry: any): string {
  const lines = [
    ` Planning: ${telemetry.planningLatency}ms`,
    ` Execution: ${telemetry.executionLatency}ms`,
    ` Total: ${telemetry.totalLatency}ms`,
    ``,
    ` Steps: ${telemetry.stepMetrics.succeeded}/${telemetry.stepMetrics.planned} succeeded`,
    ` Repairs: ${telemetry.stepMetrics.repaired}`,
    ` Approach: ${telemetry.cognitiveMetrics.planningApproach}`,
    ` Confidence: ${(telemetry.cognitiveMetrics.confidence * 100).toFixed(1)}%`,
    ``,
    ` Minecraft:`,
    `  Blocks: ${telemetry.minecraftMetrics.blocksInteracted}`,
    `  Distance: ${telemetry.minecraftMetrics.distanceTraveled.toFixed(1)}m`,
    `  Items: ${telemetry.minecraftMetrics.itemsCollected}`,
    `  Failures: ${telemetry.minecraftMetrics.actionsFailed}`,
  ];

  return lines.join('\n');
}

/**
 * Create performance summary
 */
export function createPerformanceSummary(results: any[]): string {
  if (results.length === 0) {
    return 'No results to summarize';
  }

  const successCount = results.filter((r) => r.success).length;
  const successRate = ((successCount / results.length) * 100).toFixed(1);

  const avgExecutionTime =
    results.reduce((sum, r) => sum + r.executionTime, 0) / results.length;
  const avgStepsExecuted =
    results.reduce((sum, r) => sum + r.stepsExecuted, 0) / results.length;
  const totalRepairs = results.reduce((sum, r) => sum + r.repairAttempts, 0);

  return [
    ` Performance Summary:`,
    `  Success Rate: ${successRate}% (${successCount}/${results.length})`,
    `  Avg Execution: ${avgExecutionTime.toFixed(0)}ms`,
    `  Avg Steps: ${avgStepsExecuted.toFixed(1)}`,
    `  Total Repairs: ${totalRepairs}`,
    ``,
    ` Best: ${Math.min(...results.map((r) => r.executionTime))}ms`,
    `⚠️  Worst: ${Math.max(...results.map((r) => r.executionTime))}ms`,
  ].join('\n');
}
