/**
 * Reduction Gate Contract Tests
 *
 * Verifies the four critical paths through DynamicCreationFlow's reduction gate:
 * 1. No reduction client → advisory-only, null returned, proposal stored in history
 * 2. Reduction client returns isExecutable:false → blocked, null returned, evidence stored
 * 3. Reduction client throws → fail-closed, null returned, error stored
 * 4. Reduction client allows → reductionProvenance attached, proposal returned
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DynamicCreationFlow } from '../mcp-capabilities/dynamic-creation-flow';
import type {
  OptionProposalLLM,
  OptionProposalRequest,
  OptionProposalResponse,
  ProposalHistoryEntry,
} from '../mcp-capabilities/dynamic-creation-flow';
import type { ReductionClient, ReductionResult } from '../mcp-capabilities/reduction-client';
import type { ExecError } from '../mcp-capabilities/leaf-contracts';

// ============================================================================
// Test Fixtures
// ============================================================================

const MOCK_PROPOSAL: OptionProposalResponse = {
  name: 'opt.testCapability',
  version: '1.0.0',
  btDsl: { type: 'sequence', children: [{ type: 'leaf', name: 'wait', args: { durationMs: 100 } }] },
  confidence: 0.8,
  estimatedSuccessRate: 0.9,
  reasoning: 'Test proposal',
};

const MOCK_FAILURE: ExecError = {
  code: 'test_failure',
  detail: 'test failure detail',
  retryable: false,
};

function createMockLLM(proposal: OptionProposalResponse | null = MOCK_PROPOSAL): OptionProposalLLM {
  return {
    proposeOption: vi.fn().mockResolvedValue(proposal),
  };
}

function createMockRegistry(): any {
  return {
    getLeafFactory: vi.fn().mockReturnValue({
      hasLeaf: () => true,
      getLeafSpec: () => ({ name: 'wait', version: '1.0.0' }),
    }),
    registerOption: vi.fn().mockReturnValue({ ok: true, id: 'opt_123' }),
    getShadowStats: vi.fn().mockReturnValue({ totalRuns: 0, successRate: 0, lastRunTimestamp: 0 }),
    getShadowOptions: vi.fn().mockReturnValue([]),
    retireOption: vi.fn().mockResolvedValue(true),
  };
}

/**
 * Prime a DynamicCreationFlow into impasse state for a task so that
 * requestOptionProposal doesn't early-return due to missing impasse state.
 */
function primeImpasse(flow: DynamicCreationFlow, taskId: string): void {
  // Push enough failures to cross the threshold (default: 3)
  for (let i = 0; i < 4; i++) {
    flow.checkImpasse(taskId, MOCK_FAILURE);
  }
}

// ============================================================================
// Contract Tests
// ============================================================================

