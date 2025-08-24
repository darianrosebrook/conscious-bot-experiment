import { NextRequest } from 'next/server';

// Fix for Next.js 15 SSE issues - Force Node.js runtime
export const runtime = 'nodejs';
export const maxDuration = 60; // Allow longer execution time

// Track active connections to prevent memory leaks
const activeConnections = new Set<ReadableStreamDefaultController>();
const MAX_CONNECTIONS = 10; // Limit concurrent connections

/**
 * Centralized Bot State Stream
 *
 * Provides a single SSE stream for all bot state data including:
 * - Inventory updates
 * - HUD/vitals data
 * - Cognitive state
 * - Position and environment
 * - Real-time events
 *
 * Fixed for Next.js 15 SSE compatibility issues
 *
 * @author @darianrosebrook
 */
export const GET = async (req: NextRequest) => {
  try {
    // Check if the request is for SSE or JSON
    const accept = req.headers.get('accept');
    const isSSE = accept?.includes('text/event-stream');
    const isJSON = accept?.includes('application/json');

    console.log(
      `Bot state request - SSE: ${isSSE}, JSON: ${isJSON}, Accept: ${accept}`
    );

    // If it's a JSON request, return a single response
    if (isJSON) {
      try {
        // Fetch bot state from Minecraft interface
        const minecraftResponse = await fetch('http://localhost:3005/state', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(5000), // 5 second timeout
        });

        // Fetch cognition state
        const cognitionResponse = await fetch('http://localhost:3003/state', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(5000), // 5 second timeout
        });

        // Fetch world state
        const worldResponse = await fetch('http://localhost:3004/state', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(5000), // 5 second timeout
        });

        const minecraftData = minecraftResponse.ok
          ? await minecraftResponse.json()
          : null;
        const cognitionData = cognitionResponse.ok
          ? await cognitionResponse.json()
          : null;
        const worldData = worldResponse.ok ? await worldResponse.json() : null;

        const botState = {
          type: 'bot_state_update',
          timestamp: Date.now(),
          data: {
            connected: minecraftData?.success || false,
            inventory: minecraftData?.data?.inventory || {
              hotbar: [],
              main: [],
            },
            position: minecraftData?.data?.position || null,
            vitals: minecraftData?.data?.vitals || null,
            environment: worldData?.data || null,
            cognition: cognitionData?.data || null,
          },
        };

        return new Response(JSON.stringify(botState), {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
          },
        });
      } catch (error) {
        console.error('Error fetching bot state for JSON request:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch bot state' }),
          {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );
      }
    }

    // If it's not SSE, return an error
    if (!isSSE) {
      return new Response('Expected SSE or JSON request', { status: 400 });
    }

    // Check connection limit
    if (activeConnections.size >= MAX_CONNECTIONS) {
      console.log(
        `Connection limit reached (${MAX_CONNECTIONS}), rejecting new connection`
      );
      return new Response('Too many connections', { status: 429 });
    }

    console.log('Creating SSE stream for bot state');
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start(controller) {
        let lastBotState: string | null = null;
        let isConnected = true;
        let intervalId: NodeJS.Timeout;

        // Track this connection
        activeConnections.add(controller);
        console.log(
          `SSE connection established. Total connections: ${activeConnections.size}`
        );

        const sendBotState = async () => {
          if (!isConnected) return;

          try {
            // Fetch bot state from Minecraft interface
            const minecraftResponse = await fetch(
              'http://localhost:3005/state',
              {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(5000), // 5 second timeout
              }
            );

            // Fetch cognition state
            const cognitionResponse = await fetch(
              'http://localhost:3003/state',
              {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(5000), // 5 second timeout
              }
            );

            // Fetch world state
            const worldResponse = await fetch('http://localhost:3004/state', {
              method: 'GET',
              headers: { 'Content-Type': 'application/json' },
              signal: AbortSignal.timeout(5000), // 5 second timeout
            });

            const minecraftData = minecraftResponse.ok
              ? await minecraftResponse.json()
              : null;
            const cognitionData = cognitionResponse.ok
              ? await cognitionResponse.json()
              : null;
            const worldData = worldResponse.ok
              ? await worldResponse.json()
              : null;

            const botState = {
              type: 'bot_state_update',
              timestamp: Date.now(),
              data: {
                connected: minecraftData?.success || false,
                inventory: minecraftData?.data?.inventory || {
                  hotbar: [],
                  main: [],
                },
                position: minecraftData?.data?.position || null,
                vitals: minecraftData?.data?.vitals || null,
                environment: worldData?.data || null,
                cognition: cognitionData?.data || null,
              },
            };

            // Only send if data has changed
            const stateString = JSON.stringify(botState);
            if (stateString !== lastBotState) {
              lastBotState = stateString;
              const data = `data: ${stateString}\n\n`;

              try {
                controller.enqueue(encoder.encode(data));
              } catch (error) {
                if (
                  error instanceof Error &&
                  error.message.includes('Controller is already closed')
                ) {
                  isConnected = false;
                  return;
                }
                throw error;
              }
            }
          } catch (error) {
            console.error('Error in bot state stream:', error);
            // Don't throw - just log and continue
          }
        };

        // Send initial state
        sendBotState();

        // Set up periodic updates (every 2 seconds)
        intervalId = setInterval(() => {
          if (!isConnected) {
            clearInterval(intervalId);
            return;
          }
          sendBotState();
        }, 2000);

        // Clean up on disconnect - Enhanced for Next.js 15
        const cleanup = () => {
          isConnected = false;
          if (intervalId) {
            clearInterval(intervalId);
          }
          activeConnections.delete(controller);
          console.log(
            `SSE connection closed. Total connections: ${activeConnections.size}`
          );
          try {
            controller.close();
          } catch (error) {
            // Controller might already be closed
          }
        };

        // Handle client disconnect
        req.signal.addEventListener('abort', cleanup);

        // Additional cleanup for connection close
        if (typeof req.signal.addEventListener === 'function') {
          req.signal.addEventListener('close', cleanup);
        }

        // Handle process termination
        process.on('SIGTERM', cleanup);
        process.on('SIGINT', cleanup);
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform', // Fix for proxy buffering
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control',
        'X-Accel-Buffering': 'no', // Disable nginx buffering
      },
    });
  } catch (error) {
    console.error('Failed to create bot state stream:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
};
