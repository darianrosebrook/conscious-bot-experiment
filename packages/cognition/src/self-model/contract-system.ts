/**
 * Contract system for commitment tracking and integrity assessment.
 *
 * Provides commitment tracking, promise monitoring, and integrity
 * assessment for maintaining personal accountability and trust.
 *
 * @author @darianrosebrook
 */

import { LLMInterface } from '../cognitive-core/llm-interface';
import {
  Commitment,
  Promise as ContractPromise,
  Contract,
  IntegrityAssessment,
  CommitmentTracker,
  PromiseMonitor,
  ContractManager,
  CommitmentStatus,
  PromiseStatus,
  IntegrityMetric,
  TrustScore,
  AccountabilityReport,
} from './types';

/**
 * Configuration for contract system
 */
export interface ContractSystemConfig {
  enableCommitmentTracking: boolean;
  enablePromiseMonitoring: boolean;
  enableIntegrityAssessment: boolean;
  enableTrustScoring: boolean;
  assessmentFrequency: number; // milliseconds
  integrityThreshold: number; // 0-1, minimum integrity score
  maxCommitments: number;
  maxPromises: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: ContractSystemConfig = {
  enableCommitmentTracking: true,
  enablePromiseMonitoring: true,
  enableIntegrityAssessment: true,
  enableTrustScoring: true,
  assessmentFrequency: 86400000, // 24 hours
  integrityThreshold: 0.8,
  maxCommitments: 50,
  maxPromises: 100,
};

/**
 * Contract system for commitment management
 */
export class ContractSystem {
  private llm: LLMInterface;
  private config: ContractSystemConfig;
  private commitments: Commitment[] = [];
  private promises: ContractPromise[] = [];
  private contracts: Contract[] = [];
  private integrityHistory: IntegrityAssessment[] = [];
  private lastAssessment: number = 0;

