/**
 * Intero Current Snapshot
 *
 * Compact display of the current interoceptive state:
 * six horizontal bars (one per stress axis), three headline numbers
 * (composite stress, focus, curiosity), and an emotional state badge.
 *
 * @author @darianrosebrook
 */


import { cn } from '@/lib/utils';
import type { InteroSnapshot } from '@/types';
import styles from './intero-current-snapshot.module.scss';

interface InteroCurrentSnapshotProps {
  snapshot: InteroSnapshot | null;
}

const AXIS_CONFIG: {
  key: keyof NonNullable<InteroSnapshot['stressAxes']>;
  label: string;
  color: string;
}[] = [
  { key: 'time', label: 'Time', color: '#f59e0b' },
  { key: 'situational', label: 'Situational', color: '#ef4444' },
  { key: 'healthHunger', label: 'Health', color: '#22c55e' },
  { key: 'resource', label: 'Resource', color: '#3b82f6' },
  { key: 'protection', label: 'Protection', color: '#a855f7' },
  { key: 'locationDistance', label: 'Location', color: '#06b6d4' },
];

const MOOD_CLASSES: Record<string, string> = {
  neutral: 'moodNeutral',
  attentive: 'moodAttentive',
  uneasy: 'moodUneasy',
};

export function InteroCurrentSnapshot({
  snapshot,
}: InteroCurrentSnapshotProps) {
  if (!snapshot) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyText}>No intero data available</div>
      </div>
    );
  }

  const moodKey = MOOD_CLASSES[snapshot.emotionalState] || MOOD_CLASSES.neutral;
  const moodClass =
    styles[moodKey as keyof typeof styles] || styles.moodNeutral;

  return (
    <div className={styles.root}>
      {/* Headline numbers + emotional state */}
      <div className={styles.headlineRow}>
        <div className={styles.headlineCard}>
          <div className={styles.headlineLabel}>Stress</div>
          <div className={styles.headlineValue}>
            {Math.round(snapshot.stress)}
          </div>
        </div>
        <div className={styles.headlineCard}>
          <div className={styles.headlineLabel}>Focus</div>
          <div className={styles.headlineValue}>
            {Math.round(snapshot.focus)}
          </div>
        </div>
        <div className={styles.headlineCard}>
          <div className={styles.headlineLabel}>Curiosity</div>
          <div className={styles.headlineValue}>
            {Math.round(snapshot.curiosity)}
          </div>
        </div>
        <div className={cn(styles.moodBadge, moodClass)}>
          {snapshot.emotionalState}
        </div>
      </div>

      {/* Axis bars */}
      <div className={styles.axisGroup}>
        {AXIS_CONFIG.map(({ key, label, color }) => {
          const value = snapshot.stressAxes?.[key] ?? 0;
          return (
            <div key={key} className={styles.axisBar}>
              <span className={styles.axisLabel}>{label}</span>
              <div className={styles.axisTrack}>
                <div
                  className={styles.axisFill}
                  style={{
                    width: `${Math.max(1, value)}%`,
                    backgroundColor: color,
                    opacity: 0.7 + (value / 100) * 0.3,
                  }}
                />
              </div>
              <span className={styles.axisValue}>{Math.round(value)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
