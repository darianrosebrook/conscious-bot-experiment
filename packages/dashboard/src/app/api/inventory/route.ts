/**
 * Inventory API Route
 *
 * Fetches inventory data from the Minecraft bot server.
 *
 * @author @darianrosebrook
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getMineflayerItemSprite,
  getMineflayerItemDisplayName,
} from '@/lib/mineflayer-item-mapping';

export async function GET(_request: NextRequest) {
  try {
    // Try to fetch inventory data from Minecraft bot server
    let inventory = [];

    try {
      const response = await fetch('http://localhost:3005/state', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          inventory = data.data?.inventory || [];
        }
      }
    } catch (error) {
      console.log('Minecraft bot server not available, using mock data');
    }

    // Show real inventory data (even if empty)
    console.log('Real inventory from Mineflayer:', inventory);

    // Transform Mineflayer inventory items to our format
    const transformedInventory = inventory.map((item: any) => {
      // Mineflayer items have: id, type, count, slot, metadata, name, displayName, etc.
      const itemType = item.type || item.id || null;

      const mineflayerItem = {
        type: itemType,
        count: typeof item.count === 'number' ? item.count : 1,
        slot: typeof item.slot === 'number' ? item.slot : 0,
        metadata: item.metadata || null,
        displayName:
          item.displayName ||
          item.name ||
          (itemType ? getMineflayerItemDisplayName(itemType) : null),
        durability:
          typeof item.durability === 'number' ? item.durability : null,
        maxDurability:
          typeof item.maxDurability === 'number' ? item.maxDurability : null,
      };

      // Debug logging removed for production

      return mineflayerItem;
    });

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
