#!/usr/bin/env node
/**
 * Standalone Microsoft auth for Minecraft.
 *
 * Usage:
 *   pnpm auth              # Microsoft auth (for online servers)
 *   pnpm auth --offline    # Skip auth, use offline mode
 */

import pkg from 'prismarine-auth';
const { Authflow, Titles } = pkg;
import path from 'path';
import os from 'os';
import fs from 'fs';

const CACHE_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'minecraft', 'nmp-cache');
const USERNAME = process.env.MC_USERNAME || 'BotSterling';

if (process.argv.includes('--offline')) {
  console.log('Offline mode selected.');
  console.log('Set MINECRAFT_AUTH=offline in .env or run:');
  console.log('  MINECRAFT_AUTH=offline pnpm start --debug --capture-logs=420 --skip-install --skip-build');
  process.exit(0);
}

async function main() {
  console.log('Minecraft Authentication');
  console.log('========================');
  console.log(`Cache dir: ${CACHE_DIR}`);
  console.log(`Username: ${USERNAME}`);
  console.log('');

  // Ensure cache directory exists
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  // Clear any stale cache files to force a fresh device code
  const cacheFiles = fs.readdirSync(CACHE_DIR).filter(f => f.endsWith('.json'));
  if (cacheFiles.length > 0) {
    console.log(`Clearing ${cacheFiles.length} stale cache files...`);
    for (const f of cacheFiles) {
      fs.unlinkSync(path.join(CACHE_DIR, f));
    }
    console.log('Cache cleared.\n');
  }

  let deviceCode = null;
  const flow = new Authflow(USERNAME, CACHE_DIR, {
    authTitle: Titles.MinecraftNintendoSwitch,
    deviceType: 'Nintendo',
    flow: 'live',
  }, (resp) => {
    deviceCode = resp.user_code;
    console.log('');
    console.log('========================================');
    console.log(`  Open: https://www.microsoft.com/link`);
    console.log(`  Code: ${resp.user_code}`);
    console.log('========================================');
    console.log('');
    console.log('Enter the code above, sign in with your Microsoft account,');
    console.log('then wait here. Do NOT close this terminal.');
    console.log('');
  });

  try {
    const result = await flow.getMinecraftJavaToken({ fetchProfile: true });

    console.log('');
    console.log('Authentication successful!');
    console.log(`  Profile: ${result.profile?.name || 'unknown'}`);
    console.log(`  Token cached at: ${CACHE_DIR}`);
    console.log('');
    console.log('Start the bot:');
    console.log('  pnpm start --debug --capture-logs=420 --skip-install --skip-build');
  } catch (err) {
    const msg = err.message || String(err);
    console.error('');
    console.error('Authentication failed.');
    console.error('');

    if (msg.includes('invalid_grant')) {
      console.error('Microsoft rejected the token exchange. Common causes:');
      console.error('  - The Microsoft account may not own Minecraft Java Edition');
      console.error('  - Too many recent auth attempts (rate limited) — wait 5 minutes');
      console.error('  - Microsoft auth service is temporarily unavailable');
      console.error('');
      console.error('If this persists, try offline mode for local Docker servers:');
      console.error('  MINECRAFT_AUTH=offline pnpm start --debug --capture-logs=420 --skip-install --skip-build');
    } else if (msg.includes('does the account own minecraft')) {
      console.error('The Microsoft account does not own Minecraft Java Edition.');
      console.error('Purchase at: https://www.minecraft.net/en-us/store/minecraft-java-bedrock-edition-pc');
    } else {
      console.error('Error:', msg);
    }

    console.error('');
    process.exit(1);
  }
}

main();
