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
    // Fetch environment data from planning system
    const planningRes = await fetch('http://localhost:3002/environment');

    if (!planningRes.ok) {
      return NextResponse.json(
        { error: 'Environment data unavailable' },
        { status: 503 }
      );
    }

    const planningData = await planningRes.json();

    if (!planningData.success || !planningData.environment) {
      return NextResponse.json(
        { error: 'No environment data available' },
        { status: 503 }
      );
    }

    const envData = planningData.environment;

    // Convert to dashboard format
    const environment: Environment = {
      biome: envData.biome || 'Unknown',
      weather: envData.weather || 'Unknown',
      timeOfDay: envData.timeOfDay || 'Unknown',
      nearbyEntities: [],
    };

    // Add nearby entities
    if (envData.nearbyEntities && envData.nearbyEntities.length > 0) {
      for (const entity of envData.nearbyEntities.slice(0, 10)) {
        environment.nearbyEntities.push(
          `${entity.name} (${Math.round(entity.distance)}m${entity.hostile ? ', hostile' : ''})`
        );
      }
    }

    // Add nearby blocks
    if (envData.nearbyBlocks && envData.nearbyBlocks.length > 0) {
      const blockTypes = new Set(envData.nearbyBlocks.map((b: any) => b.type));
      environment.nearbyEntities.push(`${blockTypes.size} block types nearby`);
    }

    // Add environmental conditions
    if (envData.lightLevel !== undefined) {
      environment.nearbyEntities.push(`Light level: ${envData.lightLevel}/15`);
    }

    if (envData.temperature !== undefined) {
      environment.nearbyEntities.push(
        `Temperature: ${Math.round(envData.temperature)}°C`
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
