/**
 * Environmental Detector - Real-time biome and dimension detection for navigation
 *
 * Provides:
 * - Real-time biome detection and classification
 * - Dimension identification (Overworld, Nether, End)
 * - Weather monitoring and prediction
 * - Environmental hazard mapping
 * - Terrain feature analysis
 *
 * @author @darianrosebrook
 */

import { Vec3 } from 'vec3';
import { EventEmitter } from 'events';

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface BiomeInfo {
  name: string;
  type: 'overworld' | 'nether' | 'end';
  temperature: number; // -1 to 1 (cold to hot)
  humidity: number; // 0 to 1 (dry to wet)
  elevation: number; // Average elevation
  hazards: string[]; // Biome-specific hazards
  resources: string[]; // Biome-specific resources
  navigationDifficulty: number; // 0-1 (easy to hard)
  stability: number; // 0-1 (stable to unstable)
}

export interface DimensionInfo {
  name: 'overworld' | 'nether' | 'end';
  gravity: number; // Multiplier for jump physics
  hazards: string[]; // Dimension-specific hazards
  resources: string[]; // Dimension-specific resources
  timeFlow: number; // Time speed multiplier
  portalRequired: boolean; // Whether portals are needed to enter
  navigationRules: {
    lavaSwimming: boolean;
    waterBreathing: boolean;
    flightAllowed: boolean;
    teleportationEnabled: boolean;
  };
}

export interface WeatherInfo {
  type: 'clear' | 'rain' | 'snow' | 'storm' | 'fog';
  intensity: number; // 0-1
  duration: number; // seconds remaining
  effects: {
    visibility: number; // 0-1
    movementSpeed: number; // multiplier
    hazardRisk: number; // 0-1 additional risk
    resourceAvailability: number; // multiplier
  };
  predictedChanges: Array<{
    newType: WeatherInfo['type'];
    probability: number;
    timeframe: number; // seconds
  }>;
}

export interface EnvironmentalState {
  biome: BiomeInfo;
  dimension: DimensionInfo;
  weather: WeatherInfo;
  position: Vec3;
  timestamp: number;
  stabilityScore: number; // 0-1 overall stability
  navigationScore: number; // 0-1 navigation ease
}

// ============================================================================
// Biome Definitions
// ============================================================================

export class BiomeDatabase {
  private static biomes: Map<string, BiomeInfo> = new Map();

  static {
    // Overworld biomes
    this.biomes.set('plains', {
      name: 'plains',
      type: 'overworld',
      temperature: 0.8,
      humidity: 0.4,
      elevation: 64,
      hazards: ['lightning'],
      resources: ['wheat', 'carrots', 'potatoes', 'grass', 'flowers'],
      navigationDifficulty: 0.2,
      stability: 0.9,
    });

    this.biomes.set('forest', {
      name: 'forest',
      type: 'overworld',
      temperature: 0.7,
      humidity: 0.8,
      elevation: 68,
      hazards: ['falling_trees', 'dense_vegetation', 'wildlife'],
      resources: ['wood', 'apples', 'mushrooms', 'berries'],
      navigationDifficulty: 0.4,
      stability: 0.8,
    });

    this.biomes.set('desert', {
      name: 'desert',
      type: 'overworld',
      temperature: 1.0,
      humidity: 0.0,
      elevation: 70,
      hazards: ['heat_stroke', 'sand_storms', 'cacti', 'scorpions'],
      resources: ['cactus', 'dead_bush', 'sand', 'gold_ore'],
      navigationDifficulty: 0.6,
      stability: 0.7,
    });

    this.biomes.set('mountains', {
      name: 'mountains',
      type: 'overworld',
      temperature: 0.2,
      humidity: 0.3,
      elevation: 120,
      hazards: ['falling', 'steep_slopes', 'wind', 'cold'],
      resources: ['stone', 'coal', 'iron', 'emeralds'],
      navigationDifficulty: 0.8,
      stability: 0.6,
    });

    this.biomes.set('ocean', {
      name: 'ocean',
      type: 'overworld',
      temperature: 0.5,
      humidity: 1.0,
      elevation: 62,
      hazards: ['drowning', 'currents', 'sea_creatures', 'depth_pressure'],
      resources: ['fish', 'kelp', 'sea_grass', 'shipwrecks'],
      navigationDifficulty: 0.7,
      stability: 0.5,
    });

    // Nether biomes
    this.biomes.set('nether_wastes', {
      name: 'nether_wastes',
      type: 'nether',
      temperature: 2.0,
      humidity: 0.0,
      elevation: 80,
      hazards: ['lava', 'fire', 'ghasts', 'pigmen', 'wither_skeletons'],
      resources: ['netherrack', 'glowstone', 'quartz', 'nether_wart'],
      navigationDifficulty: 0.9,
      stability: 0.3,
    });

    // End biome
    this.biomes.set('the_end', {
      name: 'the_end',
      type: 'end',
      temperature: 0.5,
      humidity: 0.5,
      elevation: 50,
      hazards: ['void', 'endermen', 'ender_dragon', 'end_crystals'],
      resources: ['end_stone', 'obsidian', 'ender_pearls', 'elytra'],
      navigationDifficulty: 0.8,
      stability: 0.4,
    });
  }

