/**
 * Database Memories Browse API Route
 *
 * Proxies to memory service /enhanced/memories with pagination and filters.
 *
 * @author @darianrosebrook
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const memoryUrl = process.env.MEMORY_SERVICE_URL || 'http://localhost:3001';
  const { searchParams } = new URL(request.url);

  const page = searchParams.get('page') || '1';
  const limit = searchParams.get('limit') || '20';
  const type = searchParams.get('type') || '';
  const sortBy = searchParams.get('sortBy') || 'created';

  try {
    const params = new URLSearchParams({ page, limit, sortBy });
    if (type) params.set('type', type);

    const res = await fetch(
      `${memoryUrl}/enhanced/memories?${params.toString()}`,
      { signal: AbortSignal.timeout(10000) }
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Memory service unavailable' },
        { status: 503 }
      );
    }

    const data = await res.json();
    return NextResponse.json(data.data ?? { memories: [], page: 1, limit: 20, total: 0 });
  } catch (error) {
    console.error('Error fetching memories:', error);
    return NextResponse.json(
      { error: 'Failed to fetch memories' },
      { status: 500 }
    );
  }
}
