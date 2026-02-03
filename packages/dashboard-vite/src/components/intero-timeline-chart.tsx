/**
 * Intero Timeline Chart
 *
 * Multi-line SVG chart showing 6 stress axes + composite stress over time.
 * Grid lines, time labels, colored paths per axis, hover tooltip.
 *
 * @author @darianrosebrook
 */

import React, { useMemo, useState, useRef, useCallback } from 'react';
import type { InteroSnapshot } from '@/types';
import styles from './intero-timeline-chart.module.scss';

interface InteroTimelineChartProps {
  snapshots: InteroSnapshot[];
  height?: number;
}

const AXIS_COLORS: Record<string, string> = {
  time: '#f59e0b', // amber
  situational: '#ef4444', // red
  healthHunger: '#22c55e', // green
  resource: '#3b82f6', // blue
  protection: '#a855f7', // purple
  locationDistance: '#06b6d4', // cyan
};

const AXIS_LABELS: Record<string, string> = {
  time: 'Time',
  situational: 'Situational',
  healthHunger: 'Health',
  resource: 'Resource',
  protection: 'Protection',
  locationDistance: 'Location',
};

const AXIS_KEYS = Object.keys(AXIS_COLORS) as (keyof typeof AXIS_COLORS)[];

const PAD = { top: 12, right: 8, bottom: 28, left: 32 };

