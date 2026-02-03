import { NextResponse } from 'next/server';

/**
 * Start Viewer API
 * Proxies to minecraft interface POST /start-viewer
 *
 * @author @darianrosebrook
 */
export async function POST() {
  try {
    const minecraftUrl =
      process.env.MINECRAFT_ENDPOINT || 'http://localhost:3005';

    const res = await fetch(`${minecraftUrl}/start-viewer`, {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Minecraft interface returned ${res.status}`);
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { data: { success: false, error: 'Minecraft interface unavailable' } },
      { status: 503 }
    );
  }
}
