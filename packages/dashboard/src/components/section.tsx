import React from 'react';
import { cn } from '@/lib/utils';

interface SectionProps {
  title: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  tight?: boolean;
  className?: string;
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
  className 
}: SectionProps) {
  return (
    <section className={cn(
      "rounded-2xl border border-zinc-800 bg-zinc-950/60 shadow-sm",
      className
    )}>
      <header className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/80">
        <div className="flex items-center gap-2 text-zinc-200">
          {icon}
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
        {actions}
      </header>
      <div className={cn("px-3", tight ? "py-2" : "py-3")}>
        {children}
      </div>
    </section>
  );
}