  static getBiome(name: string): BiomeInfo | undefined {
    return this.biomes.get(name);
  }

  static getBiomesByType(type: BiomeInfo['type']): BiomeInfo[] {
    return Array.from(this.biomes.values()).filter(
      (biome) => biome.type === type
    );
  }

  static getAllBiomes(): BiomeInfo[] {
    return Array.from(this.biomes.values());
  }

  static getBiomesByTemperatureRange(min: number, max: number): BiomeInfo[] {
    return Array.from(this.biomes.values()).filter(
      (biome) => biome.temperature >= min && biome.temperature <= max
    );
  }
}

// ============================================================================
// Dimension Definitions
// ============================================================================

export class DimensionDatabase {
  private static dimensions: Map<string, DimensionInfo> = new Map();

  static {
    this.dimensions.set('overworld', {
      name: 'overworld',
      gravity: 1.0,
      hazards: ['monsters', 'animals', 'weather'],
      resources: ['wood', 'stone', 'ores', 'crops'],
      timeFlow: 1.0,
      portalRequired: false,
      navigationRules: {
        lavaSwimming: false,
        waterBreathing: false,
        flightAllowed: false,
        teleportationEnabled: true,
      },
    });

    this.dimensions.set('nether', {
      name: 'nether',
      gravity: 1.0,
      hazards: ['lava', 'fire', 'ghasts', 'pigmen', 'wither_skeletons'],
      resources: ['netherrack', 'glowstone', 'quartz', 'nether_wart'],
      timeFlow: 8.0, // 8x faster time
      portalRequired: true,
      navigationRules: {
        lavaSwimming: true,
        waterBreathing: false,
        flightAllowed: true,
        teleportationEnabled: false,
      },
    });

    this.dimensions.set('end', {
      name: 'end',
      gravity: 0.8, // Lower gravity
      hazards: ['void', 'endermen', 'ender_dragon'],
      resources: ['end_stone', 'obsidian', 'elytra'],
      timeFlow: 1.0,
      portalRequired: true,
      navigationRules: {
        lavaSwimming: false,
        waterBreathing: false,
        flightAllowed: true,
        teleportationEnabled: false,
      },
    });
  }

  static getDimension(name: string): DimensionInfo | undefined {
    return this.dimensions.get(name);
  }

  static getAllDimensions(): DimensionInfo[] {
    return Array.from(this.dimensions.values());
  }
}

// ============================================================================
// Weather System
// ============================================================================

export class WeatherPredictor {
  private weatherPatterns: Map<
    string,
    Array<{
      type: WeatherInfo['type'];
      duration: number;
      timestamp: number;
    }>
  > = new Map();

