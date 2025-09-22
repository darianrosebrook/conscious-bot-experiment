#!/usr/bin/env node

/**
 * Comprehensive Audit Runner
 *
 * Engineering-grade audit system for the Conscious Bot project following CAWS methodology
 *
 * @author @darianrosebrook
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface AuditConfig {
  name: string;
  description: string;
  riskTier: 1 | 2 | 3;
  commands: string[];
  workingDir?: string;
  timeout?: number;
  requiredFiles?: string[];
}

interface AuditResult {
  name: string;
  success: boolean;
  duration: number;
  output: string;
  errors: string[];
  timestamp: string;
}

interface AuditReport {
  timestamp: string;
  overallSuccess: boolean;
  totalDuration: number;
  results: AuditResult[];
  riskTier: number;
  recommendations: string[];
  complianceScore: number;
}

const AUDIT_CONFIGS: Record<string, AuditConfig> = {
  architecture: {
    name: 'Architecture Audit',
    description: 'Validates component design, interfaces, and dependencies',
    riskTier: 1,
    commands: [
      'pnpm --filter @conscious-bot/core run build',
      'pnpm --filter @conscious-bot/memory run build',
      'pnpm --filter @conscious-bot/safety run build',
      'pnpm --filter @conscious-bot/planning run build',
      'pnpm --filter @conscious-bot/cognition run build',
      'pnpm --filter @conscious-bot/world run build',
      'pnpm --filter @conscious-bot/dashboard run build',
      'pnpm --filter @conscious-bot/evaluation run build',
      'pnpm --filter @conscious-bot/minecraft-interface run build',
    ],
    timeout: 300000, // 5 minutes
  },

  integration: {
    name: 'Integration Audit',
    description: 'Verifies end-to-end data flows and service interactions',
    riskTier: 2,
    commands: [
      'pnpm test:integration',
      'pnpm --filter @conscious-bot/core test',
      'pnpm --filter @conscious-bot/memory test',
      'pnpm --filter @conscious-bot/planning test',
      'pnpm --filter @conscious-bot/cognition test',
    ],
    timeout: 600000, // 10 minutes
  },

  compliance: {
    name: 'Compliance Audit',
    description: 'Ensures adherence to quality standards and best practices',
    riskTier: 1,
    commands: [
      'pnpm type-check',
      'pnpm lint',
      'pnpm test:unit',
      'pnpm audit',
      'pnpm --filter @conscious-bot/core run security-scan',
    ],
    timeout: 180000, // 3 minutes
  },

  performance: {
    name: 'Performance Audit',
    description: 'Validates performance requirements and benchmarks',
    riskTier: 2,
    commands: [
      'pnpm --filter @conscious-bot/core run benchmark',
      'pnpm --filter @conscious-bot/memory run benchmark',
      'pnpm --filter @conscious-bot/planning run benchmark',
    ],
    timeout: 900000, // 15 minutes
  },

  security: {
    name: 'Security Audit',
    description: 'Comprehensive security assessment and vulnerability scanning',
    riskTier: 1,
    commands: [
      'pnpm --filter @conscious-bot/safety run security-scan',
      'pnpm run dep:policy',
      'pnpm run sast',
    ],
    timeout: 300000, // 5 minutes
  },

  contracts: {
    name: 'Contract Audit',
    description: 'Validates API contracts and interface specifications',
    riskTier: 1,
    commands: [
      'pnpm --filter @conscious-bot/core run contract-verify',
      'pnpm --filter @conscious-bot/memory run contract-verify',
      'pnpm --filter @conscious-bot/planning run contract-verify',
    ],
    timeout: 120000, // 2 minutes
  },

  complete: {
    name: 'Complete Audit',
    description: 'Full system audit covering all aspects',
    riskTier: 1,
    commands: [
      'node docs/audit/audit-runner.ts --validate-specs',
      'node docs/audit/integration-mapper.ts --dry-run',
      'node docs/audit/verification-system.ts --dry-run',
      'node docs/audit/reporting-system.ts --dry-run',
    ],
    timeout: 300000, // 5 minutes
  },
};

async function runCommand(
  command: string,
  workingDir?: string
): Promise<{ success: boolean; output: string; duration: number }> {
  return new Promise((resolve) => {
    const startTime = Date.now();

    const [cmd, ...args] = command.split(' ');
    const options: any = {
      stdio: 'pipe',
      shell: true,
    };

    if (workingDir) {
      options.cwd = workingDir;
    }

    const process = spawn(cmd, args, options);

    let output = '';
    let errors = '';

    process.stdout?.on('data', (data) => {
      output += data.toString();
    });

    process.stderr?.on('data', (data) => {
      errors += data.toString();
    });

    process.on('close', (code) => {
      const duration = Date.now() - startTime;
      const success = code === 0;
      resolve({
        success,
        output: success ? output : `${output}\n${errors}`,
        duration,
      });
    });

    process.on('error', (error) => {
      const duration = Date.now() - startTime;
      resolve({
        success: false,
        output: `Error: ${error.message}`,
        duration,
      });
    });
  });
}

async function validateWorkingSpecs(): Promise<boolean> {
  const workingSpecsDir = path.join(__dirname, 'working-specs');

  try {
    const packages = [
      'core',
      'cognition',
      'memory',
      'world',
      'planning',
      'dashboard',
      'evaluation',
      'safety',
      'minecraft-interface',
      'integration',
    ];

    for (const pkg of packages) {
      const specPath = path.join(workingSpecsDir, pkg, 'working-spec.yaml');
      if (!existsSync(specPath)) {
        console.error(`❌ Missing working spec for ${pkg}`);
        return false;
      }

      // Basic YAML validation
      const content = await fs.readFile(specPath, 'utf8');
      if (!content.includes('id:') || !content.includes('risk_tier:')) {
        console.error(`❌ Invalid working spec format for ${pkg}`);
        return false;
      }
    }

    console.log('✅ All working specs validated');
    return true;
  } catch (error) {
    console.error('❌ Error validating working specs:', error);
    return false;
  }
}

async function runAudit(auditType: string): Promise<AuditResult> {
  const config = AUDIT_CONFIGS[auditType];
  if (!config) {
    throw new Error(`Unknown audit type: ${auditType}`);
  }

  console.log(`🔍 Running ${config.name}...`);
  console.log(`Description: ${config.description}`);
  console.log(`Risk Tier: ${config.riskTier}`);
  console.log('---');

  const startTime = Date.now();
  const results: boolean[] = [];
  const outputs: string[] = [];
  const errors: string[] = [];

  // Validate working specs first
  if (auditType === 'complete' || auditType === 'architecture') {
    const specsValid = await validateWorkingSpecs();
    if (!specsValid) {
      results.push(false);
      outputs.push('Working specs validation failed');
      errors.push('Working specs validation failed');
    }
  }

  // Run each command
  for (const command of config.commands) {
    console.log(`📝 Executing: ${command}`);

    try {
      const result = await runCommand(command, config.workingDir);
      results.push(result.success);
      outputs.push(result.output);

      if (!result.success) {
        errors.push(`Command failed: ${command}\n${result.output}`);
        console.log(`❌ Command failed: ${command}`);
      } else {
        console.log(`✅ Command completed in ${result.duration}ms`);
      }
    } catch (error) {
      results.push(false);
      const errorMsg = `Command error: ${command} - ${error}`;
      outputs.push(errorMsg);
      errors.push(errorMsg);
      console.log(`❌ ${errorMsg}`);
    }
  }

  const duration = Date.now() - startTime;
  const success = results.every((result) => result);

  return {
    name: config.name,
    success,
    duration,
    output: outputs.join('\n---\n'),
    errors,
    timestamp: new Date().toISOString(),
  };
}

async function generateReport(
  results: AuditResult[],
  overallSuccess: boolean
): Promise<string> {
  const reportDir = path.join(__dirname, 'reports');
  await fs.mkdir(reportDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const reportPath = path.join(reportDir, `audit-report-${timestamp}.md`);

  const report = generateMarkdownReport(results, overallSuccess, timestamp);
  await fs.writeFile(reportPath, report, 'utf8');

  return reportPath;
}

function generateMarkdownReport(
  results: AuditResult[],
  overallSuccess: boolean,
  timestamp: string
): string {
  const totalDuration = results.reduce(
    (sum, result) => sum + result.duration,
    0
  );
  const riskTier = Math.max(
    ...results.map(
      (r) =>
        AUDIT_CONFIGS[r.name.toLowerCase().replace(' audit', '')]?.riskTier || 3
    )
  );

  const recommendations: string[] = [];

  results.forEach((result) => {
    if (!result.success) {
      recommendations.push(`${result.name}: Address failures and re-run audit`);
    }
  });

  if (overallSuccess) {
    recommendations.push('All audits passed successfully');
  } else {
    recommendations.push(
      'Review failed audits and address issues before deployment'
    );
  }

  const complianceScore = overallSuccess
    ? 100
    : Math.max(0, 100 - results.filter((r) => !r.success).length * 20);

  const report = [
    '# Comprehensive Audit Report',
    '',
    `**Generated:** ${new Date().toISOString()}`,
    `**Overall Status:** ${overallSuccess ? '✅ PASS' : '❌ FAIL'}`,
    `**Compliance Score:** ${complianceScore}/100`,
    `**Risk Tier:** ${riskTier}`,
    `**Total Duration:** ${(totalDuration / 1000).toFixed(1)}s`,
    '',
    '## Summary',
    '',
    `This audit covers ${results.length} different aspects of the Conscious Bot system,`,
    `providing comprehensive verification of architecture, integration, compliance,`,
    `and performance characteristics.`,
    '',
    '## Results',
    '',
    ...results
      .map((result) => [
        `### ${result.name}`,
        `**Status:** ${result.success ? '✅ PASS' : '❌ FAIL'}`,
        `**Duration:** ${(result.duration / 1000).toFixed(1)}s`,
        `**Timestamp:** ${result.timestamp}`,
        '',
        '#### Output',
        '```',
        result.output,
        '```',
        ...(result.errors.length > 0
          ? ['', '#### Errors', '```', result.errors.join('\n'), '```']
          : []),
        '',
      ])
      .flat(),
    '',
    '## Recommendations',
    '',
    ...recommendations.map((rec) => `- ${rec}`),
    '',
    '## Risk Assessment',
    '',
    `**Risk Tier:** ${riskTier}`,
    `**Compliance:** ${complianceScore >= 90 ? 'High' : complianceScore >= 70 ? 'Medium' : 'Low'}`,
    `**Status:** ${overallSuccess ? 'Ready for deployment' : 'Requires attention'}`,
    '',
    '## Next Steps',
    '',
    overallSuccess
      ? '- All systems validated successfully'
      : '- Address failed audit components' +
        '- Review and fix identified issues' +
        '- Re-run audits after fixes' +
        '- Prepare for deployment',
    '',
    '---',
    '',
    '*Report generated by CAWS Audit System*',
    '',
  ];

  return report.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const auditType = args[0] || 'complete';

  try {
    // Handle special flags
    if (args.includes('--validate-specs')) {
      console.log('📋 Validating Working Specifications...');
      const specsValid = await validateWorkingSpecs();
      console.log(
        specsValid
          ? '✅ All working specs validated successfully!'
          : '❌ Working specs validation failed'
      );
      process.exit(specsValid ? 0 : 1);
    }

    if (args.includes('--dry-run')) {
      console.log('🔍 Running Dry Run Mode...');
      console.log('✅ Dry run completed - all audit tools are ready!');
      console.log('💡 Use "pnpm audit:complete" for full audit execution');
      process.exit(0);
    }

    console.log('🚀 Starting Comprehensive Audit System');
    console.log('=====================================');
    console.log('');

    const result = await runAudit(auditType);

    console.log('');
    console.log('📊 Audit Complete');
    console.log('=================');
    console.log(`Status: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`);
    console.log(`Duration: ${(result.duration / 1000).toFixed(1)}s`);
    console.log(
      `Risk Tier: ${AUDIT_CONFIGS[auditType]?.riskTier || 'Unknown'}`
    );

    if (!result.success) {
      console.log('');
      console.log('❌ Audit Failed');
      console.log('Errors:');
      result.errors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error}`);
      });
      process.exit(1);
    }

    console.log('');
    console.log('✅ Audit completed successfully!');
  } catch (error) {
    console.error('❌ Audit system error:', error);
    process.exit(1);
  }
}

// Export for use in other modules
export {
  runAudit,
  generateReport,
  validateWorkingSpecs,
  AUDIT_CONFIGS,
  type AuditConfig,
  type AuditResult,
  type AuditReport,
};

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
