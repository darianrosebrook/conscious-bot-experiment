/**
 * Environment Updates API
 * Provides Server-Sent Events for real-time environment updates
 *
 * @author @darianrosebrook
 */

import { NextRequest, NextResponse } from 'next/server';

// Store active SSE connections
const connections = new Set<ReadableStreamDefaultController>();

/**
 * POST endpoint to receive environment updates from planning system
 */
export async function POST(request: NextRequest) {
  try {
    const { event, data } = await request.json();

    // Broadcast to all connected clients
    connections.forEach((controller) => {
      try {
        controller.enqueue(
          new TextEncoder().encode(
            `data: ${JSON.stringify({ event, data, timestamp: Date.now() })}\n\n`
          )
        );
      } catch (error) {
        console.error('Failed to send to SSE client:', error);
        connections.delete(controller);
      }
    });

    // Only log in debug mode
    if (process.env.NODE_ENV === 'development' && process.env.DEBUG_API === 'true') {
      const requestStart = request.headers.get('x-request-start');
      const duration = requestStart ? Date.now() - parseInt(requestStart) : 0;
      console.log(`[Dashboard] POST /api/environment-updates 200 in ${duration}ms`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error processing environment update:', error);
    return NextResponse.json(
      { error: 'Failed to process update' },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint to establish SSE connection
 */
export async function GET() {
  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection message
      controller.enqueue(
        new TextEncoder().encode(
          `data: ${JSON.stringify({ event: 'connected', message: 'Environment updates connected', timestamp: Date.now() })}\n\n`
        )
      );

      // Add to active connections
      connections.add(controller);

      // Remove connection when client disconnects
      // Note: ReadableStreamDefaultController doesn't expose signal property
      // Connection cleanup will be handled by the client disconnection
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
