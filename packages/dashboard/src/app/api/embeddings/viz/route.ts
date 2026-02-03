import { NextResponse } from 'next/server';

const MEMORY_SERVICE_URL = process.env.MEMORY_SERVICE_URL || 'http://localhost:3001';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = searchParams.get('limit') || '500';
  const types = searchParams.get('types') || '';
  const minImportance = searchParams.get('minImportance') || '0';

  try {
    const url = new URL('/enhanced/embeddings-3d', MEMORY_SERVICE_URL);
    url.searchParams.set('limit', limit);
    if (types) url.searchParams.set('types', types);
    url.searchParams.set('minImportance', minImportance);

    const res = await fetch(url.toString(), {
      cache: 'no-store',
      signal: AbortSignal.timeout(60000), // 60s timeout for UMAP processing
    });

    if (!res.ok) {
      throw new Error(`Memory service error: ${res.statusText}`);
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[embeddings/viz] Error:', error);
    return NextResponse.json(
      { error: (error as Error).message, points: [] },
      { status: 500 }
    );
  }
}
