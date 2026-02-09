/**
 * Atlas types — shared between the Vite plugin and runtime code
 *
 * These types describe the texture atlas index JSON generated at build time
 * by vite-plugin-texture-atlas.ts. Both the plugin (Node) and the browser
 * runtime (use-atlas-material.ts) use these types.
 */

export interface AtlasEntry {
  u: number;
  v: number;
  su: number;
  sv: number;
  /** Grid column index */
  col: number;
  /** Grid row index */
  row: number;
}

export interface AtlasIndex {
  /** UV size of one tile (1 / gridSize) */
  size: number;
  /** Grid dimension (tiles per row/column) */
  gridSize: number;
  /** Tile pixel size */
  tileSize: number;
  /** Total atlas pixel size */
  atlasPixelSize: number;
  /** Ordered list of texture filenames (without extension) for runtime compositing */
  textureNames: string[];
  /** Map of texture name → UV coordinates */
  textures: Record<string, AtlasEntry>;
}
