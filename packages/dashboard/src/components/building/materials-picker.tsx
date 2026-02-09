/**
 * MaterialsPicker — block selection grid with category tabs
 *
 * Renders categorized block thumbnails from /block_textures/ (16×16 PNGs).
 * Falls back to /item_sprites/ if the block texture is missing.
 * Selecting a block updates the building store's selectedBlockType.
 */

import { useState, type SyntheticEvent } from 'react';
import { BLOCK_CATEGORIES } from '@/types/building';
import { getItemSprite, getFallbackSprite } from '@/lib/minecraft-sprites';
import { getBlockTextureUrl } from '@/lib/block-texture-resolver';
import { useBuildingStore } from '@/stores/building-store';
import { cn } from '@/lib/utils';
import s from './materials-picker.module.scss';

/** Format "stone_bricks" → "Stone Bricks" for tooltips. */
function displayName(block: string): string {
  return block
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function MaterialsPicker() {
  const selectedBlockType = useBuildingStore((s) => s.selectedBlockType);
  const setSelectedBlockType = useBuildingStore((s) => s.setSelectedBlockType);
  const [activeCategory, setActiveCategory] = useState(
    BLOCK_CATEGORIES[0].id
  );
  const [hoveredBlock, setHoveredBlock] = useState<string | null>(null);

  const category = BLOCK_CATEGORIES.find((c) => c.id === activeCategory);

  return (
    <div className={s.picker}>
      {/* Category tabs */}
      <div className={s.categoryTabs}>
        {BLOCK_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            className={cn(
              s.categoryTab,
              activeCategory === cat.id && s.categoryTabActive
            )}
            onClick={() => setActiveCategory(cat.id)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Block grid */}
      <div className={s.blockGrid}>
        {category?.blocks.map((block) => (
          <button
            key={block}
            className={cn(
              s.blockCell,
              selectedBlockType === block && s.blockCellSelected
            )}
            onClick={() => setSelectedBlockType(block)}
            onMouseEnter={() => setHoveredBlock(block)}
            onMouseLeave={() => setHoveredBlock(null)}
            title={displayName(block)}
          >
            <img
              src={getBlockTextureUrl(block)}
              alt={displayName(block)}
              width={32}
              height={32}
              style={{ imageRendering: 'pixelated' }}
              onError={(e: SyntheticEvent<HTMLImageElement>) => {
                // Block texture missing — try item sprite, then barrier fallback
                const img = e.currentTarget;
                const itemSrc = getItemSprite(block);
                if (img.src !== itemSrc) {
                  img.style.imageRendering = 'auto';
                  img.src = itemSrc;
                } else {
                  img.src = getFallbackSprite();
                }
              }}
            />
            {hoveredBlock === block && (
              <span className={s.blockTooltip}>{displayName(block)}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
