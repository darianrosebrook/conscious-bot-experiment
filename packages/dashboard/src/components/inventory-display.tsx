/**
 * Inventory Display Component
 *
 * Displays the bot's current inventory items with sprites, counts, and durability.
 *
 * @author @darianrosebrook
 */

import React from 'react';
import Image from 'next/image';
import { Package } from 'lucide-react';
import { Section } from './section';
import { EmptyState } from './empty-state';
import { getItemDisplayName as getMinecraftItemDisplayName } from '@/lib/minecraft-assets';
import { getItemSprite, getFallbackSprite } from '@/lib/minecraft-sprites';

interface InventoryItem {
  type: string | number | null;
  count: number;
  slot: number;
  metadata?: Record<string, unknown>;
  displayName?: string;
  durability?: number;
  maxDurability?: number;
}

interface InventoryDisplayProps {
  inventory: InventoryItem[];
  selectedSlot?: number;
  className?: string;
}

/**
 * Convert numeric item ID to item name
 */
const getItemNameFromId = (itemId: number): string => {
  // Common Minecraft item ID mappings
  const itemMap: Record<number, string> = {
    15: 'dirt',
    813: 'wheat_seeds',
    1: 'stone',
    2: 'grass_block',
    3: 'dirt',
    4: 'cobblestone',
    5: 'oak_planks',
    17: 'oak_log',
    263: 'coal',
    264: 'diamond',
    265: 'iron_ingot',
    266: 'gold_ingot',
    267: 'iron_sword',
    268: 'wooden_sword',
    269: 'wooden_shovel',
    270: 'wooden_pickaxe',
    271: 'wooden_axe',
    272: 'stone_sword',
    273: 'stone_shovel',
    274: 'stone_pickaxe',
    275: 'stone_axe',
    276: 'diamond_sword',
    277: 'diamond_shovel',
    278: 'diamond_pickaxe',
    279: 'diamond_axe',
    280: 'stick',
    281: 'bowl',
    282: 'mushroom_stew',
    283: 'golden_sword',
    284: 'golden_shovel',
    285: 'golden_pickaxe',
    286: 'golden_axe',
    287: 'string',
    288: 'feather',
    289: 'gunpowder',
    290: 'wooden_hoe',
    291: 'stone_hoe',
    292: 'iron_hoe',
    293: 'diamond_hoe',
    294: 'golden_hoe',
    295: 'wheat_seeds',
    296: 'wheat',
    297: 'bread',
    298: 'leather_helmet',
    299: 'leather_chestplate',
    300: 'leather_leggings',
    301: 'leather_boots',
    302: 'chainmail_helmet',
    303: 'chainmail_chestplate',
    304: 'chainmail_leggings',
    305: 'chainmail_boots',
    306: 'iron_helmet',
    307: 'iron_chestplate',
    308: 'iron_leggings',
    309: 'iron_boots',
    310: 'diamond_helmet',
    311: 'diamond_chestplate',
    312: 'diamond_leggings',
    313: 'diamond_boots',
    314: 'golden_helmet',
    315: 'golden_chestplate',
    316: 'golden_leggings',
    317: 'golden_boots',
    318: 'flint',
    319: 'raw_porkchop',
    320: 'cooked_porkchop',
    321: 'painting',
    322: 'golden_apple',
    323: 'sign',
    324: 'wooden_door',
    325: 'bucket',
    326: 'water_bucket',
    327: 'lava_bucket',
    328: 'minecart',
    329: 'saddle',
    330: 'iron_door',
    331: 'redstone',
    332: 'snowball',
    333: 'oak_boat',
    334: 'leather',
    335: 'milk_bucket',
    336: 'brick',
    337: 'clay_ball',
    338: 'sugar_cane',
    339: 'paper',
    340: 'book',
    341: 'slime_ball',
    342: 'chest_minecart',
    343: 'furnace_minecart',
    344: 'egg',
    345: 'compass',
    346: 'fishing_rod',
    347: 'clock',
    348: 'glowstone_dust',
    349: 'raw_cod',
    350: 'cooked_cod',
    351: 'dye',
    352: 'bone',
    353: 'sugar',
    354: 'cake',
    355: 'bed',
    356: 'repeater',
    357: 'cookie',
    358: 'filled_map',
    359: 'shears',
    360: 'melon_slice',
    361: 'pumpkin_seeds',
    362: 'melon_seeds',
    363: 'raw_beef',
    364: 'cooked_beef',
    365: 'raw_chicken',
    366: 'cooked_chicken',
    367: 'rotten_flesh',
    368: 'ender_pearl',
    369: 'blaze_rod',
    370: 'ghast_tear',
    371: 'gold_nugget',
    372: 'nether_wart',
    373: 'potion',
    374: 'glass_bottle',
    375: 'spider_eye',
    376: 'fermented_spider_eye',
    377: 'blaze_powder',
    378: 'magma_cream',
    379: 'brewing_stand',
    380: 'cauldron',
    381: 'ender_eye',
    382: 'glistering_melon_slice',
    383: 'spawn_egg',
    384: 'experience_bottle',
    385: 'fire_charge',
    386: 'writable_book',
    387: 'written_book',
    388: 'emerald',
    389: 'item_frame',
    390: 'flower_pot',
    391: 'carrot',
    392: 'potato',
    393: 'baked_potato',
    394: 'poisonous_potato',
    395: 'map',
    396: 'golden_carrot',
    397: 'skeleton_skull',
    398: 'wither_skeleton_skull',
    399: 'player_head',
    400: 'zombie_head',
    401: 'creeper_head',
    402: 'dragon_head',
    403: 'carrot_on_a_stick',
    404: 'nether_star',
    405: 'pumpkin_pie',
    406: 'firework_rocket',
    407: 'firework_star',
    408: 'enchanted_book',
    409: 'nether_brick',
    410: 'quartz',
    411: 'tnt_minecart',
    412: 'hopper_minecart',
    413: 'prismarine_shard',
    414: 'prismarine_crystals',
    415: 'rabbit',
    416: 'cooked_rabbit',
    417: 'rabbit_stew',
    418: 'rabbit_foot',
    419: 'rabbit_hide',
    420: 'armor_stand',
    421: 'iron_horse_armor',
    422: 'golden_horse_armor',
    423: 'diamond_horse_armor',
    424: 'lead',
    425: 'name_tag',
    426: 'command_block_minecart',
    427: 'mutton',
    428: 'cooked_mutton',
    429: 'banner',
    430: 'end_crystal',
    431: 'spruce_door',
    432: 'birch_door',
    433: 'jungle_door',
    434: 'acacia_door',
    435: 'dark_oak_door',
    436: 'chorus_fruit',
    437: 'popped_chorus_fruit',
    438: 'beetroot',
    439: 'beetroot_seeds',
    440: 'beetroot_soup',
    441: 'dragon_breath',
    442: 'splash_potion',
    443: 'spectral_arrow',
    444: 'tipped_arrow',
    445: 'lingering_potion',
    446: 'shield',
    447: 'elytra',
    448: 'spruce_boat',
    449: 'birch_boat',
    450: 'jungle_boat',
    451: 'acacia_boat',
    452: 'dark_oak_boat',
    453: 'totem_of_undying',
    454: 'shulker_shell',
    455: 'iron_nugget',
    456: 'knowledge_book',
    457: 'debug_stick',
    458: 'music_disc_13',
    459: 'music_disc_cat',
    460: 'music_disc_blocks',
    461: 'music_disc_chirp',
    462: 'music_disc_far',
    463: 'music_disc_mall',
    464: 'music_disc_mellohi',
    465: 'music_disc_stal',
    466: 'music_disc_strad',
    467: 'music_disc_ward',
    468: 'music_disc_11',
    469: 'music_disc_wait',
    470: 'trident',
    471: 'phantom_membrane',
    472: 'nautilus_shell',
    473: 'heart_of_the_sea',
    474: 'crossbow',
    475: 'suspicious_stew',
    476: 'loom',
    477: 'flower_banner_pattern',
    478: 'creeper_banner_pattern',
    479: 'skull_banner_pattern',
    480: 'mojang_banner_pattern',
    481: 'globe_banner_pattern',
    482: 'piglin_banner_pattern',
    483: 'composter',
    484: 'barrel',
    485: 'smoker',
    486: 'blast_furnace',
    487: 'cartography_table',
    488: 'fletching_table',
    489: 'grindstone',
    490: 'lectern',
    491: 'smithing_table',
    492: 'stonecutter',
    493: 'bell',
    494: 'lantern',
    495: 'soul_lantern',
    496: 'sweet_berries',
    497: 'campfire',
    498: 'soul_campfire',
    499: 'shroomlight',
    500: 'honeycomb',
    501: 'bee_nest',
    502: 'beehive',
    503: 'honey_bottle',
    504: 'honey_block',
    505: 'lodestone',
    506: 'crying_obsidian',
    507: 'blackstone',
    508: 'blackstone_slab',
    509: 'blackstone_stairs',
    510: 'gilded_blackstone',
    511: 'polished_blackstone',
    512: 'polished_blackstone_slab',
    513: 'polished_blackstone_stairs',
    514: 'polished_blackstone_bricks',
    515: 'cracked_polished_blackstone_bricks',
    516: 'chiseled_polished_blackstone',
    517: 'polished_blackstone_button',
    518: 'polished_blackstone_pressure_plate',
    519: 'polished_blackstone_wall',
    520: 'warped_wart_block',
    521: 'warped_stem',
    522: 'warped_hyphae',
    523: 'warped_nylium',
    524: 'warped_fungus',
    525: 'warped_roots',
    526: 'warped_door',
    527: 'warped_trapdoor',
    528: 'warped_fence_gate',
    529: 'warped_fence',
    530: 'warped_stairs',
    531: 'warped_slab',
    532: 'warped_pressure_plate',
    533: 'warped_button',
    534: 'warped_sign',
    535: 'crimson_nylium',
    536: 'crimson_stem',
    537: 'crimson_hyphae',
    538: 'crimson_fungus',
    539: 'crimson_roots',
    540: 'crimson_door',
    541: 'crimson_trapdoor',
    542: 'crimson_fence_gate',
    543: 'crimson_fence',
    544: 'crimson_stairs',
    545: 'crimson_slab',
    546: 'crimson_pressure_plate',
    547: 'crimson_button',
    548: 'crimson_sign',
    549: 'nether_sprouts',
    550: 'weeping_vines',
    551: 'twisting_vines',
    552: 'crimson_planks',
    553: 'warped_planks',
    554: 'crimson_stem',
    555: 'warped_stem',
    556: 'crimson_hyphae',
    557: 'warped_hyphae',
    558: 'crimson_nylium',
    559: 'warped_nylium',
    560: 'stripped_crimson_stem',
    561: 'stripped_warped_stem',
    562: 'stripped_crimson_hyphae',
    563: 'stripped_warped_hyphae',
    564: 'crimson_fungus',
    565: 'warped_fungus',
    566: 'crimson_roots',
    567: 'warped_roots',
    568: 'nether_sprouts',
    569: 'weeping_vines',
    570: 'twisting_vines',
    571: 'crimson_door',
    572: 'warped_door',
    573: 'crimson_trapdoor',
    574: 'warped_trapdoor',
    575: 'crimson_fence_gate',
    576: 'warped_fence_gate',
    577: 'crimson_fence',
    578: 'warped_fence',
    579: 'crimson_stairs',
    580: 'warped_stairs',
    581: 'crimson_slab',
    582: 'warped_slab',
    583: 'crimson_pressure_plate',
    584: 'warped_pressure_plate',
    585: 'crimson_button',
    586: 'warped_button',
    587: 'crimson_sign',
    588: 'warped_sign',
    589: 'nether_sprouts',
    590: 'weeping_vines',
    591: 'twisting_vines',
    592: 'crimson_planks',
    593: 'warped_planks',
    594: 'crimson_stem',
    595: 'warped_stem',
    596: 'crimson_hyphae',
    597: 'warped_hyphae',
    598: 'crimson_nylium',
    599: 'warped_nylium',
    600: 'stripped_crimson_stem',
    601: 'stripped_warped_stem',
    602: 'stripped_crimson_hyphae',
    603: 'stripped_warped_hyphae',
    604: 'crimson_fungus',
    605: 'warped_fungus',
    606: 'crimson_roots',
    607: 'warped_roots',
    608: 'nether_sprouts',
    609: 'weeping_vines',
    610: 'twisting_vines',
    611: 'crimson_door',
    612: 'warped_door',
    613: 'crimson_trapdoor',
    614: 'warped_trapdoor',
    615: 'crimson_fence_gate',
    616: 'warped_fence_gate',
    617: 'crimson_fence',
    618: 'warped_fence',
    619: 'crimson_stairs',
    620: 'warped_stairs',
    621: 'crimson_slab',
    622: 'warped_slab',
    623: 'crimson_pressure_plate',
    624: 'warped_pressure_plate',
    625: 'crimson_button',
    626: 'warped_button',
    627: 'crimson_sign',
    628: 'warped_sign',
    629: 'nether_sprouts',
    630: 'weeping_vines',
    631: 'twisting_vines',
    632: 'crimson_planks',
    633: 'warped_planks',
    634: 'crimson_stem',
    635: 'warped_stem',
    636: 'crimson_hyphae',
    637: 'warped_hyphae',
    638: 'crimson_nylium',
    639: 'warped_nylium',
    640: 'stripped_crimson_stem',
    641: 'stripped_warped_stem',
    642: 'stripped_crimson_hyphae',
    643: 'stripped_warped_hyphae',
    644: 'crimson_fungus',
    645: 'warped_fungus',
    646: 'crimson_roots',
    647: 'warped_roots',
    648: 'nether_sprouts',
    649: 'weeping_vines',
    650: 'twisting_vines',
    651: 'crimson_door',
    652: 'warped_door',
    653: 'crimson_trapdoor',
    654: 'warped_trapdoor',
    655: 'crimson_fence_gate',
    656: 'warped_fence_gate',
    657: 'crimson_fence',
    658: 'warped_fence',
    659: 'crimson_stairs',
    660: 'warped_stairs',
    661: 'crimson_slab',
    662: 'warped_slab',
    663: 'crimson_pressure_plate',
    664: 'warped_pressure_plate',
    665: 'crimson_button',
    666: 'warped_button',
    667: 'crimson_sign',
    668: 'warped_sign',
    669: 'nether_sprouts',
    670: 'weeping_vines',
    671: 'twisting_vines',
    672: 'crimson_planks',
    673: 'warped_hyphae',
    674: 'crimson_stem',
    675: 'warped_stem',
    676: 'crimson_hyphae',
    677: 'warped_hyphae',
    678: 'crimson_nylium',
    679: 'warped_nylium',
    680: 'stripped_crimson_stem',
    681: 'stripped_warped_stem',
    682: 'stripped_crimson_hyphae',
    683: 'stripped_warped_hyphae',
    684: 'crimson_fungus',
    685: 'warped_fungus',
    686: 'crimson_roots',
    687: 'warped_roots',
    688: 'nether_sprouts',
    689: 'weeping_vines',
    690: 'twisting_vines',
    691: 'crimson_door',
    692: 'warped_door',
    693: 'crimson_trapdoor',
    694: 'warped_trapdoor',
    695: 'crimson_fence_gate',
    696: 'warped_fence_gate',
    697: 'crimson_fence',
    698: 'warped_fence',
    699: 'crimson_stairs',
    700: 'warped_stairs',
    701: 'crimson_slab',
    702: 'warped_slab',
    703: 'crimson_pressure_plate',
    704: 'warped_pressure_plate',
    705: 'crimson_button',
    706: 'warped_button',
    707: 'crimson_sign',
    708: 'warped_sign',
    709: 'nether_sprouts',
    710: 'weeping_vines',
    711: 'twisting_vines',
    712: 'crimson_planks',
    713: 'warped_planks',
    714: 'crimson_stem',
    715: 'warped_stem',
    716: 'crimson_hyphae',
    717: 'warped_hyphae',
    718: 'crimson_nylium',
    719: 'warped_nylium',
    720: 'stripped_crimson_stem',
    721: 'stripped_warped_stem',
    722: 'stripped_crimson_hyphae',
    723: 'stripped_warped_hyphae',
    724: 'crimson_fungus',
    725: 'warped_fungus',
    726: 'crimson_roots',
    727: 'warped_roots',
    728: 'nether_sprouts',
    729: 'weeping_vines',
    730: 'twisting_vines',
    731: 'crimson_door',
    732: 'warped_door',
    733: 'crimson_trapdoor',
    734: 'warped_trapdoor',
    735: 'crimson_fence_gate',
    736: 'warped_fence_gate',
    737: 'crimson_fence',
    738: 'warped_fence',
    739: 'crimson_stairs',
    740: 'warped_stairs',
    741: 'crimson_slab',
    742: 'warped_slab',
    743: 'crimson_pressure_plate',
    744: 'warped_pressure_plate',
    745: 'crimson_button',
    746: 'warped_button',
    747: 'crimson_sign',
    748: 'warped_sign',
    749: 'nether_sprouts',
    750: 'weeping_vines',
    751: 'twisting_vines',
    752: 'crimson_planks',
    753: 'warped_planks',
    754: 'crimson_stem',
    755: 'warped_stem',
    756: 'crimson_hyphae',
    757: 'warped_hyphae',
    758: 'crimson_nylium',
    759: 'warped_nylium',
    760: 'stripped_crimson_stem',
    761: 'stripped_warped_stem',
    762: 'stripped_crimson_hyphae',
    763: 'stripped_warped_hyphae',
    764: 'crimson_fungus',
    765: 'warped_fungus',
    766: 'crimson_roots',
    767: 'warped_roots',
    768: 'nether_sprouts',
    769: 'weeping_vines',
    770: 'twisting_vines',
    771: 'crimson_door',
    772: 'warped_door',
    773: 'crimson_trapdoor',
    774: 'warped_trapdoor',
    775: 'crimson_fence_gate',
    776: 'warped_fence_gate',
    777: 'crimson_fence',
    778: 'warped_fence',
    779: 'crimson_stairs',
    780: 'warped_stairs',
    781: 'crimson_slab',
    782: 'warped_slab',
    783: 'crimson_pressure_plate',
    784: 'warped_pressure_plate',
    785: 'crimson_button',
    786: 'warped_button',
    787: 'crimson_sign',
    788: 'warped_sign',
    789: 'nether_sprouts',
    790: 'weeping_vines',
    791: 'twisting_vines',
    792: 'crimson_planks',
    793: 'warped_planks',
    794: 'crimson_stem',
    795: 'warped_stem',
    796: 'crimson_hyphae',
    797: 'warped_hyphae',
    798: 'crimson_nylium',
    799: 'warped_nylium',
    800: 'stripped_crimson_stem',
    801: 'stripped_warped_stem',
    802: 'stripped_crimson_hyphae',
    803: 'stripped_warped_hyphae',
    804: 'crimson_fungus',
    805: 'warped_fungus',
    806: 'crimson_roots',
    807: 'warped_roots',
    808: 'nether_sprouts',
    809: 'weeping_vines',
    810: 'twisting_vines',
    811: 'crimson_door',
    812: 'warped_door',
  };

  return itemMap[itemId] || 'unknown';
};

