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
    // Try to fetch inventory data from planning system
    let inventory = [];
    let botStatus = 'disconnected';
    let isAlive = false;

    try {
      const response = await fetch('http://localhost:3002/inventory', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          inventory = data.inventory || [];
          botStatus = 'connected';
          isAlive = true;
        }
      }
    } catch (error) {
      console.log('Planning system inventory not available, trying minecraft bot directly');
      
      // Fallback to minecraft bot
      try {
        const minecraftResponse = await fetch('http://localhost:3005/state', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (minecraftResponse.ok) {
          const minecraftData = await minecraftResponse.json();
          if (minecraftData.success) {
            inventory = minecraftData.data?.worldState?.inventory?.items || [];
            botStatus = minecraftData.status || 'unknown';
            isAlive = minecraftData.isAlive || false;
          }
        }
      } catch (minecraftError) {
        console.log('Minecraft bot server also not available');
      }
    }

    // Show real inventory data (even if empty) - only in debug mode
    if (
      process.env.NODE_ENV === 'development' &&
      process.env.DEBUG_INVENTORY === 'true'
    ) {
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
        // Enhanced graceful fallback item with better error handling
        const fallbackItem = {
          type: item.type || item.id || null,
          count: typeof item.count === 'number' ? item.count : 1,
          slot: typeof item.slot === 'number' ? item.slot : 0,
          metadata: null,
          displayName: item.displayName || item.name || 'Unknown Item',
          name: item.name || null,
          durability: null,
          maxDurability: null,
          fallback: true,
          error:
            error instanceof Error ? error.message : 'Item processing failed',
        };

        console.warn(
          `Using fallback item for slot ${item.slot}:`,
          fallbackItem
        );
        return fallbackItem;
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

    // Enhanced graceful fallback for complete inventory failure
    const isDevelopment = process.env.NODE_ENV === 'development';
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    if (isDevelopment) {
      // Development mode: Provide detailed error information
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to fetch inventory data',
          details: errorMessage,
          inventory: [],
          totalItems: 0,
          botStatus: 'error',
          isAlive: false,
          timestamp: Date.now(),
          fallback: true,
          debug: {
            errorType:
              error instanceof Error ? error.constructor.name : 'UnknownError',
            stack: error instanceof Error ? error.stack : undefined,
            timestamp: new Date().toISOString(),
          },
        },
        { status: 500 }
      );
    }

    // Production mode: Graceful degradation with minimal error exposure
    return NextResponse.json(
      {
        success: false,
        error: 'Inventory temporarily unavailable',
        inventory: [],
        totalItems: 0,
        botStatus: 'maintenance',
        isAlive: false,
        timestamp: Date.now(),
        fallback: true,
        message:
          'Inventory system is being restored. Please try again shortly.',
      },
      { status: 503 } // Service Unavailable
    );
  }
}
