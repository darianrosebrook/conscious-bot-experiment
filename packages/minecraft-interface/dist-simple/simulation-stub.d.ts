/**
 * Simulation Stub for Offline Minecraft Testing
 *
 * Provides a mock Minecraft environment for testing without requiring
 * a real Minecraft server. This allows for rapid development and testing
 * of the interface logic.
 *
 * @author @darianrosebrook
 */
import { EventEmitter } from 'events';
/**
 * Mock game state for simulation
 */
export interface SimulatedGameState {
    position: {
        x: number;
        y: number;
        z: number;
    };
    health: number;
    food: number;
    inventory: Array<{
        id: string;
        count: number;
    }>;
    blocks: Array<{
        x: number;
        y: number;
        z: number;
        type: string;
    }>;
    entities: Array<{
        id: string;
        type: string;
        position: {
            x: number;
            y: number;
            z: number;
        };
    }>;
    time: number;
    weather: 'clear' | 'rain' | 'thunder';
}
/**
 * Simulation configuration
 */
export interface SimulationConfig {
    worldSize: {
        width: number;
        height: number;
        depth: number;
    };
    initialPosition: {
        x: number;
        y: number;
        z: number;
    };
    blockTypes: string[];
    entityTypes: string[];
    tickRate: number;
}
/**
 * Default simulation configuration
 */
export declare const DEFAULT_SIMULATION_CONFIG: SimulationConfig;
/**
 * Simulated Minecraft Interface
 *
 * Provides the same interface as the real Minecraft interface
 * but operates in a simulated environment.
 */
export declare class SimulatedMinecraftInterface extends EventEmitter {
    private config;
    private gameState;
    private isConnected;
    private tickInterval?;
    constructor(config?: Partial<SimulationConfig>);
    /**
     * Create initial game state
     */
    private createInitialGameState;
    /**
     * Generate random blocks in the world
     */
    private generateRandomBlocks;
    /**
     * Generate random entities
     */
    private generateRandomEntities;
    /**
     * Connect to the simulated environment
     */
    connect(): Promise<void>;
    /**
     * Disconnect from the simulated environment
     */
    disconnect(): Promise<void>;
    /**
     * Get current game state
     */
    getGameState(): Promise<SimulatedGameState>;
    /**
     * Execute an action in the simulation
     */
    executeAction(action: {
        type: string;
        parameters?: Record<string, any>;
    }): Promise<{
        success: boolean;
        message: string;
        data?: any;
    }>;
    /**
     * Execute move forward action
     */
    private executeMoveForward;
    /**
     * Execute turn left action
     */
    private executeTurnLeft;
    /**
     * Execute turn right action
     */
    private executeTurnRight;
    /**
     * Execute jump action
     */
    private executeJump;
    /**
     * Execute chat action
     */
    private executeChat;
    /**
     * Execute mine block action
     */
    private executeMineBlock;
    /**
     * Execute place block action
     */
    private executePlaceBlock;
    /**
     * Start the simulation tick loop
     */
    private startSimulation;
    /**
     * Stop the simulation tick loop
     */
    private stopSimulation;
    /**
     * Get simulation statistics
     */
    getSimulationStats(): {
        connected: boolean;
        worldSize: {
            width: number;
            height: number;
            depth: number;
        };
        blockCount: number;
        entityCount: number;
        time: number;
    };
}
/**
 * Factory function to create a simulated Minecraft interface
 */
export declare function createSimulatedMinecraftInterface(config?: Partial<SimulationConfig>): SimulatedMinecraftInterface;
//# sourceMappingURL=simulation-stub.d.ts.map