/**
 * Single Memory Full-Content API Route
 *
 * Proxies to memory service /enhanced/memories/:id for on-demand full content.
 *
 * @author @darianrosebrook
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const memoryUrl = process.env.MEMORY_SERVICE_URL || 'http://localhost:3001';
  const { id } = await params;

  try {
    const res = await fetch(`${memoryUrl}/enhanced/memories/${id}`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      if (res.status === 404) {
        return NextResponse.json(
          { error: 'Memory not found' },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: 'Memory service unavailable' },
        { status: 503 }
      );
    }

    const data = await res.json();
    return NextResponse.json(data.data ?? null);
  } catch (error) {
    console.error('Error fetching memory by id:', error);
    return NextResponse.json(
      { error: 'Failed to fetch memory' },
      { status: 500 }
    );
  }
}
