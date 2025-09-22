/**
 * Memories API
 * Provides memory data from the memory system
 *
 * @author @darianrosebrook
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(_request: NextRequest) {
  try {
    // Get memory service URL from environment
    const memoryUrl = process.env.MEMORY_SERVICE_URL || 'http://localhost:3001';

    // Fetch memory data from memory system
    const memoryRes = await fetch(`${memoryUrl}/state`);
    const telemetryRes = await fetch(`${memoryUrl}/telemetry`);

    if (!memoryRes.ok || !telemetryRes.ok) {
      return NextResponse.json(
        { error: 'Memory system unavailable' },
        { status: 503 }
      );
    }

    const memoryData = await memoryRes.json();

    const memories = [];

    // Convert episodic memories
    if (memoryData.episodic?.recentMemories) {
      for (const memory of memoryData.episodic.recentMemories) {
        memories.push({
          id: memory.id || `memory-${Date.now()}`,
          type: memory.type || 'episodic',
          title: memory.description || 'Memory',
          content: memory.description || 'No description available',
          timestamp: memory.timestamp || Date.now(),
          salience: memory.salience || 0.5,
          source: 'memory-system',
        });
      }
    }

    // Convert semantic memories
    if (memoryData.semantic?.totalEntities > 0) {
      memories.push({
        id: `semantic-summary-${Date.now()}`,
        type: 'semantic',
        title: 'Knowledge Base',
        content: `Contains ${memoryData.semantic.totalEntities} entities and ${memoryData.semantic.totalRelationships} relationships`,
        timestamp: Date.now(),
        salience: 0.7,
        source: 'memory-system',
      });
    }

    // Convert working memory context
    if (memoryData.working?.currentContext) {
      memories.push({
        id: `working-context-${Date.now()}`,
        type: 'working',
        title: 'Current Context',
        content:
          memoryData.working.currentContext.description ||
          'Current working memory context',
        timestamp: Date.now(),
        salience: 0.9,
        source: 'memory-system',
      });
    }

    // Return empty array if no memories found - no demo data

    return NextResponse.json({
      memories,
      totalMemories: memoryData.episodic?.totalMemories || 0,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching memories:', error);
    return NextResponse.json({
      memories: [],
      totalMemories: 0,
      timestamp: new Date().toISOString(),
      error: 'Failed to fetch memories',
    });
  }
}
