/**
 * Normalize inventory items from MC interface wire format to planning-internal format.
 *
 * The MC interface /state endpoint returns items as:
 *   { type: 'bread', count: 16, slot: 36, metadata: 0 }
 *
 * The planning layer expects:
 *   { name: 'bread', count: 16 }
 *
 * This module owns that boundary normalization so it can be tested directly
 * and imported by both modular-server.ts and contract tests.
 */

/** Raw item shape from MC interface /state endpoint */
export interface RawInventoryItem {
  type?: string;
  name?: string;
  count: number;
  slot?: number;
  metadata?: number;
}

/** Normalized item shape used by planning internals */
export interface NormalizedInventoryItem {
  name: string;
  count: number;
}

/**
 * Normalize a single inventory item from wire format.
 * Prefers `name` (if present), falls back to `type`, then `'unknown'`.
 */
export function normalizeInventoryItem(
  raw: RawInventoryItem,
): NormalizedInventoryItem {
  return {
    name: raw.name ?? raw.type ?? 'unknown',
    count: raw.count,
  };
}

/**
 * Normalize an array of inventory items from wire format.
 */
export function normalizeInventory(
  items: RawInventoryItem[] | undefined,
): NormalizedInventoryItem[] | undefined {
  return items?.map(normalizeInventoryItem);
}
