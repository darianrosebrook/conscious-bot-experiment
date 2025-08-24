/**
 * Minecraft Assets Utility
 *
 * Provides reliable access to Minecraft item sprites and data
 * Uses multiple fallback sources for better reliability
 *
 * @author @darianrosebrook
 */

/**
 * Minecraft item data with sprite information
 */
export interface MinecraftItemData {
  id: number;
  name: string;
  displayName: string;
  stackSize: number;
  maxDurability?: number;
  spriteUrl: string;
  category: string;
}

/**
 * Get item sprite URL from multiple reliable sources
 */
export function getItemSpriteUrl(itemName: string): string {
  // Clean the item name
  const cleanName = itemName.replace('minecraft:', '').replace(/[^a-z_]/g, '');

  // Check if we have a Wiki mapping first (most reliable)
  const wikiPath = getWikiSpritePath(cleanName);
  if (wikiPath !== `${cleanName}.png`) {
    return `https://static.wikia.nocookie.net/minecraft_gamepedia/images/${wikiPath}`;
  }

  // Fallback to PrismarineJS data
  return `https://raw.githubusercontent.com/PrismarineJS/minecraft-data/master/data/pc/1.20.1/items/${cleanName}.png`;
}

/**
 * Get Wiki sprite path for Minecraft Wiki CDN
 */
