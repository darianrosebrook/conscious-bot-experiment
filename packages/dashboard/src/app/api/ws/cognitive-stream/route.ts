/**
 * Cognitive Stream API
 * Streams genuine cognitive events (internal reflection, social analysis, observations).
 * Includes persistence for thoughts across server restarts.
 *
 * @author @darianrosebrook
 */

import { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import * as path from 'path';

export const runtime = 'nodejs';
export const maxDuration = 60;

// =============================================================================
// Types
// =============================================================================

interface CognitiveThought {
  id: string;
  timestamp: number;
  type: string;
  content: string;
  attribution: string;
  context: {
    currentTask?: string;
    emotionalState?: string;
    confidence?: number;
    cognitiveSystem?: string;
  };
  metadata: {
    llmConfidence?: number;
    thoughtType?: string;
    sender?: string;
    messageType?: string;
    intent?: string;
    emotion?: string;
    requiresResponse?: boolean;
    responsePriority?: number;
    originalMessageId?: string;
    processingFailed?: boolean;
    fallback?: boolean;
    error?: string;
  };
  processed?: boolean;
}

// =============================================================================
// Persistence Configuration
// =============================================================================

// Thoughts file is now scoped by active world seed (via memory namespace).
// Fallbacks to a global file if the memory service/namespace is unavailable.
const DEFAULT_THOUGHTS_FILE_PATH = path.join(
  process.cwd(),
  'data',
  'cognitive-thoughts.json'
);
let currentThoughtsPath: string | null = null;
const MAX_THOUGHTS = 1000;
const activeConnections = new Set<ReadableStreamDefaultController>();
const MAX_CONNECTIONS = 10;

// =============================================================================
// Persistence Functions
// =============================================================================

/**
 * Ensure the data directory exists
 */
async function ensureDataDirectory(targetPath: string): Promise<void> {
  const dataDir = path.dirname(targetPath);
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
  }
}

/**
 * Load thoughts from persistent storage
 */
async function loadThoughts(): Promise<CognitiveThought[]> {
  try {
    const targetPath = await resolveThoughtsFilePath();
    await ensureDataDirectory(targetPath);
    const data = await fs.readFile(targetPath, 'utf-8');
    const thoughts = JSON.parse(data);
    return Array.isArray(thoughts) ? thoughts : [];
  } catch (error) {
    // File doesn't exist or is invalid, start with empty array
    console.log('No existing thoughts file found, starting fresh');
    return [];
  }
}

/**
 * Save thoughts to persistent storage
 */
async function saveThoughts(thoughts: CognitiveThought[]): Promise<void> {
  try {
    const targetPath = await resolveThoughtsFilePath();
    await ensureDataDirectory(targetPath);
    await fs.writeFile(targetPath, JSON.stringify(thoughts, null, 2));
  } catch (error) {
    console.error('Failed to save thoughts to file:', error);
  }
}

// Helper functions for the PUT endpoint
async function getThoughtStore(): Promise<CognitiveThought[]> {
  await maybeReloadThoughtStore();
  return thoughtHistory;
}

async function saveThoughtStore(thoughts: CognitiveThought[]): Promise<void> {
  thoughtHistory = thoughts;
  await saveThoughts(thoughts);
}

// =============================================================================
// Thought Management
// =============================================================================

// Initialize thought history from persistent storage
let thoughtHistory: CognitiveThought[] = [];

// Load thoughts on module initialization
(async () => {
  await maybeReloadThoughtStore();
  console.log(
    `Loaded ${thoughtHistory.length} thoughts from persistent storage`
  );
})();

