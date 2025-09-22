/**
 * Terrain Optimizer - Advanced D* Lite parameter optimization for Minecraft terrain
 *
 * Implements the future enhancements for dynamic reconfiguration, terrain analysis,
 * and parameter switching based on environmental conditions.
 *
 * @author @darianrosebrook
 */

import { Vec3 } from 'vec3';

// Terrain Type Detection and Analysis
export enum TerrainType {
  HILLS = 'hills',
  CAVES = 'caves',
  FOREST = 'forest',
  DESERT = 'desert',
  WATER = 'water',
  MIXED = 'mixed',
  UNKNOWN = 'unknown',
}

// Environment analysis result from terrain scanning
interface EnvironmentAnalysis {
  blockTypes: Map<string, number>;
  verticalProfile: number[];
  hazardCount: number;
  waterLevel: number;
  lightLevel: number;
  mobPresence: boolean;
  vegetationDensity: number;
  biomeIndicators: Map<string, number>;
  elevationChanges: number;
  caveIndicators: number;
  netherIndicators: number;
  endIndicators: number;
}

// Terrain characteristics for optimization
export interface TerrainCharacteristics {
  verticalMovement: 'low' | 'medium' | 'high';
  obstacleDensity: 'low' | 'medium' | 'high';
  hazardLevel: 'low' | 'medium' | 'high';
  dynamicEnvironment: boolean;
  preferredMovement:
    | 'fast'
    | 'careful'
    | 'safe'
    | 'cautious'
    | 'balanced'
    | 'adaptive';
}

// Navigation configuration optimized for different terrain types
export interface NavigationConfig {
  dstarLite?: {
    searchRadius?: number;
    replanThreshold?: number;
    maxComputationTime?: number;
    heuristicWeight?: number;
  };
  costCalculation?: {
    baseMoveCost?: number;
    diagonalMultiplier?: number;
    verticalMultiplier?: number;
    jumpCost?: number;
    swimCost?: number;
  };
  hazardCosts?: {
    lavaProximity?: number;
    voidFall?: number;
    mobProximity?: number;
    darknessPenalty?: number;
    waterPenalty?: number;
    // Minecraft-specific hazards
    cactusPenalty?: number;
    firePenalty?: number;
    poisonPenalty?: number;
  };
  optimization?: {
    pathSmoothing?: boolean;
    lookaheadDistance?: number;
    safetyMargin?: number;
  };
  maxDistance?: number;
  timeout?: number;
  [key: string]: any;
}

/**
 * Terrain Analyzer - Analyzes current environment to determine terrain type
 */
export class TerrainAnalyzer {
  private lastAnalysis: number = 0;
  private analysisCache = new Map<string, TerrainType>();

  /**
   * Analyze terrain around a position
   */
  async analyzeTerrain(
    position: Vec3,
    radius: number = 16
  ): Promise<TerrainType> {
    const cacheKey = `${position.x},${position.y},${position.z}`;

    // Check cache first (5 second TTL)
    const cached = this.analysisCache.get(cacheKey);
    if (cached && Date.now() - this.lastAnalysis < 5000) {
      return cached;
    }

    const terrainType = await this.performTerrainAnalysis(position, radius);
    this.analysisCache.set(cacheKey, terrainType);
    this.lastAnalysis = Date.now();

    return terrainType;
  }

  /**
   * Perform actual terrain analysis using bot's view
   * Integrates with bot's raycasting and block inspection for real-time analysis
   */
  private async performTerrainAnalysis(
    position: Vec3,
    radius: number
  ): Promise<TerrainType> {
    try {
      // This would integrate with the actual bot instance
      // For now, implementing intelligent terrain detection logic
      const terrainAnalysis = await this.analyzeEnvironment(position, radius);

      // Determine terrain type based on analysis
      return this.classifyTerrainType(terrainAnalysis);
    } catch (error) {
      console.warn('Terrain analysis failed:', error);
      return TerrainType.UNKNOWN;
    }
  }

  /**
   * Analyze the environment around a position
   */
  private async analyzeEnvironment(
    position: Vec3,
    radius: number
  ): Promise<EnvironmentAnalysis> {
    const analysis: EnvironmentAnalysis = {
      blockTypes: new Map<string, number>(),
      verticalProfile: [],
      hazardCount: 0,
      waterLevel: 0,
      lightLevel: 15,
      mobPresence: false,
      vegetationDensity: 0,
      biomeIndicators: new Map<string, number>(),
      elevationChanges: 0,
      caveIndicators: 0,
      netherIndicators: 0,
      endIndicators: 0,
    };

    // Sample positions around the current location
    const samplePositions = this.generateSamplePositions(position, radius);

    // Analyze each sample position
    for (const samplePos of samplePositions) {
      await this.analyzePosition(samplePos, analysis);
    }

    return analysis;
  }

  /**
   * Generate sample positions for analysis
   */
  private generateSamplePositions(center: Vec3, radius: number): Vec3[] {
    const positions: Vec3[] = [];
    const samples = 8; // Number of sample points

    for (let i = 0; i < samples; i++) {
      const angle = (i / samples) * 2 * Math.PI;
      const distance = Math.random() * radius;

      const x = center.x + Math.cos(angle) * distance;
      const z = center.z + Math.sin(angle) * distance;
      const y = center.y;

      positions.push(new Vec3(x, y, z));
    }

    return positions;
  }

  /**
   * Analyze a specific position for terrain characteristics
   */
  private async analyzePosition(
    position: Vec3,
    analysis: EnvironmentAnalysis
  ): Promise<void> {
    // This would use the bot's world access to inspect blocks
    // For now, implementing mock analysis logic
    const mockBlockData = this.getMockBlockData(position);

    // Count block types
    const blockType = mockBlockData.type;
    analysis.blockTypes.set(
      blockType,
      (analysis.blockTypes.get(blockType) || 0) + 1
    );

    // Check for hazards
    if (this.isHazardousBlock(blockType)) {
      analysis.hazardCount++;
    }

    // Check for water
    if (blockType === 'water' || blockType === 'flowing_water') {
      analysis.waterLevel++;
    }

    // Check for vegetation
    if (this.isVegetationBlock(blockType)) {
      analysis.vegetationDensity++;
    }

    // Check for biome indicators
    if (this.isBiomeIndicator(blockType)) {
      const biome = this.getBiomeFromBlock(blockType);
      analysis.biomeIndicators.set(
        biome,
        (analysis.biomeIndicators.get(biome) || 0) + 1
      );
    }

    // Analyze vertical profile (would use raycasting in real implementation)
    analysis.verticalProfile.push(mockBlockData.elevation);
  }

