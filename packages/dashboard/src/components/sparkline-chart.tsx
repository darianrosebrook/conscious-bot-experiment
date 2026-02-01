/**
 * Sparkline Chart
 *
 * Tiny reusable SVG sparkline for a single metric over time.
 * Filled area polygon + polyline stroke + current-value dot.
 *
 * @author @darianrosebrook
 */

'use client';

import React, { useMemo } from 'react';

export interface SparklinePoint {
  ts: number;
  value: number;
}

interface SparklineChartProps {
  data: SparklinePoint[];
  width?: number;
  height?: number;
  color?: string;
  label?: string;
  min?: number;
  max?: number;
}

export function SparklineChart({
  data,
  width = 160,
  height = 48,
  color = '#a5b4fc',
  label,
  min = 0,
  max = 100,
}: SparklineChartProps) {
  const padX = 2;
  const padY = 4;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const points = useMemo(() => {
    if (data.length === 0) return [];
    const tsMin = data[0].ts;
    const tsMax = data[data.length - 1].ts;
    const tsRange = tsMax - tsMin || 1;
    const valRange = max - min || 1;

    return data.map((d) => ({
      x: padX + ((d.ts - tsMin) / tsRange) * innerW,
      y: padY + (1 - (d.value - min) / valRange) * innerH,
      value: d.value,
    }));
  }, [data, innerW, innerH, padX, padY, min, max]);

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center" style={{ width, height }}>
        {label && <span className="text-[10px] text-zinc-500 mb-1">{label}</span>}
        <svg width={width} height={height - (label ? 14 : 0)} viewBox={`0 0 ${width} ${height}`}>
          <line
            x1={padX}
            y1={height / 2}
            x2={width - padX}
            y2={height / 2}
            stroke="#3f3f46"
            strokeWidth={1}
            strokeDasharray="4 3"
          />
          <text
            x={width / 2}
            y={height / 2 - 4}
            textAnchor="middle"
            fill="#52525b"
            fontSize={9}
          >
            No data
          </text>
        </svg>
      </div>
    );
  }

  const polylineStr = points.map((p) => `${p.x},${p.y}`).join(' ');
  const areaStr = [
    `${points[0].x},${padY + innerH}`,
    ...points.map((p) => `${p.x},${p.y}`),
    `${points[points.length - 1].x},${padY + innerH}`,
  ].join(' ');

  const last = points[points.length - 1];

  return (
    <div className="flex flex-col">
      {label && (
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[10px] text-zinc-500">{label}</span>
          <span className="text-[10px] font-medium text-zinc-300">
            {Math.round(data[data.length - 1].value)}
          </span>
        </div>
      )}
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <polygon points={areaStr} fill={color} fillOpacity={0.12} />
        <polyline
          points={polylineStr}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx={last.x} cy={last.y} r={2.5} fill={color} />
      </svg>
    </div>
  );
}
