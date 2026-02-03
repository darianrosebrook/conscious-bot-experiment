import { NextResponse } from 'next/server';

/**
 * Viewer Status API
 * Proxies to minecraft interface GET /viewer-status
 *
 * @author @darianrosebrook
 */
export async function GET() {
  try {
    const minecraftUrl =
      process.env.MINECRAFT_ENDPOINT || 'http://localhost:3005';

    const res = await fetch(`${minecraftUrl}/viewer-status`, {
      signal: AbortSignal.timeout(5000),
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`Minecraft interface returned ${res.status}`);
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { data: { canStart: false, reason: 'Minecraft interface unavailable' } },
      { status: 503 }
    );
  }
}