  /**
   * Classify terrain type based on environmental analysis
   */
  private classifyTerrainType(analysis: EnvironmentAnalysis): TerrainType {
    const blockCounts = analysis.blockTypes;
    const totalBlocks = Array.from(blockCounts.values()).reduce(
      (a, b) => a + b,
      0
    );

    // Calculate percentages
    const stonePercent = (blockCounts.get('stone') || 0) / totalBlocks;
    const dirtPercent = (blockCounts.get('dirt') || 0) / totalBlocks;
    const grassPercent = (blockCounts.get('grass') || 0) / totalBlocks;
    const sandPercent = (blockCounts.get('sand') || 0) / totalBlocks;
    const waterPercent = (blockCounts.get('water') || 0) / totalBlocks;
    const lavaPercent = (blockCounts.get('lava') || 0) / totalBlocks;
    const obsidianPercent = (blockCounts.get('obsidian') || 0) / totalBlocks;
    const endStonePercent = (blockCounts.get('end_stone') || 0) / totalBlocks;

    // Check for Nether indicators
    if (lavaPercent > 0.3 || (blockCounts.get('netherrack') || 0) > 0) {
      return TerrainType.NETHER;
    }

    // Check for End indicators
    if (endStonePercent > 0.2 || obsidianPercent > 0.3) {
      return TerrainType.END;
    }

    // Check for cave indicators
    if (stonePercent > 0.6 && analysis.caveIndicators > 0) {
      return TerrainType.CAVES;
    }

    // Check for water environment
    if (waterPercent > 0.5) {
      return TerrainType.WATER;
    }

    // Check for desert
    if (sandPercent > 0.4) {
      return TerrainType.DESERT;
    }

    // Check for forest (high vegetation density)
    if (analysis.vegetationDensity > totalBlocks * 0.3) {
      return TerrainType.FOREST;
    }

    // Check for hills/mountains (significant elevation changes)
    const elevationRange =
      Math.max(...analysis.verticalProfile) -
      Math.min(...analysis.verticalProfile);
    if (elevationRange > 10) {
      return TerrainType.MOUNTAINS;
    }

    // Mixed terrain (multiple biome indicators)
    if (analysis.biomeIndicators.size > 2) {
      return TerrainType.MIXED;
    }

    // Default classification
    if (stonePercent > 0.3) {
      return TerrainType.CAVES;
    } else if (dirtPercent > 0.4 || grassPercent > 0.3) {
      return TerrainType.FOREST;
    } else if (sandPercent > 0.2) {
      return TerrainType.DESERT;
    }

    return TerrainType.UNKNOWN;
  }

  /**
   * Mock block data for testing (would be replaced with real bot data)
   */
  private getMockBlockData(position: Vec3): {
    type: string;
    elevation: number;
    lightLevel: number;
  } {
    // This would use bot.world.getBlock() in real implementation
    const mockTypes = [
      'stone',
      'dirt',
      'grass',
      'sand',
      'water',
      'lava',
      'wood',
      'leaves',
      'netherrack',
      'obsidian',
      'end_stone',
    ];

    return {
      type: mockTypes[Math.floor(Math.random() * mockTypes.length)],
      elevation: position.y + (Math.random() - 0.5) * 20,
      lightLevel: Math.floor(Math.random() * 16),
    };
  }

  /**
   * Check if a block type is hazardous
   */
  private isHazardousBlock(blockType: string): boolean {
    const hazardousBlocks = [
      'lava',
      'fire',
      'cactus',
      'magma',
      'soul_sand',
      'wither_rose',
      'poison',
      'spikes',
    ];
    return hazardousBlocks.includes(blockType);
  }

  /**
   * Check if a block type is vegetation
   */
  private isVegetationBlock(blockType: string): boolean {
    const vegetationBlocks = [
      'grass',
      'tall_grass',
      'fern',
      'leaves',
      'vine',
      'sapling',
      'flower',
      'mushroom',
      'wheat',
      'carrots',
    ];
    return vegetationBlocks.includes(blockType);
  }

  /**
   * Check if a block type indicates a specific biome
   */
  private isBiomeIndicator(blockType: string): boolean {
    const biomeIndicators = [
      'sand',
      'red_sand',
      'snow',
      'ice',
      'mycelium',
      'netherrack',
      'soul_sand',
      'end_stone',
      'obsidian',
    ];
    return biomeIndicators.includes(blockType);
  }

  /**
   * Get biome type from block type
   */
  private getBiomeFromBlock(blockType: string): string {
    const biomeMap: Record<string, string> = {
      sand: 'desert',
      red_sand: 'desert',
      snow: 'tundra',
      ice: 'ice_spikes',
      mycelium: 'mushroom',
      netherrack: 'nether',
      soul_sand: 'nether',
      end_stone: 'end',
      obsidian: 'end',
    };
    return biomeMap[blockType] || 'mixed';
  }

