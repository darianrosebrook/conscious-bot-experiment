/**
 * Inventory API Route
 *
 * Fetches inventory data from the Minecraft bot server.
 *
 * @author @darianrosebrook
 */

import { NextRequest, NextResponse } from 'next/server';
import { getMineflayerItemDisplayName } from '@/lib/mineflayer-item-mapping';

export async function GET(_request: NextRequest) {
  try {
    // Try to fetch inventory data from Minecraft bot server
    let inventory = [];
    let botStatus = 'disconnected';
    let isAlive = false;

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
          // The inventory is now at data.data.worldState.inventory.items
          inventory = data.data?.worldState?.inventory?.items || [];
          botStatus = data.status || 'unknown';
          isAlive = data.isAlive || false;
        }
      }
    } catch (error) {
      console.log('Minecraft bot server not available, using mock data');
    }

    // Show real inventory data (even if empty) - only in debug mode
    if (process.env.NODE_ENV === 'development' && process.env.DEBUG_INVENTORY === 'true') {
      console.log('Real inventory from Mineflayer:', inventory);
    }

    // Transform Mineflayer inventory items to our format
    const transformedInventory = inventory.map((item: any) => {
      try {
        // Mineflayer items have: id, type, count, slot, metadata, name, displayName, etc.
        const itemType = item.type || item.id || null;

        // Mineflayer slot mapping:
        // - Hotbar: slots 36-44 (maps to 0-8)
        // - Main inventory: slots 9-35 (maps to 9-35)
        // - Armor: slots 5-8 (maps to 100-103)
        // - Offhand: slot 45 (maps to 104)
        let mappedSlot = item.slot;

        if (typeof item.slot === 'number') {
          if (item.slot >= 36 && item.slot <= 44) {
            // Hotbar items (36-44 -> 0-8)
            mappedSlot = item.slot - 36;
          } else if (item.slot >= 5 && item.slot <= 8) {
            // Armor items (5-8 -> 100-103)
            mappedSlot = item.slot + 95;
          } else if (item.slot === 45) {
            // Offhand (45 -> 104)
            mappedSlot = 104;
          }
          // Main inventory slots 9-35 stay the same
        }

        // Safely get display name
        let displayName = item.displayName || item.name;
        if (!displayName && itemType !== null) {
          // Convert string item type to display name
          if (typeof itemType === 'string') {
            displayName = itemType
              .split('_')
              .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
              .join(' ');
          } else if (typeof itemType === 'number') {
            try {
              displayName = getMineflayerItemDisplayName(itemType);
            } catch (error) {
              console.warn(
                `Failed to get display name for item type ${itemType}:`,
                error
              );
              displayName = `Item ${itemType}`;
            }
          } else {
            displayName = `Item ${itemType}`;
          }
        }

        const mineflayerItem = {
          type: itemType,
          count: typeof item.count === 'number' ? item.count : 1,
          slot: mappedSlot,
          metadata: item.metadata || null,
          displayName: displayName,
          name: item.name || null, // Preserve the original name from Mineflayer
          durability:
            typeof item.durability === 'number' ? item.durability : null,
          maxDurability:
            typeof item.maxDurability === 'number' ? item.maxDurability : null,
        };

        console.log(
          `Mapped item: ${displayName} from slot ${item.slot} to slot ${mappedSlot}`
        );

        return mineflayerItem;
      } catch (error) {
        console.error('Error processing inventory item:', error, item);
        // Return a safe fallback item
        return {
          type: item.type || item.id || null,
          count: typeof item.count === 'number' ? item.count : 1,
          slot: typeof item.slot === 'number' ? item.slot : 0,
          metadata: null,
          displayName: item.displayName || item.name || 'Unknown Item',
          name: item.name || null,
          durability: null,
          maxDurability: null,
        };
      }
    });

    return NextResponse.json({
      success: true,
      inventory: transformedInventory,
      totalItems: transformedInventory.length,
      botStatus,
      isAlive,
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
        botStatus: 'error',
        isAlive: false,
        timestamp: Date.now(),
      },
      { status: 500 }
    );
  }
}
