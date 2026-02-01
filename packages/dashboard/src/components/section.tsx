import React from 'react';
import { cn } from '@/lib/utils';

interface SectionProps {
  title: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  tight?: boolean;
  className?: string;
  fullHeight?: boolean;
}

/**
 * Section component for organizing dashboard panels
 * Provides consistent styling for different dashboard sections
 */
export function Section({
  title,
  icon,
  actions,
  children,
  tight = false,
  className,
  fullHeight = false,
}: SectionProps) {
  return (
    <section
      className={cn(
        'rounded-2xl border border-zinc-800 bg-zinc-950/60 shadow-sm',
        fullHeight && 'flex h-full min-h-0 flex-col overflow-hidden',
        className
      )}
    >
      <header className="flex shrink-0 items-center justify-between px-3 py-2 border-b border-zinc-800/80">
        <div className="flex items-center gap-2 text-zinc-200">
          {icon}
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
        {actions}
      </header>
      <div
        className={cn(
          'px-3',
          tight ? 'py-2' : 'py-3',
          fullHeight &&
            'flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col'
        )}
      >
        {children}
      </div>
    </section>
  );
}