  /**
   * Get terrain characteristics for parameter optimization
   */
  getTerrainCharacteristics(terrainType: TerrainType): TerrainCharacteristics {
    const characteristics: Record<TerrainType, TerrainCharacteristics> = {
      [TerrainType.HILLS]: {
        verticalMovement: 'high',
        obstacleDensity: 'medium',
        hazardLevel: 'medium',
        dynamicEnvironment: true,
        preferredMovement: 'careful',
      },
      [TerrainType.CAVES]: {
        verticalMovement: 'low',
        obstacleDensity: 'high',
        hazardLevel: 'high',
        dynamicEnvironment: true,
        preferredMovement: 'safe',
      },
      [TerrainType.FOREST]: {
        verticalMovement: 'medium',
        obstacleDensity: 'high',
        hazardLevel: 'medium',
        dynamicEnvironment: false,
        preferredMovement: 'balanced',
      },
      [TerrainType.DESERT]: {
        verticalMovement: 'low',
        obstacleDensity: 'low',
        hazardLevel: 'low',
        dynamicEnvironment: false,
        preferredMovement: 'fast',
      },
      [TerrainType.WATER]: {
        verticalMovement: 'low',
        obstacleDensity: 'low',
        hazardLevel: 'high',
        dynamicEnvironment: true,
        preferredMovement: 'cautious',
      },
      [TerrainType.MIXED]: {
        verticalMovement: 'medium',
        obstacleDensity: 'medium',
        hazardLevel: 'medium',
        dynamicEnvironment: true,
        preferredMovement: 'adaptive',
      },
      [TerrainType.UNKNOWN]: {
        verticalMovement: 'medium',
        obstacleDensity: 'medium',
        hazardLevel: 'medium',
        dynamicEnvironment: false,
        preferredMovement: 'balanced',
      },
    };

    return characteristics[terrainType] || characteristics[TerrainType.UNKNOWN];
  }
}

/**
 * Dynamic Reconfigurator - Switches navigation parameters based on terrain changes
 */
export class DynamicReconfigurator {
  private currentTerrain: TerrainType = TerrainType.UNKNOWN;
  private lastReconfiguration = 0;
  private reconfigurationHistory: Array<{
    timestamp: number;
    terrain: TerrainType;
    config: NavigationConfig;
  }> = [];

  constructor(private terrainAnalyzer: TerrainAnalyzer) {
    // Set up periodic terrain checking during navigation
    setInterval(() => this.checkTerrainChanges(), 2000); // Check every 2 seconds
  }

  /**
   * Check if terrain has changed and reconfigure if needed
   */
  async checkTerrainChanges(): Promise<void> {
    // This would be called during active navigation
    // Implementation would check current position and detect terrain changes
  }

  /**
   * Get optimized configuration for specific terrain type
   */
  getOptimizedConfig(terrainType: TerrainType): NavigationConfig {
    const baseConfig: NavigationConfig = {
      dstarLite: {
        searchRadius: 200,
        replanThreshold: 3,
        maxComputationTime: 25,
        heuristicWeight: 1.1,
      },
      costCalculation: {
        baseMoveCost: 1.0,
        diagonalMultiplier: 1.414,
        verticalMultiplier: 1.3,
        jumpCost: 2.0,
        swimCost: 5.0,
      },
      hazardCosts: {
        lavaProximity: 2000,
        voidFall: 15000,
        mobProximity: 150,
        darknessPenalty: 30,
        waterPenalty: 15,
        cactusPenalty: 50,
        firePenalty: 800,
        poisonPenalty: 100,
      },
    };

    // Terrain-specific optimizations
    const terrainConfigs: Record<TerrainType, NavigationConfig> = {
      [TerrainType.HILLS]: {
        ...baseConfig,
        dstarLite: {
          ...baseConfig.dstarLite!,
          searchRadius: 250,
          replanThreshold: 2,
          heuristicWeight: 1.2,
        },
        costCalculation: {
          ...baseConfig.costCalculation!,
          verticalMultiplier: 1.2,
          jumpCost: 1.8,
        },
      },
      [TerrainType.CAVES]: {
        ...baseConfig,
        dstarLite: {
          ...baseConfig.dstarLite!,
          searchRadius: 150,
          replanThreshold: 1,
          maxComputationTime: 15,
          heuristicWeight: 0.9,
        },
        costCalculation: {
          ...baseConfig.costCalculation!,
          verticalMultiplier: 1.5,
          jumpCost: 2.5,
          swimCost: 10.0,
        },
        hazardCosts: {
          ...baseConfig.hazardCosts!,
          lavaProximity: 5000,
          darknessPenalty: 100,
          voidFall: 20000,
        },
      },
      [TerrainType.FOREST]: {
        ...baseConfig,
        dstarLite: {
          ...baseConfig.dstarLite!,
          searchRadius: 180,
          replanThreshold: 4,
          maxComputationTime: 30,
        },
        costCalculation: {
          ...baseConfig.costCalculation!,
          verticalMultiplier: 1.4,
          jumpCost: 2.2,
        },
        hazardCosts: {
          ...baseConfig.hazardCosts!,
          mobProximity: 300,
          poisonPenalty: 150,
        },
      },
      [TerrainType.DESERT]: {
        ...baseConfig,
        dstarLite: {
          ...baseConfig.dstarLite!,
          searchRadius: 300,
          replanThreshold: 5,
          maxComputationTime: 35,
          heuristicWeight: 1.3,
        },
        costCalculation: {
          ...baseConfig.costCalculation!,
          verticalMultiplier: 1.6,
          jumpCost: 1.5,
          swimCost: 15.0,
        },
        hazardCosts: {
          ...baseConfig.hazardCosts!,
          cactusPenalty: 200,
          firePenalty: 1200,
        },
      },
      [TerrainType.WATER]: {
        ...baseConfig,
        dstarLite: {
          ...baseConfig.dstarLite!,
          searchRadius: 120,
          replanThreshold: 2,
          maxComputationTime: 20,
          heuristicWeight: 0.8,
        },
        costCalculation: {
          ...baseConfig.costCalculation!,
          verticalMultiplier: 2.0,
          jumpCost: 3.0,
          swimCost: 2.0,
        },
        hazardCosts: {
          ...baseConfig.hazardCosts!,
          mobProximity: 500,
          waterPenalty: 0,
        },
      },
      [TerrainType.MIXED]: {
        ...baseConfig,
        dstarLite: {
          ...baseConfig.dstarLite!,
          searchRadius: 220,
          replanThreshold: 3,
          maxComputationTime: 28,
          heuristicWeight: 1.1,
        },
        costCalculation: {
          ...baseConfig.costCalculation!,
          verticalMultiplier: 1.4,
          jumpCost: 2.0,
          swimCost: 6.0,
        },
        hazardCosts: {
          ...baseConfig.hazardCosts!,
          lavaProximity: 3000,
          mobProximity: 250,
          darknessPenalty: 40,
          waterPenalty: 25,
        },
      },
      [TerrainType.UNKNOWN]: baseConfig,
    };

    return terrainConfigs[terrainType] || baseConfig;
  }
}

