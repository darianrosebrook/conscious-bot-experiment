import { NextRequest, NextResponse } from 'next/server';
import type { Environment } from '@/types';

/**
 * API route handler for world snapshot
 * Forwards requests to the world system (port 3004)
 */
export async function GET(_request: NextRequest) {
  try {
    // Forward to world system
    const response = await fetch('http://localhost:3004/snapshot', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`World system error: ${response.statusText}`);
    }

    const result: Environment = await response.json();
    return NextResponse.json(result);

  } catch (error) {
    console.error('World snapshot API error:', error);
    
    // Return fallback data if world system is unavailable
    const fallbackData: Environment = {
      biome: "Unknown",
      weather: "Unknown", 
      timeOfDay: "Unknown",
      nearbyEntities: [],
    };

    return NextResponse.json(fallbackData);
  }
}