  predictWeather(
    currentWeather: WeatherInfo,
    biome: string
  ): WeatherInfo['predictedChanges'] {
    const patterns = this.weatherPatterns.get(biome) || [];
    const recentWeather = patterns.slice(-10); // Last 10 weather events

    if (recentWeather.length < 3) {
      // Not enough data for prediction
      return [];
    }

    // Analyze patterns and predict changes
    const predictions: WeatherInfo['predictedChanges'] = [];

    // Simple pattern-based prediction
    const weatherCounts: Record<string, number> = {};
    for (const weather of recentWeather) {
      weatherCounts[weather.type] = (weatherCounts[weather.type] || 0) + 1;
    }

    const totalWeather = recentWeather.length;
    for (const [weatherType, count] of Object.entries(weatherCounts)) {
      const probability = count / totalWeather;
      if (probability > 0.3 && weatherType !== currentWeather.type) {
        predictions.push({
          newType: weatherType as WeatherInfo['type'],
          probability,
          timeframe: 300 + Math.random() * 600, // 5-15 minutes
        });
      }
    }

    return predictions.sort((a, b) => b.probability - a.probability);
  }

  recordWeatherEvent(biome: string, weather: WeatherInfo): void {
    if (!this.weatherPatterns.has(biome)) {
      this.weatherPatterns.set(biome, []);
    }

    this.weatherPatterns.get(biome)!.push({
      type: weather.type,
      duration: weather.duration,
      timestamp: Date.now(),
    });

    // Keep only recent weather events (last 100)
    const patterns = this.weatherPatterns.get(biome)!;
    if (patterns.length > 100) {
      this.weatherPatterns.set(biome, patterns.slice(-100));
    }
  }
}

// ============================================================================
// Environmental Hazard Detector
// ============================================================================

export class EnvironmentalHazardDetector {
  detectHazards(
    position: Vec3,
    biome: BiomeInfo,
    weather: WeatherInfo
  ): Array<{
    type: string;
    position: Vec3;
    severity: 'low' | 'medium' | 'high';
    description: string;
    avoidanceDistance: number;
  }> {
    const hazards: Array<{
      type: string;
      position: Vec3;
      severity: 'low' | 'medium' | 'high';
      description: string;
      avoidanceDistance: number;
    }> = [];

    // Biome-specific hazards
    for (const hazard of biome.hazards) {
      hazards.push({
        type: hazard,
        position: position.clone(), // Would be more specific in real implementation
        severity: this.assessHazardSeverity(hazard, weather),
        description: this.getHazardDescription(hazard),
        avoidanceDistance: this.getAvoidanceDistance(hazard),
      });
    }

    // Weather-specific hazards
    if (weather.type === 'storm') {
      hazards.push({
        type: 'lightning_strike',
        position: position.clone(),
        severity: weather.intensity > 0.7 ? 'high' : 'medium',
        description: 'Lightning strikes possible',
        avoidanceDistance: 10,
      });
    }

    if (weather.type === 'fog') {
      hazards.push({
        type: 'reduced_visibility',
        position: position.clone(),
        severity: 'medium',
        description: 'Fog reduces visibility',
        avoidanceDistance: 5,
      });
    }

    return hazards;
  }

  private assessHazardSeverity(
    hazard: string,
    weather: WeatherInfo
  ): 'low' | 'medium' | 'high' {
    const baseSeverity: Record<string, 'low' | 'medium' | 'high'> = {
      lightning: 'medium',
      heat_stroke: 'low',
      sand_storms: 'medium',
      cacti: 'low',
      scorpions: 'low',
      falling: 'high',
      steep_slopes: 'high',
      wind: 'medium',
      cold: 'medium',
      drowning: 'high',
      currents: 'medium',
      sea_creatures: 'medium',
      depth_pressure: 'high',
      lava: 'high',
      fire: 'high',
      ghasts: 'high',
      pigmen: 'medium',
      wither_skeletons: 'high',
      void: 'high',
      endermen: 'medium',
      ender_dragon: 'high',
      end_crystals: 'high',
    };

    const base = baseSeverity[hazard] || 'medium';

    // Adjust based on weather
    if (
      weather.type === 'storm' &&
      (hazard === 'lightning' || hazard.includes('electric'))
    ) {
      return 'high';
    }

    if (weather.type === 'rain' && hazard === 'slippery') {
      return 'high';
    }

    return base;
  }

