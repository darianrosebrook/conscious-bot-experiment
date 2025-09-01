/**
 * Cognitive Stream History API
 *
 * Provides access to persisted thought history for dashboard restoration.
 *
 * @author @darianrosebrook
 */

import { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

// =============================================================================
// Types
// =============================================================================

interface CognitiveThought {
  id: string;
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
    thoughtType: string;
    llmConfidence?: number;
    [key: string]: any;
  };
  timestamp: number;
  processed?: boolean;
}

// =============================================================================
// Configuration
// =============================================================================

const THOUGHTS_FILE_PATH = path.join(
  process.cwd(),
  'data',
  'cognitive-thoughts.json'
);

// =============================================================================
// Persistence Functions
// =============================================================================

/**
 * Load thoughts from persistent storage
 */
async function loadThoughts(): Promise<CognitiveThought[]> {
  try {
    const data = await fs.readFile(THOUGHTS_FILE_PATH, 'utf-8');
    const thoughts = JSON.parse(data);
    return Array.isArray(thoughts) ? thoughts : [];
  } catch (error) {
    // File doesn't exist or is invalid, return empty array
    console.log('No existing thoughts file found');
    return [];
  }
}

// =============================================================================
// API Endpoint
// =============================================================================

export async function GET(req: NextRequest) {
  try {
    const thoughts = await loadThoughts();

    // Optional query params: ?limit=100 (default 200)
    const url = new URL(req.url);
    const limitParam = url.searchParams.get('limit');
    const limit = Math.max(
      1,
      Math.min(1000, Number.isFinite(Number(limitParam)) ? Number(limitParam) : 200)
    );
    const sliced = thoughts.slice(-limit);

    return new Response(
      JSON.stringify({
        success: true,
        thoughts: sliced,
        count: sliced.length,
        total: thoughts.length,
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
    console.error('Failed to load thought history:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: 'Failed to load thought history',
        thoughts: [],
        count: 0,
        timestamp: Date.now(),
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
}
