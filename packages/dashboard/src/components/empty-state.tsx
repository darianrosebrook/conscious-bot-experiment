import React from 'react';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

/**
 * Empty state component for displaying when no data is available
 * @author @darianrosebrook
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center p-6 text-center ${className}`}
    >
      <div className="mb-4 rounded-full bg-zinc-800/50 p-3">
        <Icon className="size-6 text-zinc-400" />
      </div>
      <h3 className="mb-2 text-sm font-medium text-zinc-200">{title}</h3>
      <p className="mb-4 text-xs text-zinc-400 max-w-sm">{description}</p>
      {action && <div className="flex justify-center">{action}</div>}
    </div>
  );
}

