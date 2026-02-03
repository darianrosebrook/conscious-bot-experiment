import { NextRequest, NextResponse } from 'next/server';
import type { Screenshot } from '@/types';

/**
 * API route handler for screenshots
 * Provides bot screenshots from the minecraft interface
 * 
 * @author @darianrosebrook
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');
    const limit = searchParams.get('limit') || '10';

    // Build query parameters
    const params = new URLSearchParams();
    if (sessionId) params.append('sessionId', sessionId);
    params.append('limit', limit);

    // Forward to minecraft bot
    const minecraftUrl =
      process.env.MINECRAFT_ENDPOINT || 'http://localhost:3005';
    const response = await fetch(
      `${minecraftUrl}/screenshots?${params}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Minecraft bot error: ${response.statusText}`);
    }

    const result: Screenshot[] = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    // Return empty array if minecraft bot is unavailable
    return NextResponse.json([]);
  }
}
