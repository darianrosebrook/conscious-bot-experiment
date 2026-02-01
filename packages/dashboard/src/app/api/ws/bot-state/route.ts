import { NextRequest } from 'next/server';

// Fix for Next.js 15 SSE issues - Force Node.js runtime
export const runtime = 'nodejs';
export const maxDuration = 60; // Allow longer execution time

// Track active connections to prevent memory leaks
const activeConnections = new Set<ReadableStreamDefaultController>();
const MAX_CONNECTIONS = 10; // Limit concurrent connections

/** Parse response body as JSON; return null on empty body or invalid JSON. */
async function safeJson<T = unknown>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** Shape of Minecraft interface /state response (success case). */
interface MinecraftStateResponse {
  success?: boolean;
  data?: {
    worldState?: {
      player?: { position?: unknown; health?: number; food?: number };
      inventory?: { items?: unknown[] };
    };
    data?: {
      position?: unknown;
      inventory?: { items?: unknown[] };
      health?: number;
      food?: number;
    };
  };
}

/** Normalize position to [x, y, z] for dashboard (expects array). */
function positionToArray(pos: unknown): [number, number, number] | null {
  if (pos == null) return null;
  if (
    Array.isArray(pos) &&
    pos.length >= 3 &&
    typeof pos[0] === 'number' &&
    typeof pos[1] === 'number' &&
    typeof pos[2] === 'number'
  ) {
    return [pos[0], pos[1], pos[2]];
  }
  const o = pos as { x?: number; y?: number; z?: number };
  if (
    typeof o.x === 'number' &&
    typeof o.y === 'number' &&
    typeof o.z === 'number'
  ) {
    return [o.x, o.y, o.z];
  }
  return null;
}

/** Build the bot_state_update payload from minecraft (and optional cognition/world) data. */
function buildBotStatePayload(
  minecraftData: MinecraftStateResponse | null,
  cognitionData: unknown = null,
  worldData: unknown = null
) {
  const rawPos =
    minecraftData?.data?.worldState?.player?.position ??
    minecraftData?.data?.data?.position ??
    null;
  return {
    type: 'bot_state_update',
    timestamp: Date.now(),
    data: {
      connected: minecraftData?.success ?? false,
      inventory:
        minecraftData?.data?.worldState?.inventory?.items ??
        (
          minecraftData?.data?.data as
            | { inventory?: { items?: unknown[] } }
            | undefined
        )?.inventory?.items ??
        [],
      position: positionToArray(rawPos),
      vitals:
        minecraftData?.data?.worldState || minecraftData?.data?.data
          ? {
              health:
                minecraftData?.data?.worldState?.player?.health ??
                (minecraftData?.data?.data as { health?: number })?.health ??
                0,
              food:
                minecraftData?.data?.worldState?.player?.food ??
                (minecraftData?.data?.data as { food?: number })?.food ??
                0,
              hunger:
                minecraftData?.data?.worldState?.player?.food ??
                (minecraftData?.data?.data as { food?: number })?.food ??
                0,
              stamina: 100,
              sleep: 100,
            }
          : null,
      environment: worldData ?? null,
      cognition:
        cognitionData != null
          ? { ...(cognitionData as object) }
          : { error: 'Cognition service unavailable' },
    },
  };
}

const encoder = new TextEncoder();

