#!/usr/bin/env node

/**
 * Verification System with Quality Gates
 *
 * Automated verification system following CAWS methodology with tier-based quality gates
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

interface QualityGate {
  id: string;
  name: string;
  description: string;
  tier: 1 | 2 | 3;
  checks: VerificationCheck[];
  required: boolean;
  threshold: number; // percentage (0-100)
}

interface VerificationCheck {
  id: string;
  name: string;
  command: string;
  workingDir?: string;
  expectedExitCode: number;
  timeout: number;
  riskTier: 1 | 2 | 3;
}

interface GateResult {
  gateId: string;
  success: boolean;
  score: number;
  results: CheckResult[];
  duration: number;
  timestamp: string;
}

interface CheckResult {
  checkId: string;
  success: boolean;
  duration: number;
  output: string;
  error?: string;
}

interface VerificationReport {
  timestamp: string;
  overallSuccess: boolean;
  overallScore: number;
  tierCompliance: Record<number, number>;
  gateResults: GateResult[];
  blockingIssues: string[];
  recommendations: string[];
  trustScore: number;
}

class VerificationSystem {
  private gates: QualityGate[] = [
    {
      id: 'build-verification',
      name: 'Build Verification',
      description: 'Ensures all packages build successfully',
      tier: 1,
      required: true,
      threshold: 100,
      checks: [
        {
          id: 'core-build',
          name: 'Core Package Build',
          command: 'pnpm run build',
          workingDir: path.join(__dirname, '..', '..', 'packages', 'core'),
          expectedExitCode: 0,
          timeout: 60000,
          riskTier: 1,
        },
        {
          id: 'memory-build',
          name: 'Memory Package Build',
          command: 'pnpm run build',
          workingDir: path.join(__dirname, '..', '..', 'packages', 'memory'),
          expectedExitCode: 0,
          timeout: 60000,
          riskTier: 1,
        },
        {
          id: 'safety-build',
          name: 'Safety Package Build',
          command: 'pnpm run build',
          workingDir: path.join(__dirname, '..', '..', 'packages', 'safety'),
          expectedExitCode: 0,
          timeout: 60000,
          riskTier: 1,
        },
        {
          id: 'planning-build',
          name: 'Planning Package Build',
          command: 'pnpm run build',
          workingDir: path.join(__dirname, '..', '..', 'packages', 'planning'),
          expectedExitCode: 0,
          timeout: 60000,
          riskTier: 2,
        },
        {
          id: 'cognition-build',
          name: 'Cognition Package Build',
          command: 'pnpm run build',
          workingDir: path.join(__dirname, '..', '..', 'packages', 'cognition'),
          expectedExitCode: 0,
          timeout: 60000,
          riskTier: 2,
        },
        {
          id: 'world-build',
          name: 'World Package Build',
          command: 'pnpm run build',
          workingDir: path.join(__dirname, '..', '..', 'packages', 'world'),
          expectedExitCode: 0,
          timeout: 60000,
          riskTier: 2,
        },
        {
          id: 'dashboard-build',
          name: 'Dashboard Package Build',
          command: 'pnpm run build',
          workingDir: path.join(__dirname, '..', '..', 'packages', 'dashboard'),
          expectedExitCode: 0,
          timeout: 60000,
          riskTier: 3,
        },
        {
          id: 'evaluation-build',
          name: 'Evaluation Package Build',
          command: 'pnpm run build',
          workingDir: path.join(
            __dirname,
            '..',
            '..',
            'packages',
            'evaluation'
          ),
          expectedExitCode: 0,
          timeout: 60000,
          riskTier: 3,
        },
        {
          id: 'minecraft-build',
          name: 'Minecraft Interface Build',
          command: 'pnpm run build',
          workingDir: path.join(
            __dirname,
            '..',
            '..',
            'packages',
            'minecraft-interface'
          ),
          expectedExitCode: 0,
          timeout: 60000,
          riskTier: 2,
        },
      ],
    },

    {
      id: 'type-checking',
      name: 'Type Safety',
      description: 'Ensures type correctness across all packages',
      tier: 1,
      required: true,
      threshold: 95,
      checks: [
        {
          id: 'root-typecheck',
          name: 'Root TypeScript Check',
          command: 'pnpm type-check',
          workingDir: path.join(__dirname, '..', '..'),
          expectedExitCode: 0,
          timeout: 120000,
          riskTier: 1,
        },
      ],
    },

    {
      id: 'linting',
      name: 'Code Quality',
      description: 'Enforces coding standards and best practices',
      tier: 2,
      required: true,
      threshold: 90,
      checks: [
        {
          id: 'root-lint',
          name: 'ESLint Check',
          command: 'pnpm lint',
          workingDir: path.join(__dirname, '..', '..'),
          expectedExitCode: 0,
          timeout: 60000,
          riskTier: 2,
        },
      ],
    },

    {
      id: 'unit-tests',
      name: 'Unit Tests',
      description: 'Validates unit test coverage and success',
      tier: 1,
      required: true,
      threshold: 80,
      checks: [
        {
          id: 'core-unit-tests',
          name: 'Core Unit Tests',
          command: 'pnpm test',
          workingDir: path.join(__dirname, '..', '..', 'packages', 'core'),
          expectedExitCode: 0,
          timeout: 300000,
          riskTier: 1,
        },
        {
          id: 'memory-unit-tests',
          name: 'Memory Unit Tests',
          command: 'pnpm test',
          workingDir: path.join(__dirname, '..', '..', 'packages', 'memory'),
          expectedExitCode: 0,
          timeout: 300000,
          riskTier: 1,
        },
        {
          id: 'planning-unit-tests',
          name: 'Planning Unit Tests',
          command: 'pnpm test',
          workingDir: path.join(__dirname, '..', '..', 'packages', 'planning'),
          expectedExitCode: 0,
          timeout: 300000,
          riskTier: 2,
        },
        {
          id: 'cognition-unit-tests',
          name: 'Cognition Unit Tests',
          command: 'pnpm test',
          workingDir: path.join(__dirname, '..', '..', 'packages', 'cognition'),
          expectedExitCode: 0,
          timeout: 300000,
          riskTier: 2,
        },
        {
          id: 'world-unit-tests',
          name: 'World Unit Tests',
          command: 'pnpm test',
          workingDir: path.join(__dirname, '..', '..', 'packages', 'world'),
          expectedExitCode: 0,
          timeout: 300000,
          riskTier: 2,
        },
        {
          id: 'safety-unit-tests',
          name: 'Safety Unit Tests',
          command: 'pnpm test',
          workingDir: path.join(__dirname, '..', '..', 'packages', 'safety'),
          expectedExitCode: 0,
          timeout: 300000,
          riskTier: 1,
        },
      ],
    },

    {
      id: 'security-scan',
      name: 'Security Audit',
      description: 'Identifies security vulnerabilities and issues',
      tier: 1,
      required: true,
      threshold: 100,
      checks: [
        {
          id: 'dependency-audit',
          name: 'Dependency Audit',
          command: 'pnpm audit',
          workingDir: path.join(__dirname, '..', '..'),
          expectedExitCode: 0,
          timeout: 60000,
          riskTier: 1,
        },
        {
          id: 'safety-security-scan',
          name: 'Safety Security Scan',
          command: 'pnpm run security-scan',
          workingDir: path.join(__dirname, '..', '..', 'packages', 'safety'),
          expectedExitCode: 0,
          timeout: 120000,
          riskTier: 1,
        },
      ],
    },

    {
      id: 'performance-benchmarks',
      name: 'Performance Benchmarks',
      description: 'Validates performance requirements',
      tier: 2,
      required: false,
      threshold: 85,
      checks: [
        {
          id: 'core-benchmarks',
          name: 'Core Performance Benchmarks',
          command: 'pnpm run benchmark',
          workingDir: path.join(__dirname, '..', '..', 'packages', 'core'),
          expectedExitCode: 0,
          timeout: 300000,
          riskTier: 2,
        },
        {
          id: 'memory-benchmarks',
          name: 'Memory Performance Benchmarks',
          command: 'pnpm run benchmark',
          workingDir: path.join(__dirname, '..', '..', 'packages', 'memory'),
          expectedExitCode: 0,
          timeout: 300000,
          riskTier: 1,
        },
      ],
    },

    {
      id: 'integration-tests',
      name: 'Integration Tests',
      description: 'Validates cross-package integration',
      tier: 2,
      required: false,
      threshold: 80,
      checks: [
        {
          id: 'integration-suite',
          name: 'Integration Test Suite',
          command: 'pnpm test:integration',
          workingDir: path.join(__dirname, '..', '..'),
          expectedExitCode: 0,
          timeout: 600000,
          riskTier: 2,
        },
      ],
    },
  ];

  async runVerification(): Promise<VerificationReport> {
    console.log('🚀 Starting Quality Gate Verification');
    console.log('====================================');

    const startTime = Date.now();
    const gateResults: GateResult[] = [];
    const blockingIssues: string[] = [];

    // Validate working specs first
    console.log('📋 Validating working specifications...');
    const specsValid = await this.validateWorkingSpecs();
    if (!specsValid) {
      blockingIssues.push('Working specifications validation failed');
    }

    // Run each quality gate
    for (const gate of this.gates) {
      console.log(`\n🔍 Running ${gate.name}...`);
      const result = await this.runQualityGate(gate);

      gateResults.push(result);

      if (gate.required && !result.success) {
        blockingIssues.push(`${gate.name} failed - blocking deployment`);
      }

      console.log(
        `${result.success ? '✅' : '❌'} ${gate.name}: ${result.score.toFixed(1)}%`
      );
    }

    const totalDuration = Date.now() - startTime;
    const overallSuccess = blockingIssues.length === 0;
    const overallScore = this.calculateOverallScore(gateResults);
    const tierCompliance = this.calculateTierCompliance(gateResults);
    const trustScore = this.calculateTrustScore(gateResults, overallSuccess);

    const recommendations = this.generateRecommendations(
      gateResults,
      blockingIssues
    );

    const report: VerificationReport = {
      timestamp: new Date().toISOString(),
      overallSuccess,
      overallScore,
      tierCompliance,
      gateResults,
      blockingIssues,
      recommendations,
      trustScore,
    };

    return report;
  }

  private async runQualityGate(gate: QualityGate): Promise<GateResult> {
    const startTime = Date.now();
    const results: CheckResult[] = [];

    for (const check of gate.checks) {
      const result = await this.runCheck(check);
      results.push(result);
    }

    const successful = results.filter((r) => r.success).length;
    const total = results.length;
    const score = (successful / total) * 100;
    const success = score >= gate.threshold;

    return {
      gateId: gate.id,
      success,
      score,
      results,
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }

  private async runCheck(check: VerificationCheck): Promise<CheckResult> {
    const startTime = Date.now();

    return new Promise((resolve) => {
      const workingDir = check.workingDir || path.join(__dirname, '..', '..');

      const [cmd, ...args] = check.command.split(' ');
      const process = spawn(cmd, args, {
        cwd: workingDir,
        stdio: 'pipe',
        shell: true,
      });

      let output = '';
      let error = '';

      process.stdout?.on('data', (data) => {
        output += data.toString();
      });

      process.stderr?.on('data', (data) => {
        error += data.toString();
      });

      const timer = setTimeout(() => {
        process.kill();
        resolve({
          checkId: check.id,
          success: false,
          duration: Date.now() - startTime,
          output: output,
          error: `Command timed out after ${check.timeout}ms`,
        });
      }, check.timeout);

      process.on('close', (code) => {
        clearTimeout(timer);
        const success = code === check.expectedExitCode;
        resolve({
          checkId: check.id,
          success,
          duration: Date.now() - startTime,
          output: success ? output : `${output}\n${error}`,
          error: success ? undefined : error || `Exit code: ${code}`,
        });
      });

      process.on('error', (err) => {
        clearTimeout(timer);
        resolve({
          checkId: check.id,
          success: false,
          duration: Date.now() - startTime,
          output: output,
          error: err.message,
        });
      });
    });
  }

  private async validateWorkingSpecs(): Promise<boolean> {
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

        const content = await fs.readFile(specPath, 'utf8');
        if (!content.includes('id:') || !content.includes('risk_tier:')) {
          console.error(`❌ Invalid working spec format for ${pkg}`);
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('❌ Error validating working specs:', error);
      return false;
    }
  }

  private calculateOverallScore(gateResults: GateResult[]): number {
    if (gateResults.length === 0) return 0;

    const weightedScore = gateResults.reduce((sum, result) => {
      const gate = this.gates.find((g) => g.id === result.gateId);
      const weight = gate ? 4 - gate.tier : 1; // Higher tier = lower weight
      return sum + result.score * weight;
    }, 0);

    const totalWeight = gateResults.reduce((sum, result) => {
      const gate = this.gates.find((g) => g.id === result.gateId);
      const weight = gate ? 4 - gate.tier : 1;
      return sum + weight;
    }, 0);

    return totalWeight > 0 ? weightedScore / totalWeight : 0;
  }

  private calculateTierCompliance(
    gateResults: GateResult[]
  ): Record<number, number> {
    const tierResults: Record<number, number[]> = { 1: [], 2: [], 3: [] };

    gateResults.forEach((result) => {
      const gate = this.gates.find((g) => g.id === result.gateId);
      if (gate) {
        tierResults[gate.tier].push(result.score);
      }
    });

    const compliance: Record<number, number> = {};
    Object.entries(tierResults).forEach(([tier, scores]) => {
      const avg =
        scores.length > 0
          ? scores.reduce((a, b) => a + b, 0) / scores.length
          : 0;
      compliance[parseInt(tier)] = Math.round(avg);
    });

    return compliance;
  }

  private calculateTrustScore(
    gateResults: GateResult[],
    overallSuccess: boolean
  ): number {
    let trustScore = 0;

    // Base score from overall success
    trustScore += overallSuccess ? 50 : 0;

    // Add points for each successful gate, weighted by tier
    gateResults.forEach((result) => {
      const gate = this.gates.find((g) => g.id === result.gateId);
      if (gate && result.success) {
        const tierBonus = (4 - gate.tier) * 10; // Tier 1 = 30, Tier 2 = 20, Tier 3 = 10
        trustScore += tierBonus;
      }
    });

    // Bonus for high compliance scores
    const overallScore = this.calculateOverallScore(gateResults);
    trustScore += Math.floor(overallScore / 10); // +10 for each 10% above 0

    return Math.min(trustScore, 100);
  }

  private generateRecommendations(
    gateResults: GateResult[],
    blockingIssues: string[]
  ): string[] {
    const recommendations: string[] = [];

    if (blockingIssues.length > 0) {
      recommendations.push(
        'CRITICAL: Address all blocking issues before deployment'
      );
      blockingIssues.forEach((issue) => {
        recommendations.push(`- ${issue}`);
      });
    }

    // Analyze failed gates
    const failedGates = gateResults.filter((result) => !result.success);
    if (failedGates.length > 0) {
      recommendations.push(
        `Address ${failedGates.length} failed quality gates:`
      );
      failedGates.forEach((result) => {
        const gate = this.gates.find((g) => g.id === result.gateId);
        recommendations.push(
          `- ${gate?.name}: Score ${result.score.toFixed(1)}% (threshold: ${gate?.threshold}%)`
        );
      });
    }

    // Tier-specific recommendations
    const tier1Gates = gateResults.filter((result) => {
      const gate = this.gates.find((g) => g.id === result.gateId);
      return gate?.tier === 1;
    });

    const tier1Success = tier1Gates.every((result) => result.success);
    if (!tier1Success) {
      recommendations.push(
        'PRIORITY: Fix all Tier 1 (critical) quality gates immediately'
      );
    }

    // Performance recommendations
    const perfGate = gateResults.find(
      (result) => result.gateId === 'performance-benchmarks'
    );
    if (perfGate && perfGate.score < 80) {
      recommendations.push(
        'PERFORMANCE: Optimize components with low benchmark scores'
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('All quality gates passed successfully');
    }

    return recommendations;
  }

  async saveReport(report: VerificationReport): Promise<string> {
    const reportsDir = path.join(__dirname, 'reports', 'verification');
    await fs.mkdir(reportsDir, { recursive: true });

    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, -5);
    const reportPath = path.join(
      reportsDir,
      `verification-report-${timestamp}.json`
    );

    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');

    // Also generate markdown report
    const markdownPath = path.join(
      reportsDir,
      `verification-report-${timestamp}.md`
    );
    const markdownReport = this.generateMarkdownReport(report);
    await fs.writeFile(markdownPath, markdownReport, 'utf8');

    return reportPath;
  }

  private generateMarkdownReport(report: VerificationReport): string {
    return `# Quality Gate Verification Report

**Generated:** ${report.timestamp}
**Overall Status:** ${report.overallSuccess ? '✅ PASS' : '❌ FAIL'}
**Trust Score:** ${report.trustScore}/100
**Overall Score:** ${report.overallScore.toFixed(1)}%

## Tier Compliance

| Tier | Compliance | Status |
|------|------------|--------|
| 1 (Critical) | ${report.tierCompliance[1]}% | ${report.tierCompliance[1] >= 90 ? '✅' : report.tierCompliance[1] >= 70 ? '⚠️' : '❌'} |
| 2 (Important) | ${report.tierCompliance[2]}% | ${report.tierCompliance[2] >= 80 ? '✅' : report.tierCompliance[2] >= 60 ? '⚠️' : '❌'} |
| 3 (Supporting) | ${report.tierCompliance[3]}% | ${report.tierCompliance[3] >= 70 ? '✅' : report.tierCompliance[3] >= 50 ? '⚠️' : '❌'} |

## Quality Gate Results

${report.gateResults
  .map((result) => {
    const gate = this.gates.find((g) => g.id === result.gateId);
    return `
### ${result.gateId.replace('-', ' ').toUpperCase()}
**Status:** ${result.success ? '✅ PASS' : '❌ FAIL'}
**Score:** ${result.score.toFixed(1)}%
**Tier:** ${gate?.tier}
**Required:** ${gate?.required ? 'Yes' : 'No'}
**Duration:** ${(result.duration / 1000).toFixed(1)}s

${result.results
  .map(
    (check) => `
#### ${check.checkId}
- **Status:** ${check.success ? '✅ PASS' : '❌ FAIL'}
- **Duration:** ${(check.duration / 1000).toFixed(1)}s
${check.error ? `- **Error:** ${check.error}` : ''}
`
  )
  .join('\n')}
`;
  })
  .join('\n')}

## Issues and Recommendations

${
  report.blockingIssues.length > 0
    ? `
### Blocking Issues
${report.blockingIssues.map((issue) => `- ${issue}`).join('\n')}
`
    : ''
}

### Recommendations
${report.recommendations.map((rec) => `- ${rec}`).join('\n')}

## Trust Score Breakdown

The trust score of ${report.trustScore}/100 is calculated based on:
- Base score: ${report.overallSuccess ? '50/100' : '0/100'} (overall success)
- Quality gate bonuses: ${report.trustScore - (report.overallSuccess ? 50 : 0)}/100
- Overall score bonus: ${Math.floor(report.overallScore / 10)}/100

## Deployment Readiness

**Status:** ${report.overallSuccess && report.trustScore >= 80 ? '✅ READY' : '❌ NOT READY'}
**Trust Level:** ${report.trustScore >= 90 ? 'High' : report.trustScore >= 70 ? 'Medium' : 'Low'}

${report.overallSuccess && report.trustScore >= 80 ? 'System is ready for deployment.' : 'System requires fixes before deployment.'}

---

*Report generated by Quality Gate Verification System*
`;
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const generateReport = args.includes('--report') || args.includes('-r');
  const dryRun = args.includes('--dry-run');

  if (dryRun) {
    console.log('🛡️  Quality Gate Verification System - Dry Run');
    console.log('===============================================');
    console.log('✅ Quality gate verification system ready!');
    console.log('📊 Would verify:');
    console.log('  - Build verification across all packages');
    console.log('  - Type safety and linting compliance');
    console.log('  - Unit test coverage requirements');
    console.log('  - Security vulnerability scanning');
    console.log('  - Performance benchmark validation');
    console.log('  - Integration test execution');
    console.log(
      '💡 Use "pnpm audit:quality-gates --report" for full verification'
    );
    process.exit(0);
  }

  console.log('🛡️  Quality Gate Verification System');
  console.log('====================================');

  const verifier = new VerificationSystem();
  const report = await verifier.runVerification();

  console.log('');
  console.log('📊 Verification Complete');
  console.log('========================');
  console.log(
    `Overall Status: ${report.overallSuccess ? '✅ PASS' : '❌ FAIL'}`
  );
  console.log(`Trust Score: ${report.trustScore}/100`);
  console.log(`Overall Score: ${report.overallScore.toFixed(1)}%`);
  console.log(`Tier 1 Compliance: ${report.tierCompliance[1]}%`);
  console.log(`Tier 2 Compliance: ${report.tierCompliance[2]}%`);
  console.log(`Tier 3 Compliance: ${report.tierCompliance[3]}%`);

  if (report.blockingIssues.length > 0) {
    console.log('');
    console.log('🚨 Blocking Issues:');
    report.blockingIssues.forEach((issue, index) => {
      console.log(`  ${index + 1}. ${issue}`);
    });
  }

  if (generateReport) {
    console.log('');
    console.log('📝 Generating reports...');
    const reportPath = await verifier.saveReport(report);
    console.log(`✅ Reports saved to: ${reportPath}`);
    console.log(`📄 Markdown report: ${reportPath.replace('.json', '.md')}`);
  }

  if (!report.overallSuccess) {
    console.log('');
    console.log(
      '❌ Verification failed. Please address issues before proceeding.'
    );
    process.exit(1);
  } else {
    console.log('');
    console.log('✅ All quality gates passed!');
  }
}

// Export for use in other modules
export { VerificationSystem, type VerificationReport, type QualityGate };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
