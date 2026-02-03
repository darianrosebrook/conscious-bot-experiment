#!/usr/bin/env npx tsx
/**
 * Minecraft Asset Pipeline CLI
 *
 * Extracts textures and blockStates directly from Minecraft JARs,
 * eliminating dependency on upstream `minecraft-assets` package updates.
 *
 * Usage:
 *   pnpm mc:assets extract 1.21.9      # Generate for specific version
 *   pnpm mc:assets extract --latest    # Generate for latest release
 *   pnpm mc:assets list                # Show cached versions
 *   pnpm mc:assets clean               # Clear all cache
 *   pnpm mc:assets clean 1.21.9        # Clear specific version
 *   pnpm mc:assets inject 1.21.9       # Inject into prismarine-viewer
 *
 * @author @darianrosebrook
 */

import * as path from 'path';
import { AssetPipeline, PipelineProgress } from '../src/asset-pipeline/pipeline.js';

const COMMANDS = ['extract', 'list', 'clean', 'inject', 'help'] as const;
type Command = typeof COMMANDS[number];

function printHelp(): void {
  console.log(`
Minecraft Asset Pipeline CLI

Usage: pnpm mc:assets <command> [options]

Commands:
  extract <version>    Generate assets for a Minecraft version
                       Use --latest for the latest release
                       Use --force to regenerate even if cached
                       Use --snapshot for latest snapshot

  list                 List all cached/generated versions

  clean [version]      Clear cache for specific version or all

  inject <version>     Inject generated assets into prismarine-viewer

  help                 Show this help message

Examples:
  pnpm mc:assets extract 1.21.9
  pnpm mc:assets extract --latest
  pnpm mc:assets extract 1.21.9 --force
  pnpm mc:assets list
  pnpm mc:assets clean 1.21.8
  pnpm mc:assets inject 1.21.9
`);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(date: Date): string {
  return date.toLocaleString();
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] as Command;

  if (!command || command === 'help' || args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  if (!COMMANDS.includes(command)) {
    console.error(`Unknown command: ${command}`);
    console.error(`Available commands: ${COMMANDS.join(', ')}`);
    process.exit(1);
  }

  const pipeline = new AssetPipeline();

  switch (command) {
    case 'extract':
      await runExtract(pipeline, args.slice(1));
      break;
    case 'list':
      await runList(pipeline);
      break;
    case 'clean':
      await runClean(pipeline, args.slice(1));
      break;
    case 'inject':
      await runInject(pipeline, args.slice(1));
      break;
  }
}

async function runExtract(pipeline: AssetPipeline, args: string[]): Promise<void> {
  const force = args.includes('--force') || args.includes('-f');
  const useLatest = args.includes('--latest');
  const useSnapshot = args.includes('--snapshot');

  // Get version from args (first non-flag argument)
  let version = args.find((a) => !a.startsWith('-'));

  if (useLatest) {
    version = 'latest';
  } else if (useSnapshot) {
    version = await pipeline.getVersionResolver().getLatestSnapshot();
    console.log(`Latest snapshot: ${version}`);
  }

  if (!version) {
    console.error('Error: Please specify a version or use --latest');
    console.error('Usage: pnpm mc:assets extract <version>');
    process.exit(1);
  }

  console.log(`\n🎮 Minecraft Asset Pipeline`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Version: ${version}`);
  console.log(`Force: ${force}`);
  console.log('');

  const startTime = Date.now();
  let lastStage = '';

  try {
    const result = await pipeline.generate(version, {
      force,
      onProgress: (progress: PipelineProgress) => {
        if (progress.stage !== lastStage) {
          if (lastStage) console.log(''); // Newline after progress
          lastStage = progress.stage;
          const emoji = getStageEmoji(progress.stage);
          process.stdout.write(`${emoji} ${progress.message}`);
        } else if (progress.progress !== undefined) {
          process.stdout.write(`\r${getStageEmoji(progress.stage)} ${progress.message}`);
        }
      },
    });

    console.log('\n');

    if (result.fromCache) {
      console.log(`✨ Assets already cached for ${result.version}`);
    } else {
      console.log(`✅ Successfully generated assets for ${result.version}`);
    }

    console.log('');
    console.log(`📊 Summary:`);
    console.log(`   Version:      ${result.version}`);
    console.log(`   Atlas Size:   ${result.atlasInfo.width}x${result.atlasInfo.height}`);
    console.log(`   Textures:     ${result.atlasInfo.textureCount}`);
    console.log(`   Time:         ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    console.log('');
    console.log(`📁 Output:`);
    console.log(`   Texture:      ${result.texturePath}`);
    console.log(`   BlockStates:  ${result.blockStatesPath}`);
    console.log('');
  } catch (error) {
    console.error('\n');
    console.error(`❌ Failed to generate assets: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

function getStageEmoji(stage: string): string {
  switch (stage) {
    case 'resolving':
      return '🔍';
    case 'downloading':
      return '📥';
    case 'extracting':
      return '📦';
    case 'building-atlas':
      return '🎨';
    case 'building-blockstates':
      return '🔧';
    case 'saving':
      return '💾';
    default:
      return '⏳';
  }
}

async function runList(pipeline: AssetPipeline): Promise<void> {
  console.log('\n📦 Cached Minecraft Assets');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const cached = await pipeline.listCached();

  if (cached.length === 0) {
    console.log('\nNo cached assets found.');
    console.log('Run `pnpm mc:assets extract <version>` to generate assets.');
    return;
  }

  console.log('');
  console.log('Version     Generated              Size');
  console.log('─────────── ────────────────────── ────────');

  for (const info of cached) {
    console.log(
      `${info.version.padEnd(11)} ${formatDate(info.generatedAt).padEnd(22)} ${formatBytes(info.size)}`
    );
  }

  console.log('');
  console.log(`Total: ${cached.length} version(s)`);
}

async function runClean(pipeline: AssetPipeline, args: string[]): Promise<void> {
  const version = args.find((a) => !a.startsWith('-'));

  if (version) {
    console.log(`\n🗑️  Clearing cache for version ${version}...`);
    await pipeline.clearCache(version);
    console.log(`✅ Cleared cache for ${version}`);
  } else {
    console.log('\n🗑️  Clearing all cached assets...');
    await pipeline.clearCache();
    console.log('✅ All cached assets cleared');
  }
}

async function runInject(pipeline: AssetPipeline, args: string[]): Promise<void> {
  const version = args.find((a) => !a.startsWith('-'));

  if (!version) {
    console.error('Error: Please specify a version to inject');
    console.error('Usage: pnpm mc:assets inject <version>');
    process.exit(1);
  }

  // Find prismarine-viewer's public directory using import.meta.resolve (ESM)
  let pvPublicDir: string;
  try {
    // In ESM, we need to use import.meta.resolve or find the package manually
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    const pvPackagePath = require.resolve('prismarine-viewer/package.json');
    pvPublicDir = path.join(path.dirname(pvPackagePath), 'public');
  } catch {
    console.error('Error: Could not find prismarine-viewer installation');
    process.exit(1);
  }

  console.log(`\n💉 Injecting assets for ${version} into prismarine-viewer...`);

  try {
    await pipeline.injectIntoViewer(version, pvPublicDir);
    console.log(`✅ Assets injected successfully`);
    console.log(`   Texture:      ${path.join(pvPublicDir, 'textures', `${version}.png`)}`);
    console.log(`   BlockStates:  ${path.join(pvPublicDir, 'blocksStates', `${version}.json`)}`);
  } catch (error) {
    console.error(`❌ Failed to inject assets: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
