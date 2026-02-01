#!/usr/bin/env node
/**
 * Rebuild prismarine-viewer client bundle after patch is applied.
 * Requires webpack. Runs silently; failures are non-fatal.
 * @author @darianrosebrook
 */

const path = require('path');
const fs = require('fs');

function run() {
  try {
    const webpack = require('webpack');
    const pvRoot = path.dirname(
      require.resolve('prismarine-viewer/package.json')
    );
    const configPath = path.join(pvRoot, 'webpack.config.js');
    if (!fs.existsSync(configPath)) return;
    process.chdir(pvRoot);
    const configs = require(configPath);
    const indexConfig = Array.isArray(configs) ? configs[0] : configs;
    webpack(indexConfig, () => {});
  } catch {
    process.exitCode = 0;
  }
}

run();
