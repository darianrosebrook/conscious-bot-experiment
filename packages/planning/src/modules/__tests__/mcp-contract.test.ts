import { describe, expect, it } from 'vitest';
import { MCPIntegration } from '../mcp-integration';
import contract from '../../../../../contracts/mcp-integration.pact.json';
import type { LeafImpl } from '@conscious-bot/executor-contracts';

function createContractLeaf(): LeafImpl {
  return {
    spec: {
      name: 'move_to',
      version: '1.0.0',
      description: 'Move to target block',
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
      timeoutMs: 10_000,
      retries: 0,
    },
    async run() {
      return {
        status: 'success',
        result: { arrived: true },
        metrics: {
          durationMs: 10,
          retries: 0,
          timeouts: 0,
        },
      };
    },
  };
}

describe('MCP contract coverage', () => {
  it('satisfies the documented register_option and list_tools interactions', async () => {
    const integration = new MCPIntegration();
    await integration.initialize(undefined, {
      registerOption: () => ({ ok: true, id: 'opt.test_option@1.0.0' }),
    });

    await integration.registerLeaf(createContractLeaf());

    const pactRegister = contract.interactions.find(
      (interaction) => interaction.description === 'register option succeeds'
    );
    expect(pactRegister).toBeDefined();

    const registerArgs = pactRegister!.request.arguments as any;
    const registerResult = await integration.registerOption({
      id: registerArgs.id,
      name: registerArgs.name,
      description: registerArgs.description,
      btDefinition: registerArgs.btDefinition,
      permissions: registerArgs.permissions,
    });

    expect(registerResult.success).toBe(true);
    expect(registerResult.data).toBe((pactRegister!.response as any).optionId);

    const pactListTools = contract.interactions.find(
      (interaction) =>
        interaction.description === 'list tools exposes registered leaves'
    );
    expect(pactListTools).toBeDefined();

    const tools = await integration.listTools();
    const expectedToolName = (pactListTools!.response as any).tools[0].name;
    expect(tools).toContain(expectedToolName);
  });
});
