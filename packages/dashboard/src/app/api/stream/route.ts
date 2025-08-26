import { NextRequest } from 'next/server';

/**
 * Stream API endpoint
 * Provides a placeholder stream for the dashboard
 *
 * @author @darianrosebrook
 */

function orderByTs(a: any, b: any) {
  return new Date(a.ts).getTime() - new Date(b.ts).getTime();
}

export const GET = async (req: NextRequest) => {
  try {
    // Check if the request is for SSE
    const accept = req.headers.get('accept');
    const isSSE = accept?.includes('text/event-stream');

    if (!isSSE) {
      return new Response('Expected SSE request', { status: 400 });
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start(controller) {
        const sendStreamData = async () => {
          try {
            // Fetch current bot state
            const minecraftRes = await fetch('http://localhost:3005/state');

            const streamData = {
              ts: new Date().toISOString(),
              type: 'stream_update',
              data: {
                connected: false,
                placeholder: true,
                message:
                  'Prismarine viewer is disabled. Bot is connected and active.',
                botState: null,
              },
            };

            // Get bot state if available
            if (minecraftRes.ok) {
              const minecraftData = await minecraftRes.json();
              streamData.data.connected = minecraftData.success;
              streamData.data.botState = minecraftData.data.sort(orderByTs);
            }

            const data = `data: ${JSON.stringify(streamData)}\n\n`;
            controller.enqueue(encoder.encode(data));
          } catch (error) {
            // Silently handle errors
          }
        };

        // Send initial data
        sendStreamData();

        // Send updates every 5 seconds
        const interval = setInterval(sendStreamData, 5000);

        // Cleanup on close
        req.signal.addEventListener('abort', () => {
          clearInterval(interval);
          controller.close();
        });
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    return new Response('Internal Server Error', { status: 500 });
  }
};
