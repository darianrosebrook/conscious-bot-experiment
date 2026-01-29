/**
 * Database Overview API Route
 *
 * Proxies to memory service /enhanced/stats, /enhanced/seed, and /enhanced/database
 * to build a combined overview response.
 *
 * @author @darianrosebrook
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(_request: NextRequest) {
  const memoryUrl = process.env.MEMORY_SERVICE_URL || 'http://localhost:3001';

  try {
    const [statsRes, seedRes, dbRes] = await Promise.allSettled([
      fetch(`${memoryUrl}/enhanced/stats`, {
        signal: AbortSignal.timeout(10000),
      }),
      fetch(`${memoryUrl}/enhanced/seed`, {
        signal: AbortSignal.timeout(10000),
      }),
      fetch(`${memoryUrl}/enhanced/database`, {
        signal: AbortSignal.timeout(10000),
      }),
    ]);

    const stats =
      statsRes.status === 'fulfilled' && statsRes.value.ok
        ? await statsRes.value.json()
        : null;
    const seed =
      seedRes.status === 'fulfilled' && seedRes.value.ok
        ? await seedRes.value.json()
        : null;
    const db =
      dbRes.status === 'fulfilled' && dbRes.value.ok
        ? await dbRes.value.json()
        : null;

    const overview = {
      databaseName:
        seed?.databaseName || db?.databaseName || 'unknown',
      worldSeed: seed?.worldSeed ?? 0,
      totalChunks: stats?.data?.totalChunks ?? 0,
      entityCount: stats?.data?.entityCount ?? 0,
      relationshipCount: stats?.data?.relationshipCount ?? 0,
      memoryTypeDistribution: stats?.data?.memoryTypeDistribution ?? {},
      tableSizeBytes: stats?.data?.tableSizeBytes ?? 0,
      indexInfo: stats?.data?.indexInfo ?? [],
    };

    return NextResponse.json(overview);
  } catch (error) {
    console.error('Error fetching database overview:', error);
    return NextResponse.json(
      { error: 'Failed to fetch database overview' },
      { status: 500 }
    );
  }
}
