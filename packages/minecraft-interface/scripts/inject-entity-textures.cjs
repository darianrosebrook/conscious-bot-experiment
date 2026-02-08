#!/usr/bin/env node
/**
 * Inject entity textures from Minecraft JAR into the viewer.
 *
 * This script extracts entity textures (player skins, mobs, etc.) from the
 * Minecraft JAR and copies them to the viewer's public folder.
 *
 * For versions not supported by minecraft-assets (e.g., 1.21.9), this uses
 * our asset-extractor pipeline to pull textures directly from the JAR.
 *
 * Also supports injecting a custom skin to replace steve.png.
 *
 * Usage:
 *   node scripts/inject-entity-textures.cjs [version] [--custom-skin path/to/skin.png]
 *
 * Examples:
 *   node scripts/inject-entity-textures.cjs 1.21.9
 *   node scripts/inject-entity-textures.cjs 1.21.9 --custom-skin ~/Downloads/createdSkin.png
 *
 * @author @darianrosebrook
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

// Parse command line arguments
const args = process.argv.slice(2);
const versionArg = args.find((a) => !a.startsWith('--'));
const customSkinIndex = args.indexOf('--custom-skin');
const customSkinPath = customSkinIndex !== -1 ? args[customSkinIndex + 1] : null;

const VERSION = versionArg || '1.21.9';
const JAR_CACHE_DIR = path.join(os.homedir(), '.minecraft-assets-cache', 'jars');
const EXTRACTED_CACHE_DIR = path.join(os.homedir(), '.minecraft-assets-cache', 'extracted');

async function main() {
  console.log(`[inject-entity-textures] Injecting entity textures for ${VERSION}...`);

  // Resolve internalized viewer directory
  const pvRoot = path.resolve(__dirname, '..', 'src', 'viewer');
  if (!fs.existsSync(path.join(pvRoot, 'public'))) {
    console.error('[inject-entity-textures] Error: viewer public dir not found at', path.join(pvRoot, 'public'));
    process.exit(1);
  }

  const pvTexturesDir = path.join(pvRoot, 'public', 'textures', VERSION);
  const pvEntityDir = path.join(pvTexturesDir, 'entity');

  // Check if entity textures already exist for this version
  if (fs.existsSync(pvEntityDir)) {
    const playerDir = path.join(pvEntityDir, 'player');
    if (fs.existsSync(playerDir)) {
      console.log(`[inject-entity-textures] Entity textures already exist for ${VERSION}`);

      // Still inject custom skin if provided
      if (customSkinPath) {
        await injectCustomSkin(pvEntityDir, customSkinPath);
      }
      return;
    }
  }

  // Check if JAR exists
  const jarPath = path.join(JAR_CACHE_DIR, `${VERSION}.jar`);
  if (!fs.existsSync(jarPath)) {
    console.log(`[inject-entity-textures] JAR not found at ${jarPath}`);
    console.log('[inject-entity-textures] Attempting to download...');

    // Try to download the JAR using our pipeline
    try {
      await downloadJar(VERSION, jarPath);
    } catch (err) {
      console.error(`[inject-entity-textures] Failed to download JAR: ${err.message}`);
      process.exit(1);
    }
  }

  // Extract entity textures from JAR
  console.log(`[inject-entity-textures] Extracting entity textures from ${jarPath}...`);

  const extractedEntityDir = path.join(EXTRACTED_CACHE_DIR, VERSION, 'entity');

  // Check if already extracted
  if (!fs.existsSync(extractedEntityDir)) {
    await extractEntityTextures(jarPath, VERSION);
  }

  // Copy to viewer public directory
  console.log(`[inject-entity-textures] Copying to ${pvEntityDir}...`);
  fs.mkdirSync(pvEntityDir, { recursive: true });
  copyRecursive(extractedEntityDir, pvEntityDir);

  // Count what was copied
  const entityCount = countFiles(pvEntityDir, '.png');
  console.log(`[inject-entity-textures] Copied ${entityCount} entity textures`);

  // Inject custom skin if provided
  if (customSkinPath) {
    await injectCustomSkin(pvEntityDir, customSkinPath);
  }

  console.log('[inject-entity-textures] Done!');
}

/**
 * Download the Minecraft JAR for a version.
 */
async function downloadJar(version, destPath) {
  // Use dynamic import for ES modules
  const { getVersionResolver } = await import('../dist/asset-pipeline/version-resolver.js');
  const { getJarDownloader } = await import('../dist/asset-pipeline/jar-downloader.js');

  const resolver = getVersionResolver();
  const downloader = getJarDownloader();

  console.log(`[inject-entity-textures] Resolving version ${version}...`);
  const resolved = await resolver.resolve(version);

  console.log(`[inject-entity-textures] Downloading JAR (${Math.round(resolved.clientJarSize / 1024 / 1024)}MB)...`);
  await downloader.download(resolved, {
    onProgress: (downloaded, total) => {
      const pct = Math.round((downloaded / total) * 100);
      process.stdout.write(`\r[inject-entity-textures] Downloading... ${pct}%`);
    },
  });
  console.log('');
}

