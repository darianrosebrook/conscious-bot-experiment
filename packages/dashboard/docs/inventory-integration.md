# Inventory Integration

## Overview

The dashboard now includes a real-time inventory display that shows the bot's current items, including their counts, durability, and visual sprites. The inventory display is positioned between the live stream and cognitive stream sections.

## Features

### Inventory Display Components

1. **Hotbar (Slots 0-8)**: Shows the bot's currently selected items with slot numbers
2. **Main Inventory (Slots 9-35)**: Displays the full inventory grid
3. **Item Details**: Lists the first 8 items with detailed information

### Item Information Displayed

- **Item Sprites**: Visual representations of each item using Minecraft asset URLs
- **Item Counts**: Shows quantity for items with count > 1
- **Durability**: Visual durability bars and percentage for tools and armor
- **Slot Numbers**: Clear identification of inventory positions
- **Selected Slot Highlighting**: Blue border around the currently selected hotbar slot

### Data Sources

- **Minecraft Bot Server**: Fetches inventory data from `http://localhost:3005/state`
- **Dashboard API**: `/api/inventory` endpoint transforms and serves the data
- **Real-time Updates**: Inventory refreshes every 5 seconds along with other bot state

## Technical Implementation

### API Endpoint

```typescript
// GET /api/inventory
{
  success: boolean;
  inventory: InventoryItem[];
  totalItems: number;
  timestamp: number;
}
```

### Inventory Item Structure

```typescript
interface InventoryItem {
  type: string;           // e.g., "minecraft:diamond_sword"
  count: number;          // Item quantity
  slot: number;           // Inventory slot (0-35)
  metadata?: Record<string, unknown>;
  displayName?: string;   // Human-readable name
  durability?: number;    // Current durability
  maxDurability?: number; // Maximum durability
}
```

### Component Architecture

- **InventoryDisplay**: Main component handling the visual layout
- **Section**: Wrapper component for consistent styling
- **EmptyState**: Shows when inventory is empty
- **Next.js Image**: Optimized image loading for item sprites

### Sprite System

- **Source**: Uses PrismarineJS Minecraft data repository
- **URL Pattern**: `https://raw.githubusercontent.com/PrismarineJS/minecraft-data/master/data/pc/1.21.4/items/{item_name}.png`
- **Fallback**: Generic item icon for missing sprites
- **Optimization**: Next.js Image component for performance

## Usage

The inventory display automatically appears when:

1. The Minecraft bot is connected
2. Inventory data is available from the bot server
3. The dashboard is running and can fetch the data

### Empty State

When the bot's inventory is empty, the component displays:
- "No items in inventory" message
- "The bot's inventory is empty." description
- Package icon for visual context

### Error Handling

- **Network Errors**: Gracefully handles connection failures
- **Missing Sprites**: Falls back to generic item icons
- **Invalid Data**: Safely processes malformed inventory data
- **Type Safety**: Full TypeScript support with proper error boundaries

## Future Enhancements

1. **Item Tooltips**: Hover information for item details
2. **Sorting Options**: Arrange items by type, count, or durability
3. **Search Functionality**: Filter inventory by item name
4. **Drag and Drop**: Interactive inventory management
5. **Equipment Display**: Separate section for armor and equipment
6. **Crafting Integration**: Show crafting recipes for items

## Dependencies

- **Next.js**: For API routes and image optimization
- **React**: Component framework
- **TypeScript**: Type safety and development experience
- **Tailwind CSS**: Styling and responsive design
- **Lucide React**: Icons (Package icon for inventory section)

## Configuration

The inventory system uses the following environment variables (inherited from the Minecraft bot):

- `MINECRAFT_HOST`: Minecraft server hostname
- `MINECRAFT_PORT`: Minecraft server port
- `MINECRAFT_USERNAME`: Bot username
- `MINECRAFT_VERSION`: Minecraft version

## Monitoring

The inventory integration includes:

- **Health Checks**: API endpoint status monitoring
- **Error Logging**: Console errors for debugging
- **Performance Metrics**: Image loading optimization
- **Real-time Updates**: 5-second refresh intervals

---

*Last updated: January 2025*
*Author: @darianrosebrook*