/**
 * Get item sprite from local sprite system
 */
const getItemSpriteLocal = (
  itemType: string | number | null | undefined
): string => {
  // Handle null/undefined item types
  if (!itemType) {
    return getFallbackSprite();
  }

  // Convert numeric item ID to item name
  if (typeof itemType === 'number') {
    const itemName = getItemNameFromId(itemType);
    return getItemSprite(itemName);
  }

  // Handle string item types
  if (typeof itemType === 'string') {
    return getItemSprite(itemType);
  }

  // Fallback
  return getFallbackSprite();
};

/**
 * Get durability percentage
 */
const getDurabilityPercentage = (item: InventoryItem): number => {
  if (!item.durability || !item.maxDurability) return 100;
  return Math.max(
    0,
    Math.min(
      100,
      ((item.maxDurability - item.durability) / item.maxDurability) * 100
    )
  );
};

/**
 * Get durability color based on percentage
 */
const getDurabilityColor = (percentage: number): string => {
  if (percentage >= 80) return 'bg-green-500';
  if (percentage >= 50) return 'bg-yellow-500';
  if (percentage >= 20) return 'bg-orange-500';
  return 'bg-red-500';
};

/**
 * Get item display name for a slot
 */
const getItemDisplayName = (item: InventoryItem | undefined): string => {
  if (!item?.type) return '';

  const itemName =
    typeof item.type === 'number'
      ? getItemNameFromId(item.type)
      : String(item.type);

  return getMinecraftItemDisplayName(itemName);
};

