#!/usr/bin/env node
/**
 * Verify prismarine-viewer customizations are properly installed.
 *
 * This script checks that all patched files are in place and contain
 * our customizations. Run after `pnpm install` to verify the setup.
 *
 * Usage: node scripts/verify-viewer-setup.cjs
 *
 * @author @darianrosebrook
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// Configuration
// ============================================================================

// Files that should be patched (contain our signature)
const PATCHED_FILES = [
  { path: 'lib/index.js', signature: '@darianrosebrook', description: 'Main entry with POV toggle' },
  { path: 'lib/mineflayer.js', signature: '@darianrosebrook', description: 'Server-side events' },
  { path: 'viewer/lib/worldrenderer.js', signature: '@darianrosebrook', description: 'Sync blockStates' },
  { path: 'viewer/lib/version.js', signature: 'registerDynamicVersion', description: 'Dynamic version support' },
  { path: 'viewer/lib/entities.js', signature: 'updateAnimations', description: 'Skeletal animation' },
  { path: 'viewer/lib/entity/Entity.js', signature: 'bonesByName', description: 'Bone storage' },
];

// Enhancement files that should exist
const ENHANCEMENT_FILES = [
  { path: 'lib/animated-material-client.js', description: 'Water/lava/fire shader' },
  { path: 'lib/equipment-renderer.js', description: 'Armor rendering' },
  { path: 'lib/sky-renderer.js', description: 'Procedural sky' },
  { path: 'lib/weather-system.js', description: 'Rain/snow particles' },
  { path: 'lib/entity-extras.js', description: 'Name tags, capes, shadows' },
  { path: 'viewer/lib/equipment-renderer.js', description: 'Armor rendering (viewer)' },
  { path: 'viewer/lib/entity-extras.js', description: 'Entity extras (viewer)' },
];

// ============================================================================
// Verification Logic
// ============================================================================

function findPrismarineViewer() {
  try {
    const pkgPath = require.resolve('prismarine-viewer/package.json');
    return path.dirname(pkgPath);
  } catch {
    return null;
  }
}

function checkFile(pvRoot, filePath, signature = null) {
  const fullPath = path.join(pvRoot, filePath);

  if (!fs.existsSync(fullPath)) {
    return { exists: false, patched: false };
  }

  if (!signature) {
    return { exists: true, patched: true }; // No signature check needed
  }

  const content = fs.readFileSync(fullPath, 'utf8');
  const patched = content.includes(signature);

  return { exists: true, patched };
}

function verify() {
  console.log('🔍 Verifying prismarine-viewer customizations...\n');

  const pvRoot = findPrismarineViewer();

  if (!pvRoot) {
    console.error('❌ prismarine-viewer not found in node_modules');
    console.error('   Run: pnpm install');
    process.exit(1);
  }

  console.log(`📁 Found prismarine-viewer at: ${pvRoot}\n`);

  let allOk = true;
  let patchedCount = 0;
  let missingCount = 0;
  let unpatchedCount = 0;

  // Check patched files
  console.log('Checking patched files:');
  for (const file of PATCHED_FILES) {
    const result = checkFile(pvRoot, file.path, file.signature);

    if (!result.exists) {
      console.log(`  ❌ ${file.path} — MISSING`);
      missingCount++;
      allOk = false;
    } else if (!result.patched) {
      console.log(`  ⚠️  ${file.path} — exists but NOT PATCHED (${file.description})`);
      unpatchedCount++;
      allOk = false;
    } else {
      console.log(`  ✅ ${file.path} — ${file.description}`);
      patchedCount++;
    }
  }

  console.log('\nChecking enhancement files:');
  for (const file of ENHANCEMENT_FILES) {
    const result = checkFile(pvRoot, file.path);

    if (!result.exists) {
      console.log(`  ❌ ${file.path} — MISSING`);
      missingCount++;
      allOk = false;
    } else {
      console.log(`  ✅ ${file.path} — ${file.description}`);
      patchedCount++;
    }
  }

  // Summary
  console.log('\n' + '─'.repeat(60));

  if (allOk) {
    console.log(`\n✅ All ${patchedCount} files verified successfully!`);
    console.log('\nThe prismarine-viewer customizations are properly installed.');
    console.log('Terrain rendering should work correctly.');
  } else {
    console.log(`\n❌ Verification failed:`);
    console.log(`   - ${patchedCount} files OK`);
    if (missingCount > 0) console.log(`   - ${missingCount} files MISSING`);
    if (unpatchedCount > 0) console.log(`   - ${unpatchedCount} files NOT PATCHED`);

    console.log('\nTo fix, run:');
    console.log('  node packages/minecraft-interface/scripts/rebuild-prismarine-viewer.cjs');
    console.log('\nOr reinstall:');
    console.log('  pnpm install --force');

    process.exit(1);
  }

  // Additional checks
  console.log('\n' + '─'.repeat(60));
  console.log('\nAdditional checks:');

  // Check webpack bundle
  const bundlePath = path.join(pvRoot, 'public', 'index.js');
  if (fs.existsSync(bundlePath)) {
    const bundleContent = fs.readFileSync(bundlePath, 'utf8');
    const bundleSize = Math.round(fs.statSync(bundlePath).size / 1024);

    // Check if our code is in the bundle (log messages survive minification)
    if (bundleContent.includes('Workers ready') || bundleContent.includes('blockStates should be in workers')) {
      console.log(`  ✅ Webpack bundle includes our customizations (${bundleSize}KB)`);
    } else {
      console.log(`  ⚠️  Webpack bundle may be outdated (${bundleSize}KB)`);
      console.log('     Consider running rebuild-prismarine-viewer.cjs');
    }
  } else {
    console.log('  ⚠️  Webpack bundle not found - viewer may not work in browser');
  }

  // Check version support
  try {
    const versionPath = path.join(pvRoot, 'viewer', 'lib', 'version.js');
    const versionContent = fs.readFileSync(versionPath, 'utf8');

    const supportedVersions = [];
    const match = versionContent.match(/supportedVersions\s*=\s*\[([\s\S]*?)\]/);
    if (match) {
      const versions = match[1].match(/'[\d.]+'/g);
      if (versions) {
        supportedVersions.push(...versions.map(v => v.replace(/'/g, '')));
      }
    }

    const latestSupported = supportedVersions[supportedVersions.length - 1];
    console.log(`  ✅ Version support: ${supportedVersions.length} versions (latest: ${latestSupported})`);

    if (supportedVersions.includes('1.21.9')) {
      console.log('  ✅ MC 1.21.9 support confirmed');
    } else {
      console.log('  ⚠️  MC 1.21.9 not in version list');
    }
  } catch (err) {
    console.log(`  ⚠️  Could not check version support: ${err.message}`);
  }
}

verify();
