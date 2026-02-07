import { type ClassValue, clsx } from 'clsx';
import hudColors from '@/styles/hud-colors.module.scss';

/** Only logs when VITE_DEBUG_DASHBOARD=1 to reduce browser console noise */
export function debugLog(...args: unknown[]): void {
  if (import.meta.env.VITE_DEBUG_DASHBOARD === '1') {
    console.log(...args);
  }
}

/**
 * Utility function to merge CSS classes (clsx only, no Tailwind merge)
 * @param inputs - Class values to merge
 * @returns Merged class string
 */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/**
 * Format timestamp for display
 * @param ts - ISO timestamp string
 * @returns Formatted time string
 */
export function formatTime(ts: string): string {
  return new Date(ts).toLocaleTimeString();
}

/**
 * Format relative time (e.g., "2 minutes ago")
 * @param ts - ISO timestamp string
 * @returns Relative time string
 */
export function formatRelativeTime(ts: string): string {
  const now = new Date();
  const time = new Date(ts);
  const diffMs = now.getTime() - time.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);

  if (diffSeconds < 60) {
    return 'just now';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  return time.toLocaleDateString();
}

/**
 * Get color class for HUD meter based on value and type
 * @param value - Current value (0-100)
 * @param type - Type of meter (health, hunger, stress, etc.)
 * @returns SCSS module color class
 */
export function getHudColor(value: number, type: string): string {
  // For stress-like metrics (lower is better)
  if (
    type.includes('stress') ||
    type.includes('fatigue') ||
    type.includes('anxiety')
  ) {
    if (value <= 10) return hudColors.colorGreen;
    if (value <= 50) return hudColors.colorYellow;
    return hudColors.colorRed;
  }

  // For health-like metrics (higher is better)
  if (
    type.includes('health') ||
    type.includes('energy') ||
    type.includes('happiness') ||
    type.includes('hunger')
  ) {
    if (value >= 80) return hudColors.colorGreen;
    if (value >= 50) return hudColors.colorYellow;
    return hudColors.colorRed;
  }

  // Default behavior (higher is better)
  if (value >= 80) return hudColors.colorGreen;
  if (value >= 50) return hudColors.colorYellow;
  return hudColors.colorRed;
}

/**
 * Get durability color class based on percentage
 */
export function getDurabilityColor(percentage: number): string {
  if (percentage >= 80) return hudColors.durabilityGreen;
  if (percentage >= 50) return hudColors.durabilityYellow;
  if (percentage >= 20) return hudColors.durabilityOrange;
  return hudColors.durabilityRed;
}

/**
 * Get indicator text color based on item state
 */
export function getIndicatorColor(item: {
  durability?: number;
  maxDurability?: number;
}): string {
  if (item.durability !== undefined && item.maxDurability) {
    const percentage = Math.max(
      0,
      Math.min(
        100,
        ((item.maxDurability - item.durability) / item.maxDurability) * 100
      )
    );
    if (percentage >= 80) return hudColors.textGreen;
    if (percentage >= 50) return hudColors.textYellow;
    if (percentage >= 20) return hudColors.textOrange;
    return hudColors.textRed;
  }
  return hudColors.textWhite;
}

/**
 * Generate a unique ID
 * @returns Unique string ID
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Debounce function for performance optimization
 * @param func - Function to debounce
 * @param wait - Wait time in milliseconds
 * @returns Debounced function
 */
export function debounce<T extends (..._args: unknown[]) => unknown>(
  func: T,
  wait: number
): (..._args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...a: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...a), wait);
  };
}
