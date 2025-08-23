import { NextRequest, NextResponse } from 'next/server';
import type { IntrusiveThoughtRequest, IntrusiveThoughtResponse } from '@/types';

/**
 * API route handler for intrusive thoughts
 * Forwards requests to the cognition system (port 3003)
 */
export async function POST(request: NextRequest) {
  try {
    const body: IntrusiveThoughtRequest = await request.json();
    
    // Validate request
    if (!body.text || typeof body.text !== 'string') {
      return NextResponse.json(
        { error: 'Invalid request: text is required' },
        { status: 400 }
      );
    }

    // Forward to cognition system
    const response = await fetch('http://localhost:3003/intrusive', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Cognition system error: ${response.statusText}`);
    }

    const result: IntrusiveThoughtResponse = await response.json();
    return NextResponse.json(result);

  } catch (error) {
    console.error('Intrusive thought API error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
