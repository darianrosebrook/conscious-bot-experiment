/**
 * Inventory Display Component
 *
 * Displays the bot's current inventory items with sprites, counts, and durability.
 *
 * @author @darianrosebrook
 */

import React from 'react';
import Image from 'next/image';
import { Package } from 'lucide-react';
import { Section } from './section';
import { EmptyState } from './empty-state';
import { getItemSprite, getFallbackSprite } from '@/lib/minecraft-sprites';
import {
  getMineflayerItemSprite,
  getMineflayerItemDisplayName,
} from '@/lib/mineflayer-item-mapping';

interface InventoryItem {
  type: string | number | null;
  count: number;
  slot: number;
  metadata?: Record<string, unknown>;
  displayName?: string;
  name?: string | null;
  durability?: number;
  maxDurability?: number;
}

interface InventoryDisplayProps {
  inventory: InventoryItem[];
  selectedSlot?: number;
  className?: string;
}

/**
 * Get item sprite from local sprite system
 */
const getItemSpriteLocal = (
  itemType: string | number | null | undefined,
  itemName?: string
): string => {
  // Handle null/undefined item types
  if (!itemType) {
    return getFallbackSprite();
  }

  // If we have a name from Mineflayer, use that directly (it's correct)
  if (itemName) {
    return getItemSprite(itemName);
  }

  // Convert numeric item ID to item name (Mineflayer format)
  if (typeof itemType === 'number') {
    const spriteName = getMineflayerItemSprite(itemType);
    return getItemSprite(spriteName);
  }

  // Handle string item types
  if (typeof itemType === 'string') {
    return getItemSprite(itemType);
  }

  // Fallback
  return getFallbackSprite();
};

/**
 * Get durability percentage
 */
const getDurabilityPercentage = (item: InventoryItem): number => {
  if (!item.durability || !item.maxDurability) return 100;
  return Math.max(
    0,
    Math.min(
      100,
      ((item.maxDurability - item.durability) / item.maxDurability) * 100
    )
  );
};

/**
 * Get durability color based on percentage
 */
const getDurabilityColor = (percentage: number): string => {
  if (percentage >= 80) return 'bg-green-500';
  if (percentage >= 50) return 'bg-yellow-500';
  if (percentage >= 20) return 'bg-orange-500';
  return 'bg-red-500';
};

/**
 * Get item display name for a slot
 */
const getItemDisplayName = (item: InventoryItem | undefined): string => {
  if (!item?.type) return '';

  // Use the displayName from Mineflayer if available (it's correct)
  if (item.displayName) {
    return item.displayName;
  }

  // Fallback to mapping if no displayName provided
  const itemName =
    typeof item.type === 'number'
      ? getMineflayerItemDisplayName(item.type)
      : String(item.type);

  return itemName;
};

/**
 * Get top right indicator (stack count or durability)
 */
const getTopRightIndicator = (item: InventoryItem): string => {
  // Show durability percentage for items with durability
  if (item.durability !== undefined && item.maxDurability) {
    const percentage = getDurabilityPercentage(item);
    return `${Math.round(percentage)}%`;
  }

  // Show stack count for items with count > 1
  if (item.count > 1) {
    return `${item.count}`;
  }

  return '';
};

/**
 * Get top right indicator color
 */
const getTopRightIndicatorColor = (item: InventoryItem): string => {
  // Durability colors
  if (item.durability !== undefined && item.maxDurability) {
    const percentage = getDurabilityPercentage(item);
    if (percentage >= 80) return 'text-green-400';
    if (percentage >= 50) return 'text-yellow-400';
    if (percentage >= 20) return 'text-orange-400';
    return 'text-red-400';
  }

  // Stack count color
  return 'text-white';
};

