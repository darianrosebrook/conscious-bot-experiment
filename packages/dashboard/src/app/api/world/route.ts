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

    // Read from the actual response shape: envData.environment.{biome,weather,timeOfDay}
    const rawTime = envData.environment?.timeOfDay ?? envData.timeOfDay;

    // Convert to dashboard format
    const environment: Environment = {
      biome: envData.environment?.biome || envData.player?.dimension || 'Unknown',
      weather: envData.environment?.weather || 'Unknown',
      timeOfDay: rawTime != null
        ? `${Math.floor(rawTime / 1000)}:${String(Math.floor((rawTime % 1000) / 16.67)).padStart(2, '0')}`
        : 'Unknown',
      nearbyEntities: [],
    };

    // Add nearby entities — try direct worldState paths first, then legacy _minecraftState
    const entitySource =
      envData.nearbyEntities ||
      envData.environment?.nearbyEntities ||
      envData._minecraftState?.environment?.nearbyEntities;
    if (entitySource && entitySource.length > 0) {
      for (const entity of entitySource.slice(0, 10)) {
        environment.nearbyEntities.push(
          `${entity.type || entity.name || 'entity'} (${entity.isHostile ? 'hostile' : 'passive'})`
        );
      }
    }

    // Add nearby blocks — try direct worldState paths first, then legacy _minecraftState
    const blockSource =
      envData.nearbyBlocks ||
      envData.environment?.nearbyBlocks ||
      envData._minecraftState?.environment?.nearbyBlocks;
    if (blockSource && blockSource.length > 0) {
      const blockTypes = new Set(
        blockSource.map((b: any) => b.type)
      );
      environment.nearbyEntities.push(`${blockTypes.size} block types nearby`);
    }

    // Add environmental conditions
    const isRaining = envData.environment?.isRaining ?? envData._minecraftState?.environment?.isRaining;
    if (isRaining !== undefined) {
      environment.nearbyEntities.push(
        `Raining: ${isRaining ? 'Yes' : 'No'}`
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
