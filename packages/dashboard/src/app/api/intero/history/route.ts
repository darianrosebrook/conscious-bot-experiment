import { NextRequest, NextResponse } from 'next/server';

/**
 * Intero History API
 * Proxies to cognition service GET /intero/history
 *
 * @author @darianrosebrook
 */
export async function GET(request: NextRequest) {
  try {
    const cognitionUrl =
      process.env.COGNITION_SERVICE_URL || 'http://localhost:3003';
    const timeoutMs = 5000;

    const { searchParams } = new URL(request.url);
    const since = searchParams.get('since') || '0';
    const limit = searchParams.get('limit') || '300';

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(
      `${cognitionUrl}/intero/history?since=${since}&limit=${limit}`,
      {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      }
    );

    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`Cognition service returned ${res.status}`);
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching intero history:', error);
    return NextResponse.json(
      {
        success: false,
        snapshots: [],
        summary: { count: 0, oldestTs: 0, newestTs: 0 },
        currentIntero: null,
        error: 'Cognition service temporarily unavailable',
      },
      { status: 503 }
    );
  }
}
