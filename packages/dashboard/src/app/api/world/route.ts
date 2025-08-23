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
    // Fetch data from world and minecraft systems
    const [worldRes, minecraftRes] = await Promise.allSettled([
      fetch('http://localhost:3004/state'),
      fetch('http://localhost:3005/state'),
    ]);

    const environment: Environment = {
      biome: 'Unknown',
      weather: 'Unknown',
      timeOfDay: 'Unknown',
      nearbyEntities: [],
    };

    // Get world system data
    if (worldRes.status === 'fulfilled' && worldRes.value.ok) {
      const worldData = await worldRes.value.json();
      if (worldData.placeGraph?.knownPlaces?.length > 0) {
        environment.nearbyEntities.push(`${worldData.placeGraph.knownPlaces.length} known places`);
      }
      if (worldData.perception?.visibleEntities?.length > 0) {
        environment.nearbyEntities.push(`${worldData.perception.visibleEntities.length} visible entities`);
      }
    }

    // Get minecraft data
    if (minecraftRes.status === 'fulfilled' && minecraftRes.value.ok) {
      const minecraftData = await minecraftRes.value.json();
      if (minecraftData.data) {
        // Determine biome based on position (simplified)
        const y = minecraftData.data.position?.y || 64;
        if (y > 80) environment.biome = 'Mountains';
        else if (y < 50) environment.biome = 'Underground';
        else environment.biome = 'Plains';

        // Set weather
        environment.weather = minecraftData.data.weather || 'Clear';

        // Determine time of day
        const time = minecraftData.data.time || 0;
        const hours = Math.floor(time / 1000);
        if (hours >= 6 && hours < 12) environment.timeOfDay = 'Morning';
        else if (hours >= 12 && hours < 18) environment.timeOfDay = 'Afternoon';
        else if (hours >= 18 && hours < 24) environment.timeOfDay = 'Evening';
        else environment.timeOfDay = 'Night';

        // Add inventory info
        if (minecraftData.data.inventory?.length > 0) {
          environment.nearbyEntities.push(`${minecraftData.data.inventory.length} items in inventory`);
        }
      }
    }

    return NextResponse.json({
      environment,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
