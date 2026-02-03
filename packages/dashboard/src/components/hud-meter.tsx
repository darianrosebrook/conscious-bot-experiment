
import { cn, getHudColor } from '@/lib/utils';
import styles from './hud-meter.module.scss';

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
  color,
}: HudMeterProps) {
  const percentage = Math.max(0, Math.min(100, (100 * value) / max));
  const colorClass = getHudColor(percentage, color || label.toLowerCase());

  return (
    <div className={cn(styles.root, className)}>
      <div className={styles.labelRow}>
        <span className={styles.labelText}>{label}</span>
        <span className={styles.valueText}>
          {Math.round(percentage)}%
        </span>
      </div>
      <div className={styles.track}>
        <div
          className={cn(styles.fill, colorClass)}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {hint && <div className={styles.hint}>{hint}</div>}
    </div>
  );
}
