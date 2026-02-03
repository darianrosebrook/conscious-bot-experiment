import { NextRequest, NextResponse } from 'next/server';
import { resilientFetch } from '@/lib/resilient-fetch';

const COGNITION_URL =
  process.env.COGNITION_SERVICE_URL || 'http://localhost:3003';

/**
 * TTS Status API — proxies to cognition /tts/status
 */
export async function GET() {
  try {
    const response = await resilientFetch(`${COGNITION_URL}/tts/status`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      label: 'cognition/tts/status',
    });

    if (!response?.ok) {
      return NextResponse.json(
        { enabled: false, error: 'Cognition service unavailable' },
        { status: 502 }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { enabled: false, error: 'Failed to reach cognition service' },
      { status: 502 }
    );
  }
}

/**
 * TTS Toggle API — proxies to cognition /tts/toggle
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const response = await resilientFetch(`${COGNITION_URL}/tts/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      label: 'cognition/tts/toggle',
      body: JSON.stringify(body),
    });

    if (!response?.ok) {
      return NextResponse.json(
        { enabled: false, error: 'Cognition service unavailable' },
        { status: 502 }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { enabled: false, error: 'Failed to reach cognition service' },
      { status: 502 }
    );
  }
}