function getWikiSpritePath(itemName: string): string {
  // Common item mappings for Wiki paths
  const wikiMappings: Record<string, string> = {
    diamond_sword: '8/8c/Diamond_Sword_JE3_BE3.png',
    iron_sword: '7/7b/Iron_Sword_JE3_BE3.png',
    stone_sword: 'a/a3/Stone_Sword_JE3_BE3.png',
    wooden_sword: '8/8c/Wooden_Sword_JE3_BE3.png',
    diamond_pickaxe: '9/9d/Diamond_Pickaxe_JE3_BE3.png',
    iron_pickaxe: 'a/a8/Iron_Pickaxe_JE3_BE3.png',
    stone_pickaxe: '8/8c/Stone_Pickaxe_JE3_BE3.png',
    wooden_pickaxe: '8/8c/Wooden_Pickaxe_JE3_BE3.png',
    diamond_axe: '9/9d/Diamond_Axe_JE3_BE3.png',
    iron_axe: '6/6d/Iron_Axe_JE3_BE3.png',
    stone_axe: 'a/a3/Stone_Axe_JE3_BE3.png',
    wooden_axe: '8/8c/Wooden_Axe_JE3_BE3.png',
    diamond_shovel: '9/9d/Diamond_Shovel_JE3_BE3.png',
    iron_shovel: '7/7b/Iron_Shovel_JE3_BE3.png',
    stone_shovel: 'a/a3/Stone_Shovel_JE3_BE3.png',
    wooden_shovel: '8/8c/Wooden_Shovel_JE3_BE3.png',
    diamond_hoe: '9/9d/Diamond_Hoe_JE3_BE3.png',
    iron_hoe: '7/7b/Iron_Hoe_JE3_BE3.png',
    stone_hoe: 'a/a3/Stone_Hoe_JE3_BE3.png',
    wooden_hoe: '8/8c/Wooden_Hoe_JE3_BE3.png',
    diamond_helmet: '9/9d/Diamond_Helmet_JE3_BE3.png',
    iron_helmet: '7/7b/Iron_Helmet_JE3_BE3.png',
    chainmail_helmet: '8/8c/Chainmail_Helmet_JE3_BE3.png',
    golden_helmet: '7/7b/Golden_Helmet_JE3_BE3.png',
    leather_helmet: 'a/a3/Leather_Cap_JE3_BE3.png',
    diamond_chestplate: '9/9d/Diamond_Chestplate_JE3_BE3.png',
    iron_chestplate: '7/7b/Iron_Chestplate_JE3_BE3.png',
    chainmail_chestplate: '8/8c/Chainmail_Chestplate_JE3_BE3.png',
    golden_chestplate: '7/7b/Golden_Chestplate_JE3_BE3.png',
    leather_chestplate: 'a/a3/Leather_Tunic_JE3_BE3.png',
    diamond_leggings: '9/9d/Diamond_Leggings_JE3_BE3.png',
    iron_leggings: '7/7b/Iron_Leggings_JE3_BE3.png',
    chainmail_leggings: '8/8c/Chainmail_Leggings_JE3_BE3.png',
    golden_leggings: '7/7b/Golden_Leggings_JE3_BE3.png',
    leather_leggings: 'a/a3/Leather_Pants_JE3_BE3.png',
    diamond_boots: '9/9d/Diamond_Boots_JE3_BE3.png',
    iron_boots: '7/7b/Iron_Boots_JE3_BE3.png',
    chainmail_boots: '8/8c/Chainmail_Boots_JE3_BE3.png',
    golden_boots: '7/7b/Golden_Boots_JE3_BE3.png',
    leather_boots: 'a/a3/Leather_Boots_JE3_BE3.png',
    dirt: '2/27/Dirt_JE3_BE3.png',
    stone: 'a/a8/Stone_JE3_BE3.png',
    grass_block: '8/8c/Grass_Block_Side_JE3_BE3.png',
    cobblestone: '4/48/Cobblestone_JE3_BE3.png',
    oak_planks: '8/8c/Oak_Planks_JE3_BE3.png',
    oak_log: '8/8c/Oak_Log_JE3_BE3.png',
    coal: '7/72/Coal_JE3_BE3.png',
    diamond: '3/35/Diamond_JE3_BE3.png',
    iron_ingot: '6/66/Iron_Ingot_JE3_BE3.png',
    gold_ingot: '9/9f/Gold_Ingot_JE3_BE3.png',
    stick: '0/0b/Stick_JE3_BE3.png',
    bowl: '7/7b/Bowl_JE3_BE3.png',
    mushroom_stew: '7/7b/Mushroom_Stew_JE3_BE3.png',
    string: '0/0b/String_JE3_BE3.png',
    feather: '4/4c/Feather_JE3_BE3.png',
    gunpowder: '2/2d/Gunpowder_JE3_BE3.png',
    wheat_seeds: '8/8c/Wheat_Seeds_JE3_BE3.png',
    wheat: 'b/b7/Wheat_JE3_BE3.png',
    bread: '5/50/Bread_JE3_BE3.png',
    flint: '3/3d/Flint_JE3_BE3.png',
    raw_porkchop: '3/3d/Raw_Porkchop_JE3_BE3.png',
    cooked_porkchop: '8/8c/Cooked_Porkchop_JE3_BE3.png',
    painting: '3/3d/Painting_JE3_BE3.png',
    golden_apple: '7/7b/Golden_Apple_JE3_BE3.png',
    sign: '5/50/Oak_Sign_JE3_BE3.png',
    wooden_door: '8/8c/Oak_Door_JE3_BE3.png',
    bucket: '3/3d/Bucket_JE3_BE3.png',
    water_bucket: '3/3d/Water_Bucket_JE3_BE3.png',
    lava_bucket: '3/3d/Lava_Bucket_JE3_BE3.png',
    minecart: '5/50/Minecart_JE3_BE3.png',
    saddle: '7/7b/Saddle_JE3_BE3.png',
    iron_door: '7/7b/Iron_Door_JE3_BE3.png',
    redstone: '5/50/Redstone_JE3_BE3.png',
    snowball: '9/9f/Snowball_JE3_BE3.png',
    oak_boat: '7/7b/Oak_Boat_JE3_BE3.png',
    leather: '7/7b/Leather_JE3_BE3.png',
    milk_bucket: '3/3d/Milk_Bucket_JE3_BE3.png',
    brick: '7/7b/Brick_JE3_BE3.png',
    clay_ball: '7/7b/Clay_Ball_JE3_BE3.png',
    sugar_cane: '8/8c/Sugar_Cane_JE3_BE3.png',
    paper: '7/7b/Paper_JE3_BE3.png',
    book: '7/7b/Book_JE3_BE3.png',
    slime_ball: '1/1d/Slimeball_JE3_BE3.png',
    chest_minecart: '5/50/Minecart_with_Chest_JE3_BE3.png',
    furnace_minecart: '5/50/Minecart_with_Furnace_JE3_BE3.png',
    egg: 'e/e1/Egg_JE3_BE3.png',
    compass: '9/9f/Compass_JE3_BE3.png',
    fishing_rod: '3/3d/Fishing_Rod_JE3_BE3.png',
    clock: '8/8c/Clock_JE3_BE3.png',
    glowstone_dust: '7/7b/Glowstone_Dust_JE3_BE3.png',
    raw_cod: '7/7b/Raw_Cod_JE3_BE3.png',
    cooked_cod: '7/7b/Cooked_Cod_JE3_BE3.png',
    dye: '7/7b/Ink_Sac_JE3_BE3.png',
    bone: '7/7b/Bone_JE3_BE3.png',
    sugar: '5/50/Sugar_JE3_BE3.png',
    cake: '7/7b/Cake_JE3_BE3.png',
    bed: '4/4c/Red_Bed_JE3_BE3.png',
    repeater: 'b/b1/Redstone_Repeater_JE3_BE3.png',
    cookie: 'f/f1/Cookie_JE3_BE3.png',
    filled_map: '7/7b/Map_JE3_BE3.png',
    shears: '7/7b/Shears_JE3_BE3.png',
    melon_slice: 'f/f1/Melon_Slice_JE3_BE3.png',
    pumpkin_seeds: '8/8c/Pumpkin_Seeds_JE3_BE3.png',
    melon_seeds: '8/8c/Melon_Seeds_JE3_BE3.png',
    raw_beef: '7/7b/Raw_Beef_JE3_BE3.png',
    cooked_beef: '7/7b/Steak_JE3_BE3.png',
    raw_chicken: '7/7b/Raw_Chicken_JE3_BE3.png',
    cooked_chicken: '7/7b/Cooked_Chicken_JE3_BE3.png',
    rotten_flesh: '7/7b/Rotten_Flesh_JE3_BE3.png',
    ender_pearl: '7/7b/Ender_Pearl_JE3_BE3.png',
    blaze_rod: '7/7b/Blaze_Rod_JE3_BE3.png',
    ghast_tear: '7/7b/Ghast_Tear_JE3_BE3.png',
    gold_nugget: '7/7b/Gold_Nugget_JE3_BE3.png',
    nether_wart: '7/7b/Nether_Wart_JE3_BE3.png',
    potion: '7/7b/Potion_JE3_BE3.png',
    glass_bottle: '7/7b/Glass_Bottle_JE3_BE3.png',
    spider_eye: '7/7b/Spider_Eye_JE3_BE3.png',
    fermented_spider_eye: '7/7b/Fermented_Spider_Eye_JE3_BE3.png',
    blaze_powder: '7/7b/Blaze_Powder_JE3_BE3.png',
    magma_cream: '7/7b/Magma_Cream_JE3_BE3.png',
    brewing_stand: '7/7b/Brewing_Stand_JE3_BE3.png',
    cauldron: '7/7b/Cauldron_JE3_BE3.png',
    ender_eye: '7/7b/Eye_of_Ender_JE3_BE3.png',
    glistering_melon_slice: 'f/f1/Glistering_Melon_Slice_JE3_BE3.png',
    spawn_egg: '7/7b/Pig_Spawn_Egg_JE3_BE3.png',
    experience_bottle: '7/7b/Experience_Bottle_JE3_BE3.png',
    fire_charge: '7/7b/Fire_Charge_JE3_BE3.png',
    writable_book: '7/7b/Book_and_Quill_JE3_BE3.png',
    written_book: '7/7b/Written_Book_JE3_BE3.png',
    emerald: '7/7b/Emerald_JE3_BE3.png',
    item_frame: '7/7b/Item_Frame_JE3_BE3.png',
    flower_pot: '7/7b/Flower_Pot_JE3_BE3.png',
    carrot: '7/7b/Carrot_JE3_BE3.png',
    potato: '7/7b/Potato_JE3_BE3.png',
    baked_potato: '7/7b/Baked_Potato_JE3_BE3.png',
    poisonous_potato: '7/7b/Poisonous_Potato_JE3_BE3.png',
    map: '7/7b/Empty_Map_JE3_BE3.png',
    golden_carrot: '7/7b/Golden_Carrot_JE3_BE3.png',
    skeleton_skull: '7/7b/Skeleton_Skull_JE3_BE3.png',
    wither_skeleton_skull: '7/7b/Wither_Skeleton_Skull_JE3_BE3.png',
    player_head: '7/7b/Player_Head_JE3_BE3.png',
    zombie_head: '7/7b/Zombie_Head_JE3_BE3.png',
    creeper_head: '7/7b/Creeper_Head_JE3_BE3.png',
    dragon_head: '7/7b/Dragon_Head_JE3_BE3.png',
    carrot_on_a_stick: '7/7b/Carrot_on_a_Stick_JE3_BE3.png',
    nether_star: '7/7b/Nether_Star_JE3_BE3.png',
    pumpkin_pie: '7/7b/Pumpkin_Pie_JE3_BE3.png',
    firework_rocket: '7/7b/Firework_Rocket_JE3_BE3.png',
    firework_star: '7/7b/Firework_Star_JE3_BE3.png',
    enchanted_book: '7/7b/Enchanted_Book_JE3_BE3.png',
    nether_brick: '7/7b/Nether_Brick_JE3_BE3.png',
    quartz: '7/7b/Nether_Quartz_JE3_BE3.png',
    tnt_minecart: '5/50/Minecart_with_TNT_JE3_BE3.png',
    hopper_minecart: '5/50/Minecart_with_Hopper_JE3_BE3.png',
    prismarine_shard: '7/7b/Prismarine_Shard_JE3_BE3.png',
    prismarine_crystals: '7/7b/Prismarine_Crystals_JE3_BE3.png',
    rabbit: '7/7b/Raw_Rabbit_JE3_BE3.png',
    cooked_rabbit: '7/7b/Cooked_Rabbit_JE3_BE3.png',
    rabbit_stew: '7/7b/Rabbit_Stew_JE3_BE3.png',
    rabbit_foot: '7/7b/Rabbit_Foot_JE3_BE3.png',
    rabbit_hide: '7/7b/Rabbit_Hide_JE3_BE3.png',
    armor_stand: '7/7b/Armor_Stand_JE3_BE3.png',
    iron_horse_armor: '7/7b/Iron_Horse_Armor_JE3_BE3.png',
    golden_horse_armor: '7/7b/Golden_Horse_Armor_JE3_BE3.png',
    diamond_horse_armor: '9/9d/Diamond_Horse_Armor_JE3_BE3.png',
    lead: '7/7b/Lead_JE3_BE3.png',
    name_tag: '7/7b/Name_Tag_JE3_BE3.png',
    command_block_minecart: '5/50/Minecart_with_Command_Block_JE3_BE3.png',
    mutton: '7/7b/Raw_Mutton_JE3_BE3.png',
    cooked_mutton: '7/7b/Cooked_Mutton_JE3_BE3.png',
    banner: '7/7b/White_Banner_JE3_BE3.png',
    end_crystal: '7/7b/End_Crystal_JE3_BE3.png',
    spruce_door: '8/8c/Spruce_Door_JE3_BE3.png',
    birch_door: '8/8c/Birch_Door_JE3_BE3.png',
    jungle_door: '8/8c/Jungle_Door_JE3_BE3.png',
    acacia_door: '8/8c/Acacia_Door_JE3_BE3.png',
    dark_oak_door: '8/8c/Dark_Oak_Door_JE3_BE3.png',
    chorus_fruit: '7/7b/Chorus_Fruit_JE3_BE3.png',
    popped_chorus_fruit: '7/7b/Popped_Chorus_Fruit_JE3_BE3.png',
    beetroot: '7/7b/Beetroot_JE3_BE3.png',
    beetroot_seeds: '8/8c/Beetroot_Seeds_JE3_BE3.png',
    beetroot_soup: '7/7b/Beetroot_Soup_JE3_BE3.png',
    dragon_breath: '7/7b/Dragon_Breath_JE3_BE3.png',
    splash_potion: '7/7b/Splash_Potion_JE3_BE3.png',
    spectral_arrow: '7/7b/Spectral_Arrow_JE3_BE3.png',
    tipped_arrow: '7/7b/Tipped_Arrow_JE3_BE3.png',
    lingering_potion: '7/7b/Lingering_Potion_JE3_BE3.png',
    shield: '7/7b/Shield_JE3_BE3.png',
    elytra: '7/7b/Elytra_JE3_BE3.png',
    spruce_boat: '7/7b/Spruce_Boat_JE3_BE3.png',
    birch_boat: '7/7b/Birch_Boat_JE3_BE3.png',
    jungle_boat: '7/7b/Jungle_Boat_JE3_BE3.png',
    acacia_boat: '7/7b/Acacia_Boat_JE3_BE3.png',
    dark_oak_boat: '7/7b/Dark_Oak_Boat_JE3_BE3.png',
    totem_of_undying: '7/7b/Totem_of_Undying_JE3_BE3.png',
    shulker_shell: '7/7b/Shulker_Shell_JE3_BE3.png',
    iron_nugget: '7/7b/Iron_Nugget_JE3_BE3.png',
    knowledge_book: '7/7b/Knowledge_Book_JE3_BE3.png',
    debug_stick: '7/7b/Debug_Stick_JE3_BE3.png',
    music_disc_13: '7/7b/Music_Disc_13_JE3_BE3.png',
    music_disc_cat: '7/7b/Music_Disc_Cat_JE3_BE3.png',
    music_disc_blocks: '7/7b/Music_Disc_Blocks_JE3_BE3.png',
    music_disc_chirp: '7/7b/Music_Disc_Chirp_JE3_BE3.png',
    music_disc_far: '7/7b/Music_Disc_Far_JE3_BE3.png',
    music_disc_mall: '7/7b/Music_Disc_Mall_JE3_BE3.png',
    music_disc_mellohi: '7/7b/Music_Disc_Mellohi_JE3_BE3.png',
    music_disc_stal: '7/7b/Music_Disc_Stal_JE3_BE3.png',
    music_disc_strad: '7/7b/Music_Disc_Strad_JE3_BE3.png',
    music_disc_ward: '7/7b/Music_Disc_Ward_JE3_BE3.png',
    music_disc_11: '7/7b/Music_Disc_11_JE3_BE3.png',
    music_disc_wait: '7/7b/Music_Disc_Wait_JE3_BE3.png',
    trident: '7/7b/Trident_JE3_BE3.png',
    phantom_membrane: '7/7b/Phantom_Membrane_JE3_BE3.png',
    nautilus_shell: '7/7b/Nautilus_Shell_JE3_BE3.png',
    heart_of_the_sea: '7/7b/Heart_of_the_Sea_JE3_BE3.png',
    crossbow: '7/7b/Crossbow_JE3_BE3.png',
    suspicious_stew: '7/7b/Suspicious_Stew_JE3_BE3.png',
    loom: '7/7b/Loom_JE3_BE3.png',
    flower_banner_pattern: '7/7b/Flower_Banner_Pattern_JE3_BE3.png',
    creeper_banner_pattern: '7/7b/Creeper_Banner_Pattern_JE3_BE3.png',
    skull_banner_pattern: '7/7b/Skull_Banner_Pattern_JE3_BE3.png',
    mojang_banner_pattern: '7/7b/Mojang_Banner_Pattern_JE3_BE3.png',
    globe_banner_pattern: '7/7b/Globe_Banner_Pattern_JE3_BE3.png',
    piglin_banner_pattern: '7/7b/Piglin_Banner_Pattern_JE3_BE3.png',
    composter: '7/7b/Composter_JE3_BE3.png',
    barrel: '7/7b/Barrel_JE3_BE3.png',
    smoker: '7/7b/Smoker_JE3_BE3.png',
    blast_furnace: '7/7b/Blast_Furnace_JE3_BE3.png',
    cartography_table: '7/7b/Cartography_Table_JE3_BE3.png',
    fletching_table: '7/7b/Fletching_Table_JE3_BE3.png',
    grindstone: '7/7b/Grindstone_JE3_BE3.png',
    lectern: '7/7b/Lectern_JE3_BE3.png',
    smithing_table: '7/7b/Smithing_Table_JE3_BE3.png',
    stonecutter: '7/7b/Stonecutter_JE3_BE3.png',
    bell: '7/7b/Bell_JE3_BE3.png',
    lantern: '7/7b/Lantern_JE3_BE3.png',
    soul_lantern: '7/7b/Soul_Lantern_JE3_BE3.png',
    sweet_berries: '7/7b/Sweet_Berries_JE3_BE3.png',
    campfire: '7/7b/Campfire_JE3_BE3.png',
    soul_campfire: '7/7b/Soul_Campfire_JE3_BE3.png',
    shroomlight: '7/7b/Shroomlight_JE3_BE3.png',
    honeycomb: '7/7b/Honeycomb_JE3_BE3.png',
    bee_nest: '7/7b/Bee_Nest_JE3_BE3.png',
    beehive: '7/7b/Beehive_JE3_BE3.png',
    honey_bottle: '7/7b/Honey_Bottle_JE3_BE3.png',
    honey_block: '7/7b/Honey_Block_JE3_BE3.png',
    lodestone: '7/7b/Lodestone_JE3_BE3.png',
    crying_obsidian: '7/7b/Crying_Obsidian_JE3_BE3.png',
    blackstone: '7/7b/Blackstone_JE3_BE3.png',
    blackstone_slab: '7/7b/Blackstone_Slab_JE3_BE3.png',
    blackstone_stairs: '7/7b/Blackstone_Stairs_JE3_BE3.png',
    gilded_blackstone: '7/7b/Gilded_Blackstone_JE3_BE3.png',
    polished_blackstone: '7/7b/Polished_Blackstone_JE3_BE3.png',
    polished_blackstone_slab: '7/7b/Polished_Blackstone_Slab_JE3_BE3.png',
    polished_blackstone_stairs: '7/7b/Polished_Blackstone_Stairs_JE3_BE3.png',
    polished_blackstone_bricks: '7/7b/Polished_Blackstone_Bricks_JE3_BE3.png',
    cracked_polished_blackstone_bricks:
      '7/7b/Cracked_Polished_Blackstone_Bricks_JE3_BE3.png',
    chiseled_polished_blackstone:
      '7/7b/Chiseled_Polished_Blackstone_JE3_BE3.png',
    polished_blackstone_button: '7/7b/Polished_Blackstone_Button_JE3_BE3.png',
    polished_blackstone_pressure_plate:
      '7/7b/Polished_Blackstone_Pressure_Plate_JE3_BE3.png',
    polished_blackstone_wall: '7/7b/Polished_Blackstone_Wall_JE3_BE3.png',
    warped_wart_block: '7/7b/Warped_Wart_Block_JE3_BE3.png',
    warped_stem: '7/7b/Warped_Stem_JE3_BE3.png',
    warped_hyphae: '7/7b/Warped_Hyphae_JE3_BE3.png',
    warped_nylium: '7/7b/Warped_Nylium_JE3_BE3.png',
    warped_fungus: '7/7b/Warped_Fungus_JE3_BE3.png',
    warped_roots: '7/7b/Warped_Roots_JE3_BE3.png',
    warped_door: '8/8c/Warped_Door_JE3_BE3.png',
    warped_trapdoor: '7/7b/Warped_Trapdoor_JE3_BE3.png',
    warped_fence_gate: '7/7b/Warped_Fence_Gate_JE3_BE3.png',
    warped_fence: '7/7b/Warped_Fence_JE3_BE3.png',
    warped_stairs: '7/7b/Warped_Stairs_JE3_BE3.png',
    warped_slab: '7/7b/Warped_Slab_JE3_BE3.png',
    warped_pressure_plate: '7/7b/Warped_Pressure_Plate_JE3_BE3.png',
    warped_button: '7/7b/Warped_Button_JE3_BE3.png',
    warped_sign: '7/7b/Warped_Sign_JE3_BE3.png',
    crimson_nylium: '7/7b/Crimson_Nylium_JE3_BE3.png',
    crimson_stem: '7/7b/Crimson_Stem_JE3_BE3.png',
    crimson_hyphae: '7/7b/Crimson_Hyphae_JE3_BE3.png',
    crimson_fungus: '7/7b/Crimson_Fungus_JE3_BE3.png',
    crimson_roots: '7/7b/Crimson_Roots_JE3_BE3.png',
    crimson_door: '8/8c/Crimson_Door_JE3_BE3.png',
    crimson_trapdoor: '7/7b/Crimson_Trapdoor_JE3_BE3.png',
    crimson_fence_gate: '7/7b/Crimson_Fence_Gate_JE3_BE3.png',
    crimson_fence: '7/7b/Crimson_Fence_JE3_BE3.png',
    crimson_stairs: '7/7b/Crimson_Stairs_JE3_BE3.png',
    crimson_slab: '7/7b/Crimson_Slab_JE3_BE3.png',
    crimson_pressure_plate: '7/7b/Crimson_Pressure_Plate_JE3_BE3.png',
    crimson_button: '7/7b/Crimson_Button_JE3_BE3.png',
    crimson_sign: '7/7b/Crimson_Sign_JE3_BE3.png',
    nether_sprouts: '7/7b/Nether_Sprouts_JE3_BE3.png',
    weeping_vines: '7/7b/Weeping_Vines_JE3_BE3.png',
    twisting_vines: '7/7b/Twisting_Vines_JE3_BE3.png',
    crimson_planks: '7/7b/Crimson_Planks_JE3_BE3.png',
    warped_planks: '7/7b/Warped_Planks_JE3_BE3.png',
  };

  return wikiMappings[itemName] || `${itemName}.png`;
}

