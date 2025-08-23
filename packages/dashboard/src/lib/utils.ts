import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

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
    return "just now";
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
 * @param type - Type of meter (health, hunger, etc.)
 * @returns Tailwind color class
 */
export function getHudColor(value: number, _type: string): string {
  if (value >= 80) return "bg-hud-health";
  if (value >= 60) return "bg-hud-safe";
  if (value >= 40) return "bg-hud-warning";
  return "bg-hud-danger";
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
