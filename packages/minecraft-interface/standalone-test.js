#!/usr/bin/env node
/**
 * Standalone Minecraft Interface Test
 *
 * Simple test that validates basic Minecraft interface components
 * without requiring full planning system integration.
 */

const path = require('path');

console.log(' Standalone Minecraft Interface Test');
console.log('======================================');
console.log();

// Test 1: Check if TypeScript files exist
console.log(' Checking TypeScript files...');
const fs = require('fs');

const requiredFiles = [
  'src/types.ts',
  'src/bot-adapter.ts',
  'src/observation-mapper.ts',
  'src/action-translator.ts',
  'src/plan-executor.ts',
  'src/index.ts',
  'bin/mc-smoke.ts',
];

let allFilesExist = true;
requiredFiles.forEach((file) => {
  if (fs.existsSync(file)) {
    console.log(`    ${file}`);
  } else {
    console.log(`    ${file} - MISSING`);
    allFilesExist = false;
  }
});

console.log();

// Test 2: Check package.json structure
console.log(' Checking package.json configuration...');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

const requiredDeps = ['mineflayer', 'mineflayer-pathfinder', 'vec3', 'js-yaml'];
const requiredDevDeps = ['@types/js-yaml', '@types/node', 'jest', 'typescript'];

console.log('   Dependencies:');
requiredDeps.forEach((dep) => {
  if (packageJson.dependencies && packageJson.dependencies[dep]) {
    console.log(`      ${dep}: ${packageJson.dependencies[dep]}`);
  } else {
    console.log(`      ${dep} - MISSING`);
    allFilesExist = false;
  }
});

console.log('   Dev Dependencies:');
requiredDevDeps.forEach((dep) => {
  if (packageJson.devDependencies && packageJson.devDependencies[dep]) {
    console.log(`      ${dep}: ${packageJson.devDependencies[dep]}`);
  } else {
    console.log(`      ${dep} - MISSING`);
    allFilesExist = false;
  }
});

console.log();

// Test 3: Check scenario files
console.log(' Checking scenario definitions...');
const scenarioFiles = [
  'scenarios/navigate.yaml',
  'scenarios/gather-wood.yaml',
  'scenarios/craft-planks.yaml',
];

scenarioFiles.forEach((file) => {
  if (fs.existsSync(file)) {
    console.log(`    ${file}`);
  } else {
    console.log(`    ${file} - MISSING`);
    allFilesExist = false;
  }
});

console.log();

// Test 4: Basic mineflayer import test
console.log(' Testing basic mineflayer imports...');
try {
  const mineflayer = require('mineflayer');
  const pathfinder = require('mineflayer-pathfinder');
  const Vec3 = require('vec3');
  console.log('    mineflayer');
  console.log('    mineflayer-pathfinder');
  console.log('    vec3');
} catch (error) {
  console.log(`    Import error: ${error.message}`);
  allFilesExist = false;
}

console.log();

// Summary
console.log(' Test Summary');
console.log('================');
if (allFilesExist) {
  console.log(' All basic components are in place!');
  console.log('');
  console.log(
    ' Ready for integration testing once planning package imports are resolved.'
  );
  console.log('');
  console.log('Next steps:');
  console.log('1. Fix planning package import in TypeScript build');
  console.log('2. Run full smoke test with: npm run smoke:tier0');
  console.log('3. Test against live Minecraft server');

  process.exit(0);
} else {
  console.log(' Some components are missing or misconfigured.');
  console.log('Please check the issues above and fix them before proceeding.');

  process.exit(1);
}