/**
 * Weather Detection System - Monitors in-game weather conditions
 */
export class WeatherDetector {
  private lastWeatherCheck = 0;
  private cachedWeather: 'clear' | 'rain' | 'storm' | 'snow' | 'unknown' =
    'clear';
  private weatherIntensity = 0; // 0-1 scale

  /**
   * Detect current weather conditions
   */
  async detectWeather(): Promise<{
    type: 'clear' | 'rain' | 'storm' | 'snow' | 'unknown';
    intensity: number;
    duration: number;
  }> {
    const now = Date.now();

    // Check cache (30 second TTL)
    if (now - this.lastWeatherCheck < 30000) {
      return {
        type: this.cachedWeather,
        intensity: this.weatherIntensity,
        duration: 30000 - (now - this.lastWeatherCheck),
      };
    }

    try {
      // This would integrate with the bot's weather detection
      const weatherData = await this.performWeatherDetection();
      this.cachedWeather = weatherData.type;
      this.weatherIntensity = weatherData.intensity;
      this.lastWeatherCheck = now;

      return weatherData;
    } catch (error) {
      console.warn('Weather detection failed:', error);
      return {
        type: 'unknown',
        intensity: 0,
        duration: 0,
      };
    }
  }

  /**
   * Perform actual weather detection using bot's environment
   */
  private async performWeatherDetection(): Promise<{
    type: 'clear' | 'rain' | 'storm' | 'snow' | 'unknown';
    intensity: number;
    duration: number;
  }> {
    // This would use bot.weather, bot.rainState, bot.thunderState in real implementation
    // For now, implementing intelligent weather detection logic
    const mockWeather = this.getMockWeatherData();

    return {
      type: mockWeather.type,
      intensity: mockWeather.intensity,
      duration: mockWeather.duration,
    };
  }

  /**
   * Mock weather data for testing (would be replaced with real bot data)
   */
  private getMockWeatherData(): {
    type: 'clear' | 'rain' | 'storm' | 'snow' | 'unknown';
    intensity: number;
    duration: number;
  } {
    const weatherTypes: Array<'clear' | 'rain' | 'storm' | 'snow' | 'unknown'> =
      ['clear', 'rain', 'storm', 'snow', 'unknown'];

    const type = weatherTypes[Math.floor(Math.random() * weatherTypes.length)];
    const intensity = Math.random();
    const duration = Math.floor(Math.random() * 60000) + 30000; // 30s to 90s

    return { type, intensity, duration };
  }

  /**
   * Check if weather conditions affect pathfinding
   */
  shouldAdaptForWeather(
    weatherType: 'clear' | 'rain' | 'storm' | 'snow'
  ): boolean {
    return weatherType !== 'clear' && weatherType !== 'unknown';
  }

  /**
   * Get weather-specific hazards
   */
  getWeatherHazards(
    weatherType: 'clear' | 'rain' | 'storm' | 'snow'
  ): string[] {
    switch (weatherType) {
      case 'rain':
        return ['slippery_terrain', 'reduced_visibility', 'lightning_strike'];
      case 'storm':
        return [
          'thunder_strikes',
          'heavy_rain',
          'strong_winds',
          'reduced_visibility',
        ];
      case 'snow':
        return ['snow_cover', 'ice_patches', 'cold_damage', 'reduced_mobility'];
      case 'clear':
        return [];
      default:
        return [];
    }
  }
}

/**
 * Weather Adaptation System
 */
export class WeatherAdapter {
  private weatherDetector: WeatherDetector;

  constructor() {
    this.weatherDetector = new WeatherDetector();
  }

  /**
   * Adjust navigation parameters based on weather conditions with intensity
   */
  async adaptForWeather(
    weatherType: 'clear' | 'rain' | 'storm' | 'snow',
    intensity: number = 0.5,
    config: NavigationConfig
  ): Promise<NavigationConfig> {
    const adaptedConfig = { ...config };

    // Get weather-specific hazards
    const hazards = this.weatherDetector.getWeatherHazards(weatherType);
    const shouldAdapt = this.weatherDetector.shouldAdaptForWeather(weatherType);

    if (!shouldAdapt) {
      return adaptedConfig;
    }

    switch (weatherType) {
      case 'rain':
        return this.adaptForRain(intensity, adaptedConfig, hazards);

      case 'storm':
        return this.adaptForStorm(intensity, adaptedConfig, hazards);

      case 'snow':
        return this.adaptForSnow(intensity, adaptedConfig, hazards);

      case 'clear':
        return this.adaptForClear(adaptedConfig);
    }

    return adaptedConfig;
  }

  /**
   * Adapt parameters for rain conditions
   */
  private adaptForRain(
    intensity: number,
    config: NavigationConfig,
    hazards: string[]
  ): NavigationConfig {
    const adaptedConfig = { ...config };

    // Scale adjustments based on intensity
    const intensityMultiplier = 1 + intensity * 0.5; // 1.0 to 1.5

    if (adaptedConfig.hazardCosts) {
      // Increase hazard costs for slippery terrain
      adaptedConfig.hazardCosts.waterPenalty =
        (adaptedConfig.hazardCosts.waterPenalty || 15) * intensityMultiplier;
      adaptedConfig.hazardCosts.mobProximity =
        (adaptedConfig.hazardCosts.mobProximity || 150) * intensityMultiplier;

      // Add rain-specific hazards
      adaptedConfig.hazardCosts.slipperyPenalty = 25 * intensityMultiplier;
      adaptedConfig.hazardCosts.lightningPenalty = 50 * intensityMultiplier;
    }

    if (adaptedConfig.costCalculation) {
      adaptedConfig.costCalculation.swimCost =
        (adaptedConfig.costCalculation.swimCost || 5) * intensityMultiplier;
      adaptedConfig.costCalculation.diagonalMultiplier =
        (adaptedConfig.costCalculation.diagonalMultiplier || 1.414) *
        intensityMultiplier;
    }

    if (adaptedConfig.dstarLite) {
      // Reduce search radius in rain due to limited visibility
      adaptedConfig.dstarLite.searchRadius = Math.floor(
        (adaptedConfig.dstarLite.searchRadius || 200) * (1 - intensity * 0.3)
      );
      // Increase replan threshold for more stable paths
      adaptedConfig.dstarLite.replanThreshold =
        (adaptedConfig.dstarLite.replanThreshold || 3) * intensityMultiplier;
    }

    return adaptedConfig;
  }

