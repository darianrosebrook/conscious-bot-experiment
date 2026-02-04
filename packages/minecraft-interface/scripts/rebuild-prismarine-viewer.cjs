#!/usr/bin/env node
/**
 * Rebuild prismarine-viewer client bundle after patch is applied.
 * Also generates texture atlases for newer Minecraft versions.
 * Applies POV switcher and right-click orbit patch before bundling.
 * Requires webpack. Runs silently; failures are non-fatal.
 * @author @darianrosebrook
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

function run() {
  try {
    const pvRoot = path.dirname(
      require.resolve('prismarine-viewer/package.json')
    );
    // POV switcher patch - try new source location first, fall back to legacy
    const povPatchPathNew = path.join(
      __dirname,
      '..',
      'src',
      'prismarine-viewer-src',
      'index.js'
    );
    const povPatchPathLegacy = path.join(
      __dirname,
      '..',
      'patches',
      'prismarine-viewer-lib-index.patched.js'
    );
    const povPatchPath = fs.existsSync(povPatchPathNew) ? povPatchPathNew : povPatchPathLegacy;
    const pvLibIndex = path.join(pvRoot, 'lib', 'index.js');
    if (fs.existsSync(povPatchPath) && fs.existsSync(pvLibIndex)) {
      fs.copyFileSync(povPatchPath, pvLibIndex);
    }

    // Copy animated-material-client.js to lib/ for webpack bundling
    const animatedMaterialSrc = path.join(
      __dirname,
      '..',
      'src',
      'prismarine-viewer-src',
      'animated-material-client.js'
    );
    const animatedMaterialDest = path.join(pvRoot, 'lib', 'animated-material-client.js');
    if (fs.existsSync(animatedMaterialSrc)) {
      fs.copyFileSync(animatedMaterialSrc, animatedMaterialDest);
      console.log('[rebuild-prismarine-viewer] Copied animated-material-client.js');
    }

    // Copy equipment-renderer.js to lib/ for webpack bundling
    const equipmentRendererSrc = path.join(
      __dirname,
      '..',
      'src',
      'prismarine-viewer-src',
      'equipment-renderer.js'
    );
    const equipmentRendererDest = path.join(pvRoot, 'lib', 'equipment-renderer.js');
    if (fs.existsSync(equipmentRendererSrc)) {
      fs.copyFileSync(equipmentRendererSrc, equipmentRendererDest);
      console.log('[rebuild-prismarine-viewer] Copied equipment-renderer.js');
    }

    // Copy enhanced mineflayer.js for server-side equipment/time events
    const mineflayerSrc = path.join(
      __dirname,
      '..',
      'src',
      'prismarine-viewer-src',
      'mineflayer.js'
    );
    const mineflayerDest = path.join(pvRoot, 'lib', 'mineflayer.js');
    if (fs.existsSync(mineflayerSrc)) {
      fs.copyFileSync(mineflayerSrc, mineflayerDest);
      console.log('[rebuild-prismarine-viewer] Copied mineflayer.js (equipment/time support)');
    }

    // Copy entities.js to viewer/lib/ for equipment rendering support
    const entitiesSrc = path.join(
      __dirname,
      '..',
      'src',
      'prismarine-viewer-src',
      'entities.js'
    );
    const entitiesDest = path.join(pvRoot, 'viewer', 'lib', 'entities.js');
    if (fs.existsSync(entitiesSrc)) {
      fs.copyFileSync(entitiesSrc, entitiesDest);
      console.log('[rebuild-prismarine-viewer] Copied entities.js (equipment rendering)');
    }

    // Copy Entity.js to viewer/lib/entity/ for skeletal animation support
    const entitySrc = path.join(
      __dirname,
      '..',
      'src',
      'prismarine-viewer-src',
      'Entity.js'
    );
    const entityDest = path.join(pvRoot, 'viewer', 'lib', 'entity', 'Entity.js');
    if (fs.existsSync(entitySrc)) {
      fs.copyFileSync(entitySrc, entityDest);
      console.log('[rebuild-prismarine-viewer] Copied Entity.js (skeletal animation)');
    }

    // Copy equipment-renderer.js to viewer/lib/ (used by entities.js)
    const equipmentViewerDest = path.join(pvRoot, 'viewer', 'lib', 'equipment-renderer.js');
    if (fs.existsSync(equipmentRendererSrc)) {
      fs.copyFileSync(equipmentRendererSrc, equipmentViewerDest);
      console.log('[rebuild-prismarine-viewer] Copied equipment-renderer.js to viewer/lib/');
    }

    // Generate textures for newer Minecraft versions (1.21.5-1.21.8)
    // This runs in background and doesn't block postinstall
    const generateTexturesPath = path.join(__dirname, 'generate-textures.cjs');
    if (fs.existsSync(generateTexturesPath)) {
      const child = spawn('node', [generateTexturesPath], {
        stdio: 'ignore',
        detached: true,
        cwd: path.join(__dirname, '..'),
      });
      child.unref();
    }

    const configPath = path.join(pvRoot, 'webpack.config.js');
    if (!fs.existsSync(configPath)) return;
    const webpack = require('webpack');
    process.chdir(pvRoot);
    const configs = require(configPath);

    // Build index.js bundle (contains our client-side customizations)
    // Skip worker.js - it has a transitive 'assert' dependency issue, but our changes don't affect it
    const configsArray = Array.isArray(configs) ? configs : [configs];
    const indexConfig = configsArray[0]; // First config is index.js

    console.log('[rebuild-prismarine-viewer] Building index.js bundle...');

    webpack(indexConfig, (err, stats) => {
      if (err) {
        console.warn('[rebuild-prismarine-viewer] webpack error:', err.message);
      } else if (stats && stats.hasErrors()) {
        const errors = stats.toJson().errors;
        console.warn('[rebuild-prismarine-viewer] webpack build errors:', errors.length);
        errors.slice(0, 3).forEach(e => console.warn('  -', e.message?.slice(0, 200)));
      } else {
        console.log('[rebuild-prismarine-viewer] Build complete!');
      }
    });
  } catch {
    process.exitCode = 0;
  }
}

run();
