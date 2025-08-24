# Minecraft Assets System

## Overview

The Minecraft Assets System (`src/lib/minecraft-assets.ts`) provides reliable access to Minecraft item sprites and metadata for the dashboard inventory display. This system replaces the previous unreliable external sprite URLs with a robust multi-source approach.

## Problem Solved

Previously, the inventory display was using external GitHub repositories for item sprites:
- `https://raw.githubusercontent.com/PrismarineJS/minecraft-data/master/data/pc/1.21.4/items/{item_name}.png`
- These URLs were often unreliable or inaccessible
- Many items had missing or broken sprites
- No fallback system for failed image loads

## Solution

The new system provides:

1. **Multiple Sprite Sources** - Tries multiple reliable sources in order of preference
2. **Comprehensive Item Coverage** - Handles hundreds of Minecraft items with proper mappings
3. **Graceful Fallbacks** - Always provides a fallback sprite when images fail
4. **Better Item Data** - Includes durability, categories, and display names
5. **Type Safety** - Full TypeScript support with proper error handling

## Sprite Sources (in order of preference)

1. **Minecraft Wiki CDN** - Most reliable, official Minecraft Wiki images (primary source)
2. **PrismarineJS Data** - Community-maintained Minecraft data (fallback)
3. **Fallback Sprite** - Custom SVG placeholder for missing items (error handling)

## Next.js Configuration

The system requires proper Next.js configuration for external image domains. The following domains are configured in `next.config.js`:

- `static.wikia.nocookie.net` - Minecraft Wiki CDN
- `raw.githubusercontent.com` - PrismarineJS data
- `assets.mojang.com` - Official Minecraft assets

## Features

### Item Sprite URLs

```typescript
// Get sprite URL for any item
const spriteUrl = getItemSpriteUrl('diamond_sword');
// Returns: "https://static.wikia.nocookie.net/minecraft_gamepedia/images/8/8c/Diamond_Sword_JE3_BE3.png"
```

### Item Display Names

```typescript
// Convert item names to readable display names
const displayName = getItemDisplayName('diamond_sword');
// Returns: "Diamond Sword"
```

### Item Categories

```typescript
// Categorize items for better organization
const category = getItemCategory('diamond_sword');
// Returns: "tools"
```

### Durability Information

```typescript
// Get maximum durability for tools and armor
const maxDurability = getMaxDurability('diamond_sword');
// Returns: 1561
```

### Fallback System

```typescript
// Always get a valid sprite URL
const fallbackSprite = getFallbackSprite();
// Returns: SVG data URL for generic item icon
```

## Supported Item Categories

- **Tools**: Swords, pickaxes, axes, shovels, hoes
- **Armor**: Helmets, chestplates, leggings, boots
- **Materials**: Ingots, nuggets, gems, dust
- **Food**: Apples, bread, meat, stews, pies
- **Blocks**: Stone, dirt, logs, planks
- **Agriculture**: Seeds, crops, wheat, carrots, potatoes
- **Misc**: Everything else

## Item Coverage

The system includes comprehensive mappings for:

- **Vanilla Items**: All standard Minecraft items
- **Tools & Weapons**: All tool types and materials
- **Armor Sets**: All armor types and materials
- **Food Items**: All edible items and ingredients
- **Building Blocks**: Common building materials
- **Redstone Components**: Technical items
- **Nether Items**: Nether-specific items
- **End Items**: End-specific items
- **Music Discs**: All music disc variants
- **Special Items**: Totems, elytra, tridents, etc.

## Integration with Inventory Display

The inventory display component now uses the new assets system:

```typescript
// Old way (unreliable)
const spriteUrl = `https://raw.githubusercontent.com/PrismarineJS/minecraft-data/master/data/pc/1.21.4/items/${itemName}.png`;

// New way (reliable)
const spriteUrl = getItemSpriteUrl(itemName);
```

## Benefits

1. **Improved Reliability** - Multiple fallback sources ensure sprites always load
2. **Better Performance** - Faster loading with optimized sprite URLs
3. **Comprehensive Coverage** - Handles hundreds of items with proper mappings
4. **Enhanced UX** - Users see proper item sprites instead of broken images
5. **Maintainable** - Easy to add new items or update sprite sources
6. **Type Safe** - Full TypeScript support prevents runtime errors

## Future Enhancements

- **Local Sprite Caching** - Cache sprites locally for offline use
- **Dynamic Sprite Loading** - Load sprites on-demand for better performance
- **Custom Resource Packs** - Support for custom Minecraft resource packs
- **Sprite Preloading** - Preload common item sprites
- **Animated Sprites** - Support for animated items (clocks, compasses)
- **3D Item Models** - Support for 3D item models in the future

## Usage Examples

```typescript
// Get complete item data
const itemData = getItemData('diamond_sword');
// Returns: {
//   id: 0,
//   name: 'diamond_sword',
//   displayName: 'Diamond Sword',
//   stackSize: 64,
//   maxDurability: 1561,
//   spriteUrl: 'https://static.wikia.nocookie.net/...',
//   category: 'tools'
// }

// Get sprite for inventory display
const spriteUrl = getItemSpriteUrl('iron_pickaxe');

// Get display name for UI
const displayName = getItemDisplayName('golden_apple');

// Get category for sorting
const category = getItemCategory('leather_helmet');
```

## Error Handling

The system gracefully handles:
- Missing items (returns fallback sprite)
- Network errors (tries next source)
- Invalid item names (returns fallback)
- Malformed URLs (uses fallback sprite)
- Unsupported items (maps to closest match)
- Next.js image loading errors (onError fallback to SVG)

### Image Loading Error Recovery

When a sprite fails to load, the system automatically falls back to a generic SVG placeholder:

```typescript
<Image
  src={getItemSprite(item.type)}
  alt={getItemDisplayName(item)}
  onError={(e) => {
    // Fallback to generic sprite on error
    const target = e.target as HTMLImageElement;
    target.src = getFallbackSprite();
  }}
/>
```

This ensures the inventory display always shows something useful to the user, even when external resources are unavailable.
