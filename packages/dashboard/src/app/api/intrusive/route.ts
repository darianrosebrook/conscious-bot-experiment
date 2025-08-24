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

    // Also submit to planning system if it's a goal-related or action-related intrusion
    if (
      text.toLowerCase().includes('goal') ||
      text.toLowerCase().includes('task') ||
      text.toLowerCase().includes('craft') ||
      text.toLowerCase().includes('mine') ||
      text.toLowerCase().includes('build') ||
      text.toLowerCase().includes('explore') ||
      text.toLowerCase().includes('gather') ||
      text.toLowerCase().includes('farm')
    ) {
      try {
        console.log(`🎯 Creating goal from intrusive thought: "${text}"`);
        const planningResponse = await fetch('http://localhost:3002/goal', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: `Goal from intrusion`,
            description: text,
            priority: strength,
            urgency: 0.6,
            tasks: [{
              type: 'autonomous',
              description: text,
              priority: strength,
              urgency: 0.6,
              parameters: {},
            }],
          }),
        });

        if (planningResponse.ok) {
          const planningResult = await planningResponse.json();
          console.log(`✅ Goal created successfully:`, planningResult);
        } else {
          console.error(`❌ Failed to create goal:`, await planningResponse.text());
        }
      } catch (error) {
        console.error('Failed to create goal from intrusive thought:', error);
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
