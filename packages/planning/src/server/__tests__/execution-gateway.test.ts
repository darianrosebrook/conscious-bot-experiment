import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  executeViaGateway,
  onGatewayAudit,
  getExecutorMode,
  type GatewayRequest,
  type GatewayAuditEntry,
} from '../execution-gateway';

// Mock mc-client (HTTP transport)
vi.mock('../../modules/mc-client', () => ({
  mcPostJson: vi.fn(),
  checkBotConnectionDetailed: vi.fn(),
}));

import { mcPostJson, checkBotConnectionDetailed } from '../../modules/mc-client';

const mockMcPostJson = vi.mocked(mcPostJson);
const mockBotCheck = vi.mocked(checkBotConnectionDetailed);

function makeRequest(overrides: Partial<GatewayRequest> = {}): GatewayRequest {
  return {
    origin: 'reactive',
    priority: 'normal',
    action: { type: 'dig_block', parameters: { block: 'oak_log' } },
    ...overrides,
  };
}

describe('ExecutionGateway', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: live mode
    process.env.EXECUTOR_MODE = 'live';
    process.env.EXECUTOR_LIVE_CONFIRM = 'YES';
    // Default: bot connected
    mockBotCheck.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    process.env.EXECUTOR_MODE = originalEnv.EXECUTOR_MODE;
    process.env.EXECUTOR_LIVE_CONFIRM = originalEnv.EXECUTOR_LIVE_CONFIRM;
  });

  // -----------------------------------------------------------------------
  // Shadow mode blocking
  // -----------------------------------------------------------------------

  it('blocks action in shadow mode', async () => {
    process.env.EXECUTOR_MODE = 'shadow';
    const result = await executeViaGateway(makeRequest());
    expect(result.ok).toBe(false);
    expect(result.outcome).toBe('shadow');
    expect(result.shadowBlocked).toBe(true);
    expect(result.error).toMatch(/shadow/i);
    // Should NOT have called mcPostJson
    expect(mockMcPostJson).not.toHaveBeenCalled();
  });

  it('blocks when EXECUTOR_LIVE_CONFIRM is not YES', async () => {
    process.env.EXECUTOR_MODE = 'live';
    process.env.EXECUTOR_LIVE_CONFIRM = 'no';
    const result = await executeViaGateway(makeRequest());
    expect(result.ok).toBe(false);
    expect(result.outcome).toBe('shadow');
    expect(result.shadowBlocked).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Bot connection pre-flight
  // -----------------------------------------------------------------------

  it('fails when bot is not connected', async () => {
    mockBotCheck.mockResolvedValue({ ok: false, failureKind: 'refused' });
    const result = await executeViaGateway(makeRequest());
    expect(result.ok).toBe(false);
    expect(result.outcome).toBe('error');
    expect(result.error).toMatch(/not connected/i);
    expect(result.shadowBlocked).toBe(false);
    expect(mockMcPostJson).not.toHaveBeenCalled();
  });

  it('fails when bot connection times out', async () => {
    mockBotCheck.mockResolvedValue({ ok: false, failureKind: 'timeout' });
    const result = await executeViaGateway(makeRequest());
    expect(result.ok).toBe(false);
    expect(result.outcome).toBe('error');
    expect(result.error).toMatch(/timed out/i);
  });

  // -----------------------------------------------------------------------
  // Response normalization (the core contract)
  // -----------------------------------------------------------------------

  it('returns normalized ok:true for successful leaf action', async () => {
    mockMcPostJson.mockResolvedValue({
      ok: true,
      data: {
        success: true,
        result: { success: true, collected: 3 },
      },
    });
    const result = await executeViaGateway(makeRequest());
    expect(result.ok).toBe(true);
    expect(result.outcome).toBe('executed');
    expect(result.data).toEqual({ success: true, collected: 3 });
    expect(result.shadowBlocked).toBe(false);
    expect(result.origin).toBe('reactive');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('returns normalized ok:false when transport succeeds but leaf fails', async () => {
    // The soak-stall shape: transport success:true wrapping leaf success:false
    mockMcPostJson.mockResolvedValue({
      ok: true,
      data: {
        success: true,
        result: {
          success: false,
          error: { detail: 'No reachable oak_log found', code: 'acquire.noneCollected' },
          totalAcquired: 0,
        },
      },
    });
    const result = await executeViaGateway(makeRequest());
    expect(result.ok).toBe(false);
    expect(result.outcome).toBe('executed');
    expect(result.error).toBe('No reachable oak_log found');
    expect(result.failureCode).toBe('acquire.noneCollected');
    expect(result.data).toEqual({
      success: false,
      error: { detail: 'No reachable oak_log found', code: 'acquire.noneCollected' },
      totalAcquired: 0,
    });
  });

  it('returns normalized ok:false when transport fails', async () => {
    mockMcPostJson.mockResolvedValue({
      ok: false,
      error: 'HTTP 500: Internal server error',
    });
    const result = await executeViaGateway(makeRequest());
    expect(result.ok).toBe(false);
    expect(result.outcome).toBe('error');
    expect(result.error).toBe('HTTP 500: Internal server error');
  });

  it('returns normalized ok:false when leaf reports status:failure', async () => {
    mockMcPostJson.mockResolvedValue({
      ok: true,
      data: {
        success: true,
        result: {
          status: 'failure',
          message: 'Cannot reach target block',
        },
      },
    });
    const result = await executeViaGateway(makeRequest());
    expect(result.ok).toBe(false);
    expect(result.outcome).toBe('executed');
    expect(result.error).toBe('Cannot reach target block');
  });

  // -----------------------------------------------------------------------
  // Network error handling
  // -----------------------------------------------------------------------

  it('handles network error gracefully', async () => {
    mockMcPostJson.mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await executeViaGateway(makeRequest());
    expect(result.ok).toBe(false);
    expect(result.outcome).toBe('error');
    expect(result.error).toBe('ECONNREFUSED');
    expect(result.shadowBlocked).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Audit emission
  // -----------------------------------------------------------------------

  it('emits audit entry on successful action', async () => {
    mockMcPostJson.mockResolvedValue({
      ok: true,
      data: { success: true, result: { success: true } },
    });

    const entries: GatewayAuditEntry[] = [];
    const unsub = onGatewayAudit((e) => entries.push(e));

    await executeViaGateway(makeRequest({
      origin: 'executor',
      context: { taskId: 'task-1', stepId: 'step-1' },
    }));

    unsub();

    expect(entries).toHaveLength(1);
    expect(entries[0].origin).toBe('executor');
    expect(entries[0].mode).toBe('live');
    expect(entries[0].outcome).toBe('executed');
    expect(entries[0].ok).toBe(true);
    expect(entries[0].action.type).toBe('dig_block');
    expect(entries[0].context?.taskId).toBe('task-1');
    expect(entries[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it('emits audit entry on shadow block', async () => {
    process.env.EXECUTOR_MODE = 'shadow';
    const entries: GatewayAuditEntry[] = [];
    const unsub = onGatewayAudit((e) => entries.push(e));

    await executeViaGateway(makeRequest());
    unsub();

    expect(entries).toHaveLength(1);
    expect(entries[0].mode).toBe('shadow');
    expect(entries[0].outcome).toBe('shadow');
    expect(entries[0].ok).toBe(false);
    expect(entries[0].durationMs).toBe(0);
  });

  it('emits audit entry on failure', async () => {
    mockMcPostJson.mockResolvedValue({
      ok: true,
      data: {
        success: true,
        result: {
          success: false,
          error: { detail: 'No tree', code: 'acquire.noneCollected' },
        },
      },
    });
    const entries: GatewayAuditEntry[] = [];
    const unsub = onGatewayAudit((e) => entries.push(e));

    await executeViaGateway(makeRequest());
    unsub();

    expect(entries).toHaveLength(1);
    expect(entries[0].outcome).toBe('executed');
    expect(entries[0].ok).toBe(false);
    expect(entries[0].failureCode).toBe('acquire.noneCollected');
  });

  it('audit listener errors do not break gateway', async () => {
    mockMcPostJson.mockResolvedValue({
      ok: true,
      data: { success: true, result: null },
    });

    const unsub = onGatewayAudit(() => { throw new Error('listener crash'); });
    // Should not throw
    const result = await executeViaGateway(makeRequest());
    unsub();

    expect(result.ok).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Origin passthrough
  // -----------------------------------------------------------------------

  it('passes origin through to response', async () => {
    mockMcPostJson.mockResolvedValue({
      ok: true,
      data: { success: true, result: { success: true } },
    });
    const result = await executeViaGateway(makeRequest({ origin: 'safety' }));
    expect(result.origin).toBe('safety');
  });

  // -----------------------------------------------------------------------
  // Outcome invariants
  // -----------------------------------------------------------------------

  it('outcome invariant: shadow implies ok===false and no failureCode', async () => {
    process.env.EXECUTOR_MODE = 'shadow';
    const result = await executeViaGateway(makeRequest());
    expect(result.outcome).toBe('shadow');
    expect(result.ok).toBe(false);
    expect(result.failureCode).toBeUndefined();
  });

  it('outcome invariant: error implies ok===false', async () => {
    mockBotCheck.mockResolvedValue({ ok: false, failureKind: 'refused' });
    const result = await executeViaGateway(makeRequest());
    expect(result.outcome).toBe('error');
    expect(result.ok).toBe(false);
  });

  it('outcome invariant: executed can have ok===true', async () => {
    mockMcPostJson.mockResolvedValue({
      ok: true,
      data: { success: true, result: { success: true } },
    });
    const result = await executeViaGateway(makeRequest());
    expect(result.outcome).toBe('executed');
    expect(result.ok).toBe(true);
  });

  it('outcome invariant: executed can have ok===false', async () => {
    mockMcPostJson.mockResolvedValue({
      ok: true,
      data: { success: true, result: { success: false, error: { detail: 'fail' } } },
    });
    const result = await executeViaGateway(makeRequest());
    expect(result.outcome).toBe('executed');
    expect(result.ok).toBe(false);
  });

  it('outcome invariant: shadow audit entry has mode=shadow', async () => {
    process.env.EXECUTOR_MODE = 'shadow';
    const entries: GatewayAuditEntry[] = [];
    const unsub = onGatewayAudit((e) => entries.push(e));

    await executeViaGateway(makeRequest());
    unsub();

    expect(entries).toHaveLength(1);
    expect(entries[0].outcome).toBe('shadow');
    expect(entries[0].mode).toBe('shadow');
  });

  it('outcome invariant: error implies no failureCode (infra vs action-level)', async () => {
    // Bot not connected is an infra error, not an action-level failure
    mockBotCheck.mockResolvedValue({ ok: false, failureKind: 'refused' });
    const result = await executeViaGateway(makeRequest());
    expect(result.outcome).toBe('error');
    expect(result.failureCode).toBeUndefined();
  });

  it('outcome invariant: executed with ok=false may have failureCode', async () => {
    mockMcPostJson.mockResolvedValue({
      ok: true,
      data: {
        success: true,
        result: {
          success: false,
          error: { detail: 'No tree', code: 'acquire.noneCollected' },
        },
      },
    });
    const result = await executeViaGateway(makeRequest());
    expect(result.outcome).toBe('executed');
    expect(result.ok).toBe(false);
    expect(result.failureCode).toBe('acquire.noneCollected');
  });

  // -----------------------------------------------------------------------
  // getExecutorMode (for auto-unblock logic)
  // -----------------------------------------------------------------------

  it('getExecutorMode returns shadow by default', () => {
    process.env.EXECUTOR_MODE = 'shadow';
    expect(getExecutorMode()).toBe('shadow');
  });

  it('getExecutorMode returns live when confirmed', () => {
    process.env.EXECUTOR_MODE = 'live';
    process.env.EXECUTOR_LIVE_CONFIRM = 'YES';
    expect(getExecutorMode()).toBe('live');
  });

  it('getExecutorMode returns shadow when live not confirmed', () => {
    process.env.EXECUTOR_MODE = 'live';
    process.env.EXECUTOR_LIVE_CONFIRM = 'NO';
    expect(getExecutorMode()).toBe('shadow');
  });
});
