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
    const configs = require(configPath);
    webpack(Array.isArray(configs) ? configs : [configs], (err, stats) => {
      if (err || (stats && stats.hasErrors())) process.exitCode = 1;
    });
  } catch {
    // webpack not available or other error - skip
  }
}

run();