  private getHazardDescription(hazard: string): string {
    const descriptions: Record<string, string> = {
      lightning: 'Lightning can strike nearby',
      heat_stroke: 'Extreme heat can cause damage',
      sand_storms: 'Reduces visibility and causes damage',
      cacti: 'Causes damage on contact',
      scorpions: 'Poisonous creatures',
      falling: 'Risk of falling from heights',
      steep_slopes: 'Difficult to navigate',
      wind: 'Can push off course',
      cold: 'Extreme cold causes damage',
      drowning: 'Water can cause drowning',
      currents: 'Strong currents can pull underwater',
      sea_creatures: 'Hostile underwater creatures',
      depth_pressure: 'Deep water pressure damage',
      lava: 'Contact causes severe damage',
      fire: 'Contact causes damage over time',
      ghasts: 'Flying hostile creatures that shoot fireballs',
      pigmen: 'Hostile when provoked',
      wither_skeletons: 'Strong hostile creatures with wither effect',
      void: 'Falling into void causes instant death',
      endermen: 'Hostile when looked at',
      ender_dragon: 'Extremely powerful boss creature',
      end_crystals: 'Explosive healing crystals',
    };

    return descriptions[hazard] || 'Environmental hazard';
  }

  private getAvoidanceDistance(hazard: string): number {
    const distances: Record<string, number> = {
      lightning: 15,
      heat_stroke: 5,
      sand_storms: 20,
      cacti: 2,
      scorpions: 3,
      falling: 5,
      steep_slopes: 3,
      wind: 10,
      cold: 5,
      drowning: 3,
      currents: 8,
      sea_creatures: 5,
      depth_pressure: 10,
      lava: 8,
      fire: 3,
      ghasts: 20,
      pigmen: 10,
      wither_skeletons: 8,
      void: 5,
      endermen: 5,
      ender_dragon: 30,
      end_crystals: 15,
    };

    return distances[hazard] || 5;
  }
}

// ============================================================================
// Main Environmental Detector
// ============================================================================

