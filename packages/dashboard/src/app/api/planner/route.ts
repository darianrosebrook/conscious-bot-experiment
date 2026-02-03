import { NextResponse } from 'next/server';

/**
 * Planner API
 * Proxies to planning service GET /planner
 *
 * @author @darianrosebrook
 */
export async function GET() {
  try {
    const planningUrl =
      process.env.PLANNING_SERVICE_URL || 'http://localhost:3002';

    const res = await fetch(`${planningUrl}/planner`, {
      signal: AbortSignal.timeout(5000),
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`Planning service returned ${res.status}`);
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: 'Planning service unavailable' },
      { status: 503 }
    );
  }
}
