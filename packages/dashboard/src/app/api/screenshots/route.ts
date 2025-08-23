import { NextRequest, NextResponse } from 'next/server';
import type { Screenshot } from '@/types';

/**
 * API route handler for screenshots
 * Forwards requests to the minecraft bot (port 3005)
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
    const response = await fetch(`http://localhost:3005/screenshots?${params}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Minecraft bot error: ${response.statusText}`);
    }

    const result: Screenshot[] = await response.json();
    return NextResponse.json(result);

  } catch (error) {
    // In production, use proper logging service
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Return empty array if minecraft bot is unavailable
    return NextResponse.json([]);
  }
}