describe('Reduction Gate Contract', () => {
  let registry: ReturnType<typeof createMockRegistry>;

  beforeEach(() => {
    registry = createMockRegistry();
  });

  // --------------------------------------------------------------------------
  // Path 1a: No reduction client, no advisory flag → skips LLM entirely
  // --------------------------------------------------------------------------

  describe('without reduction client (pre-LLM gate)', () => {
    it('requestOptionProposal returns null without calling LLM', async () => {
      const mockLLM = createMockLLM();
      const flow = new DynamicCreationFlow(registry, mockLLM);
      primeImpasse(flow, 'task-1');

      const result = await flow.requestOptionProposal(
        'task-1',
        {} as any,
        'test task',
        [MOCK_FAILURE]
      );

      expect(result).toBeNull();
      expect(mockLLM.proposeOption).not.toHaveBeenCalled();
    });

    it('stores skipped_no_reduction_client entry with null proposal', async () => {
      const flow = new DynamicCreationFlow(registry, createMockLLM());
      primeImpasse(flow, 'task-1');

      await flow.requestOptionProposal('task-1', {} as any, 'test task', [MOCK_FAILURE]);

      const history = flow.getProposalHistory('task-1');
      expect(history.length).toBeGreaterThanOrEqual(1);
      const entry = history.find((h: ProposalHistoryEntry) => h.outcome === 'skipped_no_reduction_client');
      expect(entry).toBeDefined();
      expect(entry!.proposal).toBeNull();
      expect(entry!.reductionResult).toBeUndefined();
      expect(entry!.reductionError).toBeUndefined();
    });

    it('isReductionClientBound returns false', () => {
      const flow = new DynamicCreationFlow(registry, createMockLLM());
      expect(flow.isReductionClientBound()).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Path 1b: No reduction client, advisory flag enabled → calls LLM, advisory outcome
  // --------------------------------------------------------------------------

  describe('without reduction client (DYNAMIC_CREATION_ADVISORY_MODE=1)', () => {
    const origEnv = process.env.DYNAMIC_CREATION_ADVISORY_MODE;

    beforeEach(() => { process.env.DYNAMIC_CREATION_ADVISORY_MODE = '1'; });
    afterEach(() => {
      if (origEnv === undefined) delete process.env.DYNAMIC_CREATION_ADVISORY_MODE;
      else process.env.DYNAMIC_CREATION_ADVISORY_MODE = origEnv;
    });

    it('calls LLM and stores proposal with advisory_only outcome', async () => {
      const mockLLM = createMockLLM();
      const flow = new DynamicCreationFlow(registry, mockLLM);
      primeImpasse(flow, 'task-1');

      const result = await flow.requestOptionProposal(
        'task-1',
        {} as any,
        'test task',
        [MOCK_FAILURE]
      );

      expect(result).toBeNull();
      expect(mockLLM.proposeOption).toHaveBeenCalled();
      const history = flow.getProposalHistory('task-1');
      const entry = history.find((h: ProposalHistoryEntry) => h.outcome === 'advisory_only');
      expect(entry).toBeDefined();
      expect(entry!.proposal).not.toBeNull();
      expect(entry!.proposal!.name).toBe('opt.testCapability');
    });
  });

  // --------------------------------------------------------------------------
  // Path 2: Reduction client returns isExecutable:false → blocked
  // --------------------------------------------------------------------------

  describe('with reduction client returning isExecutable:false', () => {
    const blockingClient: ReductionClient = {
      reduceOptionProposal: vi.fn().mockResolvedValue({
        isExecutable: false,
        blockReason: 'semantic_violation',
      } satisfies ReductionResult),
    };

    it('requestOptionProposal returns null', async () => {
      const flow = new DynamicCreationFlow(registry, createMockLLM());
      flow.setReductionClient(blockingClient);
      primeImpasse(flow, 'task-1');

      const result = await flow.requestOptionProposal(
        'task-1',
        {} as any,
        'test task',
        [MOCK_FAILURE]
      );

      expect(result).toBeNull();
    });

    it('stores proposal + reductionResult in history with blocked outcome', async () => {
      const flow = new DynamicCreationFlow(registry, createMockLLM());
      flow.setReductionClient(blockingClient);
      primeImpasse(flow, 'task-1');

      await flow.requestOptionProposal('task-1', {} as any, 'test task', [MOCK_FAILURE]);

      const history = flow.getProposalHistory('task-1');
      const entry = history.find((h: ProposalHistoryEntry) => h.outcome === 'blocked');
      expect(entry).toBeDefined();
      expect(entry!.proposal).not.toBeNull();
      expect(entry!.reductionResult).toBeDefined();
      expect(entry!.reductionResult!.isExecutable).toBe(false);
      expect(entry!.reductionResult!.blockReason).toBe('semantic_violation');
    });
  });

  // --------------------------------------------------------------------------
  // Path 3: Reduction client throws → fail-closed
  // --------------------------------------------------------------------------

  describe('with reduction client throwing an error', () => {
    const throwingClient: ReductionClient = {
      reduceOptionProposal: vi.fn().mockRejectedValue(
        new Error('Sterling connection refused')
      ),
    };

    it('requestOptionProposal returns null (fail-closed)', async () => {
      const flow = new DynamicCreationFlow(registry, createMockLLM());
      flow.setReductionClient(throwingClient);
      primeImpasse(flow, 'task-1');

      const result = await flow.requestOptionProposal(
        'task-1',
        {} as any,
        'test task',
        [MOCK_FAILURE]
      );

      expect(result).toBeNull();
    });

    it('stores proposal + reductionError in history with reduction_error outcome', async () => {
      const flow = new DynamicCreationFlow(registry, createMockLLM());
      flow.setReductionClient(throwingClient);
      primeImpasse(flow, 'task-1');

      await flow.requestOptionProposal('task-1', {} as any, 'test task', [MOCK_FAILURE]);

      const history = flow.getProposalHistory('task-1');
      const entry = history.find((h: ProposalHistoryEntry) => h.outcome === 'reduction_error');
      expect(entry).toBeDefined();
      expect(entry!.proposal).not.toBeNull();
      expect(entry!.reductionError).toBe('Sterling connection refused');
      expect(entry!.reductionResult).toBeUndefined();
    });

    it('does not crash the flow (no unhandled rejection)', async () => {
      const flow = new DynamicCreationFlow(registry, createMockLLM());
      flow.setReductionClient(throwingClient);
      primeImpasse(flow, 'task-1');

      // Should not throw
      await expect(
        flow.requestOptionProposal('task-1', {} as any, 'test task', [MOCK_FAILURE])
      ).resolves.toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // Path 4: Reduction client allows → provenance attached
  // --------------------------------------------------------------------------

  describe('with reduction client allowing execution', () => {
    const allowingResult: ReductionResult = {
      isExecutable: true,
      committedIrDigest: 'digest_abc123',
      committedGoalPropId: 'prop_xyz789',
    };

    const allowingClient: ReductionClient = {
      reduceOptionProposal: vi.fn().mockResolvedValue(allowingResult),
    };

    it('requestOptionProposal returns the proposal with reductionProvenance', async () => {
      const flow = new DynamicCreationFlow(registry, createMockLLM());
      flow.setReductionClient(allowingClient);
      primeImpasse(flow, 'task-1');

      const result = await flow.requestOptionProposal(
        'task-1',
        {} as any,
        'test task',
        [MOCK_FAILURE]
      );

      expect(result).not.toBeNull();
      expect(result!.reductionProvenance).toBeDefined();
      expect(result!.reductionProvenance!.isExecutable).toBe(true);
      expect(result!.reductionProvenance!.committedIrDigest).toBe('digest_abc123');
      expect(result!.reductionProvenance!.committedGoalPropId).toBe('prop_xyz789');
    });

    it('stores proposal in history with allowed outcome and reductionResult', async () => {
      const flow = new DynamicCreationFlow(registry, createMockLLM());
      flow.setReductionClient(allowingClient);
      primeImpasse(flow, 'task-1');

      await flow.requestOptionProposal('task-1', {} as any, 'test task', [MOCK_FAILURE]);

      const history = flow.getProposalHistory('task-1');
      const entry = history.find((h: ProposalHistoryEntry) => h.outcome === 'allowed');
      expect(entry).toBeDefined();
      expect(entry!.proposal).not.toBeNull();
      expect(entry!.reductionResult).toBeDefined();
      expect(entry!.reductionResult!.isExecutable).toBe(true);
    });

    it('isReductionClientBound returns true after setReductionClient', () => {
      const flow = new DynamicCreationFlow(registry, createMockLLM());
      expect(flow.isReductionClientBound()).toBe(false);
      flow.setReductionClient(allowingClient);
      expect(flow.isReductionClientBound()).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Edge case: LLM returns null
  // --------------------------------------------------------------------------

  describe('when LLM returns null proposal', () => {
    it('stores llm_returned_null in history', async () => {
      const flow = new DynamicCreationFlow(registry, createMockLLM(null));
      flow.setReductionClient({
        reduceOptionProposal: vi.fn().mockResolvedValue({ isExecutable: true }),
      });
      primeImpasse(flow, 'task-1');

      const result = await flow.requestOptionProposal(
        'task-1',
        {} as any,
        'test task',
        [MOCK_FAILURE]
      );

      expect(result).toBeNull();
      const history = flow.getProposalHistory('task-1');
      const entry = history.find((h: ProposalHistoryEntry) => h.outcome === 'llm_returned_null');
      expect(entry).toBeDefined();
      expect(entry!.proposal).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // Proposal history ring buffer
  // --------------------------------------------------------------------------

  describe('proposal history ring buffer', () => {
    it('evicts oldest entries when exceeding 50 per task', async () => {
      const flow = new DynamicCreationFlow(registry, createMockLLM());
      // No reduction client → skipped_no_reduction_client entries

      for (let i = 0; i < 60; i++) {
        primeImpasse(flow, 'task-1');
        await flow.requestOptionProposal('task-1', {} as any, 'test task', [MOCK_FAILURE]);
      }

      const history = flow.getProposalHistory('task-1');
      expect(history.length).toBe(50);
    });

    it('getProposalHistorySize returns correct totals', async () => {
      const flow = new DynamicCreationFlow(registry, createMockLLM());

      for (let i = 0; i < 5; i++) {
        primeImpasse(flow, 'task-a');
        await flow.requestOptionProposal('task-a', {} as any, 'test', [MOCK_FAILURE]);
      }
      for (let i = 0; i < 3; i++) {
        primeImpasse(flow, 'task-b');
        await flow.requestOptionProposal('task-b', {} as any, 'test', [MOCK_FAILURE]);
      }

      const size = flow.getProposalHistorySize();
      expect(size.totalEntries).toBe(8);
      expect(size.taskCount).toBe(2);
    });

    it('introspection still works after eviction', async () => {
      const allowingClient: ReductionClient = {
        reduceOptionProposal: vi.fn().mockResolvedValue({
          isExecutable: true,
          committedIrDigest: 'digest_latest',
        } satisfies ReductionResult),
      };

      const flow = new DynamicCreationFlow(registry, createMockLLM());
      flow.setReductionClient(allowingClient);

      // Fill 55 entries so first 5 get evicted
      for (let i = 0; i < 55; i++) {
        primeImpasse(flow, 'task-1');
        await flow.requestOptionProposal('task-1', {} as any, 'test', [MOCK_FAILURE]);
      }

      const history = flow.getProposalHistory('task-1');
      expect(history.length).toBe(50);
      // Most recent entry should still be accessible with correct outcome
      const latest = history[history.length - 1];
      expect(latest.outcome).toBe('allowed');
      expect(latest.proposal).not.toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // Skip rate-limiting (debounce advances on skip)
  // --------------------------------------------------------------------------

  describe('skip rate-limiting', () => {
    it('updates lastProposalTime on skip so debounce prevents rapid-fire entries', async () => {
      const flow = new DynamicCreationFlow(registry, createMockLLM(), {
        debounceMs: 60000, // 60s debounce — ensures second call is within debounce window
      });

      // Prime and skip once
      primeImpasse(flow, 'task-1');
      await flow.requestOptionProposal('task-1', {} as any, 'test', [MOCK_FAILURE]);

      // Second call immediately — impasse check should return false because
      // lastProposalTime was updated on skip and debounce hasn't elapsed
      const impasseState = flow.getImpasseState('task-1');
      expect(impasseState).toBeDefined();
      expect(impasseState!.lastProposalTime).toBeGreaterThan(0);

      // checkImpasse should NOT return isImpasse since debounce hasn't elapsed
      const result = flow.checkImpasse('task-1', MOCK_FAILURE);
      expect(result.isImpasse).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // TTL eviction of stale task histories
  // --------------------------------------------------------------------------

  describe('TTL eviction', () => {
    it('evicts task histories with no activity for 30+ minutes on next write', async () => {
      const allowingClient: ReductionClient = {
        reduceOptionProposal: vi.fn().mockResolvedValue({
          isExecutable: true,
        } satisfies ReductionResult),
      };

      const flow = new DynamicCreationFlow(registry, createMockLLM());
      flow.setReductionClient(allowingClient);

      // Write entries for task-old
      primeImpasse(flow, 'task-old');
      await flow.requestOptionProposal('task-old', {} as any, 'test', [MOCK_FAILURE]);
      expect(flow.getProposalHistory('task-old').length).toBe(1);

      // Manually backdate task-old's entry to 31 minutes ago
      const oldHistory = flow.getProposalHistory('task-old');
      oldHistory[0].timestamp = Date.now() - 31 * 60 * 1000;

      // Write to a different task — should trigger TTL eviction of task-old
      primeImpasse(flow, 'task-new');
      await flow.requestOptionProposal('task-new', {} as any, 'test', [MOCK_FAILURE]);

      // task-old should be evicted
      expect(flow.getProposalHistory('task-old').length).toBe(0);
      // task-new should still exist
      expect(flow.getProposalHistory('task-new').length).toBe(1);
    });
  });
});
