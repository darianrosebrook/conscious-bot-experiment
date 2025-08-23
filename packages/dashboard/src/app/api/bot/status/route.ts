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
  // Check all bot systems
  const endpoints = [
    {
      name: 'memory',
      url: 'http://localhost:3001/health',
      type: 'memory',
      metadata: { type: 'memory', host: 'localhost', port: 3001 },
    },
    {
      name: 'planning',
      url: 'http://localhost:3002/health',
      type: 'planning',
      metadata: { type: 'planning', host: 'localhost', port: 3002 },
    },
    {
      name: 'cognition',
      url: 'http://localhost:3003/health',
      type: 'cognition',
      metadata: { type: 'cognition', host: 'localhost', port: 3003 },
    },
    {
      name: 'world',
      url: 'http://localhost:3004/health',
      type: 'world',
      metadata: { type: 'world', host: 'localhost', port: 3004 },
    },
    {
      name: 'minecraft-bot',
      url: 'http://localhost:3005/health',
      type: 'minecraft-bot',
      metadata: { type: 'minecraft-bot', host: 'localhost', port: 3005 },
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

