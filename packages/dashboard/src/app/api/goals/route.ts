/**
 * Goals API Route
 *
 * Provides access to the planning system's goals data.
 * Proxies requests to the planning server to get current and active goals.
 *
 * @author @darianrosebrook
 */

import { NextRequest } from 'next/server';

const PLANNING_URL =
  process.env.PLANNING_SERVICE_URL || 'http://localhost:3002';

export async function GET(_req: NextRequest) {
  try {
    // Fetch goals from planning server
    const response = await fetch(`${PLANNING_URL}/state`, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Planning server responded with ${response.status}`);
    }

    const data = await response.json();

    return new Response(
      JSON.stringify({
        success: true,
        goals: data.state.goals,
        timestamp: Date.now(),
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
      }
    );
  } catch (error) {
    console.error('Failed to fetch goals from planning server:', error);

    return new Response(
      JSON.stringify({
        success: false,
        goals: { current: [], active: [] },
        error: 'Failed to fetch goals from planning server',
        timestamp: Date.now(),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Forward goal creation to planning server
    const response = await fetch(`${PLANNING_URL}/goal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Planning server responded with ${response.status}`);
    }

    const data = await response.json();

    return new Response(
      JSON.stringify({
        success: true,
        ...data,
        timestamp: Date.now(),
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Failed to create goal:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: 'Failed to create goal',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
