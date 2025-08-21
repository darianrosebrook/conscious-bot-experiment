#!/usr/bin/env node
/**
 * Simple Build Script
 *
 * Builds only the simple Minecraft interface without planning system dependencies.
 *
 * @author @darianrosebrook
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔨 Building simple Minecraft interface...');

// Create a temporary tsconfig for simple build
const simpleTsConfig = {
  compilerOptions: {
    target: 'ES2020',
    module: 'commonjs',
    lib: ['ES2020'],
    outDir: './dist-simple',
    rootDir: './src',
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    forceConsistentCasingInFileNames: true,
    declaration: true,
    declarationMap: true,
    sourceMap: true,
    resolveJsonModule: true,
  },
  include: ['src/standalone-simple.ts', 'src/simulation-stub.ts'],
  exclude: ['node_modules', 'dist', '**/*.test.ts'],
};

// Write temporary tsconfig
fs.writeFileSync(
  'tsconfig.simple.json',
  JSON.stringify(simpleTsConfig, null, 2)
);

try {
  // Build simple interface
  execSync('npx tsc -p tsconfig.simple.json', { stdio: 'inherit' });

  // Build CLI script
  if (fs.existsSync('bin/mc-simple.ts')) {
    execSync(
      'npx tsc bin/mc-simple.ts --outDir dist-simple --target ES2020 --module commonjs --esModuleInterop --skipLibCheck',
      { stdio: 'inherit' }
    );
  }

  // Build simulation CLI script
  if (fs.existsSync('bin/mc-sim.ts')) {
    execSync(
      'npx tsc bin/mc-sim.ts --outDir dist-simple --target ES2020 --module commonjs --esModuleInterop --skipLibCheck',
      { stdio: 'inherit' }
    );
  }

  // Create package.json for simple build
  const simplePackageJson = {
    name: '@conscious-bot/minecraft-interface-simple',
    version: '0.1.0',
    description: 'Simple Minecraft interface without planning dependencies',
    main: 'dist-simple/standalone-simple.js',
    types: 'dist-simple/standalone-simple.d.ts',
    bin: {
      'mc-simple': 'dist-simple/bin/mc-simple.js',
      'mc-sim': 'dist-simple/bin/mc-sim.js',
    },
    scripts: {
      start: 'node dist-simple/bin/mc-simple.js',
      connect: 'node dist-simple/bin/mc-simple.js --action=connect',
      move: 'node dist-simple/bin/mc-simple.js --action=move',
      turn: 'node dist-simple/bin/mc-simple.js --action=turn',
      jump: 'node dist-simple/bin/mc-simple.js --action=jump',
      chat: 'node dist-simple/bin/mc-simple.js --action=chat',
      sim: 'node dist-simple/bin/mc-sim.js',
      'sim:demo': 'node dist-simple/bin/mc-sim.js --action=demo',
      'sim:connect': 'node dist-simple/bin/mc-sim.js --action=connect',
    },
    dependencies: {
      mineflayer: '^4.17.0',
      'mineflayer-pathfinder': '^2.4.1',
      vec3: '^0.1.8',
    },
    keywords: ['minecraft', 'bot', 'mineflayer', 'simple'],
    author: '@darianrosebrook',
    license: 'MIT',
  };

  fs.writeFileSync(
    'package-simple.json',
    JSON.stringify(simplePackageJson, null, 2)
  );

  console.log('✅ Simple build completed successfully!');
  console.log('📁 Output directory: dist-simple/');
  console.log('📦 Package file: package-simple.json');
  console.log('');
  console.log('🚀 Usage:');
  console.log('  node dist-simple/bin/mc-simple.js --help');
  console.log('  node dist-simple/bin/mc-simple.js --action=connect');
  console.log('  node dist-simple/bin/mc-simple.js --action=move');
  console.log('  node dist-simple/bin/mc-sim.js --help');
  console.log('  node dist-simple/bin/mc-sim.js --action=demo');
} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
} finally {
  // Clean up temporary tsconfig
  if (fs.existsSync('tsconfig.simple.json')) {
    fs.unlinkSync('tsconfig.simple.json');
  }
}
