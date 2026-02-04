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
