import React from 'react';
import { cn } from '@/lib/utils';
import styles from './section.module.scss';

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
        styles.section,
        fullHeight && styles.sectionFullHeight,
        className
      )}
    >
      <header className={styles.header}>
        <div className={styles.headerTitle}>
          {icon}
          <h3 className={styles.titleText}>{title}</h3>
        </div>
        {actions}
      </header>
      <div
        className={cn(
          styles.content,
          tight && styles.contentTight,
          fullHeight && styles.contentFullHeight
        )}
      >
        {children}
      </div>
    </section>
  );
}