function formatTimeLabel(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

export function InteroTimelineChart({
  snapshots,
  height = 240,
}: InteroTimelineChartProps) {
  const width = 600; // will be scaled by viewBox
  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const { paths, compositePath, timeLabels, tsMin, tsRange } = useMemo(() => {
    if (snapshots.length < 2) {
      return {
        paths: {},
        compositePath: '',
        timeLabels: [],
        tsMin: 0,
        tsRange: 1,
      };
    }

    const tsMin = snapshots[0].ts;
    const tsMax = snapshots[snapshots.length - 1].ts;
    const tsRange = tsMax - tsMin || 1;

    const toX = (ts: number) => PAD.left + ((ts - tsMin) / tsRange) * innerW;
    const toY = (v: number) => PAD.top + (1 - v / 100) * innerH;

    const axisPaths: Record<string, string> = {};
    for (const key of AXIS_KEYS) {
      axisPaths[key] = snapshots
        .map((s, i) => {
          const x = toX(s.ts);
          const y = toY(s.stressAxes?.[key as keyof typeof s.stressAxes] ?? 0);
          return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(' ');
    }

    const compositePath = snapshots
      .map((s, i) => {
        const x = toX(s.ts);
        const y = toY(s.stress);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

    // Generate ~5 time labels
    const labelCount = Math.min(5, snapshots.length);
    const step = Math.floor(snapshots.length / labelCount);
    const timeLabels: { x: number; label: string }[] = [];
    for (let i = 0; i < snapshots.length; i += step) {
      timeLabels.push({
        x: toX(snapshots[i].ts),
        label: formatTimeLabel(snapshots[i].ts),
      });
    }

    return { paths: axisPaths, compositePath, timeLabels, tsMin, tsRange };
  }, [snapshots, innerW, innerH]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (snapshots.length < 2 || !svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * width;
      const relX = mouseX - PAD.left;
      if (relX < 0 || relX > innerW) {
        setHoverIdx(null);
        return;
      }
      const ts = tsMin + (relX / innerW) * tsRange;
      // Binary search for nearest
      let lo = 0;
      let hi = snapshots.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (snapshots[mid].ts < ts) lo = mid + 1;
        else hi = mid;
      }
      setHoverIdx(lo);
    },
    [snapshots, innerW, tsMin, tsRange, width]
  );

  if (snapshots.length < 2) {
    return (
      <div className={styles.emptyState} style={{ height }}>
        <div className={styles.emptyInner}>
          <div className={styles.emptyTitle}>
            Collecting interoception data...
          </div>
          <div className={styles.emptySubtitle}>
            Snapshots recorded every 60s
          </div>
        </div>
      </div>
    );
  }

  const hoverSnap = hoverIdx !== null ? snapshots[hoverIdx] : null;
  const hoverX =
    hoverIdx !== null
      ? PAD.left + ((snapshots[hoverIdx].ts - tsMin) / tsRange) * innerW
      : 0;

  return (
    <div className={styles.root}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className={styles.svg}
        style={{ height }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* Grid lines */}
        {[25, 50, 75].map((v) => {
          const y = PAD.top + (1 - v / 100) * innerH;
          return (
            <g key={v}>
              <line
                x1={PAD.left}
                y1={y}
                x2={width - PAD.right}
                y2={y}
                stroke="#27272a"
                strokeWidth={0.5}
              />
              <text
                x={PAD.left - 4}
                y={y + 3}
                textAnchor="end"
                fill="#52525b"
                fontSize={9}
              >
                {v}
              </text>
            </g>
          );
        })}

        {/* Time labels */}
        {timeLabels.map((tl, i) => (
          <text
            key={i}
            x={tl.x}
            y={height - 6}
            textAnchor="middle"
            fill="#52525b"
            fontSize={9}
          >
            {tl.label}
          </text>
        ))}

        {/* Axis paths */}
        {AXIS_KEYS.map((key) => (
          <path
            key={key}
            d={paths[key]}
            fill="none"
            stroke={AXIS_COLORS[key]}
            strokeWidth={1}
            strokeOpacity={0.6}
            strokeLinejoin="round"
          />
        ))}

        {/* Composite stress (thick white) */}
        <path
          d={compositePath}
          fill="none"
          stroke="#e4e4e7"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Hover rule */}
        {hoverSnap && (
          <>
            <line
              x1={hoverX}
              y1={PAD.top}
              x2={hoverX}
              y2={PAD.top + innerH}
              stroke="#71717a"
              strokeWidth={0.5}
              strokeDasharray="3 2"
            />
            <circle
              cx={hoverX}
              cy={PAD.top + (1 - hoverSnap.stress / 100) * innerH}
              r={3}
              fill="#e4e4e7"
              stroke="#18181b"
              strokeWidth={1}
            />
          </>
        )}
      </svg>

      {/* Hover tooltip */}
      {hoverSnap && (
        <div
          className={styles.tooltipBox}
          style={{
            left: `${(hoverX / width) * 100}%`,
            top: 4,
            transform:
              hoverX > width * 0.7 ? 'translateX(-100%)' : 'translateX(0)',
          }}
        >
          <div className={styles.tooltipTime}>
            {new Date(hoverSnap.ts).toLocaleTimeString()}
          </div>
          <div className={styles.tooltipStress}>
            Stress: {Math.round(hoverSnap.stress)}
          </div>
          {AXIS_KEYS.map((key) => (
            <div key={key} className={styles.tooltipAxisRow}>
              <span
                className={styles.tooltipDot}
                style={{ backgroundColor: AXIS_COLORS[key] }}
              />
              <span className={styles.tooltipAxisLabel}>
                {AXIS_LABELS[key]}:
              </span>
              <span className={styles.tooltipAxisValue}>
                {Math.round(
                  hoverSnap.stressAxes?.[
                    key as keyof typeof hoverSnap.stressAxes
                  ] ?? 0
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Legend */}
      <div className={styles.legend}>
        <div className={styles.legendItem}>
          <span className={styles.legendCompositeLine} />
          <span className={styles.legendCompositeLabel}>Composite</span>
        </div>
        {AXIS_KEYS.map((key) => (
          <div key={key} className={styles.legendItem}>
            <span
              className={styles.legendDot}
              style={{ backgroundColor: AXIS_COLORS[key] }}
            />
            <span className={styles.legendAxisLabel}>{AXIS_LABELS[key]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
