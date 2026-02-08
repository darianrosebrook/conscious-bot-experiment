#!/usr/bin/env node
/**
 * Capture screenshots from the prismarine viewer for visual testing.
 * Usage: node scripts/capture-viewer.mjs [--url http://localhost:3006] [--output screenshot.png] [--delay 5000]
 */
import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

function getArg(name, defaultVal) {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultVal;
}

const url = getArg('--url', 'http://localhost:3006');
const output = getArg('--output', path.join(__dirname, '..', 'viewer-screenshot.png'));
const delay = parseInt(getArg('--delay', '5000'), 10);

async function main() {
  console.log(`Capturing viewer at ${url} (waiting ${delay}ms for render)...`);

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-webgl',
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  try {
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
  } catch (err) {
    console.warn(`Page load warning: ${err.message}`);
  }

  // Wait for rendering
  await new Promise(r => setTimeout(r, delay));

  await page.screenshot({ path: output, fullPage: false });
  console.log(`Screenshot saved to: ${output}`);

  await browser.close();
}

main().catch(err => {
  console.error('Capture failed:', err.message);
  process.exit(1);
});
