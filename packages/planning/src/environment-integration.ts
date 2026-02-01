/**
 * Enhanced Environment Integration System
 *
 * Provides real environment data, entity detection, inventory tracking,
 * and resource assessment to replace mock data with actual world state.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';

interface EnvironmentData {
  biome: string;
  weather: string;
  timeOfDay: string;
  position: {
    x: number;
    y: number;
    z: number;
  };
  nearbyEntities: Entity[];
  nearbyBlocks: Block[];
  lightLevel: number;
  temperature: number;
  humidity: number;
}

interface Entity {
  id: string;
  type: string;
  name: string;
  position: {
    x: number;
    y: number;
    z: number;
  };
  distance: number;
  hostile: boolean;
  health?: number;
  maxHealth?: number;
  metadata: Record<string, any>;
}

interface Block {
  id: string;
  type: string;
  position: {
    x: number;
    y: number;
    z: number;
  };
  metadata: number;
  hardness: number;
  harvestable: boolean;
  toolRequired?: string;
}

interface InventoryItem {
  id: string;
  type: string;
  name: string;
  count: number;
  slot: number;
  durability?: number;
  maxDurability?: number;
  metadata: Record<string, any>;
}

interface ResourceAssessment {
  availableResources: {
    wood: number;
    stone: number;
    food: number;
    tools: number;
    materials: number;
  };
  nearbyResources: {
    trees: number;
    stoneDeposits: number;
    animals: number;
    waterSources: number;
  };
  resourcePriorities: string[];
  scarcityLevel: 'low' | 'medium' | 'high';
}

interface EnvironmentIntegrationConfig {
  enableRealTimeUpdates: boolean;
  enableEntityDetection: boolean;
  enableInventoryTracking: boolean;
  enableResourceAssessment: boolean;
  dashboardEndpoint: string;
  worldSystemEndpoint: string;
  minecraftEndpoint: string;
  updateInterval: number;
  maxEntityDistance: number;
  maxBlockDistance: number;
}

const DEFAULT_CONFIG: EnvironmentIntegrationConfig = {
  enableRealTimeUpdates: true,
  enableEntityDetection: true,
  enableInventoryTracking: true,
  enableResourceAssessment: true,
  dashboardEndpoint: 'http://localhost:3000',
  worldSystemEndpoint: 'http://localhost:3004',
  minecraftEndpoint: 'http://localhost:3005',
  updateInterval: 15000, // Reduced from 5 seconds to 15 seconds
  maxEntityDistance: 50,
  maxBlockDistance: 20,
};

export class EnvironmentIntegration extends EventEmitter {
  private config: EnvironmentIntegrationConfig;
  private currentEnvironment: EnvironmentData | null = null;
  private currentInventory: InventoryItem[] = [];
  private resourceAssessment: ResourceAssessment | null = null;
  private updateTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<EnvironmentIntegrationConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };

    if (this.config.enableRealTimeUpdates) {
      this.startPeriodicUpdates();
    }
  }

  /**
   * Get current environment data
   */
  async getEnvironmentData(): Promise<EnvironmentData | null> {
    try {
      // Fetch from world system
      const worldData = await this.fetchWorldSystemData();

      // Fetch from minecraft bot
      const minecraftData = await this.fetchMinecraftData();

      // Combine and process data
      this.currentEnvironment = this.combineEnvironmentData(
        worldData,
        minecraftData
      );

      return this.currentEnvironment;
    } catch (error) {
      console.error('Failed to get environment data:', error);
      return null;
    }
  }

  /**
   * Get current inventory data
   */
  async getInventoryData(): Promise<InventoryItem[]> {
    try {
      const minecraftData = await this.fetchMinecraftData();

      if (
        minecraftData?.success &&
        minecraftData?.data?.worldState?.inventory?.items
      ) {
        this.currentInventory = this.processInventoryItems(
          minecraftData.data.worldState.inventory.items
        );
      }

      return this.currentInventory;
    } catch (error) {
      console.error('Failed to get inventory data:', error);
      return [];
    }
  }

  /**
   * Get resource assessment
   */
  async getResourceAssessment(): Promise<ResourceAssessment | null> {
    try {
      const environment = await this.getEnvironmentData();
      const inventory = await this.getInventoryData();

      if (!environment) {
        return null;
      }

      this.resourceAssessment = this.assessResources(environment, inventory);
      return this.resourceAssessment;
    } catch (error) {
      console.error('Failed to get resource assessment:', error);
      return null;
    }
  }

  /**
   * Get nearby entities
   */
  async getNearbyEntities(): Promise<Entity[]> {
    try {
      const environment = await this.getEnvironmentData();
      return environment?.nearbyEntities || [];
    } catch (error) {
      console.error('Failed to get nearby entities:', error);
      return [];
    }
  }

  /**
   * Get nearby blocks
   */
  async getNearbyBlocks(): Promise<Block[]> {
    try {
      const environment = await this.getEnvironmentData();
      return environment?.nearbyBlocks || [];
    } catch (error) {
      console.error('Failed to get nearby blocks:', error);
      return [];
    }
  }

  /**
   * Fetch data from world system
   */
  private async fetchWorldSystemData(): Promise<any> {
    try {
      const response = await fetch(`${this.config.worldSystemEndpoint}/state`);
      if (!response.ok) {
        return null;
      }
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch world system data:', error);
      return null;
    }
  }

  /**
   * Fetch data from minecraft bot
   */
  private async fetchMinecraftData(): Promise<any> {
    try {
      const response = await fetch(`${this.config.minecraftEndpoint}/state`);
      if (!response.ok) {
        return null;
      }
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch minecraft data:', error);
      return null;
    }
  }

  /**
   * Combine environment data from multiple sources
   */
  private combineEnvironmentData(
    worldData: any,
    minecraftData: any
  ): EnvironmentData {
    // Extract data from minecraft bot's rich structure
    const worldState = minecraftData?.data?.worldState;
    const playerPosition = worldState?.playerPosition ||
      minecraftData?.data?.position || { x: 0, y: 64, z: 0 };
    const time = worldState?.timeOfDay || minecraftData?.time || 0;
    const weather = worldState?.weather || minecraftData?.weather || 'clear';

    // Convert position array to object if needed
    const position = Array.isArray(playerPosition)
      ? { x: playerPosition[0], y: playerPosition[1], z: playerPosition[2] }
      : playerPosition;

    // Determine biome based on position and world data
    const biome = this.determineBiome(position, worldData);

    // Determine time of day
    const timeOfDay = this.determineTimeOfDay(time);

    // Process nearby entities from minecraft bot data
    const minecraftEntities =
      worldState?._minecraftState?.environment?.nearbyEntities || [];
    const nearbyEntities = this.processNearbyEntities(
      minecraftEntities,
      position
    );

    // Process nearby blocks from minecraft bot data
    const minecraftBlocks =
      worldState?._minecraftState?.environment?.nearbyBlocks || [];
    const nearbyBlocks = this.processNearbyBlocks(minecraftBlocks, position);

    // Calculate light level and other environmental factors
    const lightLevel = this.calculateLightLevel(time, weather);
    const temperature = this.calculateTemperature(biome, time);
    const humidity = this.calculateHumidity(biome, weather);

    return {
      biome,
      weather,
      timeOfDay,
      position,
      nearbyEntities,
      nearbyBlocks,
      lightLevel,
      temperature,
      humidity,
    };
  }

  /**
   * Determine biome based on position and world data
   */
  private determineBiome(position: any, worldData: any): string {
    const y = position.y || 64;

    // Use world system data if available
    if (worldData?.biome) {
      return worldData.biome;
    }

    // Fallback biome determination based on height
    if (y > 80) return 'Mountains';
    if (y > 70) return 'Hills';
    if (y < 50) return 'Underground';
    if (y < 60) return 'Caves';
    return 'Plains';
  }

  /**
   * Determine time of day from minecraft time
   */
  private determineTimeOfDay(time: number): string {
    const hours = Math.floor(time / 1000);
    if (hours >= 6 && hours < 12) return 'Morning';
    if (hours >= 12 && hours < 18) return 'Afternoon';
    if (hours >= 18 && hours < 24) return 'Evening';
    return 'Night';
  }

  /**
   * Process nearby entities
   */
  private processNearbyEntities(entities: any[], position: any): Entity[] {
    return entities
      .filter((entity) => {
        const distance = this.calculateDistance(position, entity.position);
        return distance <= this.config.maxEntityDistance;
      })
      .map((entity) => ({
        id: entity.id || `entity-${Date.now()}`,
        type: entity.type || 'unknown',
        name: entity.name || entity.type || 'Unknown Entity',
        position: entity.position || { x: 0, y: 0, z: 0 },
        distance: this.calculateDistance(position, entity.position),
        hostile: entity.isHostile || entity.hostile || false,
        health: entity.health,
        maxHealth: entity.maxHealth,
        metadata: entity.metadata || {},
      }))
      .sort((a, b) => a.distance - b.distance);
  }

  /**
   * Process nearby blocks
   */
  private processNearbyBlocks(blocks: any[], position: any): Block[] {
    return blocks
      .filter((block) => {
        const distance = this.calculateDistance(position, block.position);
        return distance <= this.config.maxBlockDistance;
      })
      .map((block) => ({
        id: block.id || `block-${Date.now()}`,
        type: block.type || 'unknown',
        position: block.position || { x: 0, y: 0, z: 0 },
        metadata: block.metadata || 0,
        hardness: block.hardness || 1,
        harvestable: block.harvestable || false,
        toolRequired: block.toolRequired,
      }))
      .sort(
        (a, b) =>
          this.calculateDistance(position, a.position) -
          this.calculateDistance(position, b.position)
      );
  }

  /**
   * Process inventory items
   */
  private processInventoryItems(items: any[]): InventoryItem[] {
    return items.map((item) => ({
      id: item.id || `item-${Date.now()}`,
      type: item.type || item.id || 'unknown',
      name: item.displayName || item.name || item.type || 'Unknown Item',
      count: item.count || 1,
      slot: item.slot || 0,
      durability: item.durability,
      maxDurability: item.maxDurability,
      metadata: {
        ...item.metadata,
        originalSlot: item.slot,
        displayName: item.displayName,
        metadata: item.metadata,
      },
    }));
  }

  /**
   * Assess available resources
   */
  private assessResources(
    environment: EnvironmentData,
    inventory: InventoryItem[]
  ): ResourceAssessment {
    // Count inventory resources
    const availableResources = {
      wood: this.countInventoryItems(inventory, [
        'oak_log',
        'birch_log',
        'spruce_log',
        'jungle_log',
        'acacia_log',
        'dark_oak_log',
      ]),
      stone: this.countInventoryItems(inventory, [
        'stone',
        'cobblestone',
        'granite',
        'diorite',
        'andesite',
      ]),
      food: this.countInventoryItems(inventory, [
        'apple',
        'bread',
        'cooked_beef',
        'cooked_chicken',
        'cooked_porkchop',
        'carrot',
        'potato',
      ]),
      tools: this.countInventoryItems(inventory, [
        'wooden_pickaxe',
        'stone_pickaxe',
        'iron_pickaxe',
        'wooden_axe',
        'stone_axe',
        'iron_axe',
      ]),
      materials: this.countInventoryItems(inventory, [
        'iron_ingot',
        'gold_ingot',
        'coal',
        'flint',
        'string',
        'leather',
      ]),
    };

    // Count nearby resources
    const nearbyResources = {
      trees: environment.nearbyEntities.filter(
        (e) => e.type.includes('tree') || e.type.includes('log')
      ).length,
      stoneDeposits: environment.nearbyBlocks.filter(
        (b) => b.type.includes('stone') || b.type.includes('ore')
      ).length,
      animals: environment.nearbyEntities.filter(
        (e) => !e.hostile && e.type.includes('animal')
      ).length,
      waterSources: environment.nearbyBlocks.filter((b) =>
        b.type.includes('water')
      ).length,
    };

    // Determine resource priorities
    const resourcePriorities = this.determineResourcePriorities(
      availableResources,
      nearbyResources
    );

    // Determine scarcity level
    const scarcityLevel = this.determineScarcityLevel(
      availableResources,
      nearbyResources
    );

    return {
      availableResources,
      nearbyResources,
      resourcePriorities,
      scarcityLevel,
    };
  }

  /**
   * Count inventory items by type
   */
  private countInventoryItems(
    inventory: InventoryItem[],
    types: string[]
  ): number {
    return inventory
      .filter((item) => types.some((type) => item.type.includes(type)))
      .reduce((total, item) => total + item.count, 0);
  }

  /**
   * Determine resource priorities
   */
  private determineResourcePriorities(available: any, nearby: any): string[] {
    const priorities = [];

    // Check for critical shortages
    if (available.food < 5) priorities.push('food');
    if (available.tools < 2) priorities.push('tools');
    if (available.wood < 10) priorities.push('wood');
    if (available.stone < 5) priorities.push('stone');

    // Check nearby resource availability
    if (nearby.trees > 0) priorities.push('gather_wood');
    if (nearby.stoneDeposits > 0) priorities.push('mine_stone');
    if (nearby.animals > 0) priorities.push('hunt_food');

    return priorities;
  }

  /**
   * Determine scarcity level
   */
  private determineScarcityLevel(
    available: any,
    nearby: any
  ): 'low' | 'medium' | 'high' {
    const totalAvailable = Object.values(available).reduce(
      (sum: number, val: any) => sum + (val as number),
      0
    );
    const totalNearby = Object.values(nearby).reduce(
      (sum: number, val: any) => sum + (val as number),
      0
    );

    if ((totalAvailable as number) < 10 && (totalNearby as number) < 5) return 'high';
    if ((totalAvailable as number) < 20 && (totalNearby as number) < 10) return 'medium';
    return 'low';
  }

  /**
   * Calculate distance between two positions
   */
  private calculateDistance(pos1: any, pos2: any): number {
    const dx = (pos1.x || 0) - (pos2.x || 0);
    const dy = (pos1.y || 0) - (pos2.y || 0);
    const dz = (pos1.z || 0) - (pos2.z || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Calculate light level
   */
  private calculateLightLevel(time: number, weather: string): number {
    const hours = Math.floor(time / 1000);
    let baseLight = 15;

    // Reduce light at night
    if (hours < 6 || hours >= 18) {
      baseLight = 5;
    }

    // Reduce light in bad weather
    if (weather === 'rain' || weather === 'thunder') {
      baseLight = Math.max(3, baseLight - 3);
    }

    return baseLight;
  }

  /**
   * Calculate temperature
   */
  private calculateTemperature(biome: string, time: number): number {
    let baseTemp = 20; // Celsius

    // Biome adjustments
    switch (biome.toLowerCase()) {
      case 'desert':
        baseTemp += 10;
        break;
      case 'mountains':
        baseTemp -= 5;
        break;
      case 'underground':
        baseTemp += 5;
        break;
      case 'caves':
        baseTemp += 3;
        break;
    }

    // Time adjustments
    const hours = Math.floor(time / 1000);
    if (hours >= 22 || hours < 6) {
      baseTemp -= 5; // Night is colder
    }

    return baseTemp;
  }

  /**
   * Calculate humidity
   */
  private calculateHumidity(biome: string, weather: string): number {
    let humidity = 50; // Percentage

    // Biome adjustments
    switch (biome.toLowerCase()) {
      case 'desert':
        humidity -= 30;
        break;
      case 'swamp':
        humidity += 20;
        break;
      case 'ocean':
        humidity += 15;
        break;
    }

    // Weather adjustments
    if (weather === 'rain' || weather === 'thunder') {
      humidity += 30;
    }

    return Math.max(0, Math.min(100, humidity));
  }

  /**
   * Start periodic updates
   */
  private startPeriodicUpdates(): void {
    this.updateTimer = setInterval(async () => {
      try {
        const environment = await this.getEnvironmentData();
        const inventory = await this.getInventoryData();
        const resources = await this.getResourceAssessment();

        if (environment) {
          this.emit('environmentUpdated', environment);
          this.notifyDashboard('environmentUpdated', environment);
        }

        if (inventory.length > 0) {
          this.emit('inventoryUpdated', inventory);
          this.notifyDashboard('inventoryUpdated', inventory);
        }

        if (resources) {
          this.emit('resourcesUpdated', resources);
          this.notifyDashboard('resourcesUpdated', resources);
        }
      } catch (error) {
        console.error('Error in periodic environment update:', error);
      }
    }, this.config.updateInterval);
  }

  /**
   * Stop periodic updates
   */
  stopPeriodicUpdates(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
  }

  /**
   * Notify dashboard of updates
   */
  private async notifyDashboard(event: string, data: any): Promise<void> {
    try {
      await fetch(`${this.config.dashboardEndpoint}/api/environment-updates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ event, data }),
      });
    } catch (error) {
      console.error('Failed to notify dashboard:', error);
    }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<EnvironmentIntegrationConfig>): void {
    this.config = { ...this.config, ...newConfig };

    // Restart updates if interval changed
    if (this.config.enableRealTimeUpdates && this.updateTimer) {
      this.stopPeriodicUpdates();
      this.startPeriodicUpdates();
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): EnvironmentIntegrationConfig {
    return { ...this.config };
  }

  /**
   * Get current environment state
   */
  getCurrentEnvironment(): EnvironmentData | null {
    return this.currentEnvironment;
  }

  /**
   * Get current inventory state
   */
  getCurrentInventory(): InventoryItem[] {
    return [...this.currentInventory];
  }

  /**
   * Get current resource assessment
   */
  getCurrentResourceAssessment(): ResourceAssessment | null {
    return this.resourceAssessment;
  }
}