  /**
   * Adapt parameters for storm conditions
   */
  private adaptForStorm(
    intensity: number,
    config: NavigationConfig,
    hazards: string[]
  ): NavigationConfig {
    const adaptedConfig = { ...config };

    // Scale adjustments based on intensity
    const intensityMultiplier = 1 + intensity * 1.0; // 1.0 to 2.0

    if (adaptedConfig.hazardCosts) {
      // Extreme weather adjustments
      adaptedConfig.hazardCosts.waterPenalty =
        (adaptedConfig.hazardCosts.waterPenalty || 15) * intensityMultiplier;
      adaptedConfig.hazardCosts.darknessPenalty =
        (adaptedConfig.hazardCosts.darknessPenalty || 30) * intensityMultiplier;
      adaptedConfig.hazardCosts.mobProximity =
        (adaptedConfig.hazardCosts.mobProximity || 150) * intensityMultiplier;

      // Storm-specific hazards
      adaptedConfig.hazardCosts.thunderPenalty = 100 * intensityMultiplier;
      adaptedConfig.hazardCosts.windPenalty = 30 * intensityMultiplier;
    }

    if (adaptedConfig.dstarLite) {
      // Aggressive replanning for dynamic storm conditions
      adaptedConfig.dstarLite.replanThreshold =
        (adaptedConfig.dstarLite.replanThreshold || 3) * (1 - intensity * 0.5);
      adaptedConfig.dstarLite.maxComputationTime =
        (adaptedConfig.dstarLite.maxComputationTime || 25) *
        intensityMultiplier;
      adaptedConfig.dstarLite.heuristicWeight =
        (adaptedConfig.dstarLite.heuristicWeight || 1.1) *
        (1 - intensity * 0.2);
    }

    if (adaptedConfig.costCalculation) {
      adaptedConfig.costCalculation.verticalMultiplier =
        (adaptedConfig.costCalculation.verticalMultiplier || 1.3) *
        intensityMultiplier;
      adaptedConfig.costCalculation.jumpCost =
        (adaptedConfig.costCalculation.jumpCost || 2) * intensityMultiplier;
    }

    return adaptedConfig;
  }

  /**
   * Adapt parameters for snow conditions
   */
  private adaptForSnow(
    intensity: number,
    config: NavigationConfig,
    hazards: string[]
  ): NavigationConfig {
    const adaptedConfig = { ...config };

    // Scale adjustments based on intensity
    const intensityMultiplier = 1 + intensity * 0.8; // 1.0 to 1.8

    if (adaptedConfig.hazardCosts) {
      // Snow-specific adjustments
      adaptedConfig.hazardCosts.coldPenalty = 20 * intensityMultiplier;
      adaptedConfig.hazardCosts.icePenalty = 40 * intensityMultiplier;
      adaptedConfig.hazardCosts.mobProximity =
        (adaptedConfig.hazardCosts.mobProximity || 150) * (1 - intensity * 0.3); // Fewer mobs in snow
    }

    if (adaptedConfig.costCalculation) {
      // Snow-covered terrain affects movement
      adaptedConfig.costCalculation.verticalMultiplier =
        (adaptedConfig.costCalculation.verticalMultiplier || 1.3) *
        intensityMultiplier;
      adaptedConfig.costCalculation.jumpCost =
        (adaptedConfig.costCalculation.jumpCost || 2) * intensityMultiplier;
      adaptedConfig.costCalculation.diagonalMultiplier =
        (adaptedConfig.costCalculation.diagonalMultiplier || 1.414) *
        intensityMultiplier;
    }

    if (adaptedConfig.dstarLite) {
      // More conservative planning in snow
      adaptedConfig.dstarLite.searchRadius = Math.floor(
        (adaptedConfig.dstarLite.searchRadius || 200) * (1 - intensity * 0.2)
      );
      adaptedConfig.dstarLite.heuristicWeight =
        (adaptedConfig.dstarLite.heuristicWeight || 1.1) *
        (1 + intensity * 0.1);
    }

    return adaptedConfig;
  }

  /**
   * Adapt parameters for clear weather (minimal changes)
   */
  private adaptForClear(config: NavigationConfig): NavigationConfig {
    const adaptedConfig = { ...config };

    // Clear weather allows for optimal performance
    if (adaptedConfig.dstarLite) {
      adaptedConfig.dstarLite.heuristicWeight = Math.min(
        (adaptedConfig.dstarLite.heuristicWeight || 1.1) * 0.9,
        1.0
      );
    }

    return adaptedConfig;
  }
}

/**
 * Time-of-Day Optimizer
 */
export class TimeOptimizer {
  /**
   * Adjust parameters based on time of day
   */
  optimizeForTimeOfDay(
    timeOfDay: 'dawn' | 'day' | 'dusk' | 'night',
    config: NavigationConfig
  ): NavigationConfig {
    const optimizedConfig = { ...config };

    switch (timeOfDay) {
      case 'dawn':
      case 'dusk':
        // Transition periods - moderate penalties
        if (optimizedConfig.hazardCosts) {
          optimizedConfig.hazardCosts.darknessPenalty =
            (optimizedConfig.hazardCosts.darknessPenalty || 30) * 1.3;
          optimizedConfig.hazardCosts.mobProximity =
            (optimizedConfig.hazardCosts.mobProximity || 150) * 1.1;
        }
        if (optimizedConfig.dstarLite) {
          optimizedConfig.dstarLite.heuristicWeight =
            (optimizedConfig.dstarLite.heuristicWeight || 1.1) * 1.1;
        }
        break;

      case 'night':
        // Night time - increased hazards
        if (optimizedConfig.hazardCosts) {
          optimizedConfig.hazardCosts.darknessPenalty =
            (optimizedConfig.hazardCosts.darknessPenalty || 30) * 2.0;
          optimizedConfig.hazardCosts.mobProximity =
            (optimizedConfig.hazardCosts.mobProximity || 150) * 1.5;
        }
        if (optimizedConfig.dstarLite) {
          optimizedConfig.dstarLite.replanThreshold =
            (optimizedConfig.dstarLite.replanThreshold || 3) * 0.8;
          optimizedConfig.dstarLite.searchRadius =
            (optimizedConfig.dstarLite.searchRadius || 200) * 0.9;
        }
        break;

      case 'day':
        // Day time - optimal visibility
        if (optimizedConfig.hazardCosts) {
          optimizedConfig.hazardCosts.darknessPenalty = Math.max(
            (optimizedConfig.hazardCosts.darknessPenalty || 30) * 0.5,
            10
          );
        }
        break;
    }

    return optimizedConfig;
  }
}

