import { NextRequest, NextResponse } from 'next/server';
import { resilientFetch } from '@/lib/resilient-fetch';
import type {
  IntrusiveThoughtRequest,
  IntrusiveThoughtResponse,
} from '@/types';

const COGNITION_URL =
  process.env.COGNITION_SERVICE_URL || 'http://localhost:3003';
const PLANNING_URL =
  process.env.PLANNING_SERVICE_URL || 'http://localhost:3002';

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
    const cognitionResponse = await resilientFetch(`${COGNITION_URL}/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      label: 'cognition/process',
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

    if (!cognitionResponse?.ok) {
      const errBody = cognitionResponse
        ? await cognitionResponse.text()
        : 'Service unavailable';
      console.error(
        '[Dashboard] Intrusive thought cognition failure:',
        cognitionResponse?.status ?? 'unavailable',
        errBody
      );
      return NextResponse.json(
        {
          error: 'Failed to process intrusive thought',
          detail: process.env.NODE_ENV === 'development' ? errBody : undefined,
        },
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
        if (process.env.NODE_ENV === 'development') {
          console.log(
            '[Dashboard] Creating goal from intrusive thought:',
            text.slice(0, 60)
          );
        }
        const planningResponse = await resilientFetch(`${PLANNING_URL}/goal`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          label: 'planning/goal',
          body: JSON.stringify({
            name: `Goal from intrusion`,
            description: text,
            priority: strength,
            urgency: 0.6,
            tasks: [
              {
                type: 'autonomous',
                description: text,
                priority: strength,
                urgency: 0.6,
                parameters: {},
              },
            ],
          }),
        });

        if (planningResponse?.ok) {
          if (process.env.NODE_ENV === 'development') {
            const planningResult = await planningResponse.json();
            console.log(
              '[Dashboard] Goal created from intrusive thought:',
              planningResult
            );
          }
        } else if (planningResponse) {
          console.error(
            '[Dashboard] Planning goal creation failed:',
            planningResponse.status,
            await planningResponse.text()
          );
        }
      } catch (error) {
        console.error(
          '[Dashboard] Failed to create goal from intrusive thought:',
          error
        );
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
    console.error('[Dashboard] Intrusive thought API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
