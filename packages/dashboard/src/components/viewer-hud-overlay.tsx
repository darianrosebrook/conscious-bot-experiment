'use client';

import React from 'react';
import { cn } from '@/lib/utils';
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

function getHeartSprite(value: number, index: number): keyof typeof sprite.heart {
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

function getArmorSprite(value: number, index: number): keyof typeof sprite.armor {
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
  className,
}: ViewerHudOverlayProps) {
  const experiencePercent = Math.max(0, Math.min(1, experience));
  const barHeight = '4px';

  return (
    <div className={cn(s.root, className)} aria-hidden>
      <div className={s.container}>
        {/* Left stack: armor (top), health (middle), green bar (bottom) */}
        <div className={cn(s.column, s.columnLeft)}>
          <div className={s.iconRow}>
            {Array.from({ length: ARMOR_MAX }, (_, i) => (
              <img key={`armor-${i}`} src={sprite.armor[getArmorSprite(armor, i)]} alt="" className={s.hudIcon} width={9} height={9} />
            ))}
          </div>
          <div className={s.iconRow}>
            {Array.from({ length: HEARTS_MAX }, (_, i) => (
              <img key={`heart-${i}`} src={sprite.heart[getHeartSprite(health, i)]} alt="" className={s.hudIcon} width={9} height={9} />
            ))}
          </div>
          <div className={s.barWrapper} style={{ height: barHeight }}>
            <img src="/sprites/hud/experience_bar_background.png" alt="" className={s.barBg} width={182} height={5} />
            <div className={s.barFillWrapper} style={{ width: `${Math.max(0, experiencePercent) * 100}%` }}>
              <img
                src="/sprites/hud/experience_bar_progress.png"
                alt=""
                className={s.barFill}
                style={{ width: experiencePercent > 0.001 ? `${100 / experiencePercent}%` : '100%' }}
                width={182}
                height={5}
              />
            </div>
          </div>
        </div>
        {/* Right stack: breath (top), hunger (middle), green bar (bottom) */}
        <div className={cn(s.column, s.columnRight)}>
          <div className={cn(s.iconRow, s.iconRowRight)}>
            {Array.from({ length: BREATH_MAX }, (_, i) => (
              <img key={`air-${i}`} src={sprite.air[getAirSprite(breath, i)]} alt="" className={s.hudIcon} width={9} height={9} />
            ))}
          </div>
          <div className={cn(s.iconRow, s.iconRowRight)}>
            {Array.from({ length: FOOD_MAX }, (_, i) => (
              <img key={`food-${i}`} src={sprite.food[getFoodSprite(hunger, i)]} alt="" className={s.hudIcon} width={9} height={9} />
            ))}
          </div>
          <div className={s.barWrapper} style={{ height: barHeight }}>
            <img src="/sprites/hud/experience_bar_background.png" alt="" className={s.barBg} width={182} height={5} />
            <div className={s.barFillWrapper} style={{ width: `${Math.max(0, experiencePercent) * 100}%` }}>
              <img
                src="/sprites/hud/experience_bar_progress.png"
                alt=""
                className={s.barFill}
                style={{ width: experiencePercent > 0.001 ? `${100 / experiencePercent}%` : '100%' }}
                width={182}
                height={5}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
