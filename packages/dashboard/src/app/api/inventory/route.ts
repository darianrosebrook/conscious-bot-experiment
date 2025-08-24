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

    // Temporarily use mock data while we debug the inventory movement
    console.log('Using mock data for testing hotbar display');
    /*
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
    */

    // If no inventory data from server, use mock data for testing
    if (inventory.length === 0) {
      inventory = [
        // Hotbar items (slots 0-8) - matching what we see in the Minecraft screenshot
        {
          type: 3, // dirt
          count: 26,
          slot: 0,
          displayName: 'Dirt',
          durability: null,
          maxDurability: null,
        },
        {
          type: 112, // birch_log
          count: 16,
          slot: 1,
          displayName: 'Birch Log',
          durability: null,
          maxDurability: null,
        },
        {
          type: 6, // oak_sapling
          count: 1,
          slot: 2,
          displayName: 'Oak Sapling',
          durability: null,
          maxDurability: null,
        },
        {
          type: 58, // crafting_table
          count: 1,
          slot: 3,
          displayName: 'Crafting Table',
          durability: null,
          maxDurability: null,
        },
        {
          type: 284, // golden_shovel
          count: 1,
          slot: 4,
          displayName: 'Golden Shovel',
          durability: 150,
          maxDurability: 200,
        },
        // Main inventory items
        {
          type: 17, // oak_log
          count: 1,
          slot: 36,
          displayName: 'Oak Log',
          durability: null,
          maxDurability: null,
        },
        {
          type: 5, // oak_planks
          count: 64,
          slot: 37,
          displayName: 'Oak Planks',
          durability: null,
          maxDurability: null,
        },
        {
          type: 267, // iron_sword
          count: 1,
          slot: 38,
          displayName: 'Iron Sword',
          durability: 200,
          maxDurability: 250,
        },
        {
          type: 263, // coal
          count: 16,
          slot: 39,
          displayName: 'Coal',
          durability: null,
          maxDurability: null,
        },
        {
          type: 264, // diamond
          count: 3,
          slot: 40,
          displayName: 'Diamond',
          durability: null,
          maxDurability: null,
        },
      ];
    }

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
