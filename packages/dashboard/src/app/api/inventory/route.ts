/**
 * Inventory API Route
 *
 * Fetches inventory data from the Minecraft bot server.
 *
 * @author @darianrosebrook
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(_request: NextRequest) {
  try {
    // Fetch inventory data from Minecraft bot server
    const response = await fetch('http://localhost:3005/state', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(
        `Minecraft bot server responded with status: ${response.status}`
      );
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error('Minecraft bot server returned unsuccessful response');
    }

    // Extract inventory data from bot state
    const inventory = data.data?.inventory || [];

    // Transform inventory items to include additional metadata
    const transformedInventory = inventory.map(
      (item: Record<string, unknown>) => ({
        type: item.type || item.name || item.id || null,
        count: typeof item.count === 'number' ? item.count : 1,
        slot: typeof item.slot === 'number' ? item.slot : 0,
        metadata: item.metadata || null,
        displayName: item.displayName || null,
        durability:
          typeof item.durability === 'number' ? item.durability : null,
        maxDurability:
          typeof item.maxDurability === 'number' ? item.maxDurability : null,
      })
    );

    return NextResponse.json({
      success: true,
      inventory: transformedInventory,
      totalItems: transformedInventory.length,
      timestamp: Date.now(),
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to fetch inventory:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch inventory data',
        details: error instanceof Error ? error.message : 'Unknown error',
        inventory: [],
        totalItems: 0,
        timestamp: Date.now(),
      },
      { status: 500 }
    );
  }
}