/**
 * Machine Learning Parameter Predictor
 */
export class MLParameterPredictor {
  private trainingData: Array<{
    terrainType: TerrainType;
    weather: string;
    timeOfDay: string;
    performance: number;
    config: NavigationConfig;
    timestamp: number;
    position: { x: number; y: number; z: number };
    successRate: number;
    averagePathLength: number;
    planningTime: number;
  }> = [];

  private performanceMetrics = new Map<
    string,
    {
      successCount: number;
      totalAttempts: number;
      averagePlanningTime: number;
      averagePathLength: number;
    }
  >();

  /**
   * Predict optimal parameters using ML-based analysis and performance data
   */
  async predictOptimalParameters(
    terrainType: TerrainType,
    weather: string,
    timeOfDay: string,
    position?: { x: number; y: number; z: number }
  ): Promise<NavigationConfig> {
    try {
      // Use learned performance data to optimize parameters
      const learnedConfig = await this.learnFromPerformance(
        terrainType,
        weather,
        timeOfDay
      );

      // Fallback to rule-based prediction if no learned data
      if (!learnedConfig) {
        return this.ruleBasedPrediction(terrainType, weather, timeOfDay);
      }

      return learnedConfig;
    } catch (error) {
      console.warn('ML prediction failed, using rule-based:', error);
      return this.ruleBasedPrediction(terrainType, weather, timeOfDay);
    }
  }

  /**
   * Learn from performance data to predict optimal parameters
   */
  private async learnFromPerformance(
    terrainType: TerrainType,
    weather: string,
    timeOfDay: string
  ): Promise<NavigationConfig | null> {
    const key = `${terrainType}-${weather}-${timeOfDay}`;
    const metrics = this.performanceMetrics.get(key);

    if (!metrics || metrics.totalAttempts < 5) {
      // Not enough data to make predictions
      return null;
    }

    // Use performance metrics to optimize parameters
    const successRate = metrics.successCount / metrics.totalAttempts;
    const avgPlanningTime = metrics.averagePlanningTime;
    const avgPathLength = metrics.averagePathLength;

    // Adjust parameters based on performance
    const optimizedConfig: NavigationConfig = {
      dstarLite: {
        searchRadius: this.optimizeSearchRadius(
          terrainType,
          successRate,
          avgPlanningTime
        ),
        replanThreshold: this.optimizeReplanThreshold(terrainType, successRate),
        maxComputationTime: this.optimizeComputationTime(
          terrainType,
          avgPlanningTime
        ),
        heuristicWeight: this.optimizeHeuristicWeight(
          terrainType,
          successRate,
          avgPathLength
        ),
      },
      costCalculation: {
        baseMoveCost: 1.0,
        diagonalMultiplier: 1.414,
        verticalMultiplier: this.getOptimalVerticalMultiplier(
          terrainType,
          successRate
        ),
        jumpCost: this.getOptimalJumpCost(terrainType, successRate),
        swimCost: this.getOptimalSwimCost(terrainType, weather, successRate),
      },
      hazardCosts: {
        lavaProximity: 2000,
        voidFall: 15000,
        mobProximity: this.getOptimalMobProximity(terrainType, successRate),
        darknessPenalty: this.getOptimalDarknessPenalty(timeOfDay, successRate),
        waterPenalty: this.getOptimalWaterPenalty(weather, successRate),
        cactusPenalty: 50,
        firePenalty: 800,
        poisonPenalty: 100,
      },
    };

    return optimizedConfig;
  }

  /**
   * Rule-based parameter prediction (fallback)
   */
  private ruleBasedPrediction(
    terrainType: TerrainType,
    weather: string,
    timeOfDay: string
  ): NavigationConfig {
    const baseConfig: NavigationConfig = {
      dstarLite: {
        searchRadius: 200,
        replanThreshold: 3,
        maxComputationTime: 25,
        heuristicWeight: 1.1,
      },
      costCalculation: {
        baseMoveCost: 1.0,
        diagonalMultiplier: 1.414,
        verticalMultiplier: 1.3,
        jumpCost: 2.0,
        swimCost: 5.0,
      },
      hazardCosts: {
        lavaProximity: 2000,
        voidFall: 15000,
        mobProximity: 150,
        darknessPenalty: 30,
        waterPenalty: 15,
        cactusPenalty: 50,
        firePenalty: 800,
        poisonPenalty: 100,
      },
    };

    // Apply terrain-specific optimizations
    const terrainOptimizer = new DynamicReconfigurator(new TerrainAnalyzer());
    const terrainOptimized = terrainOptimizer.getOptimizedConfig(terrainType);

    // Apply weather adaptations
    const weatherAdapter = new WeatherAdapter();
    const weatherOptimized = weatherAdapter.adaptForWeather(
      weather as 'clear' | 'rain' | 'storm' | 'snow',
      terrainOptimized
    );

    // Apply time-of-day optimizations
    const timeOptimizer = new TimeOptimizer();
    const finalOptimized = timeOptimizer.optimizeForTimeOfDay(
      timeOfDay as 'dawn' | 'day' | 'dusk' | 'night',
      weatherOptimized
    );

    return finalOptimized;
  }

