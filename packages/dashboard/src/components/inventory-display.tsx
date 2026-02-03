/**
 * Inventory Display Component
 *
 * Displays the bot's main inventory (slots 9-44) and item details.
 * The hotbar (slots 0-8) is rendered by ViewerHudOverlay as a stream overlay.
 *
 * @author @darianrosebrook
 */

import { useState, type SyntheticEvent } from 'react';
import { ChevronDown, ChevronUp, Package } from 'lucide-react';
import { Section } from './section';
import { EmptyState } from './empty-state';
import { getItemSprite, getFallbackSprite } from '@/lib/minecraft-sprites';
import {
  getMineflayerItemSprite,
  getMineflayerItemDisplayName,
} from '@/lib/mineflayer-item-mapping';
import { cn, getDurabilityColor, getIndicatorColor } from '@/lib/utils';
import s from './inventory-display.module.scss';

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

const getItemSpriteLocal = (
  itemType: string | number | null | undefined,
  itemName?: string
): string => {
  if (!itemType) return getFallbackSprite();
  if (itemName) return getItemSprite(itemName);
  if (typeof itemType === 'number') {
    const spriteName = getMineflayerItemSprite(itemType);
    return getItemSprite(spriteName);
  }
  if (typeof itemType === 'string') return getItemSprite(itemType);
  return getFallbackSprite();
};

const getDurabilityPercentage = (item: InventoryItem): number => {
  if (!item.durability || !item.maxDurability) return 100;
  return Math.max(0, Math.min(100, ((item.maxDurability - item.durability) / item.maxDurability) * 100));
};

const getItemDisplayName = (item: InventoryItem | undefined): string => {
  if (!item?.type) return '';
  if (item.displayName) return item.displayName;
  const itemName = typeof item.type === 'number' ? getMineflayerItemDisplayName(item.type) : String(item.type);
  return itemName;
};

const getTopRightIndicator = (item: InventoryItem): string => {
  if (item.durability !== undefined && item.maxDurability) {
    const percentage = getDurabilityPercentage(item);
    return `${Math.round(percentage)}%`;
  }
  if (item.count > 1) return `${item.count}`;
  return '';
};

function SlotCell({ item, isSelected, slotLabel }: { item?: InventoryItem; isSelected?: boolean; slotLabel: string }) {
  if (!item) {
    return (
      <div className={cn(s.slot, isSelected && s.slotSelected)}>
        <div className={s.emptySlot}>
          <div className={s.emptySlotBox}>
            <div className={s.emptySlotPlaceholder} />
          </div>
          <div className={s.emptySlotNumber}>{slotLabel}</div>
        </div>
      </div>
    );
  }

  const itemName = getItemDisplayName(item);
  const topRightIndicator = getTopRightIndicator(item);
  const topRightColor = getIndicatorColor(item);

  return (
    <div className={cn(s.slot, isSelected && s.slotSelected)}>
      <div className={s.slotInner}>
        {topRightIndicator && (
          <div className={cn(s.indicator, topRightColor)}>{topRightIndicator}</div>
        )}
        <div className={s.spriteCenter}>
          <img
            src={getItemSpriteLocal(item.type, item.name || undefined)}
            alt={itemName}
            width={32}
            height={32}
            className={s.spriteImg}
            onError={(e: SyntheticEvent<HTMLImageElement>) => { e.currentTarget.src = getFallbackSprite(); }}
          />
        </div>
        <div className={s.itemNameWrapper}>
          <div className={s.itemName}>{itemName}</div>
        </div>
        {item.durability !== undefined && item.maxDurability && (
          <div className={s.durabilityBar}>
            <div
              className={cn(s.durabilityFill, getDurabilityColor(getDurabilityPercentage(item)))}
              style={{ width: `${getDurabilityPercentage(item)}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export const InventoryDisplay: React.FC<InventoryDisplayProps> = ({
  inventory,
  selectedSlot: _selectedSlot = 0,
  className = '',
}) => {
  void _selectedSlot; // Reserved for future use
  const [expanded, setExpanded] = useState(false);
  const mainInventoryItems = inventory.filter((item) => item.slot >= 9 && item.slot <= 44);
  const totalItems = inventory.length;

  return (
    <Section
      title="Inventory"
      icon={<Package className={s.icon4} />}
      className={className}
      actions={
        totalItems > 0 ? (
          <button
            onClick={() => setExpanded((prev) => !prev)}
            className={s.expandToggle}
          >
            {totalItems} items
            {expanded ? <ChevronUp className={s.toggleIcon} /> : <ChevronDown className={s.toggleIcon} />}
          </button>
        ) : null
      }
    >
      {!expanded ? null : inventory.length === 0 ? (
        <EmptyState icon={Package} title="No items in inventory" description="The bot's inventory is empty." />
      ) : (
        <div className={s.spacer}>
          <div>
            <h4 className={s.sectionTitle}>Main Inventory</h4>
            <div className={s.grid9}>
              {Array.from({ length: 36 }, (_, index) => {
                const actualSlot = index + 9;
                const item = mainInventoryItems.find((item) => item.slot === actualSlot);
                return <SlotCell key={actualSlot} item={item} slotLabel={`${actualSlot + 1}`} />;
              })}
            </div>
          </div>
          <div>
            <h4 className={s.sectionTitle}>Item Details</h4>
            <div className={s.detailsSpacer}>
              {inventory.slice(0, 8).map((item, index) => (
                <div key={index} className={s.detailRow}>
                  <div className={s.detailThumb}>
                    <img
                      src={getItemSpriteLocal(item.type, item.name || undefined)}
                      alt={getItemDisplayName(item)}
                      width={32}
                      height={32}
                      className={s.detailThumbImg}
                      onError={(e: SyntheticEvent<HTMLImageElement>) => { e.currentTarget.src = getFallbackSprite(); }}
                    />
                  </div>
                  <div className={s.detailInfo}>
                    <div className={s.detailName}>{getItemDisplayName(item)}</div>
                    <div className={s.detailMeta}>
                      Slot {item.slot} • Count: {item.count}
                      {item.durability !== undefined && item.maxDurability && (
                        <span> • Durability: {Math.round(getDurabilityPercentage(item))}%</span>
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