/** Broadcast a bot_state_update payload to all SSE clients (push). */
function broadcastBotState(payload: {
  type: string;
  timestamp: number;
  data: unknown;
}) {
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  activeConnections.forEach((controller) => {
    try {
      controller.enqueue(encoder.encode(data));
    } catch (err) {
      activeConnections.delete(controller);
    }
  });
}

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

    // If it's a JSON request, return a single response (degraded state on timeout/errors)
    if (isJSON) {
      const BOT_STATE_TIMEOUT_MS = 4000;
      const opts = {
        method: 'GET' as const,
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(BOT_STATE_TIMEOUT_MS),
      };

      let minecraftData: unknown = null;
      let cognitionData: unknown = null;
      let worldData: unknown = null;

      try {
        const minecraftResponse = await fetch(
          'http://localhost:3005/state',
          opts
        );
        minecraftData = minecraftResponse.ok
          ? await safeJson(minecraftResponse)
          : null;
      } catch (e) {
        if (
          process.env.NODE_ENV === 'development' &&
          !(globalThis as unknown as { botStateMinecraftLogged?: boolean })
            .botStateMinecraftLogged
        ) {
          console.warn(
            '[Dashboard] Minecraft state unavailable (timeout or error), returning degraded state'
          );
          (
            globalThis as unknown as { botStateMinecraftLogged?: boolean }
          ).botStateMinecraftLogged = true;
        }
      }

      try {
        const cognitionResponse = await fetch(
          'http://localhost:3003/state',
          opts
        );
        cognitionData = cognitionResponse.ok
          ? await safeJson(cognitionResponse)
          : null;
      } catch {
        cognitionData = null;
      }

      try {
        const worldResponse = await fetch('http://localhost:3004/state', opts);
        worldData = worldResponse.ok ? await safeJson(worldResponse) : null;
      } catch {
        worldData = null;
      }

      const m = minecraftData as MinecraftStateResponse | null;
      const rawPosition =
        m?.data?.worldState?.player?.position ??
        m?.data?.data?.position ??
        null;
      const hasVitals = m?.data?.worldState != null || m?.data?.data != null;
      const botState = {
        type: 'bot_state_update',
        timestamp: Date.now(),
        data: {
          connected: m?.success ?? false,
          inventory:
            m?.data?.worldState?.inventory?.items ??
            (m?.data?.data as { inventory?: { items?: unknown[] } } | undefined)
              ?.inventory?.items ??
            [],
          position: positionToArray(rawPosition),
          vitals: hasVitals
            ? {
                health:
                  m?.data?.worldState?.player?.health ??
                  (m?.data?.data as { health?: number } | undefined)?.health ??
                  0,
                hunger:
                  m?.data?.worldState?.player?.food ??
                  (m?.data?.data as { food?: number } | undefined)?.food ??
                  0,
                stamina: 100,
                sleep: 100,
              }
            : null,
          intero: { stress: 20, focus: 80, curiosity: 75 },
          mood: 'neutral',
          environment: worldData ?? null,
          cognition:
            cognitionData != null
              ? { ...(cognitionData as object) }
              : { error: 'Cognition service unavailable' },
        },
      };

      return new Response(JSON.stringify(botState), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
      });
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

    const stream = new ReadableStream({
      async start(controller) {
        activeConnections.add(controller);
        if (process.env.NODE_ENV === 'development') {
          console.log(
            `SSE connection established. Total connections: ${activeConnections.size}`
          );
        }

        // Send one initial snapshot; further updates come via POST /api/ws/bot-state (push)
        try {
          let minecraftData: MinecraftStateResponse | null = null;
          let cognitionData: unknown = null;
          let worldData: unknown = null;
          try {
            const r = await fetch('http://localhost:3005/state', {
              method: 'GET',
              headers: { 'Content-Type': 'application/json' },
              signal: AbortSignal.timeout(3000),
            });
            minecraftData = r.ok
              ? await safeJson<MinecraftStateResponse>(r)
              : null;
          } catch {
            minecraftData = null;
          }
          try {
            const r = await fetch('http://localhost:3003/state', {
              method: 'GET',
              headers: { 'Content-Type': 'application/json' },
              signal: AbortSignal.timeout(3000),
            });
            cognitionData = r.ok ? await safeJson(r) : null;
          } catch {
            cognitionData = null;
          }
          try {
            const r = await fetch('http://localhost:3004/state', {
              method: 'GET',
              headers: { 'Content-Type': 'application/json' },
              signal: AbortSignal.timeout(3000),
            });
            worldData = r.ok ? await safeJson(r) : null;
          } catch {
            worldData = null;
          }
          const payload = buildBotStatePayload(
            minecraftData,
            cognitionData,
            worldData
          );
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
          );
        } catch (err) {
          console.error('Error sending initial bot state:', err);
        }

        const cleanup = () => {
          activeConnections.delete(controller);
          if (process.env.NODE_ENV === 'development') {
            console.log(
              `SSE connection closed. Total connections: ${activeConnections.size}`
            );
          }
          try {
            controller.close();
          } catch {
            // Controller may already be closed
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

/**
 * POST endpoint for push-based bot state updates.
 * Minecraft-interface (or other services) POST here when state changes;
 * dashboard broadcasts to all SSE clients so they receive updates without polling.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    let payload: { type: string; timestamp: number; data: unknown };

    if (body?.type === 'bot_state_update' && body?.data != null) {
      payload = {
        type: 'bot_state_update',
        timestamp: body.timestamp ?? Date.now(),
        data: body.data,
      };
    } else if (body?.data != null) {
      const m = body.data as MinecraftStateResponse;
      payload = buildBotStatePayload(
        m,
        body.cognition ?? null,
        body.environment ?? null
      );
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing data or bot_state_update payload',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    broadcastBotState(payload);
    return new Response(
      JSON.stringify({ success: true, connections: activeConnections.size }),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err) {
    console.error('Bot state ingest failed:', err);
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid JSON or body' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
