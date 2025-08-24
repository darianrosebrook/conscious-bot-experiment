/**
 * Cognitive Stream API
 * Streams genuine cognitive events (internal reflection, social analysis, observations).
 */

import { NextRequest } from 'next/server';
export const runtime = 'nodejs';
export const maxDuration = 60;

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
  };
}

const thoughtHistory: CognitiveThought[] = [];
const MAX_THOUGHTS = 1000;
const activeConnections = new Set<ReadableStreamDefaultController>();
const MAX_CONNECTIONS = 10;

function addThought(
  thought: Omit<CognitiveThought, 'id' | 'timestamp'>
): CognitiveThought {
  const newThought = {
    ...thought,
    id: `thought-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
  };
  thoughtHistory.push(newThought);
  if (thoughtHistory.length > MAX_THOUGHTS) {
    thoughtHistory.splice(0, thoughtHistory.length - MAX_THOUGHTS);
  }
  return newThought;
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

  if (!state || !plan) return [];

  const context = {
    goals: plan.goalFormulation?.currentGoals || [],
    state: {
      pos: state.data?.position,
      health: state.data?.vitals?.health,
      inventory: state.data?.inventory,
      tasks: plan.goalFormulation?.currentTasks || [],
    },
    emotional: 'neutral',
    urgency: 0.3,
  };

  const resp = await fetch('http://localhost:3003/generate-thoughts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      situation: 'environment',
      context,
      thoughtTypes: ['reflection', 'observation', 'planning'],
    }),
    signal: AbortSignal.timeout(5000),
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
          currentTask: context.state.tasks[0]?.description,
          emotionalState: t.emotionalState,
          confidence: t.confidence,
          cognitiveSystem: 'llm-core',
        },
        metadata: { llmConfidence: t.confidence, thoughtType: t.type },
      }),
    ];
  });
}

async function processExternalChat(): Promise<CognitiveThought[]> {
  // Placeholder for external chat processing
  // In a full implementation, this would monitor chat channels
  return [];
}

async function processBotResponses(): Promise<CognitiveThought[]> {
  // Placeholder for bot response processing
  // In a full implementation, this would process bot actions and responses
  return [];
}

export const GET = async (req: NextRequest) => {
  if (activeConnections.size >= MAX_CONNECTIONS) {
    return new Response('Too many connections', { status: 429 });
  }

  console.log(
    'GET /api/ws/cognitive-stream: New connection, total connections:',
    activeConnections.size
  );

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      activeConnections.add(controller);
      console.log(
        'GET /api/ws/cognitive-stream: Connection added, total connections:',
        activeConnections.size
      );

      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ type: 'cognitive_stream_init', timestamp: Date.now(), data: { thoughts: thoughtHistory.slice(-50) } })}\n\n`
        )
      );

      const sendUpdates = async () => {
        const thoughts = (
          Math.random() < 0.15 ? await generateThoughts() : []
        ).concat(
          await processExternalChat(), // assume refactored similarly
          await processBotResponses()
        );
        if (thoughts.length) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'cognitive_thoughts', timestamp: Date.now(), data: { thoughts } })}\n\n`
            )
          );
        }
      };

      const interval = setInterval(sendUpdates, 15000);
      req.signal.addEventListener('abort', () => {
        clearInterval(interval);
        activeConnections.delete(controller);
        console.log(
          'GET /api/ws/cognitive-stream: Connection removed, total connections:',
          activeConnections.size
        );
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
};

export const POST = async (req: NextRequest) => {
  try {
    const body = await req.json();
    const { type, content, attribution, context, metadata } = body;

    console.log('POST /api/ws/cognitive-stream received:', {
      type,
      content,
      attribution,
    });

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
      metadata: metadata || {},
    });

    console.log('New thought added to history:', newThought);

    // Broadcast to all connected clients
    const message = JSON.stringify({
      type: 'cognitive_thoughts',
      timestamp: Date.now(),
      data: { thoughts: [newThought] },
    });

    console.log(
      'Broadcasting message to',
      activeConnections.size,
      'connections:',
      message
    );

    activeConnections.forEach((controller) => {
      try {
        controller.enqueue(new TextEncoder().encode(`data: ${message}\n\n`));
        console.log('Message sent to connection');
      } catch (error) {
        console.log('Error sending to connection:', error);
        // Remove dead connections
        activeConnections.delete(controller);
      }
    });

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
