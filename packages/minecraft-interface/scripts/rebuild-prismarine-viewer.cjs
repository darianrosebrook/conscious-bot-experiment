#!/usr/bin/env node
/**
 * Rebuild prismarine-viewer client bundle after patch is applied.
 *
 * This script is the single source of truth for all prismarine-viewer customizations.
 * It copies custom files from src/prismarine-viewer-src/ to node_modules/prismarine-viewer/
 * and rebuilds the webpack bundle.
 *
 * Features:
 * - Consolidated file mapping for easy maintenance
 * - Sync blockStates fix to prevent terrain rendering race condition
 * - Dynamic version support for MC 1.21.5+
 * - Animated textures, sky dome, weather, entity animations
 *
 * Runs during postinstall; failures are non-fatal.
 *
 * @author @darianrosebrook
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// ============================================================================
// File Mapping Configuration
// ============================================================================
// This is the single source of truth for all file copies.
// Each entry: { src: 'source file', dest: ['destination(s) relative to pvRoot'] }

const FILE_MAPPINGS = [
  // Entry point - POV toggle, orbit controls, asset loading, sky/weather
  { src: 'index.js', dest: ['lib/index.js'], description: 'Main entry point with POV toggle and custom assets' },

  // Server-side integration
  { src: 'mineflayer.js', dest: ['lib/mineflayer.js'], description: 'Server-side equipment/time events' },

  // Core rendering fixes
  { src: 'worldrenderer.js', dest: ['viewer/lib/worldrenderer.js'], description: 'Sync blockStates fix' },
  { src: 'version.js', dest: ['viewer/lib/version.js'], description: 'Dynamic version support' },

  // Entity system
  { src: 'entities.js', dest: ['viewer/lib/entities.js'], description: 'Skeletal animation manager' },
  { src: 'Entity.js', dest: ['viewer/lib/entity/Entity.js'], description: 'Bone storage for animations' },
  { src: 'equipment-renderer.js', dest: ['lib/equipment-renderer.js', 'viewer/lib/equipment-renderer.js'], description: 'Armor/item rendering' },
  { src: 'entity-extras.js', dest: ['lib/entity-extras.js', 'viewer/lib/entity-extras.js'], description: 'Name tags, capes, shadows' },

  // Visual enhancements
  { src: 'animated-material-client.js', dest: ['lib/animated-material-client.js'], description: 'Water/lava/fire animation shader' },
  { src: 'sky-renderer.js', dest: ['lib/sky-renderer.js'], description: 'Procedural sky dome' },
  { src: 'weather-system.js', dest: ['lib/weather-system.js'], description: 'Rain/snow particles' },

  // Build config override for worker bundle polyfills
  { src: 'webpack.config.js', dest: ['webpack.config.js'], description: 'Webpack config with polyfills for worker build' },
];

// ============================================================================
// Main Build Function
// ============================================================================

function run() {
  try {
    const pvRoot = path.dirname(
      require.resolve('prismarine-viewer/package.json')
    );
    const srcDir = path.join(__dirname, '..', 'src', 'prismarine-viewer-src');

    console.log('[rebuild-prismarine-viewer] Starting rebuild...');
    console.log(`[rebuild-prismarine-viewer] Source: ${srcDir}`);
    console.log(`[rebuild-prismarine-viewer] Target: ${pvRoot}`);

    // Track statistics
    let copiedCount = 0;
    let skippedCount = 0;

    // Copy all mapped files
    for (const mapping of FILE_MAPPINGS) {
      const srcPath = path.join(srcDir, mapping.src);

      if (!fs.existsSync(srcPath)) {
        console.warn(`[rebuild-prismarine-viewer] Missing source: ${mapping.src}`);
        skippedCount++;
        continue;
      }

      for (const dest of mapping.dest) {
        const destPath = path.join(pvRoot, dest);
        const destDir = path.dirname(destPath);

        // Ensure destination directory exists
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }

        fs.copyFileSync(srcPath, destPath);
        copiedCount++;
      }

      console.log(`[rebuild-prismarine-viewer] ✓ ${mapping.src} → ${mapping.dest.join(', ')}`);
    }

    console.log(`[rebuild-prismarine-viewer] Copied ${copiedCount} files, skipped ${skippedCount}`);

    // ========================================================================
    // Background Processes
    // ========================================================================

    // Generate textures for newer Minecraft versions (1.21.5-1.21.9)
    // This runs in background and doesn't block postinstall
    const generateTexturesPath = path.join(__dirname, 'generate-textures.cjs');
    if (fs.existsSync(generateTexturesPath)) {
      const child = spawn('node', [generateTexturesPath], {
        stdio: 'ignore',
        detached: true,
        cwd: path.join(__dirname, '..'),
      });
      child.unref();
      console.log('[rebuild-prismarine-viewer] Started background texture generation');
    }

    // Inject entity textures for versions not in minecraft-assets (1.21.9+)
    const injectEntityTexturesPath = path.join(__dirname, 'inject-entity-textures.cjs');
    const customSkinPath = path.join(process.env.HOME || '', 'Downloads', 'createdSkin.png');
    if (fs.existsSync(injectEntityTexturesPath)) {
      const injectArgs = ['1.21.9'];
      if (fs.existsSync(customSkinPath)) {
        injectArgs.push('--custom-skin', customSkinPath);
      }
      const injectChild = spawn('node', [injectEntityTexturesPath, ...injectArgs], {
        stdio: 'ignore',
        detached: true,
        cwd: path.join(__dirname, '..'),
      });
      injectChild.unref();
      console.log('[rebuild-prismarine-viewer] Started background entity texture injection');
    }

    // ========================================================================
    // Webpack Bundle Rebuild
    // ========================================================================

    const configPath = path.join(pvRoot, 'webpack.config.js');
    if (!fs.existsSync(configPath)) {
      console.log('[rebuild-prismarine-viewer] No webpack.config.js found, skipping bundle');
      return;
    }

    const webpack = require('webpack');
    process.chdir(pvRoot);
    const configs = require(configPath);

    // Build bundles (index.js + worker.js)
    const configsArray = Array.isArray(configs) ? configs : [configs];

    console.log('[rebuild-prismarine-viewer] Building webpack bundle...');

    webpack(configsArray, (err, stats) => {
      if (err) {
        console.warn('[rebuild-prismarine-viewer] webpack error:', err.message);
      } else if (stats && stats.hasErrors()) {
        const errors = stats.toJson().errors;
        console.warn('[rebuild-prismarine-viewer] webpack build errors:', errors.length);
        errors.slice(0, 3).forEach(e => console.warn('  -', e.message?.slice(0, 200)));
      } else {
        console.log('[rebuild-prismarine-viewer] ✓ Build complete!');
      }
    });
  } catch (error) {
    // Non-fatal - don't block pnpm install
    console.warn('[rebuild-prismarine-viewer] Error:', error.message);
    process.exitCode = 0;
  }
}

run();