/**
 * Get top right indicator (stack count or durability)
 */
const getTopRightIndicator = (item: InventoryItem): string => {
  // Show durability percentage for items with durability
  if (item.durability !== undefined && item.maxDurability) {
    const percentage = getDurabilityPercentage(item);
    return `${Math.round(percentage)}%`;
  }

  // Show stack count for items with count > 1
  if (item.count > 1) {
    return `${item.count}`;
  }

  return '';
};

/**
 * Get top right indicator color
 */
const getTopRightIndicatorColor = (item: InventoryItem): string => {
  // Durability colors
  if (item.durability !== undefined && item.maxDurability) {
    const percentage = getDurabilityPercentage(item);
    if (percentage >= 80) return 'text-green-400';
    if (percentage >= 50) return 'text-yellow-400';
    if (percentage >= 20) return 'text-orange-400';
    return 'text-red-400';
  }

  // Stack count color
  return 'text-white';
};

export const InventoryDisplay: React.FC<InventoryDisplayProps> = ({
  inventory,
  selectedSlot = 0,
  className = '',
}) => {
  // Separate hotbar (slots 0-8) from main inventory
  const hotbarItems = inventory.filter(
    (item) => item.slot >= 0 && item.slot <= 8
  );
  const mainInventoryItems = inventory.filter(
    (item) => item.slot >= 9 && item.slot <= 35
  );

  return (
    <Section
      title="Inventory"
      icon={<Package className="size-4" />}
      className={className}
    >
      {inventory.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No items in inventory"
          description="The bot's inventory is empty."
        />
      ) : (
        <div className="space-y-4">
          {/* Hotbar */}
          <div>
            <h4 className="text-sm font-medium text-zinc-300 mb-2">Hotbar</h4>
            <div className="grid grid-cols-9 gap-1">
              {Array.from({ length: 9 }, (_, index) => {
                const item = hotbarItems.find((item) => item.slot === index);
                const itemName = getItemDisplayName(item);
                const topRightIndicator = item
                  ? getTopRightIndicator(item)
                  : '';
                const topRightColor = item
                  ? getTopRightIndicatorColor(item)
                  : '';

                return (
                  <div
                    key={index}
                    className={`relative aspect-square rounded-lg border-2 p-1 ${
                      selectedSlot === index
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-zinc-700 bg-zinc-900/50'
                    }`}
                  >
                    {item ? (
                      <div className="relative h-full w-full flex flex-col">
                        {/* Top right indicator (stack count or durability) */}
                        {topRightIndicator && (
                          <div
                            className={`absolute top-0 right-0 text-xs font-medium bg-black/60 px-1 rounded ${topRightColor}`}
                          >
                            {topRightIndicator}
                          </div>
                        )}

                        {/* Item sprite - centered */}
                        <div className="flex-1 flex items-center justify-center p-1">
                          <Image
                            src={getItemSpriteLocal(item.type)}
                            alt={itemName}
                            width={32}
                            height={32}
                            className="h-full w-full object-contain"
                            onError={(e) => {
                              // Fallback to generic sprite on error
                              const target = e.target as HTMLImageElement;
                              target.src = getFallbackSprite();
                            }}
                          />
                        </div>

                        {/* Item name - centered at bottom */}
                        <div className="text-center">
                          <div className="text-[10px] text-zinc-300 font-medium truncate px-1">
                            {itemName}
                          </div>
                        </div>

                        {/* Durability bar */}
                        {item.durability !== undefined &&
                          item.maxDurability && (
                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-700">
                              <div
                                className={`h-full ${getDurabilityColor(getDurabilityPercentage(item))}`}
                                style={{
                                  width: `${getDurabilityPercentage(item)}%`,
                                }}
                              />
                            </div>
                          )}
                      </div>
                    ) : (
                      <div className="h-full w-full flex flex-col items-center justify-center text-zinc-600 text-xs">
                        <div className="flex-1 flex items-center justify-center">
                          <div className="w-8 h-8 bg-zinc-800/50 rounded"></div>
                        </div>
                        <div className="text-[10px] text-zinc-500">
                          {index + 1}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Main Inventory */}
          <div>
            <h4 className="text-sm font-medium text-zinc-300 mb-2">
              Main Inventory
            </h4>
            <div className="grid grid-cols-9 gap-1">
              {Array.from({ length: 27 }, (_, index) => {
                const actualSlot = index + 9; // Main inventory starts at slot 9
                const item = mainInventoryItems.find(
                  (item) => item.slot === actualSlot
                );
                const itemName = getItemDisplayName(item);
                const topRightIndicator = item
                  ? getTopRightIndicator(item)
                  : '';
                const topRightColor = item
                  ? getTopRightIndicatorColor(item)
                  : '';

                return (
                  <div
                    key={actualSlot}
                    className="relative aspect-square rounded-lg border border-zinc-700 bg-zinc-900/50 p-1"
                  >
                    {item ? (
                      <div className="relative h-full w-full flex flex-col">
                        {/* Top right indicator (stack count or durability) */}
                        {topRightIndicator && (
                          <div
                            className={`absolute top-0 right-0 text-xs font-medium bg-black/60 px-1 rounded ${topRightColor}`}
                          >
                            {topRightIndicator}
                          </div>
                        )}

                        {/* Item sprite - centered */}
                        <div className="flex-1 flex items-center justify-center p-1">
                          <Image
                            src={getItemSpriteLocal(item.type)}
                            alt={itemName}
                            width={32}
                            height={32}
                            className="h-full w-full object-contain"
                            onError={(e) => {
                              // Fallback to generic sprite on error
                              const target = e.target as HTMLImageElement;
                              target.src = getFallbackSprite();
                            }}
                          />
                        </div>

                        {/* Item name - centered at bottom */}
                        <div className="text-center">
                          <div className="text-[10px] text-zinc-300 font-medium truncate px-1">
                            {itemName}
                          </div>
                        </div>

                        {/* Durability bar */}
                        {item.durability !== undefined &&
                          item.maxDurability && (
                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-700">
                              <div
                                className={`h-full ${getDurabilityColor(getDurabilityPercentage(item))}`}
                                style={{
                                  width: `${getDurabilityPercentage(item)}%`,
                                }}
                              />
                            </div>
                          )}
                      </div>
                    ) : (
                      <div className="h-full w-full flex flex-col items-center justify-center text-zinc-600 text-xs">
                        <div className="flex-1 flex items-center justify-center">
                          <div className="w-8 h-8 bg-zinc-800/50 rounded"></div>
                        </div>
                        <div className="text-[10px] text-zinc-500">
                          {actualSlot + 1}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </Section>
  );
};
