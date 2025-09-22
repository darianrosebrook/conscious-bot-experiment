import { NextRequest, NextResponse } from 'next/server';
import type { Environment } from '@/types';

/**
 * World API
 * Provides environment and world state data
 *
 * @author @darianrosebrook
 */
export async function GET(_request: NextRequest) {
  try {
    // Get minecraft service URL from environment
    const minecraftUrl =
      process.env.MINECRAFT_SERVICE_URL || 'http://localhost:3005';

    // Fetch environment data from minecraft service
    const minecraftRes = await fetch(`${minecraftUrl}/state`);

    if (!minecraftRes.ok) {
      return NextResponse.json(
        { error: 'Environment data unavailable' },
        { status: 503 }
      );
    }

    const minecraftData = await minecraftRes.json();

    if (!minecraftData.success || !minecraftData.data?.worldState) {
      return NextResponse.json(
        { error: 'No environment data available' },
        { status: 503 }
      );
    }

    const envData = minecraftData.data.worldState;

    // Convert to dashboard format
    const environment: Environment = {
      biome: 'Overworld', // Minecraft dimension
      weather: envData.weather || 'Unknown',
      timeOfDay: envData.timeOfDay
        ? `${Math.floor(envData.timeOfDay / 1000)}:${Math.floor((envData.timeOfDay % 1000) / 16.67)}`
        : 'Unknown',
      nearbyEntities: [],
    };

    // Add nearby entities from minecraft data
    if (
      envData._minecraftState?.environment?.nearbyEntities &&
      envData._minecraftState.environment.nearbyEntities.length > 0
    ) {
      for (const entity of envData._minecraftState.environment.nearbyEntities.slice(
        0,
        10
      )) {
        environment.nearbyEntities.push(
          `${entity.type} (${entity.isHostile ? 'hostile' : 'passive'})`
        );
      }
    }

    // Add nearby blocks
    if (
      envData._minecraftState?.environment?.nearbyBlocks &&
      envData._minecraftState.environment.nearbyBlocks.length > 0
    ) {
      const blockTypes = new Set(
        envData._minecraftState.environment.nearbyBlocks.map((b: any) => b.type)
      );
      environment.nearbyEntities.push(`${blockTypes.size} block types nearby`);
    }

    // Add environmental conditions
    if (envData._minecraftState?.environment?.isRaining !== undefined) {
      environment.nearbyEntities.push(
        `Raining: ${envData._minecraftState.environment.isRaining ? 'Yes' : 'No'}`
      );
    }

    // Add resource counts
    if (envData.nearbyLogs !== undefined) {
      environment.nearbyEntities.push(`Nearby logs: ${envData.nearbyLogs}`);
    }
    if (envData.nearbyOres !== undefined) {
      environment.nearbyEntities.push(`Nearby ores: ${envData.nearbyOres}`);
    }
    if (envData.nearbyWater !== undefined) {
      environment.nearbyEntities.push(`Nearby water: ${envData.nearbyWater}`);
    }
    if (envData.nearbyHostiles !== undefined) {
      environment.nearbyEntities.push(
        `Nearby hostiles: ${envData.nearbyHostiles}`
      );
    }
    if (envData.nearbyPassives !== undefined) {
      environment.nearbyEntities.push(
        `Nearby passives: ${envData.nearbyPassives}`
      );
    }

    return NextResponse.json({
      environment,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching environment data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch environment data' },
      { status: 500 }
    );
  }
}
