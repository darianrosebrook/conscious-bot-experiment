#!/usr/bin/env node
/**
 * Generate texture atlases and blockStates for newer Minecraft versions.
 *
 * This script uses prismarine-viewer's atlas generation logic combined with
 * the latest minecraft-assets to create texture files for versions not yet
 * supported by the upstream prismarine-viewer package.
 *
 * Usage: node scripts/generate-textures.cjs [version]
 * Example: node scripts/generate-textures.cjs 1.21.8
 *
 * @author @darianrosebrook
 */

const path = require('path');
const fs = require('fs');

// Versions we want to generate that aren't in prismarine-viewer by default
const VERSIONS_TO_GENERATE = ['1.21.5', '1.21.6', '1.21.7', '1.21.8'];

async function main() {
  const requestedVersion = process.argv[2];
  const versions = requestedVersion ? [requestedVersion] : VERSIONS_TO_GENERATE;

  console.log('[generate-textures] Starting texture generation...');
  console.log('[generate-textures] Versions to generate:', versions.join(', '));

  // Find prismarine-viewer installation
  let pvRoot;
  try {
    pvRoot = path.dirname(require.resolve('prismarine-viewer/package.json'));
  } catch (err) {
    console.error('[generate-textures] Error: prismarine-viewer not found. Run pnpm install first.');
    process.exit(1);
  }

  const texturesPath = path.join(pvRoot, 'public', 'textures');
  const blockStatesPath = path.join(pvRoot, 'public', 'blocksStates');

  // Load prismarine-viewer's atlas and model builder
  const { makeTextureAtlas } = require(path.join(pvRoot, 'viewer', 'lib', 'atlas.js'));
  const { prepareBlocksStates } = require(path.join(pvRoot, 'viewer', 'lib', 'modelsBuilder.js'));

  // We need minecraft-assets - check if it's available
  let mcAssetsModule;
  try {
    mcAssetsModule = require('minecraft-assets');
  } catch (err) {
    console.error('[generate-textures] Error: minecraft-assets not found.');
    console.error('[generate-textures] Install it with: pnpm add -D minecraft-assets@1.17.0');
    process.exit(1);
  }

  for (const version of versions) {
    console.log(`\n[generate-textures] Generating assets for ${version}...`);

    // Check if assets already exist
    const textureFile = path.join(texturesPath, `${version}.png`);
    const blockStatesFile = path.join(blockStatesPath, `${version}.json`);

    if (fs.existsSync(textureFile) && fs.existsSync(blockStatesFile)) {
      console.log(`[generate-textures] ${version} assets already exist, skipping.`);
      console.log(`[generate-textures]   Use -f flag to force regeneration.`);
      if (!process.argv.includes('-f')) {
        continue;
      }
      console.log(`[generate-textures]   Force flag detected, regenerating...`);
    }

    // Try to load minecraft-assets for this version
    let mcAssets;
    try {
      mcAssets = mcAssetsModule(version);
    } catch (err) {
      console.warn(`[generate-textures] Warning: minecraft-assets doesn't support ${version}`);
      console.warn(`[generate-textures]   Error: ${err.message}`);
      console.warn(`[generate-textures]   Skipping this version.`);
      continue;
    }

    if (!mcAssets || !mcAssets.directory) {
      console.warn(`[generate-textures] Warning: No asset directory for ${version}, skipping.`);
      continue;
    }

    console.log(`[generate-textures]   Asset directory: ${mcAssets.directory}`);

    try {
      // Generate texture atlas
      console.log(`[generate-textures]   Generating texture atlas...`);
      const atlas = makeTextureAtlas(mcAssets);

      // Write texture PNG
      fs.mkdirSync(texturesPath, { recursive: true });
      fs.writeFileSync(textureFile, atlas.image);
      console.log(`[generate-textures]   Created: ${textureFile}`);

      // Generate and write blockStates JSON
      console.log(`[generate-textures]   Generating blockStates...`);
      const blocksStates = JSON.stringify(prepareBlocksStates(mcAssets, atlas));
      fs.mkdirSync(blockStatesPath, { recursive: true });
      fs.writeFileSync(blockStatesFile, blocksStates);
      console.log(`[generate-textures]   Created: ${blockStatesFile}`);

      // Also copy the raw asset directory for entity textures etc.
      const versionAssetsDir = path.join(texturesPath, version);
      if (!fs.existsSync(versionAssetsDir)) {
        console.log(`[generate-textures]   Copying raw assets...`);
        copyRecursive(mcAssets.directory, versionAssetsDir);
        console.log(`[generate-textures]   Created: ${versionAssetsDir}/`);
      }

      console.log(`[generate-textures] ✓ Successfully generated ${version} assets!`);
    } catch (err) {
      console.error(`[generate-textures] Error generating ${version}:`, err.message);
      console.error(err.stack);
    }
  }

  console.log('\n[generate-textures] Done!');
}

/**
 * Recursively copy directory
 */
function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;

  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src);
    for (const entry of entries) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

main().catch(err => {
  console.error('[generate-textures] Fatal error:', err);
  process.exit(1);
});
