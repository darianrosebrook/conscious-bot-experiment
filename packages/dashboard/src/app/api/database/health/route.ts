/**
 * Database Health API Route
 *
 * Proxies to memory service /enhanced/embedding-health and /enhanced/knowledge-graph.
 * Returns both embedding health and knowledge graph stats in one call.
 *
 * @author @darianrosebrook
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(_request: NextRequest) {
  const memoryUrl = process.env.MEMORY_SERVICE_URL || 'http://localhost:3001';

  try {
    const [embeddingRes, graphRes] = await Promise.allSettled([
      fetch(`${memoryUrl}/enhanced/embedding-health`, {
        signal: AbortSignal.timeout(10000),
      }),
      fetch(`${memoryUrl}/enhanced/knowledge-graph`, {
        signal: AbortSignal.timeout(10000),
      }),
    ]);

    const embeddingHealth =
      embeddingRes.status === 'fulfilled' && embeddingRes.value.ok
        ? (await embeddingRes.value.json()).data
        : null;
    const knowledgeGraph =
      graphRes.status === 'fulfilled' && graphRes.value.ok
        ? (await graphRes.value.json()).data
        : null;

    return NextResponse.json({
      embeddingHealth: embeddingHealth ?? {
        dimension: 768,
        totalEmbeddings: 0,
        normStats: { min: 0, max: 0, avg: 0, stddev: 0 },
        indexType: 'HNSW',
        indexSize: '0MB',
        sampleSimilarityDistribution: [],
      },
      knowledgeGraph: knowledgeGraph ?? {
        topEntities: [],
        entityTypeDistribution: {},
        relationshipTypeDistribution: {},
        totalEntities: 0,
        totalRelationships: 0,
      },
    });
  } catch (error) {
    console.error('Error fetching database health:', error);
    return NextResponse.json(
      { error: 'Failed to fetch database health' },
      { status: 500 }
    );
  }
}