function addThought(
  thought: Omit<CognitiveThought, 'id' | 'timestamp' | 'processed'>
): CognitiveThought {
  const newThought = {
    ...thought,
    id: `thought-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    timestamp: Date.now(),
    processed: false,
  };

  thoughtHistory.push(newThought);

  // Keep only the last MAX_THOUGHTS
  if (thoughtHistory.length > MAX_THOUGHTS) {
    thoughtHistory = thoughtHistory.slice(-MAX_THOUGHTS);
  }

  // Save to persistent storage (async, don't await)
  saveThoughts(thoughtHistory).catch((error) => {
    console.error('Failed to persist thoughts:', error);
  });

  return newThought;
}

// =============================================================================
// Seed-Scoped Persistence Resolution
// =============================================================================

async function fetchActiveNamespace(): Promise<{
  id: string;
  context?: { worldSeed?: string; worldName?: string; sessionId?: string };
} | null> {
  try {
    const res = await fetch('http://localhost:3001/versioning/active', {
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as any;
    return body?.success ? (body.data as any) : null;
  } catch {
    return null;
  }
}

function computePathForNamespace(
  ns: {
    id: string;
    context?: { worldSeed?: string; worldName?: string; sessionId?: string };
  } | null
): string {
  if (!ns) return DEFAULT_THOUGHTS_FILE_PATH;
  const seed = ns.context?.worldSeed;
  const world = ns.context?.worldName;
  if (seed) {
    return path.join(
      process.cwd(),
      'data',
      'thoughts',
      `seed-${seed}`,
      'cognitive-thoughts.json'
    );
  }
  if (world) {
    return path.join(
      process.cwd(),
      'data',
      'thoughts',
      `world-${world}`,
      'cognitive-thoughts.json'
    );
  }
  // As a last resort, bucket by namespace id
  if (ns.id) {
    return path.join(
      process.cwd(),
      'data',
      'thoughts',
      `ns-${ns.id}`,
      'cognitive-thoughts.json'
    );
  }
  return DEFAULT_THOUGHTS_FILE_PATH;
}

async function resolveThoughtsFilePath(): Promise<string> {
  const ns = await fetchActiveNamespace();
  const target = computePathForNamespace(ns);
  if (!currentThoughtsPath) currentThoughtsPath = target;
  return target;
}

async function maybeReloadThoughtStore(): Promise<void> {
  const target = await resolveThoughtsFilePath();
  if (currentThoughtsPath !== target) {
    // Namespace changed — load the correct store
    currentThoughtsPath = target;
    thoughtHistory = await loadThoughts();
  } else if (!thoughtHistory.length) {
    // Initial load
    thoughtHistory = await loadThoughts();
  }
}

async function fetchState(path: string): Promise<any> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(3000),
  });
  return res.ok ? res.json() : null;
}

async function generateThoughts(): Promise<CognitiveThought[]> {
  const [state, plan] = await Promise.all([
    fetchState('http://localhost:3005/state'),
    fetchState('http://localhost:3002/state'),
  ]);

  // If services are down, generate basic thoughts from available data
  if (!state || !plan) {
    return [];
  }

  const context = {
    currentGoals: plan.goalFormulation?.currentGoals || [],
    currentState: {
      position: state.data?.position,
      health: state.data?.vitals?.health,
      inventory: state.data?.inventory,
      currentTasks: plan.goalFormulation?.currentTasks || [],
    },
    emotional: 'neutral',
    urgency: 0.3,
  };

  try {
    const resp = await fetch('http://localhost:3003/generate-thoughts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        situation: 'environment',
        context,
        thoughtTypes: ['reflection', 'observation', 'planning'],
      }),
      signal: AbortSignal.timeout(3000),
    });

    if (!resp.ok) return [];
    const data = await resp.json();
    return (data.thoughts || []).flatMap((t: any) => {
      const dup = thoughtHistory.find(
        (old) => old.content === t.content && Date.now() - old.timestamp < 60000
      );
      if (dup) return [];
      return [
        addThought({
          type: t.type || 'internal',
          content: t.content,
          attribution: 'self',
          context: {
            currentTask: context.currentState.currentTasks[0]?.description,
            emotionalState: t.emotionalState,
            confidence: t.confidence,
            cognitiveSystem: 'llm-core',
          },
          metadata: { llmConfidence: t.confidence, thoughtType: t.type },
        }),
      ];
    });
  } catch (error) {
    console.warn(
      'Cognition service unavailable, using fallback thoughts:',
      error
    );
    return [];
  }
}

async function processExternalChat(): Promise<CognitiveThought[]> {
  // Check for external chat messages in the thought history
  const externalChatMessages = thoughtHistory.filter(
    (thought) => thought.type === 'external_chat_in' && !thought.processed
  );

  if (externalChatMessages.length === 0) {
    return [];
  }

  const processedThoughts: CognitiveThought[] = [];

  for (const chatMessage of externalChatMessages) {
    try {
      // Mark as processed to avoid duplicate processing
      chatMessage.processed = true;

      // Send to cognitive core for processing
      const cognitiveResponse = await fetch('http://localhost:3003/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'external_chat',
          content: chatMessage.content,
          metadata: {
            sender: chatMessage.metadata?.sender,
            messageType: chatMessage.metadata?.messageType,
            intent: chatMessage.metadata?.intent,
            emotion: chatMessage.metadata?.emotion,
            requiresResponse: chatMessage.metadata?.requiresResponse,
            responsePriority: chatMessage.metadata?.responsePriority,
          },
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (cognitiveResponse.ok) {
        const response = await cognitiveResponse.json();

        // Add the bot's response as a thought
        if (response.response) {
          const botResponseThought = addThought({
            type: 'external_chat_out',
            content: response.response,
            attribution: 'self',
            context: {
              emotionalState: 'responsive',
              confidence: 0.8,
              cognitiveSystem: 'llm-core',
            },
            metadata: {
              thoughtType: 'external_chat_out',
              intent: 'response',
              originalMessageId: chatMessage.id,
            },
          });
          processedThoughts.push(botResponseThought);

          // Send the response to the minecraft server
          try {
            const minecraftResponse = await fetch(
              'http://localhost:3005/chat',
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  message: response.response,
                  target: chatMessage.metadata?.sender, // Optional: send as private message
                }),
                signal: AbortSignal.timeout(15000),
              }
            );

            if (minecraftResponse.ok) {
              console.log('✅ Bot response sent to minecraft server');
            } else {
              console.error(
                '❌ Failed to send bot response to minecraft server'
              );
            }
          } catch (error) {
            console.error(
              '❌ Error sending bot response to minecraft server:',
              error
            );
          }
        }

        // Add any cognitive thoughts generated from the chat
        if (response.cognitiveThoughts) {
          for (const cognitiveThought of response.cognitiveThoughts) {
            const thought = addThought({
              type: 'reflection',
              content: cognitiveThought.content,
              attribution: 'self',
              context: {
                emotionalState: cognitiveThought.emotionalState || 'neutral',
                confidence: cognitiveThought.confidence || 0.7,
                cognitiveSystem: 'llm-core',
              },
              metadata: {
                thoughtType: 'reflection',
                originalMessageId: chatMessage.id,
              },
            });
            processedThoughts.push(thought);
          }
        }
      } else {
        // If cognitive processing fails, add a simple acknowledgment thought
        const acknowledgmentThought = addThought({
          type: 'reflection',
          content: `Received message from ${chatMessage.metadata?.sender || 'someone'}: "${chatMessage.content}"`,
          attribution: 'self',
          context: {
            emotionalState: 'neutral',
            confidence: 0.5,
            cognitiveSystem: 'llm-core',
          },
          metadata: {
            thoughtType: 'reflection',
            originalMessageId: chatMessage.id,
            processingFailed: true,
          },
        });
        processedThoughts.push(acknowledgmentThought);
      }
    } catch (error) {
      console.error('Error processing external chat message:', error);

      // Add error acknowledgment thought
      const errorThought = addThought({
        type: 'reflection',
        content: `Failed to process message: "${chatMessage.content}"`,
        attribution: 'self',
        context: {
          emotionalState: 'confused',
          confidence: 0.3,
          cognitiveSystem: 'llm-core',
        },
        metadata: {
          thoughtType: 'reflection',
          originalMessageId: chatMessage.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });
      processedThoughts.push(errorThought);
    }
  }

  return processedThoughts;
}

async function processBotResponses(): Promise<CognitiveThought[]> {
  // Placeholder for bot response processing
  // In a full implementation, this would process bot actions and responses
  return [];
}

export const GET = async (req: NextRequest) => {
  await maybeReloadThoughtStore();
  if (activeConnections.size >= MAX_CONNECTIONS) {
    return new Response('Too many connections', { status: 429 });
  }

  // Only log in development mode
  if (process.env.NODE_ENV === 'development') {
    console.log(
      'GET /api/ws/cognitive-stream: New connection, total connections:',
      activeConnections.size
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      activeConnections.add(controller);
      // Only log in development mode
      if (process.env.NODE_ENV === 'development') {
        console.log(
          'GET /api/ws/cognitive-stream: Connection added, total connections:',
          activeConnections.size
        );
      }

      // Send initial data with existing thoughts (support ?limit)
      const url = new URL(req.url);
      const initLimitParam = url.searchParams.get('limit');
      const initLimit = Math.max(
        1,
        Math.min(
          1000,
          Number.isFinite(Number(initLimitParam)) ? Number(initLimitParam) : 50
        )
      );
      const initialData = {
        type: 'cognitive_stream_init',
        timestamp: Date.now(),
        data: { thoughts: thoughtHistory.slice(-initLimit) },
      };

      // Only log in development mode
      if (process.env.NODE_ENV === 'development') {
        console.log(
          'Sending initial data with',
          thoughtHistory.length,
          'thoughts'
        );
      }
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(initialData)}\n\n`)
      );

      const sendUpdates = async () => {
        try {
          // Process external chat and bot responses only
          // Thought generation is now handled by bot lifecycle events
          const thoughts = [(await generateThoughts()) || []].concat(
            await processExternalChat(),
            await processBotResponses()
          );

          if (thoughts.length > 0) {
            // Only log in development mode
            if (process.env.NODE_ENV === 'development') {
              console.log(
                'Sending',
                thoughts.length,
                'new thoughts to',
                activeConnections.size,
                'connections'
              );
            }
            const updateData = {
              type: 'cognitive_thoughts',
              timestamp: Date.now(),
              data: { thoughts },
            };

            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(updateData)}\n\n`)
            );
          } else {
            console.log('No new thoughts to send');
          }
        } catch (error) {
          console.error('Error in sendUpdates:', error);
        }
      };

      const interval = setInterval(sendUpdates, 60000); // Process chat/responses every minute only

      // Send heartbeat every 10 seconds to keep connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'heartbeat', timestamp: Date.now() })}\n\n`
            )
          );
        } catch (error) {
          // Connection is dead, will be cleaned up on next broadcast
          console.debug('Heartbeat failed, connection may be dead');
        }
      }, 10000);

      req.signal.addEventListener('abort', () => {
        clearInterval(interval);
        clearInterval(heartbeat);
        activeConnections.delete(controller);
        // Only log in development mode
        if (process.env.NODE_ENV === 'development') {
          console.log(
            'GET /api/ws/cognitive-stream: Connection removed, total connections:',
            activeConnections.size
          );
        }
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};

export const OPTIONS = async () => {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};

// Mark a thought as processed
export const PUT = async (req: NextRequest) => {
  try {
    await maybeReloadThoughtStore();
    const { thoughtId } = await req.json();

    if (!thoughtId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Thought ID required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const thoughtStore = await getThoughtStore();
    const updated = thoughtStore.map((thought) =>
      thought.id === thoughtId ? { ...thought, processed: true } : thought
    );

    await saveThoughtStore(updated);

    return new Response(JSON.stringify({ success: true, thoughtId }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('PUT /api/ws/cognitive-stream error:', error);
    return new Response('Internal server error', { status: 500 });
  }
};

export const POST = async (req: NextRequest) => {
  try {
    await maybeReloadThoughtStore();
    const body = await req.json();
    const { type, content, attribution, context, metadata } = body;

    // Only log in development mode
    if (process.env.NODE_ENV === 'development') {
      console.log('POST /api/ws/cognitive-stream received:', {
        type,
        content,
        attribution,
      });
    }

    if (!content || content.trim().length === 0) {
      return new Response('Thought content is required', { status: 400 });
    }

    // Add the thought to the history
    const newThought = addThought({
      type: type || 'intrusive',
      content: content.trim(),
      attribution: attribution || 'external',
      context: context || {
        emotionalState: 'neutral',
        confidence: 0.5,
      },
      metadata: {
        ...metadata,
        thoughtType: type || 'intrusive', // Ensure thoughtType is set
      },
    });

    // Only log in development mode
    if (process.env.NODE_ENV === 'development') {
      console.log('New thought added to history:', newThought);
    }

    // Broadcast to all connected clients
    const message = JSON.stringify({
      type: 'cognitive_thoughts',
      timestamp: Date.now(),
      data: { thoughts: [newThought] },
    });

    // Only log in development mode
    if (process.env.NODE_ENV === 'development') {
      console.log(
        'Broadcasting message to',
        activeConnections.size,
        'connections:',
        message
      );
    }

    let sentCount = 0;
    const deadConnections: ReadableStreamDefaultController[] = [];

    activeConnections.forEach((controller) => {
      try {
        controller.enqueue(new TextEncoder().encode(`data: ${message}\n\n`));
        sentCount++;
        // Only log in development mode
        if (process.env.NODE_ENV === 'development') {
          console.log('Message sent to connection');
        }
      } catch (error) {
        // Only log errors in development mode
        if (process.env.NODE_ENV === 'development') {
          console.log('Error sending to connection:', error);
        }
        // Mark for removal
        deadConnections.push(controller);
      }
    });

    // Remove dead connections
    deadConnections.forEach((controller) => {
      activeConnections.delete(controller);
    });

    // Only log in development mode
    if (process.env.NODE_ENV === 'development') {
      console.log(
        `Successfully sent message to ${sentCount} connections (${deadConnections.length} dead connections removed)`
      );
    }

    return new Response(
      JSON.stringify({ success: true, thought: newThought }),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('POST /api/ws/cognitive-stream error:', error);
    return new Response('Internal server error', { status: 500 });
  }
};
