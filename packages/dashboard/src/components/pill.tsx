import React from 'react';
import { cn } from '@/lib/utils';

interface PillProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger';
  className?: string;
}

/**
 * Pill component for displaying tags and labels
 * Used for task sources, thought types, and other metadata
 */
export function Pill({ 
  children, 
  variant = 'default',
  className 
}: PillProps) {
  const variantClasses = {
    default: "bg-zinc-800/80 text-zinc-300",
    success: "bg-emerald-600/20 text-emerald-300 border border-emerald-600/30",
    warning: "bg-amber-600/20 text-amber-300 border border-amber-600/30",
    danger: "bg-red-600/20 text-red-300 border border-red-600/30",
  };

  return (
    <span className={cn(
      "rounded-full px-2 py-0.5 text-[11px] font-medium",
      variantClasses[variant],
      className
    )}>
      {children}
    </span>
  );
}