  constructor(llm?: LLMInterface, config: Partial<ContractSystemConfig> = {}) {
    this.llm = llm as LLMInterface;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Track a new commitment
   */
  trackCommitment(
    commitment: Omit<Commitment, 'id' | 'createdAt' | 'status'>
  ): Commitment {
    const newCommitment: Commitment = {
      id: `commitment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ...commitment,
      createdAt: Date.now(),
      status: CommitmentStatus.ACTIVE,
      progress: 0,
      integrityScore: 1.0,
    };

    this.commitments.push(newCommitment);

    // Limit commitments
    if (this.commitments.length > this.config.maxCommitments) {
      this.commitments = this.commitments.slice(-this.config.maxCommitments);
    }

    return newCommitment;
  }

  /**
   * Monitor a new promise
   */
  monitorPromise(
    promise: Omit<ContractPromise, 'id' | 'createdAt' | 'status'>
  ): ContractPromise {
    const newPromise: ContractPromise = {
      id: `promise-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ...promise,
      createdAt: Date.now(),
      status: PromiseStatus.PENDING,
      fulfillmentScore: 0,
      trustImpact: 0,
    };

    this.promises.push(newPromise);

    // Limit promises
    if (this.promises.length > this.config.maxPromises) {
      this.promises = this.promises.slice(-this.config.maxPromises);
    }

    return newPromise;
  }

  /**
   * Update commitment progress
   */
  updateCommitmentProgress(
    commitmentId: string,
    progress: number,
    evidence: string
  ): boolean {
    const commitment = this.commitments.find((c) => c.id === commitmentId);
    if (!commitment) {
      console.warn(`Commitment '${commitmentId}' not found`);
      return false;
    }

    const oldProgress = commitment.progress;
    commitment.progress = Math.min(1, Math.max(0, progress));
    commitment.lastUpdated = Date.now();
    commitment.evidence.push(evidence);

    // Update status based on progress
    if (commitment.progress >= 1) {
      commitment.status = CommitmentStatus.COMPLETED;
    } else if (commitment.progress > 0) {
      commitment.status = CommitmentStatus.IN_PROGRESS;
    }

    // Calculate integrity score based on progress consistency
    commitment.integrityScore = this.calculateCommitmentIntegrity(commitment);

    console.log(
      `Updated commitment '${commitment.description}': ${oldProgress.toFixed(2)} -> ${commitment.progress.toFixed(2)}`
    );
    return true;
  }

  /**
   * Fulfill a promise
   */
  fulfillPromise(
    promiseId: string,
    fulfillmentQuality: number,
    evidence: string
  ): boolean {
    const promise = this.promises.find((p) => p.id === promiseId);
    if (!promise) {
      console.warn(`Promise '${promiseId}' not found`);
      return false;
    }

    promise.status = PromiseStatus.FULFILLED;
    promise.fulfilledAt = Date.now();
    promise.fulfillmentScore = Math.min(1, Math.max(0, fulfillmentQuality));
    promise.evidence.push(evidence);

    // Calculate trust impact
    promise.trustImpact = this.calculateTrustImpact(promise);

    console.log(
      `Fulfilled promise '${promise.description}' with quality: ${promise.fulfillmentScore.toFixed(2)}`
    );
    return true;
  }

  /**
   * Break a promise
   */
  breakPromise(promiseId: string, reason: string, impact: string): boolean {
    const promise = this.promises.find((p) => p.id === promiseId);
    if (!promise) {
      console.warn(`Promise '${promiseId}' not found`);
      return false;
    }

    promise.status = PromiseStatus.BROKEN;
    promise.brokenAt = Date.now();
    promise.breakReason = reason;
    promise.breakImpact = impact;
    promise.fulfillmentScore = 0;
    promise.trustImpact = -0.5; // Negative trust impact

    console.log(`Broke promise '${promise.description}': ${reason}`);
    return true;
  }

  /**
   * Assess integrity across all commitments and promises
   */
  async assessIntegrity(): Promise<IntegrityAssessment> {
    if (!this.config.enableIntegrityAssessment) {
      return this.createEmptyIntegrityAssessment();
    }

    const now = Date.now();
    if (now - this.lastAssessment < this.config.assessmentFrequency) {
      return this.getLastAssessment();
    }

    const assessment: IntegrityAssessment = {
      id: `integrity-${Date.now()}`,
      timestamp: now,
      commitmentIntegrity: this.assessCommitmentIntegrity(),
      promiseIntegrity: this.assessPromiseIntegrity(),
      contractIntegrity: this.assessContractIntegrity(),
      trustScore: this.calculateTrustScore(),
      metrics: this.calculateIntegrityMetrics(),
      recommendations: [],
    };

    // Generate recommendations
    assessment.recommendations =
      await this.generateIntegrityRecommendations(assessment);

    this.integrityHistory.push(assessment);
    this.lastAssessment = now;

    return assessment;
  }

  /**
   * Assess commitment integrity
   */
  private assessCommitmentIntegrity(): number {
    if (this.commitments.length === 0) return 1.0;

    const activeCommitments = this.commitments.filter(
      (c) => c.status === CommitmentStatus.ACTIVE
    );
    if (activeCommitments.length === 0) return 1.0;

    const avgIntegrity =
      activeCommitments.reduce(
        (sum, commitment) => sum + commitment.integrityScore,
        0
      ) / activeCommitments.length;
    return avgIntegrity;
  }

  /**
   * Assess promise integrity
   */
  private assessPromiseIntegrity(): number {
    if (this.promises.length === 0) return 1.0;

    const fulfilledPromises = this.promises.filter(
      (p) => p.status === PromiseStatus.FULFILLED
    );
    const brokenPromises = this.promises.filter(
      (p) => p.status === PromiseStatus.BROKEN
    );
    const pendingPromises = this.promises.filter(
      (p) => p.status === PromiseStatus.PENDING
    );

    if (fulfilledPromises.length + brokenPromises.length === 0) return 1.0;

    const fulfillmentRate =
      fulfilledPromises.length /
      (fulfilledPromises.length + brokenPromises.length);
    const avgFulfillmentQuality =
      fulfilledPromises.length > 0
        ? fulfilledPromises.reduce(
            (sum, promise) => sum + promise.fulfillmentScore,
            0
          ) / fulfilledPromises.length
        : 0;

    return (fulfillmentRate + avgFulfillmentQuality) / 2;
  }

  /**
   * Assess contract integrity
   */
  private assessContractIntegrity(): number {
    if (this.contracts.length === 0) return 1.0;

    const avgIntegrity =
      this.contracts.reduce(
        (sum, contract) => sum + contract.integrityScore,
        0
      ) / this.contracts.length;
    return avgIntegrity;
  }

  /**
   * Calculate trust score
   */
  private calculateTrustScore(): TrustScore {
    const commitmentIntegrity = this.assessCommitmentIntegrity();
    const promiseIntegrity = this.assessPromiseIntegrity();
    const contractIntegrity = this.assessContractIntegrity();

    const overallTrust =
      (commitmentIntegrity + promiseIntegrity + contractIntegrity) / 3;

    return {
      overall: overallTrust,
      commitmentTrust: commitmentIntegrity,
      promiseTrust: promiseIntegrity,
      contractTrust: contractIntegrity,
      trend: this.calculateTrustTrend(),
      confidence: 0.8,
    };
  }

  /**
   * Calculate trust trend
   */
  private calculateTrustTrend(): 'improving' | 'stable' | 'declining' {
    if (this.integrityHistory.length < 2) return 'stable';

    const recent = this.integrityHistory.slice(-3);
    const older = this.integrityHistory.slice(-6, -3);

    if (recent.length === 0 || older.length === 0) return 'stable';

    const recentAvg =
      recent.reduce(
        (sum, assessment) => sum + assessment.trustScore.overall,
        0
      ) / recent.length;
    const olderAvg =
      older.reduce(
        (sum, assessment) => sum + assessment.trustScore.overall,
        0
      ) / older.length;

    const difference = recentAvg - olderAvg;

    if (difference > 0.1) return 'improving';
    if (difference < -0.1) return 'declining';
    return 'stable';
  }

  /**
   * Calculate integrity metrics
   */
  private calculateIntegrityMetrics(): IntegrityMetric[] {
    return [
      {
        name: 'Commitment Fulfillment',
        value: this.assessCommitmentIntegrity(),
        threshold: this.config.integrityThreshold,
        trend: 'stable',
      },
      {
        name: 'Promise Reliability',
        value: this.assessPromiseIntegrity(),
        threshold: this.config.integrityThreshold,
        trend: 'stable',
      },
      {
        name: 'Contract Compliance',
        value: this.assessContractIntegrity(),
        threshold: this.config.integrityThreshold,
        trend: 'stable',
      },
    ];
  }

  /**
   * Generate integrity recommendations
   */
  async generateIntegrityRecommendations(
    assessment: IntegrityAssessment
  ): Promise<string[]> {
    const prompt = `Based on this integrity assessment, generate actionable recommendations:

Commitment Integrity: ${assessment.commitmentIntegrity.toFixed(2)}
Promise Integrity: ${assessment.promiseIntegrity.toFixed(2)}
Contract Integrity: ${assessment.contractIntegrity.toFixed(2)}
Trust Score: ${assessment.trustScore.overall.toFixed(2)}

Metrics:
${assessment.metrics.map((m) => `- ${m.name}: ${m.value.toFixed(2)} (threshold: ${m.threshold.toFixed(2)})`).join('\n')}

Generate 3-5 specific, actionable recommendations for improving integrity and trust.`;

    try {
      const response = await this.llm.generateResponse(prompt, {
        systemPrompt:
          'You are generating integrity improvement recommendations. Be specific and actionable.',
        temperature: 0.4,
        maxTokens: 512,
      });

      return response.text
        .split('\n')
        .filter(
          (line) => line.trim().startsWith('-') || line.trim().startsWith('•')
        )
        .map((line) => line.replace(/^[-•]\s*/, '').trim())
        .slice(0, 5);
    } catch (error) {
      console.error('Error generating integrity recommendations:', error);
      return [];
    }
  }

  /**
   * Calculate commitment integrity
   */
  private calculateCommitmentIntegrity(commitment: Commitment): number {
    // Simple integrity calculation based on progress consistency
    const expectedProgress =
      (Date.now() - commitment.createdAt) /
      (commitment.deadline - commitment.createdAt);
    const progressRatio = commitment.progress / Math.max(0.1, expectedProgress);

    return Math.min(1, Math.max(0, progressRatio));
  }

  /**
   * Calculate trust impact of promise fulfillment
   */
  private calculateTrustImpact(promise: ContractPromise): number {
    // Trust impact based on fulfillment quality and timeliness
    const timeliness = promise.deadline
      ? Math.max(0, 1 - (Date.now() - promise.deadline) / (24 * 60 * 60 * 1000))
      : 1;

    return (promise.fulfillmentScore + timeliness) / 2;
  }

  /**
   * Get accountability report
   */
  async generateAccountabilityReport(): Promise<AccountabilityReport> {
    const activeCommitments = this.commitments.filter(
      (c) => c.status === CommitmentStatus.ACTIVE
    );
    const pendingPromises = this.promises.filter(
      (p) => p.status === PromiseStatus.PENDING
    );
    const recentIntegrity = await this.assessIntegrity();

    const report: AccountabilityReport = {
      id: `accountability-${Date.now()}`,
      timestamp: Date.now(),
      activeCommitments: activeCommitments.length,
      pendingPromises: pendingPromises.length,
      overallIntegrity: recentIntegrity.trustScore.overall,
      areasOfConcern: this.identifyAreasOfConcern(),
      improvementAreas: this.identifyImprovementAreas(),
      recommendations: recentIntegrity.recommendations,
    };

    return report;
  }

  /**
   * Identify areas of concern
   */
  private identifyAreasOfConcern(): string[] {
    const concerns: string[] = [];

    // Check for overdue commitments
    const overdueCommitments = this.commitments.filter(
      (c) =>
        c.status === CommitmentStatus.ACTIVE &&
        c.deadline &&
        Date.now() > c.deadline
    );

    if (overdueCommitments.length > 0) {
      concerns.push(`${overdueCommitments.length} overdue commitments`);
    }

    // Check for broken promises
    const brokenPromises = this.promises.filter(
      (p) => p.status === PromiseStatus.BROKEN
    );
    if (brokenPromises.length > 0) {
      concerns.push(`${brokenPromises.length} broken promises`);
    }

    // Check for low integrity scores
    const lowIntegrityCommitments = this.commitments.filter(
      (c) => c.integrityScore < 0.5
    );
    if (lowIntegrityCommitments.length > 0) {
      concerns.push(
        `${lowIntegrityCommitments.length} commitments with low integrity`
      );
    }

    return concerns;
  }

  /**
   * Identify improvement areas
   */
  private identifyImprovementAreas(): string[] {
    const improvements: string[] = [];

    const commitmentIntegrity = this.assessCommitmentIntegrity();
    const promiseIntegrity = this.assessPromiseIntegrity();
    const contractIntegrity = this.assessContractIntegrity();

    if (commitmentIntegrity < 0.8) {
      improvements.push('Improve commitment tracking and progress updates');
    }

    if (promiseIntegrity < 0.8) {
      improvements.push('Enhance promise fulfillment and communication');
    }

    if (contractIntegrity < 0.8) {
      improvements.push('Strengthen contract compliance and monitoring');
    }

    return improvements;
  }

  /**
   * Get last assessment
   */
  private getLastAssessment(): IntegrityAssessment {
    return (
      this.integrityHistory[this.integrityHistory.length - 1] ||
      this.createEmptyIntegrityAssessment()
    );
  }

  /**
   * Create empty integrity assessment
   */
  private createEmptyIntegrityAssessment(): IntegrityAssessment {
    return {
      id: `empty-integrity-${Date.now()}`,
      timestamp: Date.now(),
      commitmentIntegrity: 1.0,
      promiseIntegrity: 1.0,
      contractIntegrity: 1.0,
      trustScore: {
        overall: 1.0,
        commitmentTrust: 1.0,
        promiseTrust: 1.0,
        contractTrust: 1.0,
        trend: 'stable',
        confidence: 1.0,
      },
      metrics: [],
      recommendations: [],
    };
  }

  /**
   * Get all commitments
   */
  getCommitments(): Commitment[] {
    return [...this.commitments];
  }

  /**
   * Get all promises
   */
  getPromises(): ContractPromise[] {
    return [...this.promises];
  }

  /**
   * Get all contracts
   */
  getContracts(): Contract[] {
    return [...this.contracts];
  }

  /**
   * Get integrity history
   */
  getIntegrityHistory(): IntegrityAssessment[] {
    return [...this.integrityHistory];
  }

  /**
   * Create a commitment (alias for trackCommitment)
   */
  createCommitment(
    title: string,
    description: string,
    deadline: Date,
    steps: string[],
    outcomes: string[]
  ): string {
    const commitment = this.trackCommitment({
      description: title,
      category: 'personal',
      deadline: deadline.getTime(),
      priority: 0.5,
      evidence: [],
      progress: 0,
      integrityScore: 1.0,
    });

    // Add missing properties for test compatibility
    (commitment as any).title = title;
    (commitment as any).steps = steps;
    (commitment as any).outcomes = outcomes;

    return commitment.id;
  }

  /**
   * Get a specific commitment
   */
  getCommitment(commitmentId: string): Commitment | undefined {
    return this.commitments.find((c) => c.id === commitmentId);
  }

  /**
   * Create a promise (alias for monitorPromise)
   */
  createPromise(
    title: string,
    recipient: string,
    description: string,
    deadline: Date,
    requirements: string[]
  ): string {
    const promise = this.monitorPromise({
      description: title,
      recipient,
      deadline: deadline.getTime(),
      fulfillmentScore: 0,
      trustImpact: 0,
      evidence: [],
    });

    // Add missing properties for test compatibility
    (promise as any).title = title;
    (promise as any).requirements = requirements;

    return promise.id;
  }

  /**
   * Get a specific promise
   */
  getPromise(promiseId: string): ContractPromise | undefined {
    return this.promises.find((p) => p.id === promiseId);
  }

  /**
   * Create a formal contract (overloaded method)
   */
  createContract(
    title: string,
    type: string,
    description: string,
    counterparty: string,
    terms: any
  ): string;
  createContract(
    contract: Omit<Contract, 'id' | 'createdAt' | 'status'>
  ): Contract;
  createContract(
    titleOrContract: string | Omit<Contract, 'id' | 'createdAt' | 'status'>,
    type?: string,
    description?: string,
    counterparty?: string,
    terms?: any
  ): string | Contract {
    if (typeof titleOrContract === 'string') {
      // New overload for test compatibility
      const contract = this.createContractFromParams({
        title: titleOrContract,
        description: description!,
        parties: [counterparty!],
        terms: terms?.myObligations || [],
        startDate: Date.now(),
        endDate: terms?.duration
          ? Date.now() + terms.duration * 24 * 60 * 60 * 1000
          : undefined,
        integrityScore: 1.0,
        trustScore: 1.0,
      });

      // Add missing properties for test compatibility
      (contract as any).type = type;

      return contract.id;
    } else {
      // Original implementation
      const newContract: Contract = {
        id: `contract-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        ...titleOrContract,
        createdAt: Date.now(),
        status: 'active',
        integrityScore: 1.0,
        trustScore: 1.0,
      };

      this.contracts.push(newContract);
      return newContract;
    }
  }

  /**
   * Create contract from parameters (helper method)
   */
  private createContractFromParams(
    contract: Omit<Contract, 'id' | 'createdAt' | 'status'>
  ): Contract {
    const newContract: Contract = {
      id: `contract-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ...contract,
      createdAt: Date.now(),
      status: 'active',
      integrityScore: 1.0,
      trustScore: 1.0,
    };

    this.contracts.push(newContract);
    return newContract;
  }

  /**
   * Get a specific contract
   */
  getContract(contractId: string): Contract | undefined {
    return this.contracts.find((c) => c.id === contractId);
  }

  /**
   * Evaluate commitment progress
   */
  evaluateCommitmentProgress(commitmentId: string): any {
    const commitment = this.getCommitment(commitmentId);
    if (!commitment) return null;

    const timeElapsed = Date.now() - commitment.createdAt;
    const totalTime = commitment.deadline - commitment.createdAt;
    const expectedProgress = timeElapsed / totalTime;

    return {
      currentProgress: commitment.progress,
      onTrack: commitment.progress >= expectedProgress * 0.8,
      projectedCompletion: new Date(
        commitment.createdAt + totalTime / commitment.progress
      ),
      recommendations: [
        commitment.progress < expectedProgress
          ? 'Accelerate progress'
          : 'Maintain current pace',
        'Document evidence regularly',
        'Review milestones',
      ],
    };
  }

  /**
   * Get integrity score
   */
  getIntegrityScore(): any {
    const commitmentScore = this.assessCommitmentIntegrity();
    const promiseScore = this.assessPromiseIntegrity();
    const trustScore = this.calculateTrustScore();

    return {
      overall: (commitmentScore + promiseScore + trustScore.overall) / 3,
      commitmentScore,
      promiseScore,
      trustScore: trustScore.overall,
      trends: {
        commitment: 'stable',
        promise: 'stable',
        trust: trustScore.trend,
      },
    };
  }

  /**
   * Generate integrity report
   */
  generateIntegrityReport(): any {
    const assessment = this.getLastAssessment();

    return {
      overallScore: assessment.trustScore.overall,
      commitmentMetrics: {
        total: this.commitments.length,
        active: this.commitments.filter(
          (c) => c.status === CommitmentStatus.ACTIVE
        ).length,
        completed: this.commitments.filter(
          (c) => c.status === CommitmentStatus.COMPLETED
        ).length,
        integrity: assessment.commitmentIntegrity,
      },
      promiseMetrics: {
        total: this.promises.length,
        fulfilled: this.promises.filter(
          (p) => p.status === PromiseStatus.FULFILLED
        ).length,
        broken: this.promises.filter((p) => p.status === PromiseStatus.BROKEN)
          .length,
        integrity: assessment.promiseIntegrity,
      },
      trends: {
        trust: assessment.trustScore.trend,
        commitment: 'stable',
        promise: 'stable',
      },
      areasOfConcern: this.identifyAreasOfConcern(),
      recommendations: assessment.recommendations,
      improvementPlan: this.identifyImprovementAreas(),
    };
  }

  /**
   * Check for contract violations
   */
  checkViolations(): any[] {
    const violations: any[] = [];

    // Check overdue promises
    const overduePromises = this.promises.filter(
      (p) =>
        p.status === PromiseStatus.PENDING &&
        p.deadline &&
        Date.now() > p.deadline
    );

    overduePromises.forEach((promise) => {
      violations.push({
        contractId: promise.id,
        type: 'promise_overdue',
        severity: 0.8,
        description: `Promise "${promise.description}" is overdue`,
        impact: 'trust_loss',
      });
    });

    // Check overdue commitments
    const overdueCommitments = this.commitments.filter(
      (c) =>
        c.status === CommitmentStatus.ACTIVE &&
        c.deadline &&
        Date.now() > c.deadline
    );

    overdueCommitments.forEach((commitment) => {
      violations.push({
        contractId: commitment.id,
        type: 'commitment_overdue',
        severity: 0.7,
        description: `Commitment "${commitment.description}" is overdue`,
        impact: 'integrity_loss',
      });
    });

    return violations;
  }

  /**
   * Get contract system statistics
   */
  getStats() {
    const integrityScore = this.getIntegrityScore();

    return {
      totalCommitments: this.commitments.length,
      totalPromises: this.promises.length,
      totalContracts: this.contracts.length,
      activeCommitments: this.commitments.filter(
        (c) => c.status === CommitmentStatus.ACTIVE
      ).length,
      pendingPromises: this.promises.filter(
        (p) => p.status === PromiseStatus.PENDING
      ).length,
      fulfilledPromises: this.promises.filter(
        (p) => p.status === PromiseStatus.FULFILLED
      ).length,
      brokenPromises: this.promises.filter(
        (p) => p.status === PromiseStatus.BROKEN
      ).length,
      averageIntegrityScore: integrityScore.overall,
      activeObligations:
        this.commitments.filter((c) => c.status === CommitmentStatus.ACTIVE)
          .length +
        this.promises.filter((p) => p.status === PromiseStatus.PENDING).length,
      completionRate:
        this.commitments.length > 0
          ? this.commitments.filter(
              (c) => c.status === CommitmentStatus.COMPLETED
            ).length / this.commitments.length
          : 1,
      config: this.config,
    };
  }
}
