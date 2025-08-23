import { NextRequest, NextResponse } from 'next/server';
import type {
  IntrusiveThoughtRequest,
  IntrusiveThoughtResponse,
} from '@/types';

/**
 * Intrusive Thought API
 * Submits intrusive thoughts to the bot's cognition system
 *
 * @author @darianrosebrook
 */
export async function POST(request: NextRequest) {
  try {
    const body: IntrusiveThoughtRequest = await request.json();
    const { text, tags, strength = 1.0 } = body;

    if (!text || text.trim().length === 0) {
      return NextResponse.json(
        { error: 'Thought text is required' },
        { status: 400 }
      );
    }

    // Submit to cognition system
    const cognitionResponse = await fetch('http://localhost:3003/process', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'intrusion',
        content: text,
        metadata: {
          tags: tags || [],
          strength: strength,
          timestamp: new Date().toISOString(),
        },
      }),
    });

    if (!cognitionResponse.ok) {
      return NextResponse.json(
        { error: 'Failed to process intrusive thought' },
        { status: 500 }
      );
    }

    // Also submit to planning system if it's a goal-related intrusion
    if (
      text.toLowerCase().includes('goal') ||
      text.toLowerCase().includes('task')
    ) {
      try {
        await fetch('http://localhost:3002/goal', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'intrusion',
            description: text,
            priority: strength,
            source: 'intrusion',
          }),
        });
      } catch (error) {
        // Silently fail if planning system is unavailable
      }
    }

    const response: IntrusiveThoughtResponse = {
      id: `intrusion-${Date.now()}`,
      accepted: true,
      rationale:
        'Intrusive thought processed and integrated into cognitive systems',
    };

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
