/**
 * Memories API
 * Provides memory data from the memory system
 *
 * @author @darianrosebrook
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(_request: NextRequest) {
  try {
    // Fetch memory data from memory system
    const memoryRes = await fetch('http://localhost:3001/state');
    const telemetryRes = await fetch('http://localhost:3001/telemetry');

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

    // If no memories found, create demo memories
    if (memories.length === 0) {
      memories.push(
        {
          id: `demo-memory-1-${Date.now()}`,
          type: 'episodic',
          title: 'First Minecraft Experience',
          content: 'Joined the world and began exploring the environment',
          timestamp: Date.now() - 3600000, // 1 hour ago
          salience: 0.8,
          source: 'demo',
        },
        {
          id: `demo-memory-2-${Date.now()}`,
          type: 'semantic',
          title: 'World Knowledge',
          content:
            'Learning about the Minecraft world structure and available resources',
          timestamp: Date.now() - 1800000, // 30 minutes ago
          salience: 0.6,
          source: 'demo',
        }
      );
    }

    return NextResponse.json({
      memories,
      totalMemories: memoryData.episodic?.totalMemories || 0,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    // Return demo data on error
    return NextResponse.json({
      memories: [
        {
          id: `demo-memory-1-${Date.now()}`,
          type: 'episodic',
          title: 'First Minecraft Experience',
          content: 'Joined the world and began exploring the environment',
          timestamp: Date.now() - 3600000,
          salience: 0.8,
          source: 'demo',
        },
        {
          id: `demo-memory-2-${Date.now()}`,
          type: 'semantic',
          title: 'World Knowledge',
          content:
            'Learning about the Minecraft world structure and available resources',
          timestamp: Date.now() - 1800000,
          salience: 0.6,
          source: 'demo',
        },
      ],
      totalMemories: 2,
      timestamp: new Date().toISOString(),
    });
  }
}
