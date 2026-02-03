import { NextRequest, NextResponse } from 'next/server';

/**
 * API route handler for bot status
 * Provides connection status for all bot systems
 *
 * @author @darianrosebrook
 */
export async function GET(_request: NextRequest) {
  try {
    const connections = await checkAllBotConnections();

    return NextResponse.json({
      status: 'success',
      connections,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to get bot status',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

async function checkAllBotConnections() {
  const memoryUrl = process.env.MEMORY_SERVICE_URL || 'http://localhost:3001';
  const planningUrl = process.env.PLANNING_SERVICE_URL || 'http://localhost:3002';
  const cognitionUrl = process.env.COGNITION_SERVICE_URL || 'http://localhost:3003';
  const worldUrl = process.env.WORLD_SERVICE_URL || 'http://localhost:3004';
  const minecraftUrl = process.env.MINECRAFT_ENDPOINT || 'http://localhost:3005';

  // Check all bot systems
  const endpoints = [
    {
      name: 'memory',
      url: `${memoryUrl}/health`,
      type: 'memory',
      metadata: { type: 'memory' },
    },
    {
      name: 'planning',
      url: `${planningUrl}/health`,
      type: 'planning',
      metadata: { type: 'planning' },
    },
    {
      name: 'cognition',
      url: `${cognitionUrl}/health`,
      type: 'cognition',
      metadata: { type: 'cognition' },
    },
    {
      name: 'world',
      url: `${worldUrl}/health`,
      type: 'world',
      metadata: { type: 'world' },
    },
    {
      name: 'minecraft-bot',
      url: `${minecraftUrl}/health`,
      type: 'minecraft-bot',
      metadata: { type: 'minecraft-bot' },
    },
  ];

  const results = await Promise.allSettled(
    endpoints.map(async (endpoint) => {
      try {
        const response = await fetch(endpoint.url, { cache: 'no-store' });

        if (!response.ok) {
          return {
            name: endpoint.name,
            connected: false,
            status: 'error',
            metadata: endpoint.metadata,
            error: `HTTP ${response.status}: ${response.statusText}`,
          };
        }

        const data = await response.json();

        return {
          name: endpoint.name,
          connected: data.status === 'healthy' || data.status === 'connected',
          status: data.status || 'unknown',
          metadata: endpoint.metadata,
          timestamp: data.timestamp,
        };
      } catch (error) {
        return {
          name: endpoint.name,
          connected: false,
          status: 'error',
          metadata: endpoint.metadata,
          error: error instanceof Error ? error.message : 'Connection failed',
        };
      }
    })
  );

  return results.map((result) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }

    return {
      name: 'unknown',
      connected: false,
      status: 'error',
      metadata: null,
      error: result.reason || 'Unknown error',
    };
  });
}

