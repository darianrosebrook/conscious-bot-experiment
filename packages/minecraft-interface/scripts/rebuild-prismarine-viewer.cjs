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
    const povPatchPath = path.join(
      __dirname,
      '..',
      'patches',
      'prismarine-viewer-lib-index.patched.js'
    );
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
    const indexConfig = Array.isArray(configs) ? configs[0] : configs;
    webpack(indexConfig, (err, stats) => {
      if (err) {
        console.warn('[rebuild-prismarine-viewer] webpack error:', err.message);
      } else if (stats && stats.hasErrors()) {
        console.warn('[rebuild-prismarine-viewer] webpack build errors:', stats.compilation.errors.length);
      }
    });
  } catch {
    process.exitCode = 0;
  }
}

run();
