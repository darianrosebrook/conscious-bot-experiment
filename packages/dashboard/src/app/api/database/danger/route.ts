/**
 * Database Danger Zone API Route
 *
 * Proxies to memory service /enhanced/reset or /enhanced/drop.
 * Body: { action: 'reset' | 'drop', confirm: string }
 *
 * @author @darianrosebrook
 */

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const memoryUrl = process.env.MEMORY_SERVICE_URL || 'http://localhost:3001';

  try {
    const body = await request.json();
    const { action, confirm } = body;

    if (!action || !confirm) {
      return NextResponse.json(
        { error: 'Missing required fields: action, confirm' },
        { status: 400 }
      );
    }

    if (action !== 'reset' && action !== 'drop') {
      return NextResponse.json(
        { error: 'Invalid action. Must be "reset" or "drop".' },
        { status: 400 }
      );
    }

    const endpoint = action === 'reset' ? '/enhanced/reset' : '/enhanced/drop';

    const res = await fetch(`${memoryUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm }),
      signal: AbortSignal.timeout(30000),
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(data, { status: res.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error executing danger zone action:', error);
    return NextResponse.json(
      { error: 'Failed to execute database action' },
      { status: 500 }
    );
  }
}
