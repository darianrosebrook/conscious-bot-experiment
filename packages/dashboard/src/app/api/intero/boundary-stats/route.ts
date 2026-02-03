import { NextResponse } from 'next/server';

/**
 * Intero Boundary Stats API
 * Proxies to cognition service GET /intero/boundary-stats
 *
 * @author @darianrosebrook
 */
export async function GET() {
  try {
    const cognitionUrl =
      process.env.COGNITION_SERVICE_URL || 'http://localhost:3003';

    const res = await fetch(`${cognitionUrl}/intero/boundary-stats`, {
      signal: AbortSignal.timeout(3000),
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`Cognition service returned ${res.status}`);
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      {
        success: false,
        totalEvents: 0,
        eventCounts: {},
        acceptResistRatio: 0,
      },
      { status: 503 }
    );
  }
}
