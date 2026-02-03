import { NextResponse } from 'next/server';

/**
 * Bot Health API
 * Proxies to minecraft interface GET /health
 *
 * @author @darianrosebrook
 */
export async function GET() {
  try {
    const minecraftUrl =
      process.env.MINECRAFT_ENDPOINT || 'http://localhost:3005';

    const res = await fetch(`${minecraftUrl}/health`, {
      signal: AbortSignal.timeout(3000),
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`Minecraft interface returned ${res.status}`);
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { status: 'unhealthy', error: 'Minecraft interface unavailable' },
      { status: 503 }
    );
  }
}
