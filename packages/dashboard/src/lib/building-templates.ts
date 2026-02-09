/**
 * Building Templates — preset builds users can load into the 3D builder
 *
 * Each template is a named array of PlacedBlocks. These demonstrate the
 * builder's capabilities and give users a starting point to edit.
 *
 * All builds fit within the default 16×16×16 grid.
 */

import type { PlacedBlock } from '@/types/building';

export interface BuildingTemplate {
  id: string;
  name: string;
  description: string;
  blocks: PlacedBlock[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Shorthand to create a placed block. */
function b(x: number, y: number, z: number, blockType: string): PlacedBlock {
  return { position: { x, y, z }, blockType };
}

/** Fill a rectangular volume with a single block type. */
function fill(
  x1: number, y1: number, z1: number,
  x2: number, y2: number, z2: number,
  blockType: string,
): PlacedBlock[] {
  const blocks: PlacedBlock[] = [];
  for (let x = x1; x <= x2; x++)
    for (let y = y1; y <= y2; y++)
      for (let z = z1; z <= z2; z++)
        blocks.push(b(x, y, z, blockType));
  return blocks;
}

// ─── Template: Simple Shelter ────────────────────────────────────────────────

function simpleShelter(): PlacedBlock[] {
  const blocks: PlacedBlock[] = [];

  // Floor: 5×5 cobblestone at y=0
  blocks.push(...fill(4, 0, 4, 8, 0, 8, 'cobblestone'));

  // Walls: 3 high (y=1..3), hollow
  for (let y = 1; y <= 3; y++) {
    // Front wall (z=4) and back wall (z=8)
    for (let x = 4; x <= 8; x++) {
      blocks.push(b(x, y, 4, 'oak_planks'));
      blocks.push(b(x, y, 8, 'oak_planks'));
    }
    // Side walls (x=4 and x=8), skip corners already placed
    for (let z = 5; z <= 7; z++) {
      blocks.push(b(4, y, z, 'oak_planks'));
      blocks.push(b(8, y, z, 'oak_planks'));
    }
  }

  // Door opening: remove front wall blocks at (6,1,4) and (6,2,4)
  const doorPositions = new Set(['6,1,4', '6,2,4']);
  const filtered = blocks.filter(
    (bl) => !doorPositions.has(`${bl.position.x},${bl.position.y},${bl.position.z}`),
  );

  // Windows: replace some wall blocks with glass
  const windowPositions = new Set(['5,2,8', '7,2,8', '4,2,6', '8,2,6']);
  const withWindows = filtered.map((bl) => {
    const key = `${bl.position.x},${bl.position.y},${bl.position.z}`;
    if (windowPositions.has(key)) {
      return { ...bl, blockType: 'glass' };
    }
    return bl;
  });

  // Roof: flat oak slab layer at y=4
  withWindows.push(...fill(3, 4, 3, 9, 4, 9, 'oak_slab'));

  // Torch inside
  withWindows.push(b(6, 1, 6, 'torch'));

  return withWindows;
}

// ─── Template: Watchtower ────────────────────────────────────────────────────

function watchtower(): PlacedBlock[] {
  const blocks: PlacedBlock[] = [];
  const cx = 7; // center x
  const cz = 7; // center z

  // Base platform: 5×5 stone bricks at y=0
  blocks.push(...fill(cx - 2, 0, cz - 2, cx + 2, 0, cz + 2, 'stone_bricks'));

  // Tower shaft: 3×3 cobblestone walls, 6 layers (y=1..6)
  for (let y = 1; y <= 6; y++) {
    for (let x = cx - 1; x <= cx + 1; x++) {
      for (let z = cz - 1; z <= cz + 1; z++) {
        const isEdge = x === cx - 1 || x === cx + 1 || z === cz - 1 || z === cz + 1;
        if (isEdge) blocks.push(b(x, y, z, 'cobblestone'));
      }
    }
  }

  // Door opening (south face)
  const doorKeys = new Set([`${cx},1,${cz - 1}`, `${cx},2,${cz - 1}`]);
  const withDoor = blocks.filter(
    (bl) => !doorKeys.has(`${bl.position.x},${bl.position.y},${bl.position.z}`),
  );

  // Observation deck: 5×5 at y=7
  withDoor.push(...fill(cx - 2, 7, cz - 2, cx + 2, 7, cz + 2, 'stone_bricks'));

  // Deck railing: 1 block high at y=8
  for (let x = cx - 2; x <= cx + 2; x++) {
    withDoor.push(b(x, 8, cz - 2, 'cobblestone_stairs'));
    withDoor.push(b(x, 8, cz + 2, 'cobblestone_stairs'));
  }
  for (let z = cz - 1; z <= cz + 1; z++) {
    withDoor.push(b(cx - 2, 8, z, 'cobblestone_stairs'));
    withDoor.push(b(cx + 2, 8, z, 'cobblestone_stairs'));
  }

  // Corner pillars: oak logs at each corner, full height
  for (let y = 1; y <= 8; y++) {
    withDoor.push(b(cx - 2, y, cz - 2, 'oak_log'));
    withDoor.push(b(cx + 2, y, cz - 2, 'oak_log'));
    withDoor.push(b(cx - 2, y, cz + 2, 'oak_log'));
    withDoor.push(b(cx + 2, y, cz + 2, 'oak_log'));
  }

  // Torches on deck
  withDoor.push(b(cx - 1, 8, cz - 1, 'torch'));
  withDoor.push(b(cx + 1, 8, cz + 1, 'torch'));

  return withDoor;
}

// ─── Template: Blacksmith Workshop ───────────────────────────────────────────

function blacksmithWorkshop(): PlacedBlock[] {
  const blocks: PlacedBlock[] = [];

  // Floor: stone bricks 7×7
  blocks.push(...fill(4, 0, 4, 10, 0, 10, 'stone_bricks'));

  // Walls: cobblestone, 3 high (y=1..3)
  for (let y = 1; y <= 3; y++) {
    for (let x = 4; x <= 10; x++) {
      blocks.push(b(x, y, 4, 'cobblestone'));
      blocks.push(b(x, y, 10, 'cobblestone'));
    }
    for (let z = 5; z <= 9; z++) {
      blocks.push(b(4, y, z, 'cobblestone'));
      blocks.push(b(10, y, z, 'cobblestone'));
    }
  }

  // Door opening (front wall, z=4)
  const removeKeys = new Set(['7,1,4', '7,2,4']);
  const withOpening = blocks.filter(
    (bl) => !removeKeys.has(`${bl.position.x},${bl.position.y},${bl.position.z}`),
  );

  // Door block
  withOpening.push(b(7, 1, 4, 'oak_door'));

  // Windows: glass panes (using glass blocks)
  const windowKeys = new Set(['5,2,4', '9,2,4', '4,2,7', '10,2,7']);
  const withWindows = withOpening.map((bl) => {
    const key = `${bl.position.x},${bl.position.y},${bl.position.z}`;
    if (windowKeys.has(key)) return { ...bl, blockType: 'glass' };
    return bl;
  });

  // Roof: dark oak slabs
  withWindows.push(...fill(3, 4, 3, 11, 4, 11, 'dark_oak_slab'));

  // Workstations along the back wall (z=9)
  withWindows.push(b(5, 1, 9, 'crafting_table'));
  withWindows.push(b(6, 1, 9, 'furnace'));
  withWindows.push(b(7, 1, 9, 'blast_furnace'));
  withWindows.push(b(8, 1, 9, 'anvil'));
  withWindows.push(b(9, 1, 9, 'smithing_table'));

  // Side stations
  withWindows.push(b(5, 1, 5, 'barrel'));     // storage
  withWindows.push(b(5, 1, 6, 'barrel'));     // storage
  withWindows.push(b(9, 1, 5, 'smoker'));     // food
  withWindows.push(b(9, 1, 6, 'cauldron'));   // water

  // Grindstone on a table
  withWindows.push(b(9, 1, 8, 'stonecutter'));
  withWindows.push(b(5, 1, 8, 'grindstone'));

  // Lighting
  withWindows.push(b(7, 3, 7, 'lantern'));

  // Chimney on the roof (above blast furnace)
  withWindows.push(b(7, 5, 9, 'cobblestone'));
  withWindows.push(b(7, 6, 9, 'cobblestone'));

  return withWindows;
}

// ─── Template: Village House ─────────────────────────────────────────────────

function villageHouse(): PlacedBlock[] {
  const blocks: PlacedBlock[] = [];

  // Foundation: cobblestone 6×8
  blocks.push(...fill(4, 0, 3, 9, 0, 10, 'cobblestone'));

  // Ground floor walls: spruce planks, 3 high (y=1..3)
  for (let y = 1; y <= 3; y++) {
    for (let x = 4; x <= 9; x++) {
      blocks.push(b(x, y, 3, 'spruce_planks'));
      blocks.push(b(x, y, 10, 'spruce_planks'));
    }
    for (let z = 4; z <= 9; z++) {
      blocks.push(b(4, y, z, 'spruce_planks'));
      blocks.push(b(9, y, z, 'spruce_planks'));
    }
  }

  // Front door opening (z=3) — two blocks tall
  const doorRemove = new Set(['6,1,3', '6,2,3']);
  const withOpening = blocks.filter(
    (bl) => !doorRemove.has(`${bl.position.x},${bl.position.y},${bl.position.z}`),
  );

  // Place door
  withOpening.push(b(6, 1, 3, 'spruce_door'));

  // Back door
  const backRemove = new Set(['7,1,10', '7,2,10']);
  const withBackDoor = withOpening.filter(
    (bl) => !backRemove.has(`${bl.position.x},${bl.position.y},${bl.position.z}`),
  );
  withBackDoor.push(b(7, 1, 10, 'oak_door'));

  // Windows
  const windowKeys = new Set([
    '5,2,3', '8,2,3',   // front
    '5,2,10', '8,2,10', // back
    '4,2,6', '4,2,8',   // left side
    '9,2,6', '9,2,8',   // right side
  ]);
  const withWindows = withBackDoor.map((bl) => {
    const key = `${bl.position.x},${bl.position.y},${bl.position.z}`;
    if (windowKeys.has(key)) return { ...bl, blockType: 'glass' };
    return bl;
  });

  // Second floor: oak planks at y=4
  withWindows.push(...fill(4, 4, 3, 9, 4, 10, 'oak_planks'));

  // Second floor walls: oak planks, 3 high (y=5..7)
  for (let y = 5; y <= 7; y++) {
    for (let x = 4; x <= 9; x++) {
      withWindows.push(b(x, y, 3, 'oak_planks'));
      withWindows.push(b(x, y, 10, 'oak_planks'));
    }
    for (let z = 4; z <= 9; z++) {
      withWindows.push(b(4, y, z, 'oak_planks'));
      withWindows.push(b(9, y, z, 'oak_planks'));
    }
  }

  // Second floor windows
  const upperWindowKeys = new Set([
    '6,6,3', '7,6,3',    // front
    '6,6,10', '7,6,10',  // back
    '4,6,6', '9,6,6',    // sides
  ]);
  const withUpperWindows = withWindows.map((bl) => {
    const key = `${bl.position.x},${bl.position.y},${bl.position.z}`;
    if (upperWindowKeys.has(key)) return { ...bl, blockType: 'glass' };
    return bl;
  });

  // Trapdoor in floor for ladder access (remove one floor block)
  const hatchRemove = new Set(['8,4,9']);
  const withHatch = withUpperWindows.filter(
    (bl) => !hatchRemove.has(`${bl.position.x},${bl.position.y},${bl.position.z}`),
  );
  withHatch.push(b(8, 4, 9, 'oak_trapdoor'));

  // Ladder going up to second floor
  withHatch.push(b(8, 1, 9, 'ladder'));
  withHatch.push(b(8, 2, 9, 'ladder'));
  withHatch.push(b(8, 3, 9, 'ladder'));

  // Roof: birch slab, overhangs by 1
  withHatch.push(...fill(3, 8, 2, 10, 8, 11, 'birch_slab'));

  // Corner posts: stripped spruce logs, full height
  for (let y = 1; y <= 7; y++) {
    withHatch.push(b(4, y, 3, 'stripped_spruce_log'));
    withHatch.push(b(9, y, 3, 'stripped_spruce_log'));
    withHatch.push(b(4, y, 10, 'stripped_spruce_log'));
    withHatch.push(b(9, y, 10, 'stripped_spruce_log'));
  }

  // Interior: crafting + furnace on ground floor
  withHatch.push(b(5, 1, 4, 'crafting_table'));
  withHatch.push(b(5, 1, 5, 'furnace'));

  // Barrel storage under stairs
  withHatch.push(b(8, 1, 8, 'barrel'));

  // Lighting
  withHatch.push(b(6, 3, 7, 'lantern'));
  withHatch.push(b(6, 7, 7, 'lantern'));

  return withHatch;
}

// ─── Dedup helper ────────────────────────────────────────────────────────────

/** Remove duplicate positions (last write wins — later blocks override earlier). */
function dedup(blocks: PlacedBlock[]): PlacedBlock[] {
  const seen = new Map<string, PlacedBlock>();
  for (const bl of blocks) {
    seen.set(`${bl.position.x},${bl.position.y},${bl.position.z}`, bl);
  }
  return Array.from(seen.values());
}

// ─── Export ──────────────────────────────────────────────────────────────────

export const BUILDING_TEMPLATES: BuildingTemplate[] = [
  {
    id: 'simple-shelter',
    name: 'Simple Shelter',
    description: 'A basic 5×5 wooden shelter with a door, windows, and a flat roof',
    blocks: dedup(simpleShelter()),
  },
  {
    id: 'watchtower',
    name: 'Watchtower',
    description: 'A stone tower with observation deck and corner log pillars',
    blocks: dedup(watchtower()),
  },
  {
    id: 'blacksmith-workshop',
    name: 'Blacksmith Workshop',
    description: 'A stone workshop with crafting table, furnaces, anvil, and storage barrels',
    blocks: dedup(blacksmithWorkshop()),
  },
  {
    id: 'village-house',
    name: 'Village House',
    description: 'A two-story house with doors, trapdoor hatch, ladder, and workstations',
    blocks: dedup(villageHouse()),
  },
];
