import { beforeEach, describe, expect, it } from 'vitest';
import { MCPIntegration } from '../mcp-integration';
import type {
  ConsciousBotMCPServer,
  LeafImpl,
  MCPServerDependencies,
} from '@conscious-bot/mcp-server';

function createTestLeaf(name = 'move_to', version = '1.0.0'): LeafImpl {
  return {
    spec: {
      name,
      version,
      description: `${name} leaf`,
      inputSchema: {
        type: 'object',
        properties: {
          target: {
            type: 'object',
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
              z: { type: 'number' },
            },
            required: ['x', 'y', 'z'],
          },
        },
        required: ['target'],
        additionalProperties: false,
      },
      outputSchema: {
        type: 'object',
        properties: {
          arrived: { type: 'boolean' },
        },
        required: ['arrived'],
        additionalProperties: false,
      },
      permissions: ['movement'],
      timeoutMs: 5_000,
      retries: 0,
    },
    async run() {
      return {
        status: 'success',
        result: { arrived: true },
        metrics: {
          durationMs: 5,
          retries: 0,
          timeouts: 0,
        },
      };
    },
  };
}

describe('MCPIntegration', () => {
  let integration: MCPIntegration;
  const registry = {
    registerOption: () => ({ ok: true, id: 'opt.test_option@1.0.0' }),
    promoteOption: async () => true,
  } satisfies Partial<MCPServerDependencies['registry']>;

  beforeEach(() => {
    integration = new MCPIntegration();
  });

  it('initializes the real MCP server and hydrates tools from registered leaves', async () => {
    await integration.initialize(undefined, registry);

    const leaf = createTestLeaf();
    const registered = await integration.registerLeaf(leaf);
    expect(registered).toBe(true);

    // The underlying server should be the real implementation once dependencies resolve
    const server = integration.getMCPServer() as
      | ConsciousBotMCPServer
      | undefined;
    expect(server?.constructor?.name).toBe('ConsciousBotMCPServer');

    const tools = await integration.listTools();
    expect(tools).toContain(
      `minecraft.${leaf.spec!.name}@${leaf.spec!.version}`
    );
  });

  it('registers options through the MCP server and updates the bot instance without errors', async () => {
    const botStub = { id: 'bot-1' };
    await integration.initialize(botStub, registry);

    await integration.registerLeaf(createTestLeaf());

    const optionResult = await integration.registerOption({
      id: 'opt.test_option',
      name: 'Test Option',
      description: 'Test BT option registration',
      btDefinition: {
        id: 'opt.test_option',
        name: 'Test Option',
        root: {
          type: 'sequence',
          children: [],
        },
      },
    });

    expect(optionResult.success).toBe(true);
    expect(optionResult.data).toBe('opt.test_option@1.0.0');

    await expect(
      integration.updateBotInstance(botStub)
    ).resolves.toBeUndefined();

    const server = integration.getMCPServer() as any;
    expect(server?.deps?.bot).toBe(botStub);
  });
});
