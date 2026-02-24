import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import styles from './stream-card.module.scss';

interface StreamCardProps {
  /** Color override classes (thought variants) — sets border-color + background-color */
  colorClasses?: { border?: string; bg?: string };
  /** Header left slot: type label, Pill, etc. */
  headerLeft: React.ReactNode;
  /** Header right slot: timestamp */
  headerRight?: React.ReactNode;
  /** Optional title between header and body */
  title?: React.ReactNode;
  /** Body content */
  body: React.ReactNode;
  /** Body text color override class */
  bodyColorClass?: string;
  /** Compact (12px) vs standard (14px) body. Default: 'standard' */
  bodySize?: 'standard' | 'compact';
  /** 2-line clamp when true. Default: true */
  truncated?: boolean;
  /** Tags/chips slot (rendered with border-top separator) */
  tags?: React.ReactNode;
  /** Footer slot */
  footer?: React.ReactNode;
  /** Expand/collapse control. Omit = no expand button */
  expandable?: { expanded: boolean; onToggle: () => void };
  className?: string;
}

export function StreamCard({
  colorClasses,
  headerLeft,
  headerRight,
  title,
  body,
  bodyColorClass,
  bodySize = 'standard',
  truncated = true,
  tags,
  footer,
  expandable,
  className,
}: StreamCardProps) {
  return (
    <div
      className={cn(
        styles.root,
        expandable && styles.rootExpandable,
        colorClasses?.border,
        colorClasses?.bg,
        className,
      )}
    >
      <div className={styles.header}>
        {headerLeft}
        {headerRight}
      </div>

      {title && <div className={styles.title}>{title}</div>}

      <p
        className={cn(
          truncated ? styles.bodyTruncated : styles.bodyExpanded,
          bodySize === 'compact' && styles.bodyCompact,
          bodyColorClass,
        )}
      >
        {body}
      </p>

      {tags && <div className={styles.tags}>{tags}</div>}

      {footer && <div className={styles.footer}>{footer}</div>}

      {expandable && (
        <button
          type="button"
          onClick={expandable.onToggle}
          className={styles.expandBtn}
          aria-label={expandable.expanded ? 'Collapse' : 'Expand'}
        >
          {expandable.expanded ? (
            <ChevronUp className={styles.expandIcon} />
          ) : (
            <ChevronDown className={styles.expandIcon} />
          )}
        </button>
      )}
    </div>
  );
}
