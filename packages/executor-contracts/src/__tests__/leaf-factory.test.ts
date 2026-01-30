import { describe, expect, it } from 'vitest';
import { LeafFactory, createLeafFactory } from '../leaf-factory';
import { createLeafContext, ExecErrorCode, LeafPermission, LeafSpec } from '../leaf-interfaces';

describe('LeafFactory', () => {
  it('registers run-only leaves using their declared version', async () => {
    const factory = new LeafFactory();

    const leafImpl = {
      spec: {
        name: 'gather_logs',
        version: '2.1.0',
        description: 'Collect logs safely',
        inputSchema: {
          type: 'object',
          properties: {
            amount: { type: 'number', minimum: 1 },
          },
          required: ['amount'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            gathered: { type: 'number' },
          },
          required: ['gathered'],
        },
        timeoutMs: 10_000,
        retries: 1,
        permissions: ['movement', 'dig'] as LeafPermission[],
      },
      async run() {
        return {
          status: 'success' as const,
          result: { gathered: 3 },
        };
      },
    };

    const registerResult = factory.register({
      name: 'gather_logs',
      version: '2.1.0',
      description: 'Collect logs safely',
      inputSchema: leafImpl.spec.inputSchema,
      outputSchema: leafImpl.spec.outputSchema,
      timeoutMs: leafImpl.spec.timeoutMs,
      retries: leafImpl.spec.retries,
      permissions: leafImpl.spec.permissions as LeafPermission[],
      implementation: leafImpl as any,
    });

    expect(registerResult.ok).toBe(true);
    expect(registerResult.id).toBe('gather_logs@2.1.0');

    const context = createLeafContext(undefined, {
      timestamp: Date.now(),
      requestId: 'test',
    });
    const runResult = await factory.run('gather_logs', '2.1.0', context, {
      amount: 3,
    });
    expect(runResult.status).toBe('success');
    expect(runResult.result).toEqual({ gathered: 3 });
  });

  it('rejects duplicate registrations for the same version', () => {
    const factory = new LeafFactory();
    const leafImpl = {
      spec: {
        name: 'sense_light_level',
        version: '1.0.0',
        description: 'Sense the light level',
        inputSchema: { type: 'object', properties: {} },
        outputSchema: { type: 'object', properties: {} },
        timeoutMs: 5_000,
        retries: 0,
        permissions: ['sense'],
      },
      async run() {
        return { status: 'success' as const, result: {} };
      },
    };

    const spec: LeafSpec = {
      name: 'sense_light_level',
      version: '1.0.0',
      description: 'Sense the light level',
      inputSchema: leafImpl.spec.inputSchema,
      outputSchema: leafImpl.spec.outputSchema,
      timeoutMs: leafImpl.spec.timeoutMs,
      retries: leafImpl.spec.retries,
      permissions: leafImpl.spec.permissions as LeafPermission[],
      implementation: leafImpl as any,
    };

    expect(factory.register(spec).ok).toBe(true);
    const second = factory.register(spec);
    expect(second.ok).toBe(false);
    expect(second.error).toMatch(/sense_light_level@1\.0\.0/);
  });

  it('surfaces execution errors when the leaf handler is missing', async () => {
    const factory = new LeafFactory();
    const spec: LeafSpec = {
      name: 'broken_leaf',
      version: '1.0.0',
      description: 'Intentionally broken leaf',
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
      timeoutMs: 1_000,
      retries: 0,
      permissions: ['sense'],
      implementation: {
        spec: {
          name: 'broken_leaf',
          version: '1.0.0',
          description: 'Intentionally broken leaf',
          inputSchema: { type: 'object' },
          outputSchema: { type: 'object' },
          timeoutMs: 1_000,
          retries: 0,
          permissions: ['sense'],
        },
      } as any,
    };

    const registerResult = factory.register(spec);
    expect(registerResult.ok).toBe(false);
    expect(registerResult.error).toBe('Invalid leaf implementation');

    const context = createLeafContext(undefined, {
      timestamp: Date.now(),
      requestId: 'broken',
    });
    const result = await factory.run('broken_leaf', '1.0.0', context, {});
    expect(result.status).toBe('failure');
    expect(result.error?.code).toBe('EXECUTION_FAILED');
  });

  it('should handle leaf without run method', async () => {
    const factory = new LeafFactory();
    const spec: LeafSpec = {
      name: 'incomplete_leaf',
      version: '1.0.0',
      description: 'Leaf without run method',
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
      timeoutMs: 1_000,
      retries: 0,
      permissions: ['sense'],
      implementation: {
        spec: {
          name: 'incomplete_leaf',
          version: '1.0.0',
          description: 'Leaf without run method',
          inputSchema: { type: 'object' },
          outputSchema: { type: 'object' },
          timeoutMs: 1_000,
          retries: 0,
          permissions: ['sense'],
        },
      } as any,
    };

    const registerResult = factory.register(spec);
    expect(registerResult.ok).toBe(false);
    expect(registerResult.error).toBe('Invalid leaf implementation');

    const context = createLeafContext(undefined, {
      timestamp: Date.now(),
      requestId: 'incomplete',
    });
    const result = await factory.run('incomplete_leaf', '1.0.0', context, {});
    expect(result.status).toBe('failure');
    expect(result.error?.code).toBe('EXECUTION_FAILED');
  });

  it('should handle exceptions during leaf execution', async () => {
    const factory = new LeafFactory();
    const spec: LeafSpec = {
      name: 'simple_leaf',
      version: '1.0.0',
      description: 'Simple leaf for testing',
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
      timeoutMs: 1_000,
      retries: 0,
      permissions: ['sense'],
      implementation: {
        spec: {
          name: 'simple_leaf',
          version: '1.0.0',
          description: 'Simple leaf for testing',
          inputSchema: { type: 'object' },
          outputSchema: { type: 'object' },
          timeoutMs: 1_000,
          retries: 0,
          permissions: ['sense'],
        },
        async run() {
          return { status: 'success' as const, result: {} };
        },
      } as any,
    };

    const registerResult = factory.register(spec);
    expect(registerResult.ok).toBe(true);

    const context = createLeafContext(undefined, {
      timestamp: Date.now(),
      requestId: 'simple',
    });
    const result = await factory.run('simple_leaf', '1.0.0', context, {});
    expect(result.status).toBe('success');
    expect(result.result).toEqual({});
  });

  it('should create leaf factory using factory function', () => {
    const factory = createLeafFactory();
    expect(factory).toBeInstanceOf(LeafFactory);
    expect(factory).toBeDefined();
  });
});
