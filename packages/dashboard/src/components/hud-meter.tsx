import React from 'react';
import { cn, getHudColor } from '@/lib/utils';

interface HudMeterProps {
  label: string;
  value: number;
  max?: number;
  hint?: string;
  className?: string;
  color?: string;
}

/**
 * HUD Meter component for displaying vital statistics
 * Shows a progress bar with label and percentage
 */
export function HudMeter({ 
  label, 
  value, 
  max = 100, 
  hint, 
  className,
  color 
}: HudMeterProps) {
  const percentage = Math.max(0, Math.min(100, (100 * value) / max));
  const colorClass = color ? `bg-${color}-500` : getHudColor(percentage, label.toLowerCase());

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex items-center justify-between text-xs text-zinc-300">
        <span className="uppercase tracking-wide">{label}</span>
        <span className="tabular-nums text-zinc-400">{Math.round(percentage)}%</span>
      </div>
      <div className="h-2 w-full rounded bg-zinc-800">
        <div 
          className={cn("h-2 rounded transition-all duration-300", colorClass)} 
          style={{ width: `${percentage}%` }} 
        />
      </div>
      {hint && (
        <div className="text-[10px] text-zinc-500">{hint}</div>
      )}
    </div>
  );
}
