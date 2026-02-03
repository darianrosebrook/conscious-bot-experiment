import React from 'react';
import { cn } from '@/lib/utils';
import styles from './pill.module.scss';

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
    default: styles.variantDefault,
    success: styles.variantSuccess,
    warning: styles.variantWarning,
    danger: styles.variantDanger,
  };

  return (
    <span className={cn(
      styles.root,
      variantClasses[variant],
      className
    )}>
      {children}
    </span>
  );
}
