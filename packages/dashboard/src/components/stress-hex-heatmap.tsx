/**
 * Stress Hex Heatmap
 *
 * Hexagonal grid: center = low stress, edges = high stress. Radial position
 * is driven by intero (stress = ring, dominant axis = sector). Heat = dwell
 * frequency; current cell = thick outline.
 *
 * Axes:
 * - Radial (center -> edge): composite stress 0-100. Ring 0 = stress 0-19,
 *   ring 1 = 20-39, etc.
 * - Angular (6 directions on each ring): dominant stress axis when stressAxes
 *   is available; fallback to focus-based mapping.
 *   Sector mapping: 0=Time, 1=Situational, 2=Health/Hunger, 3=Resource,
 *   4=Protection, 5=Location.
 *
 * @author @darianrosebrook
 */

import  { useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import s from './stress-hex-heatmap.module.scss';

type Axial = { q: number; r: number };

const HEX_RADIUS = 4;
const HEX_SIZE = 16;
const SQ3 = Math.sqrt(3);

// Flat-top axial direction vectors (same order as agent-agency HexagonHeatmap)
const DIRS: Axial[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

const AXIS_LABELS = [
  'Time',
  'Situational',
  'Health',
  'Resource',
  'Protection',
  'Location',
] as const;
const AXIS_KEYS = [
  'time',
  'situational',
  'healthHunger',
  'resource',
  'protection',
  'locationDistance',
] as const;

/**
 * Situational descriptions for tooltips: stress level (ring) x dominant axis (sector).
 * Row = ring 0..4 (center = low stress, edge = high).
 * Col = axis index: 0=Time, 1=Situational, 2=Health/Hunger, 3=Resource, 4=Protection, 5=Location.
 *
 * Vocabulary is derived from buildStressContext() in stress-axis-computer.ts,
 * which provides the bot's first-person situational fragments for LLM prompts.
 * Ring 0 = below all thresholds (calm). Rings 1-2 map to the mid-threshold
 * phrases (>40-45). Rings 3-4 map to the high-threshold phrases (>60-70).
 */
const FEELING_BY_RING_AND_AXIS: Record<number, readonly [string, string, string, string, string, string]> = {
  // Ring 0: all axes below threshold — no situational context generated
  0: ['Settled', 'Settled', 'Settled', 'Settled', 'Settled', 'Settled'],
  // Ring 1-2: mid-threshold — maps to buildStressContext >40-45 phrases
  1: ['Could use a break', 'Staying alert', 'Could use food or healing', 'Could restock', 'Could use more protection', 'A ways from home'],
  2: ['Been a while since a break', 'Area feels unsafe', 'Not in the best shape', 'Inventory needs restocking', 'Additional protection needed', 'Wandered far from home'],
  // Ring 3-4: high-threshold — maps to buildStressContext >60-70 phrases
  3: ['At this for a while without rest', 'On edge — something nearby', 'Need to address health or hunger', 'Running low on supplies', 'Quite exposed', 'Far from anywhere familiar'],
  4: ['Exhausted — no rest in a long time', 'On edge — immediate danger', 'Health or hunger is critical', 'Critically low on supplies', 'Dangerously exposed', 'Far from anywhere safe'],
};

/** Ring-only description when axes not available (focus-based sectors). */
const FEELING_BY_RING_ONLY: Record<number, string> = {
  0: 'Settled',
  1: 'Mildly uneasy',
  2: 'Uneasy',
  3: 'On edge',
  4: 'Overwhelmed',
};

export interface StressAxes {
  time: number;
  situational: number;
  healthHunger: number;
  resource: number;
  protection: number;
  locationDistance: number;
}

export interface InteroState {
  stress?: number;
  focus?: number;
  curiosity?: number;
  stressAxes?: StressAxes;
}

/** Ring at distance k from center (agent-agency algorithm). */
function hexRing(center: Axial, k: number): Axial[] {
  if (k === 0) return [center];
  let cur: Axial = {
    q: center.q + DIRS[4].q * k,
    r: center.r + DIRS[4].r * k,
  };
  const out: Axial[] = [];
  for (let side = 0; side < 6; side++) {
    for (let step = 0; step < k; step++) {
      out.push({ ...cur });
      const d = DIRS[side];
      cur = { q: cur.q + d.q, r: cur.r + d.r };
    }
  }
  return out;
}

/** Spiral of hexagons from center to radius R (agent-agency algorithm). */
function hexSpiral(center: Axial, R: number): Axial[] {
  const cells: Axial[] = [];
  for (let k = 0; k <= R; k++) cells.push(...hexRing(center, k));
  return cells;
}

/** Flat-top axial to pixel (agent-agency formula). */
function axialToPixel(hex: Axial, size: number): { x: number; y: number } {
  const x = size * (3 / 2) * hex.q;
  const y = size * SQ3 * (hex.r + hex.q / 2);
  return { x, y };
}

/** Flat-top hex path: first vertex at 0 deg (right), then counterclockwise. */
function hexPath(cx: number, cy: number, size: number): string {
  const points: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i * 60 * Math.PI) / 180;
    points.push(
      `${cx + size * Math.cos(angle)},${cy + size * Math.sin(angle)}`
    );
  }
  return `M ${points.join(' L ')} Z`;
}