export class EnvironmentalDetector extends EventEmitter {
  private weatherPredictor: WeatherPredictor;
  private hazardDetector: EnvironmentalHazardDetector;
  private currentState: EnvironmentalState | null = null;
  private updateInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.weatherPredictor = new WeatherPredictor();
    this.hazardDetector = new EnvironmentalHazardDetector();
  }

  startMonitoring(updateInterval: number = 5000): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    this.updateInterval = setInterval(() => {
      this.analyzeEnvironment(new Vec3(0, 64, 0)); // Update with current position
    }, updateInterval);

    console.log('🌍 Environmental monitoring started');
  }

  stopMonitoring(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    console.log('🌍 Environmental monitoring stopped');
  }

  async analyzeEnvironment(position: Vec3): Promise<EnvironmentalState> {
    // This would integrate with actual Minecraft world data
    // For now, return mock data based on position
    const biomeName = this.estimateBiomeFromPosition(position);
    const biome =
      BiomeDatabase.getBiome(biomeName) || BiomeDatabase.getBiome('plains')!;

    const dimensionName = this.estimateDimensionFromPosition(position);
    const dimension = DimensionDatabase.getDimension(dimensionName)!;

    const weather = await this.getCurrentWeather(biome, position);

    const state: EnvironmentalState = {
      biome,
      dimension,
      weather,
      position,
      timestamp: Date.now(),
      stabilityScore: this.calculateStabilityScore(biome, weather),
      navigationScore: this.calculateNavigationScore(biome, dimension, weather),
    };

    this.currentState = state;
    this.emit('environment-updated', state);

    return state;
  }

  private estimateBiomeFromPosition(position: Vec3): string {
    // Simple biome estimation based on position characteristics
    const y = position.y;

    if (y > 100) return 'mountains';
    if (y < 50) return 'ocean';
    if (y > 80) return 'hills';

    // Add some randomness for variety
    const random = Math.random();
    if (random < 0.4) return 'plains';
    if (random < 0.7) return 'forest';
    return 'desert';
  }

  private estimateDimensionFromPosition(position: Vec3): string {
    // This would detect actual dimension in real implementation
    // For now, assume overworld unless position suggests otherwise
    if (position.y < 0 && Math.random() < 0.1) return 'nether';
    if (position.y > 200 && Math.random() < 0.05) return 'end';
    return 'overworld';
  }

  private async getCurrentWeather(
    biome: BiomeInfo,
    position: Vec3
  ): Promise<WeatherInfo> {
    // Mock weather data - would integrate with actual weather system
    const weatherTypes: WeatherInfo['type'][] = [
      'clear',
      'rain',
      'snow',
      'storm',
      'fog',
    ];
    const type = weatherTypes[Math.floor(Math.random() * weatherTypes.length)];

    const weather: WeatherInfo = {
      type,
      intensity: Math.random(),
      duration: 300 + Math.random() * 1200, // 5-25 minutes
      effects: {
        visibility: type === 'fog' ? 0.3 : type === 'storm' ? 0.6 : 1.0,
        movementSpeed: type === 'snow' ? 0.7 : type === 'rain' ? 0.9 : 1.0,
        hazardRisk: type === 'storm' ? 0.8 : type === 'rain' ? 0.4 : 0.2,
        resourceAvailability: type === 'clear' ? 1.2 : 0.8,
      },
      predictedChanges: this.weatherPredictor.predictWeather(
        {
          type,
          intensity: 0,
          duration: 0,
          effects: {
            visibility: 1,
            movementSpeed: 1,
            hazardRisk: 0,
            resourceAvailability: 1,
          },
          predictedChanges: [],
        },
        biome.name
      ),
    };

    this.weatherPredictor.recordWeatherEvent(biome.name, weather);
    return weather;
  }

  private calculateStabilityScore(
    biome: BiomeInfo,
    weather: WeatherInfo
  ): number {
    let score = biome.stability;

    // Weather affects stability
    if (weather.type === 'storm') score *= 0.7;
    if (weather.type === 'rain') score *= 0.9;
    if (weather.type === 'fog') score *= 0.8;

    return Math.max(0, Math.min(1, score));
  }

  private calculateNavigationScore(
    biome: BiomeInfo,
    dimension: DimensionInfo,
    weather: WeatherInfo
  ): number {
    let score = 1.0;

    // Biome difficulty
    score -= biome.navigationDifficulty * 0.3;

    // Dimension-specific challenges
    if (dimension.name === 'nether') score -= 0.4;
    if (dimension.name === 'end') score -= 0.3;

    // Weather effects
    score -= weather.effects.movementSpeed < 1 ? 0.2 : 0;
    score -= weather.effects.visibility < 0.8 ? 0.2 : 0;

    return Math.max(0, Math.min(1, score));
  }

  getCurrentState(): EnvironmentalState | null {
    return this.currentState;
  }

  detectHazards(position: Vec3): Array<{
    type: string;
    position: Vec3;
    severity: 'low' | 'medium' | 'high';
    description: string;
    avoidanceDistance: number;
  }> {
    if (!this.currentState) return [];

    return this.hazardDetector.detectHazards(
      position,
      this.currentState.biome,
      this.currentState.weather
    );
  }

  getEnvironmentalStats(): {
    biomesAnalyzed: number;
    dimensionsDetected: number;
    weatherPatterns: number;
    hazardsDetected: number;
    averageStability: number;
  } {
    const biomes = BiomeDatabase.getAllBiomes().length; // Using this as proxy
    const dimensions = DimensionDatabase.getAllDimensions().length;
    const weatherPatterns = this.weatherPredictor['weatherPatterns'].size;
    const hazards = Object.keys(this.hazardDetector['hazardSeverity']).length;

    return {
      biomesAnalyzed: biomes,
      dimensionsDetected: dimensions,
      weatherPatterns,
      hazardsDetected: hazards,
      averageStability: this.currentState?.stabilityScore || 0,
    };
  }
}

// ============================================================================
// Export Default Instance
// ============================================================================

export const environmentalDetector = new EnvironmentalDetector();
