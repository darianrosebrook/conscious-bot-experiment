import React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { getItemSprite, getFallbackSprite } from '@/lib/minecraft-sprites';
import {
  getMineflayerItemSprite,
  getMineflayerItemDisplayName,
} from '@/lib/mineflayer-item-mapping';
import s from './viewer-hud-overlay.module.scss';

const HEARTS_MAX = 10;
const FOOD_MAX = 10;
const ARMOR_MAX = 10;
const BREATH_MAX = 10;

const sprite = {
  heart: {
    full: '/sprites/hud/heart/full.png',
    half: '/sprites/hud/heart/half.png',
    empty: '/sprites/hud/heart/container.png',
  },
  food: {
    full: '/sprites/hud/food_full.png',
    half: '/sprites/hud/food_half.png',
    empty: '/sprites/hud/food_empty.png',
  },
  armor: {
    full: '/sprites/hud/armor_full.png',
    half: '/sprites/hud/armor_half.png',
    empty: '/sprites/hud/armor_empty.png',
  },
  air: {
    full: '/sprites/hud/air.png',
    empty: '/sprites/hud/air_bursting.png',
  },
} as const;

export interface HotbarItem {
  type: string | number | null;
  count: number;
  slot: number;
  name?: string | null;
  displayName?: string;
}

function getHotbarItemSprite(
  itemType: string | number | null | undefined,
  itemName?: string
): string {
  if (!itemType) return getFallbackSprite();
  if (itemName) return getItemSprite(itemName);
  if (typeof itemType === 'number')
    return getItemSprite(getMineflayerItemSprite(itemType));
  if (typeof itemType === 'string') return getItemSprite(itemType);
  return getFallbackSprite();
}

function getHotbarItemName(item: HotbarItem): string {
  if (item.displayName) return item.displayName;
  if (typeof item.type === 'number')
    return getMineflayerItemDisplayName(item.type);
  return String(item.type ?? '');
}

function getHeartSprite(
  value: number,
  index: number
): keyof typeof sprite.heart {
  const remaining = value - index * 2;
  if (remaining >= 2) return 'full';
  if (remaining >= 1) return 'half';
  return 'empty';
}

function getFoodSprite(value: number, index: number): keyof typeof sprite.food {
  const remaining = value - index * 2;
  if (remaining >= 2) return 'full';
  if (remaining >= 1) return 'half';
  return 'empty';
}

function getArmorSprite(
  value: number,
  index: number
): keyof typeof sprite.armor {
  const remaining = value - index * 2;
  if (remaining >= 2) return 'full';
  if (remaining >= 1) return 'half';
  return 'empty';
}

function getAirSprite(value: number, index: number): keyof typeof sprite.air {
  const remaining = value - index * 2;
  return remaining >= 1 ? 'full' : 'empty';
}

export interface ViewerHudOverlayProps {
  health?: number;
  hunger?: number;
  armor?: number;
  breath?: number;
  experience?: number;
  hotbarItems?: HotbarItem[];
  selectedSlot?: number;
  className?: string;
}

/**
 * Minecraft-style HUD overlay for the prismarine viewer.
 */
export function ViewerHudOverlay({
  health = 20,
  hunger = 20,
  armor = 0,
  breath = 20,
  experience = 0,
  hotbarItems = [],
  selectedSlot = 0,
  className,
}: ViewerHudOverlayProps) {
  const experiencePercent = Math.max(0, Math.min(1, experience));
  const barHeight = '4px';

  return (
    <div className={cn(s.root, className)} aria-hidden>
      <div className={s.container}>
        {/* Left stack: armor (top), health (middle) */}
        <div className={cn(s.column, s.columnLeft)}>
          <div className={s.iconRow}>
            {Array.from({ length: ARMOR_MAX }, (_, i) => (
              <img
                key={`armor-${i}`}
                src={sprite.armor[getArmorSprite(armor, i)]}
                alt=""
                className={s.hudIcon}
                width={9}
                height={9}
              />
            ))}
          </div>
          <div className={s.iconRow}>
            {Array.from({ length: HEARTS_MAX }, (_, i) => (
              <img
                key={`heart-${i}`}
                src={sprite.heart[getHeartSprite(health, i)]}
                alt=""
                className={s.hudIcon}
                width={9}
                height={9}
              />
            ))}
          </div>
        </div>
        {/* Right stack: breath (top), hunger (middle) */}
        <div className={cn(s.column, s.columnRight)}>
          <div className={cn(s.iconRow, s.iconRowRight)}>
            {Array.from({ length: BREATH_MAX }, (_, i) => (
              <img
                key={`air-${i}`}
                src={sprite.air[getAirSprite(breath, i)]}
                alt=""
                className={s.hudIcon}
                width={9}
                height={9}
              />
            ))}
          </div>
          <div className={cn(s.iconRow, s.iconRowRight)}>
            {Array.from({ length: FOOD_MAX }, (_, i) => (
              <img
                key={`food-${i}`}
                src={sprite.food[getFoodSprite(hunger, i)]}
                alt=""
                className={s.hudIcon}
                width={9}
                height={9}
              />
            ))}
          </div>
        </div>
      </div>
      {/* XP bar spanning full width */}
      <div className={s.xpBarRow}>
        <div className={s.barWrapper} style={{ height: barHeight }}>
          <img
            src="/sprites/hud/experience_bar_background.png"
            alt=""
            className={s.barBg}
            width={182}
            height={5}
          />
          <div
            className={s.barFillWrapper}
            style={{ width: `${Math.max(0, experiencePercent) * 100}%` }}
          >
            <img
              src="/sprites/hud/experience_bar_progress.png"
              alt=""
              className={s.barFill}
              style={{
                width:
                  experiencePercent > 0.001
                    ? `${100 / experiencePercent}%`
                    : '100%',
              }}
              width={182}
              height={5}
            />
          </div>
        </div>
      </div>
      {/* Hotbar */}
      <div className={s.hotbar}>
        {Array.from({ length: 9 }, (_, i) => {
          const item = hotbarItems.find((h) => h.slot === i);
          const isSelected = selectedSlot === i;
          return (
            <div
              key={i}
              className={cn(s.hotbarSlot, isSelected && s.hotbarSlotSelected)}
            >
              {item ? (
                <>
                  <Image
                    src={getHotbarItemSprite(item.type, item.name || undefined)}
                    alt={getHotbarItemName(item)}
                    width={32}
                    height={32}
                    className={s.hotbarSprite}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = getFallbackSprite();
                    }}
                  />
                  {item.count > 1 && (
                    <span className={s.hotbarCount}>{item.count}</span>
                  )}
                </>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