export const InventoryDisplay: React.FC<InventoryDisplayProps> = ({
  inventory,
  selectedSlot = 0,
  className = '',
}) => {
  // Separate hotbar (slots 0-8) from main inventory
  const hotbarItems = inventory.filter(
    (item) => item.slot >= 0 && item.slot <= 8
  );
  const mainInventoryItems = inventory.filter(
    (item) => item.slot >= 9 && item.slot <= 35
  );

  return (
    <Section
      title="Inventory"
      icon={<Package className="size-4" />}
      className={className}
    >
      {inventory.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No items in inventory"
          description="The bot's inventory is empty."
        />
      ) : (
        <div className="space-y-4">
          {/* Hotbar */}
          <div>
            <h4 className="text-sm font-medium text-zinc-300 mb-2">Hotbar</h4>
            <div className="grid grid-cols-9 gap-1">
              {Array.from({ length: 9 }, (_, index) => {
                const item = hotbarItems.find((item) => item.slot === index);
                const itemName = getItemDisplayName(item);
                const topRightIndicator = item
                  ? getTopRightIndicator(item)
                  : '';
                const topRightColor = item
                  ? getTopRightIndicatorColor(item)
                  : '';

                return (
                  <div
                    key={index}
                    className={`relative aspect-square rounded-lg border p-1 ${
                      selectedSlot === index
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-zinc-700 bg-zinc-900/50'
                    }`}
                  >
                    {item ? (
                      <div className="relative h-full w-full flex flex-col">
                        {/* Top right indicator (stack count or durability) */}
                        {topRightIndicator && (
                          <div
                            className={`absolute top-0 right-0 text-xs font-medium bg-black/60 px-1 rounded ${topRightColor}`}
                          >
                            {topRightIndicator}
                          </div>
                        )}

                        {/* Item sprite - centered */}
                        <div className="flex-1 flex items-center justify-center p-1">
                          <Image
                            src={getItemSpriteLocal(
                              item.type,
                              item.name || undefined
                            )}
                            alt={itemName}
                            width={32}
                            height={32}
                            className="h-full w-full object-contain"
                            onError={(e) => {
                              // Fallback to generic sprite on error
                              const target = e.target as HTMLImageElement;
                              target.src = getFallbackSprite();
                            }}
                          />
                        </div>

                        {/* Item name - centered at bottom */}
                        <div className="text-center">
                          <div className="text-[10px] text-zinc-300 font-medium truncate px-1">
                            {itemName}
                          </div>
                        </div>

                        {/* Durability bar */}
                        {item.durability !== undefined &&
                          item.maxDurability && (
                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-700">
                              <div
                                className={`h-full ${getDurabilityColor(getDurabilityPercentage(item))}`}
                                style={{
                                  width: `${getDurabilityPercentage(item)}%`,
                                }}
                              />
                            </div>
                          )}
                      </div>
                    ) : (
                      <div className="h-full w-full flex flex-col items-center justify-center text-zinc-600 text-xs">
                        <div className="flex-1 flex items-center justify-center">
                          <div className="w-8 h-8 bg-zinc-800/50 rounded"></div>
                        </div>
                        <div className="text-[10px] text-zinc-500">
                          {index + 1}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Main Inventory */}
          <div>
            <h4 className="text-sm font-medium text-zinc-300 mb-2">
              Main Inventory
            </h4>
            <div className="grid grid-cols-9 gap-1">
              {Array.from({ length: 27 }, (_, index) => {
                const actualSlot = index + 9; // Main inventory starts at slot 9
                const item = mainInventoryItems.find(
                  (item) => item.slot === actualSlot
                );
                const itemName = getItemDisplayName(item);
                const topRightIndicator = item
                  ? getTopRightIndicator(item)
                  : '';
                const topRightColor = item
                  ? getTopRightIndicatorColor(item)
                  : '';

                return (
                  <div
                    key={actualSlot}
                    className="relative aspect-square rounded-lg border border-zinc-700 bg-zinc-900/50 p-1"
                  >
                    {item ? (
                      <div className="relative h-full w-full flex flex-col">
                        {/* Top right indicator (stack count or durability) */}
                        {topRightIndicator && (
                          <div
                            className={`absolute top-0 right-0 text-xs font-medium bg-black/60 px-1 rounded ${topRightColor}`}
                          >
                            {topRightIndicator}
                          </div>
                        )}

                        {/* Item sprite - centered */}
                        <div className="flex-1 flex items-center justify-center p-1">
                          <Image
                            src={getItemSpriteLocal(
                              item.type,
                              item.name || undefined
                            )}
                            alt={itemName}
                            width={32}
                            height={32}
                            className="h-full w-full object-contain"
                            onError={(e) => {
                              // Fallback to generic sprite on error
                              const target = e.target as HTMLImageElement;
                              target.src = getFallbackSprite();
                            }}
                          />
                        </div>

                        {/* Item name - centered at bottom */}
                        <div className="text-center">
                          <div className="text-[10px] text-zinc-300 font-medium truncate px-1">
                            {itemName}
                          </div>
                        </div>

                        {/* Durability bar */}
                        {item.durability !== undefined &&
                          item.maxDurability && (
                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-700">
                              <div
                                className={`h-full ${getDurabilityColor(getDurabilityPercentage(item))}`}
                                style={{
                                  width: `${getDurabilityPercentage(item)}%`,
                                }}
                              />
                            </div>
                          )}
                      </div>
                    ) : (
                      <div className="h-full w-full flex flex-col items-center justify-center text-zinc-600 text-xs">
                        <div className="flex-1 flex items-center justify-center">
                          <div className="w-8 h-8 bg-zinc-800/50 rounded"></div>
                        </div>
                        <div className="text-[10px] text-zinc-500">
                          {actualSlot + 1}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Item Details */}
          <div>
            <h4 className="text-sm font-medium text-zinc-300 mb-2">
              Item Details
            </h4>
            <div className="space-y-2">
              {inventory.slice(0, 8).map((item, index) => (
                <div
                  key={index}
                  className="flex items-center space-x-3 p-2 bg-zinc-900/50 rounded-lg"
                >
                  <div className="relative w-8 h-8">
                    <Image
                      src={getItemSpriteLocal(
                        item.type,
                        item.name || undefined
                      )}
                      alt={getItemDisplayName(item)}
                      width={32}
                      height={32}
                      className="w-full h-full object-contain"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src = getFallbackSprite();
                      }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-zinc-200 truncate">
                      {getItemDisplayName(item)}
                    </div>
                    <div className="text-xs text-zinc-400">
                      Slot {item.slot} • Count: {item.count}
                      {item.durability !== undefined && item.maxDurability && (
                        <span>
                          {' '}
                          • Durability:{' '}
                          {Math.round(getDurabilityPercentage(item))}%
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Section>
  );
};
