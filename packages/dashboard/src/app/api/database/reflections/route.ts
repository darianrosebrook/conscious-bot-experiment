/**
 * Database Reflections API Route
 *
 * Proxies to memory service /enhanced/reflections with pagination.
 *
 * @author @darianrosebrook
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const memoryUrl = process.env.MEMORY_SERVICE_URL || 'http://localhost:3001';
  const { searchParams } = new URL(request.url);

  const page = searchParams.get('page') || '1';
  const limit = searchParams.get('limit') || '20';
  const includePlaceholders = searchParams.get('includePlaceholders') || 'true';

  try {
    const params = new URLSearchParams({ page, limit, includePlaceholders });

    const res = await fetch(
      `${memoryUrl}/enhanced/reflections?${params.toString()}`,
      { signal: AbortSignal.timeout(10000) }
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Memory service unavailable' },
        { status: 503 }
      );
    }

    const data = await res.json();
    return NextResponse.json(
      data.data ?? { reflections: [], lessons: [], narrative: null, page: 1, limit: 20 }
    );
  } catch (error) {
    console.error('Error fetching reflections:', error);
    return NextResponse.json(
      { error: 'Failed to fetch reflections' },
      { status: 500 }
    );
  }
}