/**
 * Extract entity textures from a JAR file.
 */
async function extractEntityTextures(jarPath, version) {
  const yauzl = require('yauzl');

  const outputDir = path.join(EXTRACTED_CACHE_DIR, version, 'entity');
  fs.mkdirSync(outputDir, { recursive: true });

  const ENTITY_PREFIX = 'assets/minecraft/textures/entity/';

  await new Promise((resolve, reject) => {
    yauzl.open(jarPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err);

      let extractedCount = 0;

      zipfile.on('error', reject);
      zipfile.on('end', () => {
        console.log(`[inject-entity-textures] Extracted ${extractedCount} entity textures`);
        resolve();
      });

      zipfile.on('entry', (entry) => {
        const entryPath = entry.fileName;

        // Skip directories and non-entity textures
        if (entryPath.endsWith('/') || !entryPath.startsWith(ENTITY_PREFIX) || !entryPath.endsWith('.png')) {
          zipfile.readEntry();
          return;
        }

        // Extract relative path
        const relativePath = entryPath.substring(ENTITY_PREFIX.length);
        const destFilePath = path.join(outputDir, relativePath);

        zipfile.openReadStream(entry, (err, readStream) => {
          if (err) {
            zipfile.readEntry();
            return;
          }

          // Ensure directory exists
          fs.mkdirSync(path.dirname(destFilePath), { recursive: true });

          const writeStream = fs.createWriteStream(destFilePath);
          readStream.pipe(writeStream);

          writeStream.on('finish', () => {
            extractedCount++;
            zipfile.readEntry();
          });

          writeStream.on('error', () => {
            zipfile.readEntry();
          });
        });
      });

      zipfile.readEntry();
    });
  });
}

/**
 * Inject a custom skin to replace steve.png.
 * Also copies to fallback versions (1.16.4) that prismarine-viewer may use.
 */
async function injectCustomSkin(entityDir, skinPath) {
  if (!fs.existsSync(skinPath)) {
    console.error(`[inject-entity-textures] Custom skin not found: ${skinPath}`);
    return;
  }

  console.log(`[inject-entity-textures] Injecting custom skin from ${skinPath}...`);

  // Copy to both wide and slim variants for the target version
  const targets = [
    path.join(entityDir, 'player', 'wide', 'steve.png'),
    path.join(entityDir, 'player', 'slim', 'steve.png'),
  ];

  for (const target of targets) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(skinPath, target);
    console.log(`[inject-entity-textures]   -> ${path.relative(entityDir, target)}`);
  }

  // Also copy to fallback versions the viewer may use for entity textures
  // (the viewer often falls back to older versions like 1.16.4 for entity paths)
  const viewerRoot = path.resolve(__dirname, '..', 'src', 'viewer');

  const fallbackVersions = ['1.16.4', '1.17.1', '1.18.1', '1.19', '1.20.1'];
  for (const fallbackVersion of fallbackVersions) {
    const fallbackEntityDir = path.join(viewerRoot, 'public', 'textures', fallbackVersion, 'entity');
    if (fs.existsSync(fallbackEntityDir)) {
      // Older versions use entity/steve.png directly
      const oldStyleTarget = path.join(fallbackEntityDir, 'steve.png');
      if (fs.existsSync(oldStyleTarget)) {
        fs.copyFileSync(skinPath, oldStyleTarget);
        console.log(`[inject-entity-textures]   -> (fallback) ${fallbackVersion}/entity/steve.png`);
      }
      // Newer versions use entity/player/wide/steve.png
      const newStyleTarget = path.join(fallbackEntityDir, 'player', 'wide', 'steve.png');
      if (fs.existsSync(path.dirname(newStyleTarget))) {
        fs.copyFileSync(skinPath, newStyleTarget);
        console.log(`[inject-entity-textures]   -> (fallback) ${fallbackVersion}/entity/player/wide/steve.png`);
      }
    }
  }
}

/**
 * Recursively copy a directory.
 */
function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;

  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

/**
 * Count files with a specific extension in a directory.
 */
function countFiles(dir, ext) {
  let count = 0;
  if (!fs.existsSync(dir)) return 0;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      count += countFiles(path.join(dir, entry.name), ext);
    } else if (entry.name.endsWith(ext)) {
      count++;
    }
  }
  return count;
}

main().catch((err) => {
  console.error('[inject-entity-textures] Fatal error:', err);
  process.exit(1);
});
