/**
 * AC-2.3 CB-side proof: world_snapshot is forwarded to Sterling when available,
 * and the no-snapshot path is behaviorally unchanged.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SterlingLanguageIOClient } from '../sterling-language-io-client';
import type { LanguageIOTransport, LanguageIOReduceResponse } from '../transport';

// ── Mock transport that records what it received ──
class SpyTransport implements LanguageIOTransport {
  lastEnvelope: Record<string, unknown> | null = null;
  lastWorldSnapshot: Record<string, unknown> | undefined = undefined;
  callCount = 0;

  private mockResponse: LanguageIOReduceResponse = {
    schema_id: 'sterling.language_reducer_result.v1',
    schema_version: '1.1.0',
    source_envelope_id: 'test',
    committed_ir_digest: 'ling_ir:mock_test',
    committed_goal_prop_id: 'prop_test',
    has_committed_propositions: true,
    advisory: null,
    grounding: null,
    reducer_version: 'mock/v1',
  };

  async sendReduce(
    envelope: Record<string, unknown>,
    _timeoutMs?: number,
    worldSnapshot?: Record<string, unknown>,
  ): Promise<LanguageIOReduceResponse> {
    this.lastEnvelope = envelope;
    this.lastWorldSnapshot = worldSnapshot;
    this.callCount++;
    return this.mockResponse;
  }

  isAvailable(): boolean {
    return true;
  }
}

describe('AC-2.3: world_snapshot passthrough', () => {
  let transport: SpyTransport;
  let client: SterlingLanguageIOClient;

  beforeEach(() => {
    transport = new SpyTransport();
    client = new SterlingLanguageIOClient({
      enabled: true,
      transport,
    });
    // Mark as connected
    (client as any).connected = true;
  });

  it('forwards world_snapshot to transport when provided', async () => {
    const worldSnapshot = {
      schema_id: 'sterling.world_snapshot.v1',
      schema_version: '1.1.0',
      inventory_items: [{ name: 'oak_log', count: 3 }],
      nearby_blocks: [{ block_type: 'oak_log', position: { x: 10, y: 64, z: 20 } }],
      nearby_entities: [],
      captured_at_ms: 1700000000000,
      source: 'bot_state_endpoint',
    };

    const result = await client.reduce('[GOAL: craft wooden pickaxe]', {
      worldSnapshot,
    });

    expect(transport.callCount).toBe(1);
    expect(transport.lastWorldSnapshot).toBeDefined();
    expect(transport.lastWorldSnapshot).toEqual(worldSnapshot);
    expect(transport.lastWorldSnapshot!.source).toBe('bot_state_endpoint');
    // Result should still be successful
    expect('result' in result).toBe(true);
  });

  it('does not send world_snapshot when not provided (regression)', async () => {
    const result = await client.reduce('[GOAL: craft wooden pickaxe]');

    expect(transport.callCount).toBe(1);
    expect(transport.lastWorldSnapshot).toBeUndefined();
    // Result should still be successful
    expect('result' in result).toBe(true);
  });

  it('does not send world_snapshot when options are empty', async () => {
    const result = await client.reduce('[GOAL: craft wooden pickaxe]', {});

    expect(transport.callCount).toBe(1);
    expect(transport.lastWorldSnapshot).toBeUndefined();
    expect('result' in result).toBe(true);
  });
});
