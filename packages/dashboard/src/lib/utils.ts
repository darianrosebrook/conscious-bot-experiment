import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Only logs when NEXT_PUBLIC_DEBUG_DASHBOARD=1 to reduce browser console noise */
export function debugLog(...args: unknown[]): void {
  if (process.env.NEXT_PUBLIC_DEBUG_DASHBOARD === '1') {
    console.log(...args);
  }
}

/**
 * Utility function to merge Tailwind CSS classes
 * @param inputs - Class values to merge
 * @returns Merged class string
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
 * Get color for HUD meter based on value and type
 * @param value - Current value (0-100)
 * @param type - Type of meter (health, hunger, stress, etc.)
 * @returns Tailwind color class
 */
export function getHudColor(value: number, type: string): string {
  // For stress-like metrics (lower is better)
  if (
    type.includes('stress') ||
    type.includes('fatigue') ||
    type.includes('anxiety')
  ) {
    if (value <= 10) return 'bg-green-500'; // Green for low stress
    if (value <= 50) return 'bg-yellow-500'; // Yellow for moderate stress
    return 'bg-red-500'; // Red for high stress
  }

  // For health-like metrics (higher is better)
  if (
    type.includes('health') ||
    type.includes('energy') ||
    type.includes('happiness') ||
    type.includes('hunger')
  ) {
    if (value >= 80) return 'bg-green-500'; // Green for high health
    if (value >= 50) return 'bg-yellow-500'; // Yellow for moderate health
    return 'bg-red-500'; // Red for low health
  }

  // Default behavior (higher is better)
  if (value >= 80) return 'bg-green-500';
  if (value >= 50) return 'bg-yellow-500';
  return 'bg-red-500';
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
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}