/**
 * Get item display name from item name
 */
export function getItemDisplayName(itemName: string): string {
  const cleanName = itemName.replace('minecraft:', '');

  // Convert snake_case to Title Case
  return cleanName
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Get item category for grouping
 */
export function getItemCategory(itemName: string): string {
  const cleanName = itemName.replace('minecraft:', '');

  if (
    cleanName.includes('sword') ||
    cleanName.includes('axe') ||
    cleanName.includes('pickaxe') ||
    cleanName.includes('shovel') ||
    cleanName.includes('hoe')
  ) {
    return 'tools';
  }

  if (
    cleanName.includes('helmet') ||
    cleanName.includes('chestplate') ||
    cleanName.includes('leggings') ||
    cleanName.includes('boots')
  ) {
    return 'armor';
  }

  if (
    cleanName.includes('ingot') ||
    cleanName.includes('nugget') ||
    cleanName.includes('gem') ||
    cleanName.includes('dust')
  ) {
    return 'materials';
  }

  if (
    cleanName.includes('food') ||
    cleanName.includes('apple') ||
    cleanName.includes('bread') ||
    cleanName.includes('meat') ||
    cleanName.includes('stew') ||
    cleanName.includes('pie')
  ) {
    return 'food';
  }

  if (
    cleanName.includes('block') ||
    cleanName.includes('stone') ||
    cleanName.includes('dirt') ||
    cleanName.includes('log') ||
    cleanName.includes('planks')
  ) {
    return 'blocks';
  }

  if (
    cleanName.includes('seed') ||
    cleanName.includes('crop') ||
    cleanName.includes('wheat') ||
    cleanName.includes('carrot') ||
    cleanName.includes('potato')
  ) {
    return 'agriculture';
  }

  return 'misc';
}

/**
 * Get default fallback sprite (SVG data URL)
 */
export function getFallbackSprite(): string {
  return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2IiBmaWxsPSIjNjM2NjZhIi8+CjxwYXRoIGQ9Ik04IDRMMTIgOEw4IDEyTDQgOEw4IDRaIiBmaWxsPSIjZjNmNGY2Ii8+Cjwvc3ZnPgo=';
}

/**
 * Get item data with all metadata
 */
export function getItemData(itemName: string): MinecraftItemData {
  const cleanName = itemName.replace('minecraft:', '');

  return {
    id: 0, // Will be filled by mineflayer data
    name: cleanName,
    displayName: getItemDisplayName(cleanName),
    stackSize: 64, // Default stack size
    maxDurability: getMaxDurability(cleanName),
    spriteUrl: getItemSpriteUrl(cleanName),
    category: getItemCategory(cleanName),
  };
}

/**
 * Get maximum durability for tools and armor
 */
function getMaxDurability(itemName: string): number | undefined {
  const durabilityMap: Record<string, number> = {
    // Tools
    wooden_sword: 59,
    stone_sword: 250,
    iron_sword: 250,
    diamond_sword: 1561,
    golden_sword: 32,
    wooden_pickaxe: 59,
    stone_pickaxe: 131,
    iron_pickaxe: 250,
    diamond_pickaxe: 1561,
    golden_pickaxe: 32,
    wooden_axe: 59,
    stone_axe: 131,
    iron_axe: 250,
    diamond_axe: 1561,
    golden_axe: 32,
    wooden_shovel: 59,
    stone_shovel: 131,
    iron_shovel: 250,
    diamond_shovel: 1561,
    golden_shovel: 32,
    wooden_hoe: 59,
    stone_hoe: 131,
    iron_hoe: 250,
    diamond_hoe: 1561,
    golden_hoe: 32,

    // Armor
    leather_helmet: 55,
    leather_chestplate: 80,
    leather_leggings: 75,
    leather_boots: 65,
    chainmail_helmet: 165,
    chainmail_chestplate: 240,
    chainmail_leggings: 225,
    chainmail_boots: 195,
    iron_helmet: 165,
    iron_chestplate: 240,
    iron_leggings: 225,
    iron_boots: 195,
    diamond_helmet: 363,
    diamond_chestplate: 528,
    diamond_leggings: 495,
    diamond_boots: 429,
    golden_helmet: 77,
    golden_chestplate: 112,
    golden_leggings: 105,
    golden_boots: 91,

    // Other items with durability
    fishing_rod: 64,
    flint_and_steel: 64,
    shears: 238,
    shield: 336,
    elytra: 432,
    trident: 250,
    crossbow: 326,
  };

  return durabilityMap[itemName];
}
