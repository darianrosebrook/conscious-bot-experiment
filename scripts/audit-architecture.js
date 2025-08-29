#!/usr/bin/env node

/**
 * Architecture Audit Script
 *
 * Command-line script to run the complete Mermaid architecture audit
 * and end-to-end verification process.
 *
 * @author @darianrosebrook
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runAudit() {
  console.log('🔍 Running Architecture Audit...\n');

  // Change to the evaluation package directory
  const evaluationDir = path.join(__dirname, '..', 'packages', 'evaluation');

  try {
    // Run the audit using ts-node
    const auditProcess = spawn('npx', ['tsx', 'src/audit-runner.ts'], {
      cwd: evaluationDir,
      stdio: 'inherit',
      shell: true,
    });

    return new Promise((resolve, reject) => {
      auditProcess.on('close', (code) => {
        if (code === 0) {
          console.log('\n✅ Architecture audit completed successfully!');
          resolve();
        } else {
          console.error(`\n❌ Architecture audit failed with code ${code}`);
          reject(new Error(`Audit failed with code ${code}`));
        }
      });

      auditProcess.on('error', (error) => {
        console.error('❌ Failed to start audit process:', error);
        reject(error);
      });
    });
  } catch (error) {
    console.error('❌ Error running audit:', error);
    throw error;
  }
}

async function runSpecificAudit(type) {
  console.log(`🔍 Running ${type} Audit...\n`);

  const evaluationDir = path.join(__dirname, '..', 'packages', 'evaluation');

  try {
    const auditProcess = spawn('npx', ['tsx', 'src/audit-runner.ts', type], {
      cwd: evaluationDir,
      stdio: 'inherit',
      shell: true,
    });

    return new Promise((resolve, reject) => {
      auditProcess.on('close', (code) => {
        if (code === 0) {
          console.log(`\n✅ ${type} audit completed successfully!`);
          resolve();
        } else {
          console.error(`\n❌ ${type} audit failed with code ${code}`);
          reject(new Error(`${type} audit failed with code ${code}`));
        }
      });

      auditProcess.on('error', (error) => {
        console.error(`❌ Failed to start ${type} audit process:`, error);
        reject(error);
      });
    });
  } catch (error) {
    console.error(`❌ Error running ${type} audit:`, error);
    throw error;
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'complete';

  try {
    switch (command) {
      case 'architecture':
        await runSpecificAudit('architecture');
        break;
      case 'integration':
        await runSpecificAudit('integration');
        break;
      case 'complete':
      case 'full':
        await runAudit();
        break;
      case 'help':
      case '--help':
      case '-h':
        console.log(`
🔍 Architecture Audit Script

Usage: node audit-architecture.js [command]

Commands:
  complete, full    Run complete audit (architecture + integration)
  architecture      Run architecture validation only
  integration       Run integration tests only
  help, --help, -h  Show this help message

Examples:
  node audit-architecture.js complete
  node audit-architecture.js architecture
  node audit-architecture.js integration

The audit will generate reports in the audit-reports/ directory.
        `);
        break;
      default:
        console.error(`❌ Unknown command: ${command}`);
        console.log(
          'Use "node audit-architecture.js help" for usage information.'
        );
        process.exit(1);
    }
  } catch (error) {
    console.error('❌ Audit failed:', error.message);
    process.exit(1);
  }
}

// Run main function
main();

export { runAudit, runSpecificAudit };
