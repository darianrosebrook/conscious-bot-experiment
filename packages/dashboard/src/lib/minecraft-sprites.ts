/**
 * Minecraft Item Sprites
 *
 * Local PNG sprites for Minecraft items from public/item_sprites/
 * Uses local files for reliable loading without external dependencies
 *
 * @author @darianrosebrook
 */

/**
 * Get item sprite URL from local public folder
 */
export function getItemSprite(itemName: string): string {
  // Clean the item name - remove minecraft: prefix and ensure valid characters
  const cleanName = itemName
    .replace('minecraft:', '')
    .replace(/[^a-z0-9_]/g, '');

  // Return path to local sprite
  return `/item_sprites/${cleanName}.png`;
}

/**
 * Get fallback sprite for unknown items
 */
export function getFallbackSprite(): string {
  return '/item_sprites/barrier.png'; // Use barrier.png as fallback, or create a generic unknown item sprite
}
