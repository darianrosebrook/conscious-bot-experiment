/**
 * Task Updates API
 * Receives real-time task updates from the planning system
 * and broadcasts them to connected dashboard clients
 *
 * @author @darianrosebrook
 */

import { NextRequest, NextResponse } from 'next/server';

// Store active connections for real-time updates
const activeConnections = new Set<ReadableStreamDefaultController>();

/**
 * POST endpoint to receive task updates from planning system
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { event, data, timestamp } = body;

    // console.log(`Received task update: ${event}`, data);

    // Broadcast to all connected clients
    const message = JSON.stringify({
      type: 'task_update',
      event,
      data,
      timestamp,
    });

    activeConnections.forEach((controller) => {
      try {
        controller.enqueue(new TextEncoder().encode(`data: ${message}\n\n`));
      } catch (error) {
        console.error('Error sending task update to connection:', error);
        // Remove dead connections
        activeConnections.delete(controller);
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Task update broadcasted',
      connections: activeConnections.size,
    });
  } catch (error) {
    console.error('Error processing task update:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to process task update',
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint for Server-Sent Events (SSE) connection
 */
export async function GET() {
  const stream = new ReadableStream({
    start(controller) {
      // Add connection to active set
      activeConnections.add(controller);

      // Send initial connection message
      const message = JSON.stringify({
        type: 'connection_established',
        message: 'Task updates stream connected',
        timestamp: Date.now(),
      });

      controller.enqueue(new TextEncoder().encode(`data: ${message}\n\n`));

      // Handle connection close
      // Note: ReadableStreamDefaultController doesn't have a signal property
      // We'll handle cleanup when the stream is closed
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
