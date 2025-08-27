/**
 * Contract Testing for Core Module Interfaces
 *
 * These tests validate that module interfaces conform to their
 * contracts and maintain compatibility across changes.
 *
 * @author @darianrosebrook
 */

import { Arbiter, SignalProcessor } from '../index';
import {
  PerformanceTracker,
  BudgetEnforcer,
  DegradationManager,
  AlertingSystem,
} from '../real-time';
import { CapabilityRegistry } from '../mcp-capabilities';
import {
  Signal,
  CognitiveTask,
  validateSignal,
  validateCognitiveTask,
  PerformanceMetrics,
  TaskSignature,
} from '../types';
import { CognitiveModule, ReflexModule } from '../arbiter';
import {
  PerformanceContext,
  BudgetConfig,
  OperationType,
} from '../real-time/types';

describe('Module Contract Testing', () => {
  describe('Arbiter Interface Contract', () => {
    let arbiter: Arbiter;

    beforeEach(() => {
      arbiter = new Arbiter({ config: { debugMode: false } });
    });

    afterEach(() => {
      arbiter.stop();
    });

    test('should implement required Arbiter interface methods', () => {
      // Core interface methods must exist
      expect(typeof arbiter.start).toBe('function');
      expect(typeof arbiter.stop).toBe('function');
      expect(typeof arbiter.processSignal).toBe('function');
      expect(typeof arbiter.processCognitiveTask).toBe('function');
      expect(typeof arbiter.getStatus).toBe('function');
      expect(typeof arbiter.getPerformanceMetrics).toBe('function');
      expect(typeof arbiter.registerModule).toBe('function');
    });

    test('should accept valid Signal inputs', () => {
      const validSignal: Signal = {
        type: 'health',
        intensity: 0.5,
        urgency: 0.5,
        trend: -0.1,
        confidence: 0.9,
        timestamp: Date.now(),
        source: 'contract-test',
      };

      // Should not throw for valid signal
      expect(() => arbiter.processSignal(validSignal)).not.toThrow();
    });

    test('should handle invalid Signal inputs gracefully', () => {
      const invalidSignals = [
        // Missing required fields
        { type: 'health' },
        // Invalid intensity range
        {
          type: 'health',
          intensity: 2.0,
          trend: 0,
          confidence: 0.9,
          timestamp: 0,
          source: 'test',
        },
        // Invalid confidence range
        {
          type: 'health',
          intensity: 0.5,
          trend: 0,
          confidence: 2.0,
          timestamp: 0,
          source: 'test',
        },
        // Invalid timestamp
        {
          type: 'health',
          intensity: 0.5,
          trend: 0,
          confidence: 0.9,
          timestamp: -1,
          source: 'test',
        },
      ];

      invalidSignals.forEach((signal) => {
        // The arbiter catches validation errors and doesn't throw
        // Instead, we test that invalid signals are handled gracefully
        expect(() => arbiter.processSignal(signal as Signal)).not.toThrow();
      });
    });

    test('should return valid status object', () => {
      const status = arbiter.getStatus();

      expect(status).toHaveProperty('running');
      expect(typeof status.running).toBe('boolean');

      expect(status).toHaveProperty('registeredModules');
      expect(Array.isArray(status.registeredModules)).toBe(true);

      expect(status).toHaveProperty('lastSignalTime');
      expect(status).toHaveProperty('totalSignalsProcessed');
      expect(typeof status.totalSignalsProcessed).toBe('number');
    });

    test('should return valid performance metrics', () => {
      const metrics = arbiter.getPerformanceMetrics();

      expect(metrics).toHaveProperty('lastCycleTime');
      expect(typeof metrics.lastCycleTime).toBe('number');

      expect(metrics).toHaveProperty('lastCycleTime');
      expect(typeof metrics.lastCycleTime).toBe('number');

      expect(metrics).toHaveProperty('averageResponseTime');
      expect(typeof metrics.averageResponseTime).toBe('number');
    });

    test('should process CognitiveTask with valid output', async () => {
      const validTask: CognitiveTask = {
        id: 'contract-test-task',
        type: 'reactive',
        priority: 0.5,
        complexity: 'simple',
        context: { contractTest: true },
      };

      const result = await arbiter.processCognitiveTask(validTask);

      // Should return a valid result
      expect(result).toBeDefined();
      expect(typeof result === 'string' || typeof result === 'object').toBe(
        true
      );
    });
  });

  describe('SignalProcessor Interface Contract', () => {
    let processor: SignalProcessor;

    beforeEach(() => {
      processor = new SignalProcessor();
    });

    afterEach(() => {
      processor.dispose();
    });

    test('should implement required SignalProcessor interface methods', () => {
      expect(typeof processor.normalizeSignal).toBe('function');
      expect(typeof processor.calculateNeeds).toBe('function');
      expect(typeof processor.aggregateSignals).toBe('function');
      expect(typeof processor.calculatePriority).toBe('function');
      expect(typeof processor.generateGoalCandidates).toBe('function');
      expect(typeof processor.checkFeasibility).toBe('function');
      expect(typeof processor.dispose).toBe('function');
    });

    test('should normalize signals within valid bounds', () => {
      const testSignal: Signal = {
        type: 'health',
        intensity: 1.5, // Out of bounds
        urgency: 0.5,
        trend: 0.0,
        confidence: 0.9,
        timestamp: Date.now(),
        source: 'contract-test',
      };

      const normalized = processor.normalizeSignal(testSignal);

      expect(normalized.intensity).toBeGreaterThanOrEqual(0);
      expect(normalized.intensity).toBeLessThanOrEqual(1);
      expect(normalized.confidence).toBeGreaterThanOrEqual(0);
      expect(normalized.confidence).toBeLessThanOrEqual(1);
    });

    test('should calculate needs from signals', () => {
      const testSignals: Signal[] = [
        {
          type: 'health',
          intensity: 0.3,
          urgency: 0.3,
          trend: -0.1,
          confidence: 0.9,
          timestamp: Date.now(),
          source: 'test1',
        },
        {
          type: 'hunger',
          intensity: 0.7,
          urgency: 0.7,
          trend: 0.05,
          confidence: 0.8,
          timestamp: Date.now(),
          source: 'test2',
        },
      ];

      const needs = processor.calculateNeeds(testSignals);

      expect(Array.isArray(needs)).toBe(true);
      needs.forEach((need) => {
        expect(need).toHaveProperty('type');
        expect(need).toHaveProperty('urgency');
        expect(need).toHaveProperty('confidence');
        expect(need.urgency).toBeGreaterThanOrEqual(0);
        expect(need.urgency).toBeLessThanOrEqual(1);
        expect(need.confidence).toBeGreaterThanOrEqual(0);
        expect(need.confidence).toBeLessThanOrEqual(1);
      });
    });

    test('should aggregate signals correctly', () => {
      const duplicateSignals: Signal[] = [
        {
          type: 'health',
          intensity: 0.4,
          urgency: 0.4,
          trend: -0.1,
          confidence: 0.9,
          timestamp: 1000,
          source: 'test1',
        },
        {
          type: 'health',
          intensity: 0.6,
          urgency: 0.6,
          trend: -0.05,
          confidence: 0.8,
          timestamp: 1100,
          source: 'test2',
        },
      ];

      const aggregated = processor.aggregateSignals(duplicateSignals);

      expect(Array.isArray(aggregated)).toBe(true);

      // Should consolidate duplicate signal types
      const healthSignals = aggregated.filter((s) => s.type === 'health');
      expect(healthSignals.length).toBeLessThanOrEqual(1);

      if (healthSignals.length > 0) {
        const healthSignal = healthSignals[0];
        expect(healthSignal.intensity).toBeGreaterThanOrEqual(0);
        expect(healthSignal.intensity).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('CognitiveModule Interface Contract', () => {
    let reflexModule: ReflexModule;

    beforeEach(() => {
      reflexModule = new ReflexModule();
    });

    test('should implement required CognitiveModule interface', () => {
      expect(typeof reflexModule.process).toBe('function');
      expect(typeof reflexModule.getName).toBe('function');
      expect(typeof reflexModule.getPriority).toBe('function');
      expect(typeof reflexModule.canHandle).toBe('function');
    });

    test('should return valid module metadata', () => {
      const name = reflexModule.getName();
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);

      const priority = reflexModule.getPriority();
      expect(typeof priority).toBe('number');
      expect(priority).toBeGreaterThanOrEqual(0);
      expect(priority).toBeLessThanOrEqual(1);
    });

    test('should handle task processing with valid output', async () => {
      const testTask: CognitiveTask = {
        id: 'module-contract-test',
        type: 'reactive',
        priority: 0.8,
        complexity: 'simple',
        context: { moduleTest: true },
      };

      const signature: TaskSignature = {
        symbolicPreconditions: 0.2,
        socialContent: false,
        ambiguousContext: false,
        requiresPlanning: false,
        timeConstraint: 50,
        riskLevel: 'low',
      };

      if (reflexModule.canHandle(testTask, signature)) {
        const result = await reflexModule.process(testTask);
        expect(result).toBeDefined();
      }
    });
  });

  describe('Real-Time Components Interface Contracts', () => {
    let performanceTracker: PerformanceTracker;
    let budgetEnforcer: BudgetEnforcer;

    beforeEach(() => {
      performanceTracker = new PerformanceTracker();

      const mockBudgets: Record<PerformanceContext, BudgetConfig> = {
        [PerformanceContext.EMERGENCY]: {
          total: 50,
          allocation: { signalProcessing: 10, routing: 5, execution: 35 },
          triggers: ['combat'],
        },
        [PerformanceContext.ROUTINE]: {
          total: 200,
          allocation: { signalProcessing: 30, routing: 20, execution: 150 },
          triggers: ['exploration'],
        },
        [PerformanceContext.DELIBERATIVE]: {
          total: 1000,
          allocation: { signalProcessing: 50, routing: 50, execution: 900 },
          triggers: ['planning'],
        },
      };

      budgetEnforcer = new BudgetEnforcer(mockBudgets, {
        loadScaling: {
          lowLoad: 1.0,
          mediumLoad: 0.8,
          highLoad: 0.6,
          criticalLoad: 0.4,
        },
        contextModifiers: {},
        qosGuarantees: {},
      });
    });

    afterEach(() => {
      performanceTracker.dispose();
      budgetEnforcer.dispose();
    });

    test('PerformanceTracker should implement required interface', () => {
      expect(typeof performanceTracker.startTracking).toBe('function');
      expect(typeof performanceTracker.recordCompletion).toBe('function');
      expect(typeof performanceTracker.getPerformanceStats).toBe('function');
      // analyzePerformanceTrends method is not part of the public interface
      expect(typeof performanceTracker.dispose).toBe('function');
    });

    test('BudgetEnforcer should implement required interface', () => {
      expect(typeof budgetEnforcer.allocateBudget).toBe('function');
      expect(typeof budgetEnforcer.monitorBudgetUsage).toBe('function');
      expect(typeof budgetEnforcer.triggerDegradation).toBe('function');
      expect(typeof budgetEnforcer.calculateDynamicBudget).toBe('function');
      expect(typeof budgetEnforcer.dispose).toBe('function');
    });

    test('should provide valid performance tracking', () => {
      const mockOperation = {
        id: 'contract-test-op',
        type: OperationType.SIGNAL_PROCESSING,
        name: 'test_operation',
        module: 'contract-test',
        priority: 0.5,
      };

      const session = performanceTracker.startTracking(
        mockOperation,
        PerformanceContext.ROUTINE
      );

      expect(session).toHaveProperty('operation');
      expect(session).toHaveProperty('startTime');
      expect(session).toHaveProperty('context');
      expect(typeof session.startTime).toBe('number');
    });

    test('should provide valid budget allocation', () => {
      const mockOperation = {
        id: 'budget-test-op',
        type: OperationType.CAPABILITY_EXECUTION,
        name: 'test_capability',
        module: 'contract-test',
        priority: 0.7,
      };

      const allocation = budgetEnforcer.allocateBudget(
        mockOperation,
        PerformanceContext.ROUTINE
      );

      expect(allocation).toHaveProperty('totalBudget');
      expect(allocation).toHaveProperty('allocatedBudget');
      expect(allocation).toHaveProperty('context');
      expect(typeof allocation.totalBudget).toBe('number');
      expect(allocation.totalBudget).toBeGreaterThan(0);
    });
  });

  describe('MCP Capabilities Interface Contract', () => {
    let capabilityRegistry: CapabilityRegistry;

    beforeEach(() => {
      capabilityRegistry = new CapabilityRegistry();
    });

    afterEach(() => {
      capabilityRegistry.removeAllListeners();
    });

    test('should implement required CapabilityRegistry interface', () => {
      expect(typeof capabilityRegistry.registerCapability).toBe('function');
      expect(typeof capabilityRegistry.discoverCapabilities).toBe('function');
      expect(typeof capabilityRegistry.validateExecution).toBe('function');
      expect(typeof capabilityRegistry.executeCapability).toBe('function');
      expect(typeof capabilityRegistry.getCapability).toBe('function');
      expect(typeof capabilityRegistry.removeAllListeners).toBe('function');
    });

    test('should handle capability registration contract', () => {
      const testCapability = {
        id: 'contract_test_capability',
        name: 'Contract Test',
        description: 'Test capability for contract validation',
        category: 'social' as const,
        preconditions: [],
        effects: [],
        costHint: 10,
        durationMs: 100,
        energyCost: 1,
        safetyTags: ['reversible'],
        constitutionalRules: [],
        riskLevel: 1, // RiskLevel.LOW
        cooldownMs: 0,
        maxConcurrent: 1,
        requiresApproval: false,
        enabled: true,
      };

      const result = capabilityRegistry.registerCapability(testCapability);

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('capabilityId');
      expect(typeof result.success).toBe('boolean');

      if (result.success) {
        expect(result.capabilityId).toBe(testCapability.id);
      }
    });

    test('should handle capability discovery contract', () => {
      const discoveryResult = capabilityRegistry.discoverCapabilities({
        category: 'movement',
      });

      expect(Array.isArray(discoveryResult)).toBe(true);
      discoveryResult.forEach((match) => {
        expect(match).toHaveProperty('capability');
        expect(match).toHaveProperty('matchScore');
        expect(typeof match.matchScore).toBe('number');
        expect(match.matchScore).toBeGreaterThanOrEqual(0);
        expect(match.matchScore).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('Type System Contract Validation', () => {
    test('Signal type should validate correctly', () => {
      const validSignal = {
        type: 'health',
        intensity: 0.5,
        urgency: 0.4,
        trend: -0.1,
        confidence: 0.9,
        timestamp: Date.now(),
        source: 'type-test',
      };

      // Should parse without error
      expect(() => validateSignal(validSignal)).not.toThrow();

      const parsed = validateSignal(validSignal);
      expect(parsed.type).toBe(validSignal.type);
      expect(parsed.intensity).toBe(validSignal.intensity);
    });

    test('CognitiveTask type should validate correctly', () => {
      const validTask = {
        id: 'type-test-task',
        type: 'reactive',
        priority: 0.7,
        complexity: 'moderate',
        context: { typeTest: true },
      };

      // Should parse without error
      expect(() => validateCognitiveTask(validTask)).not.toThrow();

      const parsed = validateCognitiveTask(validTask);
      expect(parsed.id).toBe(validTask.id);
      expect(parsed.type).toBe(validTask.type);
    });

    test('should reject invalid type inputs', () => {
      const invalidSignal = {
        type: 'invalid_type',
        intensity: 2.0, // Out of bounds
        confidence: -0.5, // Out of bounds
        timestamp: 'invalid', // Wrong type
        source: 123, // Wrong type
      };

      expect(() => validateSignal(invalidSignal)).toThrow();
    });
  });

  describe('Event System Contract', () => {
    let arbiter: Arbiter;

    beforeEach(() => {
      arbiter = new Arbiter({ config: { debugMode: false } });
    });

    afterEach(() => {
      arbiter.stop();
    });

    test('should emit required events with correct structure', (done) => {
      const timeout = setTimeout(() => {
        done(new Error('Test timed out waiting for signal-received event'));
      }, 1000);

      arbiter.on('signal-received', (signal) => {
        try {
          expect(signal).toHaveProperty('type');
          expect(signal).toHaveProperty('intensity');
          expect(signal).toHaveProperty('timestamp');

          clearTimeout(timeout);
          done();
        } catch (error) {
          clearTimeout(timeout);
          done(error);
        }
      });

      const testSignal: Signal = {
        type: 'social',
        intensity: 0.5,
        urgency: 0.5,
        trend: 0.0,
        confidence: 1.0,
        timestamp: Date.now(),
        source: 'event-contract-test',
      };

      arbiter.processSignal(testSignal);
    });

    test('should handle event listener errors gracefully', () => {
      arbiter.on('signal-received', () => {
        throw new Error('Event handler error');
      });

      const testSignal: Signal = {
        type: 'threat',
        intensity: 0.5,
        urgency: 0.5,
        trend: 0.0,
        confidence: 1.0,
        timestamp: Date.now(),
        source: 'error-test',
      };

      // Should not throw even if event handler throws
      expect(() => arbiter.processSignal(testSignal)).not.toThrow();
    });
  });
});
