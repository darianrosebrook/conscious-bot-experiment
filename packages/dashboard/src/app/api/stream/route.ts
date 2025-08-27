import { NextRequest } from 'next/server';

/**
 * Stream API endpoint
 * Provides a placeholder stream for the dashboard
 *
 * @author @darianrosebrook
 */

// Removed unused orderByTs function

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
            // Fetch live stream data from planning system
            const planningRes = await fetch(
              'http://localhost:3002/live-stream'
            );

            const streamData = {
              ts: new Date().toISOString(),
              type: 'stream_update',
              data: {
                connected: false,
                placeholder: false,
                message: 'Live stream data unavailable',
                botState: null,
                streamData: null,
              },
            };

            // Get live stream data if available
            if (planningRes.ok) {
              const planningData = await planningRes.json();
              if (planningData.success && planningData.streamData) {
                streamData.data.connected = planningData.streamData.connected;
                streamData.data.placeholder = false;
                streamData.data.message =
                  planningData.streamData.status === 'active'
                    ? 'Live stream active'
                    : planningData.streamData.error || 'Stream inactive';
                streamData.data.streamData = planningData.streamData;
              }
            }

            const data = `data: ${JSON.stringify(streamData)}\n\n`;
            controller.enqueue(encoder.encode(data));
          } catch (error) {
            console.error('Error in stream data update:', error);
            // Send error state
            const errorData = {
              ts: new Date().toISOString(),
              type: 'stream_update',
              data: {
                connected: false,
                placeholder: false,
                message: 'Stream data error',
                botState: null,
                streamData: null,
                error: error instanceof Error ? error.message : 'Unknown error',
              },
            };
            const data = `data: ${JSON.stringify(errorData)}\n\n`;
            controller.enqueue(encoder.encode(data));
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
    console.error('Failed to create stream:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
};
