/**
 * SSE Broadcast Route Factory
 *
 * Creates Next.js-compatible { GET, POST } route handlers for
 * Server-Sent Events broadcast channels. Eliminates copy-paste
 * across task-updates, memory-updates, valuation-updates, etc.
 *
 * @author @darianrosebrook
 */

import { NextRequest, NextResponse } from 'next/server';

export interface SSEBroadcastOptions {
  /** Human-readable channel name used in connection messages. */
  channelName: string;
  /**
   * Number of recent events to buffer and replay on new connections.
   * 0 (default) means no replay — clients only receive live events.
   */
  ringBufferSize?: number;
}

export function createSSEBroadcastRoute(options: SSEBroadcastOptions) {
  const { channelName, ringBufferSize = 0 } = options;

  const activeConnections = new Set<ReadableStreamDefaultController>();
  const ringBuffer: string[] = [];
  const encoder = new TextEncoder();

  function broadcast(message: string) {
    const encoded = encoder.encode(`data: ${message}\n\n`);
    const stale: ReadableStreamDefaultController[] = [];
    activeConnections.forEach((controller) => {
      try {
        controller.enqueue(encoded);
      } catch {
        stale.push(controller);
      }
    });
    for (const c of stale) activeConnections.delete(c);
  }

  async function POST(request: NextRequest) {
    try {
      const body = await request.json();
      const { event, data, timestamp } = body;

      const message = JSON.stringify({
        type: `${channelName}_update`,
        event,
        data,
        timestamp: timestamp ?? Date.now(),
      });

      if (ringBufferSize > 0) {
        ringBuffer.push(message);
        if (ringBuffer.length > ringBufferSize) {
          ringBuffer.shift();
        }
      }

      broadcast(message);

      return NextResponse.json({
        success: true,
        message: `${channelName} update broadcasted`,
        connections: activeConnections.size,
      });
    } catch (error) {
      console.error(`Error processing ${channelName} update:`, error);
      return NextResponse.json(
        { success: false, error: `Failed to process ${channelName} update` },
        { status: 500 },
      );
    }
  }

  function GET() {
    const snapshot = ringBufferSize > 0 ? [...ringBuffer] : [];

    let controllerRef: ReadableStreamDefaultController | null = null;
    const stream = new ReadableStream({
      start(controller) {
        controllerRef = controller;
        activeConnections.add(controller);

        // Connection established message
        const connMsg = JSON.stringify({
          type: 'connection_established',
          message: `${channelName} stream connected`,
          timestamp: Date.now(),
          ...(ringBufferSize > 0 ? { bufferedEvents: snapshot.length } : {}),
        });
        controller.enqueue(encoder.encode(`data: ${connMsg}\n\n`));

        // Replay buffered events
        for (const msg of snapshot) {
          try {
            controller.enqueue(encoder.encode(`data: ${msg}\n\n`));
          } catch {
            break;
          }
        }
      },
      cancel() {
        if (controllerRef) {
          activeConnections.delete(controllerRef);
          controllerRef = null;
        }
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

  return { GET, POST };
}