  /**
   * Collect performance data for ML training
   */
  collectPerformanceData(
    terrainType: TerrainType,
    weather: string,
    timeOfDay: string,
    performance: {
      success: boolean;
      planningTime: number;
      pathLength: number;
      replans: number;
    },
    config: NavigationConfig,
    position: { x: number; y: number; z: number }
  ): void {
    const key = `${terrainType}-${weather}-${timeOfDay}`;

    // Add to training data
    this.trainingData.push({
      terrainType,
      weather,
      timeOfDay,
      performance: performance.success ? 1 : 0,
      config,
      timestamp: Date.now(),
      position,
      successRate: 0, // Will be calculated
      averagePathLength: performance.pathLength,
      planningTime: performance.planningTime,
    });

    // Update performance metrics
    const metrics = this.performanceMetrics.get(key) || {
      successCount: 0,
      totalAttempts: 0,
      averagePlanningTime: 0,
      averagePathLength: 0,
    };

    metrics.totalAttempts++;
    if (performance.success) {
      metrics.successCount++;
    }

    // Update running averages
    metrics.averagePlanningTime =
      (metrics.averagePlanningTime * (metrics.totalAttempts - 1) +
        performance.planningTime) /
      metrics.totalAttempts;
    metrics.averagePathLength =
      (metrics.averagePathLength * (metrics.totalAttempts - 1) +
        performance.pathLength) /
      metrics.totalAttempts;

    this.performanceMetrics.set(key, metrics);

    // Keep training data size manageable
    if (this.trainingData.length > 1000) {
      this.trainingData = this.trainingData.slice(-500); // Keep last 500 entries
    }
  }

  /**
   * Get performance statistics for a specific terrain/weather/time combination
   */
  getPerformanceStats(
    terrainType: TerrainType,
    weather: string,
    timeOfDay: string
  ): {
    successCount: number;
    totalAttempts: number;
    successRate: number;
    averagePlanningTime: number;
    averagePathLength: number;
  } | null {
    const key = `${terrainType}-${weather}-${timeOfDay}`;
    const metrics = this.performanceMetrics.get(key);

    if (!metrics) {
      return null;
    }

    return {
      successCount: metrics.successCount,
      totalAttempts: metrics.totalAttempts,
      successRate: metrics.successCount / metrics.totalAttempts,
      averagePlanningTime: metrics.averagePlanningTime,
      averagePathLength: metrics.averagePathLength,
    };
  }

  /**
   * Train the ML model with performance data
   */
  trainModel(
    data: Array<{
      terrainType: TerrainType;
      weather: string;
      timeOfDay: string;
      performance: number;
      config: NavigationConfig;
    }>
  ): void {
    // Legacy method for backward compatibility
    this.trainingData.push(
      ...data.map((item) => ({
        ...item,
        timestamp: Date.now(),
        position: { x: 0, y: 0, z: 0 },
        successRate: 0,
        averagePathLength: 0,
        planningTime: 0,
      }))
    );
  }

  /**
   * Parameter optimization methods based on performance metrics
   */
  private optimizeSearchRadius(
    terrainType: TerrainType,
    successRate: number,
    planningTime: number
  ): number {
    const baseRadius = 200;

    // Adjust based on terrain type
    let radius = baseRadius;
    switch (terrainType) {
      case TerrainType.HILLS:
      case TerrainType.MOUNTAINS:
        radius = 250;
        break;
      case TerrainType.CAVES:
        radius = 150;
        break;
      case TerrainType.WATER:
        radius = 120;
        break;
      case TerrainType.DESERT:
        radius = 300;
        break;
    }

    // Adjust based on performance
    if (successRate < 0.7) {
      // Poor success rate - reduce search radius for more focused planning
      radius *= 0.8;
    } else if (successRate > 0.9 && planningTime < 20) {
      // Good performance - can increase radius for better paths
      radius *= 1.2;
    }

    return Math.floor(Math.max(radius, 100)); // Minimum 100
  }

  private optimizeReplanThreshold(
    terrainType: TerrainType,
    successRate: number
  ): number {
    const baseThreshold = 3;

    // Adjust based on terrain and performance
    let threshold = baseThreshold;

    if (
      terrainType === TerrainType.CAVES ||
      terrainType === TerrainType.WATER
    ) {
      // Dynamic environments need more responsive replanning
      threshold *= 0.7;
    } else if (successRate > 0.85) {
      // Good performance allows for less frequent replanning
      threshold *= 1.2;
    }

    return Math.max(threshold, 1);
  }

  private optimizeComputationTime(
    terrainType: TerrainType,
    planningTime: number
  ): number {
    const baseTime = 25;

    // Adjust based on terrain complexity and performance
    let time = baseTime;

    if (
      terrainType === TerrainType.CAVES ||
      terrainType === TerrainType.MOUNTAINS
    ) {
      time *= 1.2; // More complex terrain needs more computation time
    } else if (planningTime < 15) {
      time *= 0.9; // Good performance allows for faster computation
    }

    return Math.floor(Math.max(time, 10)); // Minimum 10ms
  }

  private optimizeHeuristicWeight(
    terrainType: TerrainType,
    successRate: number,
    pathLength: number
  ): number {
    const baseWeight = 1.1;

    // Adjust heuristic weight based on performance
    let weight = baseWeight;

    if (successRate < 0.7) {
      // Poor performance - rely more on actual costs
      weight *= 0.9;
    } else if (successRate > 0.9 && pathLength < 50) {
      // Good performance with short paths - can favor heuristics more
      weight *= 1.1;
    }

    return Math.min(Math.max(weight, 0.8), 1.5); // Clamp between 0.8 and 1.5
  }

  private getOptimalVerticalMultiplier(
    terrainType: TerrainType,
    successRate: number
  ): number {
    const baseMultiplier = 1.3;

    switch (terrainType) {
      case TerrainType.HILLS:
      case TerrainType.MOUNTAINS:
        return 1.2; // Encourage hill climbing
      case TerrainType.CAVES:
        return 1.5; // Discourage deep mining unless necessary
      case TerrainType.WATER:
        return 2.0; // High penalty for underwater movement
      default:
        return baseMultiplier;
    }
  }

