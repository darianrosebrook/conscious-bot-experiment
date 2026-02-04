/**
 * Sterling service and solver initialization for the planning server.
 * Centralizes Sterling reasoning service, crafting/building/tool-progression
 * solver creation, and registration with task integration.
 *
 * Also wires the Sterling Language IO transport to enable LLM output processing
 * through Sterling's semantic authority.
 *
 * @author @darianrosebrook
 */

import {
  SterlingReasoningService,
  MinecraftCraftingSolver,
  MinecraftBuildingSolver,
  MinecraftToolProgressionSolver,
  MinecraftNavigationSolver,
} from '../sterling';

// Import Language IO transport for wiring
import {
  SterlingTransportAdapter,
  setDefaultTransport,
  SterlingLanguageIOClient,
  setDefaultLanguageIOClient,
} from '@conscious-bot/cognition';

export interface SterlingBootstrapResult {
  sterlingService: SterlingReasoningService | undefined;
  minecraftCraftingSolver: MinecraftCraftingSolver | undefined;
  minecraftBuildingSolver: MinecraftBuildingSolver | undefined;
  minecraftToolProgressionSolver: MinecraftToolProgressionSolver | undefined;
  minecraftNavigationSolver: MinecraftNavigationSolver | undefined;
}

export interface TaskIntegrationSolverRegistry {
  registerSolver(solver: unknown): void;
}

/**
 * Initialize Sterling reasoning service and Minecraft solvers, then register
 * solvers with the given task integration. Safe to call; logs and continues
 * without Sterling if initialization fails.
 */
export async function createSterlingBootstrap(
  taskIntegration: TaskIntegrationSolverRegistry
): Promise<SterlingBootstrapResult> {
  let sterlingService: SterlingReasoningService | undefined;
  let minecraftCraftingSolver: MinecraftCraftingSolver | undefined;
  let minecraftBuildingSolver: MinecraftBuildingSolver | undefined;
  let minecraftToolProgressionSolver:
    | MinecraftToolProgressionSolver
    | undefined;
  let minecraftNavigationSolver: MinecraftNavigationSolver | undefined;

  try {
    sterlingService = new SterlingReasoningService();
    await sterlingService.initialize();
    if (sterlingService.isAvailable()) {
      console.log('Sterling reasoning service connected');
    } else {
      console.log(
        'Sterling reasoning service not available (will retry on demand)'
      );
    }

    // Wire the Language IO transport to use the same Sterling client
    // This enables LLM output processing through Sterling's semantic authority
    if (sterlingService) {
      const sterlingClient = sterlingService.getClient();
      const transportAdapter = new SterlingTransportAdapter(sterlingClient);
      setDefaultTransport(transportAdapter);

      // Create and wire the default Language IO client
      const languageIOClient = new SterlingLanguageIOClient();
      setDefaultLanguageIOClient(languageIOClient);
      await languageIOClient.connect();

      console.log('Sterling Language IO transport wired (shared WebSocket connection)');
    }

    if (sterlingService) {
      minecraftCraftingSolver = new MinecraftCraftingSolver(sterlingService);
      taskIntegration.registerSolver(minecraftCraftingSolver);
      console.log('Minecraft crafting solver initialized');

      minecraftBuildingSolver = new MinecraftBuildingSolver(sterlingService);
      taskIntegration.registerSolver(minecraftBuildingSolver);
      console.log('Minecraft building solver initialized');

      minecraftToolProgressionSolver = new MinecraftToolProgressionSolver(
        sterlingService
      );
      taskIntegration.registerSolver(minecraftToolProgressionSolver);
      console.log('Minecraft tool progression solver initialized');

      minecraftNavigationSolver = new MinecraftNavigationSolver(
        sterlingService
      );
      taskIntegration.registerSolver(minecraftNavigationSolver);
      console.log('Minecraft navigation solver initialized');
    }
  } catch (error) {
    console.warn(
      'Sterling reasoning service failed to initialize, continuing without it:',
      error instanceof Error ? error.message : error
    );
  }

  return {
    sterlingService,
    minecraftCraftingSolver,
    minecraftBuildingSolver,
    minecraftToolProgressionSolver,
    minecraftNavigationSolver,
  };
}
