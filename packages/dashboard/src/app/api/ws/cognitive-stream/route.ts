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
    /** Dashboard-only: 'chain-of-thought' | 'intrusion' for display and dedup */
    provenance?: 'chain-of-thought' | 'intrusion';
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
    console.warn('Cognition service unavailable; returning no thoughts.', error);
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
              console.log('Bot response sent to minecraft server');
            } else {
              console.error(
                'Failed to send bot response to minecraft server'
              );
            }
          } catch (error) {
            console.error(
              'Error sending bot response to minecraft server:',
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
          const thoughts = [
            ...((await generateThoughts()) || []),
            ...((await processExternalChat()) || []),
            ...((await processBotResponses()) || []),
          ];

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
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};

export const OPTIONS = async () => {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};

/**
 * Clear all thoughts from persistent storage and in-memory store.
 * Clears the active thoughts file and all seed-scoped files under data/thoughts/.
 */
export const DELETE = async () => {
  try {
    thoughtHistory = [];
    currentThoughtsPath = null;

    const dataDir = path.join(process.cwd(), 'data');
    const defaultPath = path.join(dataDir, 'cognitive-thoughts.json');
    const thoughtsDir = path.join(dataDir, 'thoughts');

    const cleared: string[] = [];

    await ensureDataDirectory(defaultPath);
    await fs.writeFile(defaultPath, JSON.stringify([], null, 2));
    cleared.push(defaultPath);

    try {
      const entries = await fs.readdir(thoughtsDir, { withFileTypes: true });
      for (const ent of entries) {
        if (ent.isDirectory()) {
          const filePath = path.join(
            thoughtsDir,
            ent.name,
            'cognitive-thoughts.json'
          );
          try {
            await fs.writeFile(filePath, JSON.stringify([], null, 2));
            cleared.push(filePath);
          } catch {
            // Skip if file cannot be written
          }
        }
      }
    } catch {
      // thoughts subdir may not exist
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Cleared ${cleared.length} thought store(s)`,
        cleared,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('DELETE /api/ws/cognitive-stream error:', error);
    return new Response('Internal server error', { status: 500 });
  }
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

/**
 * Clean markdown artifacts from LLM output
 */
function cleanMarkdownArtifacts(text: string): string {
  if (!text) return text;

  let cleaned = text;

  // Remove all code fence markers (opening and closing, including nested)
  // Match: ```text, ```python, ```, or just backticks at start/end
  cleaned = cleaned.replace(/^```+[a-z]*\s*/gim, '');
  cleaned = cleaned.replace(/\s*```+$/gm, '');

  // Remove any remaining standalone triple backticks
  cleaned = cleaned.replace(/```+/g, '');

  // Collapse multiple spaces/newlines
  cleaned = cleaned.replace(/\s+/g, ' ');

  // Trim
  cleaned = cleaned.trim();

  return cleaned;
}

/**
 * Check if content is a generic fallback message
 */
function isGenericFallback(text: string): boolean {
  const lower = text.toLowerCase().trim();
  const GENERIC_PATTERNS = [
    'processing current situation',
    'maintaining awareness',
    'observing surroundings',
    'monitoring environment',
    'processing intrusive thought',
  ];
  return GENERIC_PATTERNS.some(
    (pattern) => lower === pattern || lower.startsWith(pattern + ':')
  );
}

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

    // Clean markdown artifacts from content
    const cleanedContent = cleanMarkdownArtifacts(content);

    if (!cleanedContent || cleanedContent.length === 0) {
      return new Response('Thought content is empty after cleaning', {
        status: 400,
      });
    }

    // Deduplicate generic fallbacks more aggressively (5 minutes instead of 30s)
    if (isGenericFallback(cleanedContent)) {
      const recentGenericCutoff = Date.now() - 300_000; // 5 minutes
      const recentGeneric = thoughtHistory.find(
        (old) =>
          isGenericFallback(old.content) && old.timestamp > recentGenericCutoff
      );
      if (recentGeneric) {
        return new Response(
          JSON.stringify({
            success: true,
            deduplicated: true,
            id: recentGeneric.id,
            reason: 'generic_fallback',
          }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    const trimmedContent = cleanedContent.trim();
    const provenance =
      (body.metadata && (body.metadata as { provenance?: string }).provenance) as
        | 'chain-of-thought'
        | 'intrusion'
        | undefined;

    // Deduplicate intrusive thoughts by canonical content within 8 minutes
    // so the same intrusive thought does not appear multiple times in the dashboard
    if (provenance === 'intrusion') {
      const canonicalIntrusive = trimmedContent.toLowerCase().replace(/\s+/g, ' ').trim();
      const intrusiveCutoff = Date.now() - 8 * 60_000; // 8 minutes
      const duplicateIntrusive = thoughtHistory.find(
        (old) =>
          old.metadata?.provenance === 'intrusion' &&
          old.timestamp > intrusiveCutoff &&
          old.content.toLowerCase().replace(/\s+/g, ' ').trim() === canonicalIntrusive
      );
      if (duplicateIntrusive) {
        return new Response(
          JSON.stringify({
            success: true,
            deduplicated: true,
            id: duplicateIntrusive.id,
            reason: 'intrusive_dedup',
          }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // Deduplicate: skip if identical content+type was added within the last 30s
    const recentCutoff = Date.now() - 30_000;
    const duplicate = thoughtHistory.find(
      (old) =>
        old.content === trimmedContent &&
        old.type === (type || 'reflection') &&
        old.timestamp > recentCutoff
    );
    if (duplicate) {
      return new Response(
        JSON.stringify({ success: true, deduplicated: true, id: duplicate.id }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Add the thought to the history (use cleaned content)
    const newThought = addThought({
      type: type || 'reflection',
      content: trimmedContent,
      attribution: attribution || 'external',
      context: context || {
        emotionalState: 'neutral',
        confidence: 0.5,
      },
      metadata: {
        ...metadata,
        thoughtType: metadata?.thoughtType ?? type ?? 'reflection',
        provenance: provenance ?? 'chain-of-thought',
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

// =============================================================================
// Cleanup and Maintenance Functions
// =============================================================================

/**
 * Clean up old backup files to prevent disk space issues
 */
async function cleanupOldBackups(): Promise<void> {
  try {
    const dataDir = path.join(process.cwd(), 'data');
    const backupFiles = await fs.readdir(dataDir).catch(() => []);

    const backupPattern = /^cognitive-thoughts-backup-\d{8}_\d{6}\.json$/;
    const oldBackups = backupFiles.filter((file) => backupPattern.test(file));

    // Keep only the 3 most recent backups
    const MAX_BACKUPS = 3;

    if (oldBackups.length > MAX_BACKUPS) {
      const sortedBackups = oldBackups
        .map((file) => ({
          file,
          timestamp: file.match(/(\d{8})_(\d{6})/)?.[0] || '0',
        }))
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
        .slice(MAX_BACKUPS);

      for (const backup of sortedBackups) {
        const backupPath = path.join(dataDir, backup.file);
        try {
          await fs.unlink(backupPath);
          console.log(`🧹 Cleaned up old backup: ${backup.file}`);
        } catch (error) {
          console.warn(`⚠️ Failed to clean up backup ${backup.file}:`, error);
        }
      }
    }
  } catch (error) {
    console.error('Error during backup cleanup:', error);
  }
}

/**
 * Clean up the main thoughts file if it gets too large
 */
async function cleanupMainThoughtsFile(): Promise<void> {
  try {
    const mainFilePath = path.join(
      process.cwd(),
      'data',
      'cognitive-thoughts.json'
    );
    const stats = await fs.stat(mainFilePath).catch(() => null);

    if (!stats) return;

    // If file is over 1MB, create a backup and clean it up
    const MAX_FILE_SIZE = 1024 * 1024; // 1MB

    if (stats.size > MAX_FILE_SIZE) {
      console.log(
        `📁 Main thoughts file is ${Math.round(stats.size / 1024)}KB, creating cleanup...`
      );

      // Create a backup with timestamp
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, '-')
        .slice(0, 19);
      const backupPath = path.join(
        process.cwd(),
        'data',
        `cognitive-thoughts-backup-${timestamp}.json`
      );

      await fs.copyFile(mainFilePath, backupPath);
      console.log(`💾 Created backup: ${backupPath}`);

      // Clean up the main file - keep only the last 100 thoughts
      const thoughts = await loadThoughts();
      const cleanedThoughts = thoughts.slice(-100);

      await saveThoughts(cleanedThoughts);
      console.log(
        `🧹 Cleaned main file, kept ${cleanedThoughts.length} recent thoughts`
      );

      // Clean up old backups
      await cleanupOldBackups();
    }
  } catch (error) {
    console.error('Error during main file cleanup:', error);
  }
}

/**
 * Clean up old turbo/build logs to prevent disk space issues
 */
async function cleanupTurboLogs(): Promise<void> {
  try {
    const turboDirs = [
      'packages/core/.turbo',
      'packages/memory/.turbo',
      'packages/cognition/.turbo',
      'packages/planning/.turbo',
      'packages/world/.turbo',
      'packages/safety/.turbo',
      'packages/dashboard/.turbo',
      'packages/evaluation/.turbo',
      'packages/executor-contracts/.turbo',
      'packages/minecraft-interface/.turbo',
      'packages/mcp-server/.turbo',
    ];

    for (const dir of turboDirs) {
      const fullPath = path.join(process.cwd(), dir);
      try {
        const files = await fs.readdir(fullPath).catch(() => []);
        const logFiles = files.filter((file) => file.endsWith('.log'));

        for (const logFile of logFiles) {
          const logPath = path.join(fullPath, logFile);
          const stats = await fs.stat(logPath).catch(() => null);

          if (stats && stats.size > 100 * 1024) {
            // Over 100KB
            try {
              await fs.unlink(logPath);
              console.log(
                `🧹 Cleaned up large log: ${logPath} (${Math.round(stats.size / 1024)}KB)`
              );
            } catch (error) {
              console.warn(`⚠️ Failed to clean up log ${logPath}:`, error);
            }
          }
        }
      } catch (error) {
        // Directory doesn't exist, skip
      }
    }
  } catch (error) {
    console.error('Error during turbo log cleanup:', error);
  }
}

/**
 * Initialize cleanup system
 */
setInterval(async () => {
  try {
    await cleanupMainThoughtsFile();
    await cleanupTurboLogs();
  } catch (error) {
    console.error('Error in cleanup interval:', error);
  }
}, 300000); // Run cleanup every 5 minutes

// Run cleanup on startup
cleanupMainThoughtsFile().catch(console.error);
cleanupTurboLogs().catch(console.error);

// =============================================================================
// Logging Control System
// =============================================================================

/**
 * Centralized logging configuration
 */
const LOGGING_CONFIG = {
  // Log levels: 'debug', 'info', 'warn', 'error', 'none'
  currentLevel:
    (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error' | 'none') ||
    'info',

  // Component-specific overrides
  components: {
    planning: 'warn', // Reduce planning noise
    minecraft: 'warn', // Reduce minecraft noise
    cognition: 'info', // Keep cognition logs for consciousness
    dashboard: 'info', // Keep dashboard logs for UI
  },
};

/**
 * Check if a log should be displayed based on level and component
 */
function shouldLog(level: string, component?: string): boolean {
  if (LOGGING_CONFIG.currentLevel === 'none') return false;
  if (LOGGING_CONFIG.currentLevel === 'debug') return true;

  const componentLevel = component
    ? LOGGING_CONFIG.components[
        component as keyof typeof LOGGING_CONFIG.components
      ]
    : LOGGING_CONFIG.currentLevel;

  const levelHierarchy = { debug: 0, info: 1, warn: 2, error: 3 };
  const currentLevelValue =
    levelHierarchy[LOGGING_CONFIG.currentLevel as keyof typeof levelHierarchy];
  const componentLevelValue =
    levelHierarchy[componentLevel as keyof typeof levelHierarchy] ||
    levelHierarchy[LOGGING_CONFIG.currentLevel];

  return (
    levelHierarchy[level as keyof typeof levelHierarchy] >=
    Math.min(currentLevelValue, componentLevelValue)
  );
}

/**
 * Centralized logging functions
 */
const Logger = {
  debug: (message: string, component?: string, ...args: any[]) => {
    if (shouldLog('debug', component)) {
      console.log(
        `[DEBUG][${component?.toUpperCase() || 'APP'}] ${message}`,
        ...args
      );
    }
  },

  info: (message: string, component?: string, ...args: any[]) => {
    if (shouldLog('info', component)) {
      console.log(
        `ℹ️  [INFO][${component?.toUpperCase() || 'APP'}] ${message}`,
        ...args
      );
    }
  },

  warn: (message: string, component?: string, ...args: any[]) => {
    if (shouldLog('warn', component)) {
      console.warn(
        `⚠️  [WARN][${component?.toUpperCase() || 'APP'}] ${message}`,
        ...args
      );
    }
  },

  error: (message: string, component?: string, ...args: any[]) => {
    if (shouldLog('error', component)) {
      console.error(
        `[ERROR][${component?.toUpperCase() || 'APP'}] ${message}`,
        ...args
      );
    }
  },

  // Specialized loggers for different components
  planning: (
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    ...args: any[]
  ) => {
    if (shouldLog(level, 'planning')) {
      const prefix = level === 'warn' ? '⚠️ ' : level === 'error' ? '🚫 ' : '';
      console.log(`${prefix}[PLANNING] ${message}`, ...args);
    }
  },

  minecraft: (
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    ...args: any[]
  ) => {
    if (shouldLog(level, 'minecraft')) {
      const prefix = level === 'warn' ? '⚠️ ' : level === 'error' ? '🚫 ' : '';
      console.log(`${prefix}[MINECRAFT] ${message}`, ...args);
    }
  },

  cognition: (
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    ...args: any[]
  ) => {
    if (shouldLog(level, 'cognition')) {
      const prefix = level === 'warn' ? '⚠️ ' : level === 'error' ? '🚫 ' : '';
      console.log(`${prefix}[COGNITION] ${message}`, ...args);
    }
  },

  dashboard: (
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    ...args: any[]
  ) => {
    if (shouldLog(level, 'dashboard')) {
      const prefix = level === 'warn' ? '⚠️ ' : level === 'error' ? '🚫 ' : '';
      console.log(`${prefix}[DASHBOARD] ${message}`, ...args);
    }
  },
};

// Make Logger available globally
if (typeof globalThis !== 'undefined') {
  (globalThis as any).Logger = Logger;
}