/** Find the dominant axis index (0-5). Ties broken by order. */
function dominantAxisIndex(axes: StressAxes): number {
  const values = AXIS_KEYS.map((k) => axes[k]);
  let maxIdx = 0;
  let maxVal = values[0];
  for (let i = 1; i < values.length; i++) {
    if (values[i] > maxVal) {
      maxVal = values[i];
      maxIdx = i;
    }
  }
  return maxIdx;
}

/** (ring, sector) key from intero: stress -> ring, dominant axis -> sector within ring. */
function getHexKey(intero: InteroState): string {
  const stress = Math.max(0, Math.min(100, intero.stress ?? 20));
  const ring = Math.min(
    HEX_RADIUS,
    Math.floor(stress / (100 / (HEX_RADIUS + 1)))
  );
  if (ring === 0) return '0,0';

  const numInRing = ring * 6;

  if (intero.stressAxes) {
    // Map dominant axis (0-5) to sector in ring
    const axisIdx = dominantAxisIndex(intero.stressAxes);
    const sector = Math.floor((axisIdx / 6) * numInRing) % numInRing;
    return `${ring},${sector}`;
  }

  // Fallback: focus-based
  const focus = Math.max(0, Math.min(100, intero.focus ?? 80));
  const sector = Math.floor((focus / 100) * numInRing) % numInRing;
  return `${ring},${sector}`;
}

/** Spiral index -> (ring, sector) key. */
function indexToKey(index: number): string {
  let idx = index;
  if (idx === 0) return '0,0';
  idx -= 1;
  for (let ring = 1; ring <= HEX_RADIUS; ring++) {
    const count = ring * 6;
    if (idx < count) return `${ring},${idx}`;
    idx -= count;
  }
  return `${HEX_RADIUS},0`;
}

/** Stress range for ring (0-100 scale). */
function stressRangeForRing(ring: number): string {
  const bucket = 100 / (HEX_RADIUS + 1);
  const lo = Math.round(ring * bucket);
  const hi = Math.round((ring + 1) * bucket) - 1;
  return `${lo}-${hi}`;
}

/** Sector label: axis name when stressAxes available, else focus percentage. */
function sectorLabel(ring: number, sector: number, hasAxes: boolean): string {
  if (ring === 0) return 'center';
  if (hasAxes) {
    const numInRing = ring * 6;
    const axisIdx = Math.round((sector / numInRing) * 6) % 6;
    return AXIS_LABELS[axisIdx];
  }
  const numInRing = ring * 6;
  const pctLo = Math.round((sector / numInRing) * 100);
  const pctHi = Math.round(((sector + 1) / numInRing) * 100) - 1;
  return `focus ~${pctLo}-${pctHi}%`;
}

/** Feeling label for tooltip: stress ring + dominant axis -> first-person situational phrase. */
function feelingLabel(ring: number, sector: number, hasAxes: boolean): string {
  if (ring === 0) return FEELING_BY_RING_ONLY[0];
  if (hasAxes) {
    const numInRing = ring * 6;
    const axisIdx = Math.round((sector / numInRing) * 6) % 6;
    const row = FEELING_BY_RING_AND_AXIS[ring as keyof typeof FEELING_BY_RING_AND_AXIS];
    return row ? row[axisIdx] : FEELING_BY_RING_ONLY[ring] ?? 'Stressed';
  }
  return FEELING_BY_RING_ONLY[ring] ?? 'Stressed';
}

interface StressHexHeatmapProps {
  intero: InteroState;
  dwellCounts: Record<string, number>;
  className?: string;
}

