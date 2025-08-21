/**
 * Simplified Standalone Minecraft Interface
 *
 * A minimal version for testing basic Minecraft connectivity
 * without any planning system dependencies.
 *
 * @author @darianrosebrook
 */
import { Bot } from 'mineflayer';
import { EventEmitter } from 'events';
export interface SimpleBotConfig {
    host: string;
    port: number;
    username: string;
    version: string;
    auth?: 'offline' | 'mojang' | 'microsoft';
}
export interface SimpleGameState {
    position: {
        x: number;
        y: number;
        z: number;
    };
    health: number;
    food: number;
    inventory: any[];
    time: number;
    weather: string;
}
export interface SimpleAction {
    type: string;
    parameters: Record<string, any>;
}
export declare class SimpleMinecraftInterface extends EventEmitter {
    private bot;
    private config;
    private isConnected;
    constructor(config: SimpleBotConfig);
    /**
     * Connect to Minecraft server
     */
    connect(): Promise<void>;
    /**
     * Disconnect from server
     */
    disconnect(): Promise<void>;
    /**
     * Get current game state
     */
    getGameState(): Promise<SimpleGameState>;
    /**
     * Execute a simple action
     */
    executeAction(action: SimpleAction): Promise<any>;
    /**
     * Move forward
     */
    private moveForward;
    /**
     * Turn left
     */
    private turnLeft;
    /**
     * Turn right
     */
    private turnRight;
    /**
     * Jump
     */
    private jump;
    /**
     * Send chat message
     */
    private sendChat;
    /**
     * Check if connected
     */
    get connected(): boolean;
    /**
     * Get bot instance
     */
    get botInstance(): Bot | null;
}
/**
 * Create a simple Minecraft interface
 */
export declare function createSimpleMinecraftInterface(config: SimpleBotConfig): SimpleMinecraftInterface;
/**
 * Default configuration
 */
export declare const DEFAULT_SIMPLE_CONFIG: SimpleBotConfig;
//# sourceMappingURL=standalone-simple.d.ts.map