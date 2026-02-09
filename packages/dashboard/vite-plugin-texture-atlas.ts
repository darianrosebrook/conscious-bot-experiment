/**
 * vite-plugin-texture-atlas — Build-time atlas index generation
 *
 * Scans public/block_textures/*.png and generates an atlas index JSON
 * mapping each texture name to its UV coordinates in a grid layout.
 * The actual atlas PNG is composited at runtime in the browser
 * (via use-atlas-material.ts) to avoid native `canvas` dependency.
 *
 * Output: public/atlas/blocks-atlas-index.json
 */

import fs from 'fs';
import path from 'path';
import type { Plugin } from 'vite';

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

function generateAtlasIndex(texturesDir: string): AtlasIndex {
  const files = fs.readdirSync(texturesDir)
    .filter((f) => f.endsWith('.png'))
    .sort();

  const tileSize = 16;
  const count = files.length;
  const gridSize = Math.ceil(Math.sqrt(count));
  // Next power of 2 for the atlas dimension in tiles
  const atlasGridSize = Math.pow(2, Math.ceil(Math.log2(gridSize)));
  const atlasPixelSize = atlasGridSize * tileSize;
  const uvSize = 1 / atlasGridSize;

  const textures: Record<string, AtlasEntry> = {};
  const textureNames: string[] = [];

  files.forEach((file, i) => {
    const name = file.replace(/\.png$/, '');
    const col = i % atlasGridSize;
    const row = Math.floor(i / atlasGridSize);

    textureNames.push(name);
    textures[name] = {
      u: col * uvSize,
      v: row * uvSize,
      su: uvSize,
      sv: uvSize,
      col,
      row,
    };
  });

  return {
    size: uvSize,
    gridSize: atlasGridSize,
    tileSize,
    atlasPixelSize,
    textureNames,
    textures,
  };
}

export default function textureAtlasPlugin(): Plugin {
  let texturesDir = '';
  let atlasDir = '';

  function ensureAtlasDir() {
    if (!fs.existsSync(atlasDir)) {
      fs.mkdirSync(atlasDir, { recursive: true });
    }
  }

  function writeIndex() {
    if (!fs.existsSync(texturesDir)) return;
    ensureAtlasDir();
    const index = generateAtlasIndex(texturesDir);
    const outPath = path.join(atlasDir, 'blocks-atlas-index.json');
    fs.writeFileSync(outPath, JSON.stringify(index, null, 2));
  }

  return {
    name: 'texture-atlas',

    configResolved(config) {
      const publicDir = config.publicDir || path.join(config.root, 'public');
      texturesDir = path.join(publicDir, 'block_textures');
      atlasDir = path.join(publicDir, 'atlas');
    },

    buildStart() {
      writeIndex();
    },

    configureServer(server) {
      // Generate on dev server startup
      writeIndex();

      // Watch for texture changes
      server.watcher.add(texturesDir);
      server.watcher.on('change', (changedPath) => {
        if (changedPath.startsWith(texturesDir)) {
          writeIndex();
        }
      });
      server.watcher.on('add', (addedPath) => {
        if (addedPath.startsWith(texturesDir)) {
          writeIndex();
        }
      });
    },
  };
}