export function StressHexHeatmap({
  intero,
  dwellCounts,
  className,
}: StressHexHeatmapProps) {
  const hasAxes = !!intero.stressAxes;

  const {
    hexagons,
    currentKey,
    maxDwell,
    centerX,
    centerY,
    drawSize,
    svgWidth,
    svgHeight,
  } = useMemo(() => {
    const center: Axial = { q: 0, r: 0 };
    const cells = hexSpiral(center, HEX_RADIUS);
    const currentKey = getHexKey(intero);
    const maxDwell = Math.max(1, ...Object.values(dwellCounts));

    const hexagons = cells.map((hex, idx) => {
      const { x, y } = axialToPixel(hex, HEX_SIZE);
      const key = indexToKey(idx);
      const [ring, sector] = key.split(',').map(Number);
      const dwell = dwellCounts[key] ?? 0;
      return { q: hex.q, r: hex.r, x, y, key, dwell, ring, sector };
    });

    const maxExtent = HEX_RADIUS * HEX_SIZE * 2;
    const svgWidth = maxExtent * 2;
    const svgHeight = maxExtent * 2;
    const centerX = svgWidth / 2;
    const centerY = svgHeight / 2;
    const gutter = 1.5;
    const drawScale = Math.max(0, 1 - gutter / (HEX_SIZE * SQ3));
    const drawSize = HEX_SIZE * drawScale;

    return {
      hexagons,
      currentKey,
      maxDwell,
      centerX,
      centerY,
      drawSize,
      svgWidth,
      svgHeight,
    };
  }, [intero, dwellCounts]);

  const labelRadius = (HEX_RADIUS + 0.8) * HEX_SIZE * 1.5;

  return (
    <div className={cn(s.root, className)}>
      <div className={s.label}>Stress (center=low, edge=high)</div>
      <div className={s.sublabel}>
        {hasAxes
          ? 'Radial = composite stress. Sector = dominant axis: Time, Situational, Health, Resource, Protection, Location.'
          : 'Radial = stress (ring 0 = 0\u201319, ring 1 = 20\u201339, \u2026). Angular = focus (6 sectors).'}
      </div>
      <TooltipProvider delayDuration={0}>
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className={s.svg}
          style={{ overflow: 'visible' }}
        >
          <g transform={`translate(${centerX}, ${centerY})`}>
            {hexagons.map((hex) => {
              const intensity = maxDwell > 0 ? hex.dwell / maxDwell : 0;
              const isCurrent = hex.key === currentKey;
              const fill =
                intensity <= 0
                  ? '#27272a'
                  : intensity <= 0.33
                    ? '#312e81'
                    : intensity <= 0.66
                      ? '#6366f1'
                      : '#a5b4fc';
              const stressRange = stressRangeForRing(hex.ring);
              const label = sectorLabel(hex.ring, hex.sector, hasAxes);
              return (
                <TooltipPrimitive.Root key={hex.key}>
                  <TooltipTrigger asChild>
                    <path
                      d={hexPath(hex.x, hex.y, drawSize)}
                      fill={fill}
                      stroke={isCurrent ? 'rgb(250 250 250)' : 'rgb(0 0 0)'}
                      strokeWidth={isCurrent ? 3 : 1}
                      strokeOpacity={isCurrent ? 1 : 0.4}
                      className={s.hexPath}
                    />
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <div className={s.tooltipBody}>
                      <div className={s.tooltipTitle}>
                        {feelingLabel(hex.ring, hex.sector, hasAxes)}
                        {isCurrent ? ' (current)' : ''}
                      </div>
                      <div className={s.tooltipDetail}>
                        Stress {stressRange} &middot; {label}
                      </div>
                      <div className={s.tooltipDwell}>
                        Dwell: {hex.dwell}{' '}
                        {hex.dwell === 1 ? 'visit' : 'visits'}
                      </div>
                    </div>
                  </TooltipContent>
                </TooltipPrimitive.Root>
              );
            })}
            {hasAxes &&
              AXIS_LABELS.map((label, i) => {
                const angle = (i * 60 - 90) * (Math.PI / 180);
                const lx = labelRadius * Math.cos(angle);
                const ly = labelRadius * Math.sin(angle);
                return (
                  <text
                    key={label}
                    x={lx}
                    y={ly}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className={s.axisLabel}
                    style={{ fontSize: 8 }}
                  >
                    {label}
                  </text>
                );
              })}
          </g>
        </svg>
      </TooltipProvider>
    </div>
  );
}

export { getHexKey };
