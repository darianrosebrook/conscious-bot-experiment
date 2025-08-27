/**
 * Provenance System Integration Test
 *
 * Tests the integration of decision tracker, evidence manager,
 * audit trail, and explanation generator components.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ProvenanceSystem,
  DecisionImportance,
  DecisionStage,
  DecisionOutcomeStatus,
  ExecutionStatus,
  ActionStatus,
  EvidenceType,
  AuditAction,
  ExplanationFormat,
  ExplanationDetailLevel,
  InformationSourceType,
} from '../index';

describe('Provenance System Integration', () => {
  let provenanceSystem: ProvenanceSystem;
  const testActor = 'test-user';

  beforeEach(() => {
    provenanceSystem = new ProvenanceSystem();
  });

  describe('Decision Lifecycle', () => {
    it('should track a complete decision lifecycle', async () => {
      // Start a decision
      const decision = provenanceSystem.startDecision(
        'Choose Database Technology',
        'Select the most appropriate database technology for our new project',
        'technology',
        DecisionImportance.HIGH,
        {
          situation:
            'We need to select a database technology for our new project',
          goals: ['Scalability', 'Performance', 'Cost-effectiveness'],
          constraints: [
            'Must support ACID transactions',
            'Must have good community support',
          ],
          environment: {
            projectType: 'web application',
            teamExpertise: ['SQL', 'NoSQL'],
          },
        },
        testActor
      );

      expect(decision).toBeDefined();
      expect(decision.id).toBeDefined();
      expect(decision.stage).toBe(DecisionStage.INITIATED);

      // Add information sources
      const updatedWithSources = provenanceSystem.addInformationSource(
        decision.id,
        {
          type: InformationSourceType.KNOWLEDGE,
          description: 'Database technology comparison',
          content: {
            sql: { pros: ['ACID', 'Mature'], cons: ['Scaling'] },
            nosql: { pros: ['Scaling', 'Flexibility'], cons: ['ACID'] },
          },
          reliability: 0.8,
          metadata: {},
        },
        testActor
      );

      expect(updatedWithSources).toBeDefined();
      expect(updatedWithSources?.stage).toBe(
        DecisionStage.INFORMATION_GATHERED
      );

      // Add alternatives
      const withAlternatives = provenanceSystem.addAlternative(
        decision.id,
        {
          title: 'PostgreSQL',
          description: 'Open-source relational database',
          pros: ['ACID compliant', 'Mature', 'Feature-rich'],
          cons: ['Scaling complexity', 'Resource intensive'],
          estimatedUtility: 0.8,
          confidence: 0.7,
          risks: [
            {
              description: 'Performance issues with large datasets',
              probability: 0.3,
              impact: 0.7,
            },
          ],
        },
        testActor
      );

      provenanceSystem.addAlternative(
        decision.id,
        {
          title: 'MongoDB',
          description: 'Document-oriented NoSQL database',
          pros: ['Scalability', 'Flexibility', 'JSON structure'],
          cons: ['Limited ACID support', 'Less mature'],
          estimatedUtility: 0.7,
          confidence: 0.6,
          risks: [
            {
              description: 'Data consistency issues',
              probability: 0.4,
              impact: 0.8,
            },
          ],
        },
        testActor
      );

      expect(withAlternatives).toBeDefined();
      expect(withAlternatives?.stage).toBe(
        DecisionStage.ALTERNATIVES_EVALUATED
      );
      expect(withAlternatives?.alternatives.length).toBe(2);

      // Add evidence
      const evidence = provenanceSystem.addEvidence(
        {
          type: EvidenceType.DOCUMENT,
          content: 'PostgreSQL has better ACID compliance than MongoDB',
          source: 'Database comparison whitepaper',
          reliability: 0.9,
          metadata: {
            author: 'Database Expert',
            date: '2023-01-15',
          },
        },
        testActor
      );

      expect(evidence).toBeDefined();
      expect(evidence.id).toBeDefined();

      // Make decision
      const selectedAlternative = withAlternatives?.alternatives[0].id;
      const withDecision = provenanceSystem.makeDecision(
        decision.id,
        selectedAlternative!,
        {
          reasoning:
            'PostgreSQL was selected due to its strong ACID compliance and maturity',
          evidenceIds: [evidence.id],
          confidenceScore: 0.8,
          ethicalConsiderations: [
            'Data integrity is critical for user privacy',
          ],
        },
        testActor
      );

      expect(withDecision).toBeDefined();
      expect(withDecision?.stage).toBe(DecisionStage.DECISION_MADE);
      expect(withDecision?.selectedAlternative).toBe(selectedAlternative);

      // Start execution
      const withExecution = provenanceSystem.startExecution(
        decision.id,
        {
          team: 'Database Team',
          deadline: '2023-03-01',
        },
        testActor
      );

      expect(withExecution).toBeDefined();
      expect(withExecution?.stage).toBe(DecisionStage.EXECUTED);
      expect(withExecution?.execution).toBeDefined();
      expect(withExecution?.execution?.status).toBe(
        ExecutionStatus.IN_PROGRESS
      );

      // Add action
      const withAction = provenanceSystem.addAction(
        decision.id,
        {
          type: 'installation',
          description: 'Install PostgreSQL on development servers',
          parameters: {
            version: '14.1',
            environment: 'development',
          },
        },
        testActor
      );

      expect(withAction).toBeDefined();
      expect(withAction?.execution?.actions.length).toBe(1);

      // Update action status
      const actionId = withAction?.execution?.actions[0].id!;
      const withUpdatedAction = provenanceSystem.updateActionStatus(
        decision.id,
        actionId,
        ActionStatus.COMPLETED,
        testActor,
        {
          success: true,
          duration: '15 minutes',
        }
      );

      expect(withUpdatedAction).toBeDefined();
      expect(withUpdatedAction?.execution?.actions[0].status).toBe(
        ActionStatus.COMPLETED
      );

      // Complete execution
      const withCompletedExecution = provenanceSystem.completeExecution(
        decision.id,
        ExecutionStatus.COMPLETED,
        testActor
      );

      expect(withCompletedExecution).toBeDefined();
      expect(withCompletedExecution?.execution?.status).toBe(
        ExecutionStatus.COMPLETED
      );
      expect(withCompletedExecution?.execution?.endTime).toBeDefined();

      // Record outcome
      const withOutcome = provenanceSystem.recordOutcome(
        decision.id,
        {
          status: DecisionOutcomeStatus.SUCCESSFUL,
          description:
            'PostgreSQL was successfully implemented and met all requirements',
          metrics: {
            performance: 85,
            reliability: 95,
            teamSatisfaction: 90,
          },
          expectedVsActual: {
            setupTime: {
              expected: '2 days',
              actual: '1.5 days',
            },
            queryPerformance: {
              expected: 'Good',
              actual: 'Excellent',
            },
          },
        },
        testActor
      );

      expect(withOutcome).toBeDefined();
      expect(withOutcome?.stage).toBe(DecisionStage.OUTCOME_RECORDED);
      expect(withOutcome?.outcome?.status).toBe(
        DecisionOutcomeStatus.SUCCESSFUL
      );

      // Add learning
      const withLearning = provenanceSystem.addLearning(
        decision.id,
        {
          insight: 'Early performance testing saved significant rework later',
          applicability: ['Database selection', 'Technology evaluation'],
          confidence: 0.9,
          integratedInto: ['Technology selection process'],
        },
        testActor
      );

      expect(withLearning).toBeDefined();
      expect(withLearning?.stage).toBe(DecisionStage.LEARNING_INTEGRATED);
      expect(withLearning?.learnings?.length).toBe(1);

      // Generate explanation
      const explanation = provenanceSystem.explainDecision(
        decision.id,
        {
          format: ExplanationFormat.TEXT,
          detailLevel: ExplanationDetailLevel.STANDARD,
        },
        testActor
      );

      expect(explanation).toBeDefined();
      expect(typeof explanation?.content).toBe('string');
      expect((explanation?.content as string).includes('PostgreSQL')).toBe(
        true
      );

      // Get audit trail
      const auditTrail = provenanceSystem.getAuditTrail(
        decision.id,
        {
          sortDirection: 'asc',
        },
        testActor
      );

      expect(auditTrail).toBeDefined();
      expect(auditTrail.length).toBeGreaterThan(0);
      expect(auditTrail[0].action).toBe(AuditAction.CREATE);
    });
  });

  describe('Evidence Management', () => {
    it('should manage evidence and link to decisions', () => {
      // Create a decision
      const decision = provenanceSystem.startDecision(
        'Select Cloud Provider',
        'Choose between AWS, Azure, and GCP',
        'infrastructure',
        DecisionImportance.CRITICAL,
        {
          situation:
            'We need to select a cloud provider for our infrastructure',
          goals: ['Reliability', 'Cost-effectiveness', 'Feature set'],
          constraints: ['Budget constraints', 'Technical requirements'],
          environment: {},
        },
        testActor
      );

      // Add evidence
      const evidence1 = provenanceSystem.addEvidence(
        {
          type: EvidenceType.MEASUREMENT,
          content: {
            aws: { cost: 1000, reliability: 0.9999 },
            azure: { cost: 1200, reliability: 0.9998 },
            gcp: { cost: 950, reliability: 0.9997 },
          },
          source: 'Cost analysis',
          reliability: 0.95,
          metadata: {},
        },
        testActor
      );

      const evidence2 = provenanceSystem.addEvidence(
        {
          type: EvidenceType.TESTIMONY,
          content: 'Our team has more experience with AWS than other providers',
          source: 'Team lead interview',
          reliability: 0.8,
          metadata: {},
        },
        testActor
      );

      // Add alternatives
      provenanceSystem.addAlternative(
        decision.id,
        {
          title: 'AWS',
          description: 'Amazon Web Services',
          pros: ['Market leader', 'Most services', 'Team familiarity'],
          cons: ['Complex pricing', 'Vendor lock-in'],
          estimatedUtility: 0.85,
          confidence: 0.8,
          risks: [],
        },
        testActor
      );

      provenanceSystem.addAlternative(
        decision.id,
        {
          title: 'Azure',
          description: 'Microsoft Azure',
          pros: ['Good Windows integration', 'Enterprise support'],
          cons: ['Higher cost', 'Less team experience'],
          estimatedUtility: 0.75,
          confidence: 0.7,
          risks: [],
        },
        testActor
      );

      // Make decision with evidence
      const withDecision = provenanceSystem.makeDecision(
        decision.id,
        decision.alternatives[0].id,
        {
          reasoning: 'AWS selected based on cost analysis and team experience',
          evidenceIds: [evidence1.id, evidence2.id],
          confidenceScore: 0.85,
          ethicalConsiderations: [],
        },
        testActor
      );

      expect(withDecision).toBeDefined();
      expect(withDecision?.justification.evidenceIds).toContain(evidence1.id);
      expect(withDecision?.justification.evidenceIds).toContain(evidence2.id);

      // Search evidence
      const searchResults = provenanceSystem.searchEvidence(
        'AWS',
        {
          maxResults: 5,
        },
        testActor
      );

      expect(searchResults).toBeDefined();
      expect(searchResults.length).toBeGreaterThan(0);
      expect(searchResults.some((result) => result.id === evidence1.id)).toBe(
        true
      );

      // Get evidence by ID
      const retrievedEvidence = provenanceSystem.getEvidence(
        evidence1.id,
        testActor
      );
      expect(retrievedEvidence).toBeDefined();
      expect(retrievedEvidence?.id).toBe(evidence1.id);
    });
  });

  describe('Explanation Generation', () => {
    it('should generate different explanation formats', () => {
      // Create a decision with all components
      const decision = provenanceSystem.startDecision(
        'Hire New Developer',
        'Select the best candidate for our development team',
        'hiring',
        DecisionImportance.HIGH,
        {
          situation: 'We need to hire a new developer for our team',
          goals: [
            'Technical excellence',
            'Cultural fit',
            'Long-term potential',
          ],
          constraints: ['Budget', 'Timeline', 'Location'],
          environment: {},
        },
        testActor
      );

      // Add alternatives (candidates)
      provenanceSystem.addAlternative(
        decision.id,
        {
          title: 'Candidate A',
          description: 'Senior developer with 8 years experience',
          pros: ['Extensive experience', 'Technical skills', 'Leadership'],
          cons: ['Higher salary requirements', 'Less familiar with our stack'],
          estimatedUtility: 0.85,
          confidence: 0.8,
          risks: [],
        },
        testActor
      );

      provenanceSystem.addAlternative(
        decision.id,
        {
          title: 'Candidate B',
          description: 'Mid-level developer with 4 years experience',
          pros: [
            'Good cultural fit',
            'Experience with our stack',
            'Growth potential',
          ],
          cons: ['Less experience', 'No leadership experience'],
          estimatedUtility: 0.75,
          confidence: 0.7,
          risks: [],
        },
        testActor
      );

      // Add evidence
      const evidence = provenanceSystem.addEvidence(
        {
          type: EvidenceType.DOCUMENT,
          content:
            'Technical assessment results show Candidate A scored 95% and Candidate B scored 82%',
          source: 'Technical assessment',
          reliability: 0.9,
          metadata: {},
        },
        testActor
      );

      // Make decision
      provenanceSystem.makeDecision(
        decision.id,
        decision.alternatives[0].id,
        {
          reasoning:
            'Candidate A was selected due to superior technical skills and leadership experience',
          evidenceIds: [evidence.id],
          confidenceScore: 0.85,
          ethicalConsiderations: [
            'Fair evaluation process',
            'Diversity considerations',
          ],
        },
        testActor
      );

      // Record outcome
      provenanceSystem.recordOutcome(
        decision.id,
        {
          status: DecisionOutcomeStatus.SUCCESSFUL,
          description:
            'Candidate A accepted the offer and has integrated well with the team',
          metrics: {
            performanceRating: 90,
            teamSatisfaction: 85,
          },
          expectedVsActual: {
            onboardingTime: {
              expected: '2 weeks',
              actual: '10 days',
            },
          },
        },
        testActor
      );

      // Generate text explanation
      const textExplanation = provenanceSystem.explainDecision(
        decision.id,
        {
          format: ExplanationFormat.TEXT,
          detailLevel: ExplanationDetailLevel.STANDARD,
        },
        testActor
      );

      expect(textExplanation).toBeDefined();
      expect(typeof textExplanation?.content).toBe('string');
      expect((textExplanation?.content as string).includes('Candidate A')).toBe(
        true
      );

      // Generate structured explanation
      const structuredExplanation = provenanceSystem.explainDecision(
        decision.id,
        {
          format: ExplanationFormat.STRUCTURED,
          detailLevel: ExplanationDetailLevel.DETAILED,
        },
        testActor
      );

      expect(structuredExplanation).toBeDefined();
      expect(typeof structuredExplanation?.content).toBe('object');
      expect(
        (structuredExplanation?.content as any).selectedAlternative
      ).toBeDefined();

      // Generate summary explanation
      const summaryExplanation = provenanceSystem.explainDecision(
        decision.id,
        {
          format: ExplanationFormat.SUMMARY,
          detailLevel: ExplanationDetailLevel.MINIMAL,
        },
        testActor
      );

      expect(summaryExplanation).toBeDefined();
      expect(typeof summaryExplanation?.content).toBe('string');
      expect((summaryExplanation?.content as string).length).toBeLessThan(
        (textExplanation?.content as string).length
      );

      // Use why function
      const whyResult = provenanceSystem.why(decision.id);
      expect(whyResult).toBeDefined();
      expect(typeof whyResult).toBe('string');
      expect((whyResult as string).includes('Candidate A')).toBe(true);
    });
  });

  describe('System Statistics', () => {
    it('should provide system statistics', () => {
      // Create some test data
      provenanceSystem.startDecision(
        'Test Decision 1',
        'Description 1',
        'domain1',
        DecisionImportance.MEDIUM,
        {
          situation: 'Situation 1',
          goals: ['Goal 1'],
          constraints: [],
          environment: {},
        },
        testActor
      );

      provenanceSystem.startDecision(
        'Test Decision 2',
        'Description 2',
        'domain2',
        DecisionImportance.HIGH,
        {
          situation: 'Situation 2',
          goals: ['Goal 2'],
          constraints: [],
          environment: {},
        },
        testActor
      );

      provenanceSystem.addEvidence(
        {
          type: EvidenceType.OBSERVATION,
          content: 'Test evidence 1',
          source: 'Source 1',
          reliability: 0.8,
          metadata: {},
        },
        testActor
      );

      // Get stats
      const stats = provenanceSystem.getStats(testActor);

      expect(stats).toBeDefined();
      expect(stats.decisions).toBeDefined();
      expect(stats.evidence).toBeDefined();
      expect(stats.audit).toBeDefined();
      expect(stats.decisions.totalDecisions).toBe(2);
      expect(stats.evidence.totalEvidence).toBe(1);
      expect(stats.audit.totalEntries).toBeGreaterThan(0);
    });
  });
});