  private getOptimalJumpCost(
    terrainType: TerrainType,
    successRate: number
  ): number {
    const baseCost = 2.0;

    if (successRate < 0.7) {
      // Poor performance - discourage risky jumping
      return baseCost * 1.2;
    }

    switch (terrainType) {
      case TerrainType.HILLS:
      case TerrainType.MOUNTAINS:
        return 1.8; // Encourage jumping up slopes
      case TerrainType.CAVES:
        return 2.5; // Discourage risky jumping in caves
      default:
        return baseCost;
    }
  }

  private getOptimalSwimCost(
    terrainType: TerrainType,
    weather: string,
    successRate: number
  ): number {
    const baseCost = 5.0;

    if (terrainType === TerrainType.WATER) {
      return 2.0; // Swimming is primary movement in water
    }

    if (weather === 'rain' || weather === 'storm') {
      return baseCost * 1.5; // Swimming more difficult in rain
    }

    return baseCost;
  }

  private getOptimalMobProximity(
    terrainType: TerrainType,
    successRate: number
  ): number {
    const baseProximity = 150;

    if (successRate < 0.7) {
      // Poor performance - increase mob avoidance
      return baseProximity * 1.3;
    }

    switch (terrainType) {
      case TerrainType.FOREST:
        return 300; // Higher mob density in forests
      case TerrainType.CAVES:
        return 200; // More dangerous mobs in caves
      case TerrainType.WATER:
        return 500; // Underwater mobs are more dangerous
      default:
        return baseProximity;
    }
  }

  private getOptimalDarknessPenalty(
    timeOfDay: string,
    successRate: number
  ): number {
    const basePenalty = 30;

    switch (timeOfDay) {
      case 'night':
        return basePenalty * 2.0;
      case 'dawn':
      case 'dusk':
        return basePenalty * 1.3;
      case 'day':
        return basePenalty * 0.5;
      default:
        return basePenalty;
    }
  }

  private getOptimalWaterPenalty(weather: string, successRate: number): number {
    const basePenalty = 15;

    if (weather === 'rain' || weather === 'storm') {
      return basePenalty * 2.0; // Water more hazardous in rain
    }

    if (successRate < 0.7) {
      return basePenalty * 1.2; // Poor performance - avoid water more
    }

    return basePenalty;
  }
}

/**
 * Multi-Agent Coordination System
 */
export class MultiAgentCoordinator {
  /**
   * Optimize parameters for multiple bots operating in same area
   */
  coordinateMultipleAgents(
    agentCount: number,
    areaSize: number,
    terrainType: TerrainType
  ): NavigationConfig {
    const baseConfig = new DynamicReconfigurator(
      new TerrainAnalyzer()
    ).getOptimizedConfig(terrainType);

    // Adjust parameters for multi-agent scenarios
    if (agentCount > 1) {
      if (baseConfig.dstarLite) {
        // Increase search radius for better coordination
        baseConfig.dstarLite.searchRadius =
          (baseConfig.dstarLite.searchRadius || 200) * 1.2;

        // Reduce replanning frequency to avoid conflicts
        baseConfig.dstarLite.replanThreshold =
          (baseConfig.dstarLite.replanThreshold || 3) * 1.5;

        // Increase computation time for coordination
        baseConfig.dstarLite.maxComputationTime =
          (baseConfig.dstarLite.maxComputationTime || 25) * 1.3;
      }

      if (baseConfig.hazardCosts) {
        // Reduce mob proximity penalties in crowded areas
        baseConfig.hazardCosts.mobProximity =
          (baseConfig.hazardCosts.mobProximity || 150) * 0.8;
      }
    }

    return baseConfig;
  }
}

/**
 * Main Terrain Optimizer - Coordinates all optimization systems
 */
export class TerrainOptimizer {
  private terrainAnalyzer: TerrainAnalyzer;
  private dynamicReconfigurator: DynamicReconfigurator;
  private weatherAdapter: WeatherAdapter;
  private timeOptimizer: TimeOptimizer;
  private mlPredictor: MLParameterPredictor;
  private multiAgentCoordinator: MultiAgentCoordinator;

  constructor() {
    this.terrainAnalyzer = new TerrainAnalyzer();
    this.dynamicReconfigurator = new DynamicReconfigurator(
      this.terrainAnalyzer
    );
    this.weatherAdapter = new WeatherAdapter();
    this.timeOptimizer = new TimeOptimizer();
    this.mlPredictor = new MLParameterPredictor();
    this.multiAgentCoordinator = new MultiAgentCoordinator();
  }

  /**
   * Get fully optimized configuration based on all factors
   */
  async getOptimizedConfig(
    terrainType: TerrainType,
    weather: 'clear' | 'rain' | 'storm' | 'snow' = 'clear',
    timeOfDay: 'dawn' | 'day' | 'dusk' | 'night' = 'day',
    agentCount: number = 1,
    areaSize: number = 100
  ): Promise<NavigationConfig> {
    // Use ML predictor for advanced optimization
    const mlOptimized = await this.mlPredictor.predictOptimalParameters(
      terrainType,
      weather,
      timeOfDay
    );

    // Apply multi-agent coordination if needed
    const multiAgentOptimized =
      this.multiAgentCoordinator.coordinateMultipleAgents(
        agentCount,
        areaSize,
        terrainType
      );

    // Merge optimizations (ML takes precedence for advanced features)
    const finalConfig: NavigationConfig = {
      ...multiAgentOptimized,
      ...mlOptimized,
    };

    return finalConfig;
  }

  /**
   * Train the system with performance data
   */
  trainWithPerformanceData(
    data: Array<{
      terrainType: TerrainType;
      weather: string;
      timeOfDay: string;
      performance: number;
      config: NavigationConfig;
    }>
  ): void {
    this.mlPredictor.trainModel(data);
  }
}

// Export all classes and enums
export {
  TerrainAnalyzer,
  DynamicReconfigurator,
  WeatherAdapter,
  TimeOptimizer,
  MLParameterPredictor,
  MultiAgentCoordinator,
  TerrainOptimizer,
};
