#!/usr/bin/env node
/**
 * Standalone CLI for extracting Bedrock entity models.
 *
 * Downloads the Mojang/bedrock-samples repository, extracts entity geometry,
 * animations, and definitions, then transforms them into our entities.json format.
 *
 * Usage:
 *   pnpm --filter minecraft-interface run extract-entities
 *   pnpm --filter minecraft-interface run extract-entities -- --force
 *   pnpm --filter minecraft-interface run extract-entities -- --output path/to/entities.json
 *
 * @module asset-pipeline/extract-bedrock-entities
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { BedrockEntityExtractor } from './bedrock-entity-extractor.js';
import { BedrockEntityTransformer } from './bedrock-entity-transformer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const quiet = args.includes('--quiet');

  // Parse --output flag
  const outputIdx = args.indexOf('--output');
  const outputPath = outputIdx !== -1 && args[outputIdx + 1]
    ? path.resolve(args[outputIdx + 1])
    : path.resolve(__dirname, '../viewer/entities/entities.json');

  if (!quiet) {
    console.log('[extract-entities] Bedrock Entity Model Extractor');
    console.log(`[extract-entities] Output: ${outputPath}`);
  }

  // Step 1: Download and extract
  const extractor = new BedrockEntityExtractor();

  if (force) {
    if (!quiet) console.log('[extract-entities] Clearing cache (--force)...');
    await extractor.clearCache();
  }

  if (!quiet) console.log('[extract-entities] Downloading bedrock-samples...');

  const result = await extractor.extract((downloaded, total) => {
    if (!quiet) {
      const pct = Math.round((downloaded / total) * 100);
      const dlMB = (downloaded / 1024 / 1024).toFixed(1);
      const totalMB = (total / 1024 / 1024).toFixed(1);
      process.stdout.write(
        `\r[extract-entities] Downloading: ${dlMB}MB / ${totalMB}MB (${pct}%)`
      );
    }
  });

  if (!quiet) {
    if (result.fromCache) {
      console.log('\n[extract-entities] Using cached bedrock-samples ZIP');
    } else {
      console.log('\n[extract-entities] Download complete');
    }
  }

  // Step 2: Transform into our format
  if (!quiet) console.log('[extract-entities] Transforming entity data...');

  const transformer = new BedrockEntityTransformer({ verbose: !quiet });
  const entities = transformer.transform(result);

  // Step 3: Write output
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

  const json = JSON.stringify(entities, null, 2);
  await fs.promises.writeFile(outputPath, json);

  if (!quiet) {
    const entityCount = Object.keys(entities).length;
    const sizeKB = (Buffer.byteLength(json) / 1024).toFixed(0);
    console.log(
      `[extract-entities] Wrote ${entityCount} entities to ${outputPath} (${sizeKB}KB)`
    );
  }

  // Step 4: Summary
  if (!quiet) {
    const names = Object.keys(entities).sort();
    console.log(`[extract-entities] Entities: ${names.join(', ')}`);
  }
}

main().catch((err) => {
  console.error('[extract-entities] Fatal error:', err);
  process.exit(1);
});
