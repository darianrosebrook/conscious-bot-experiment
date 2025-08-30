/**
 * MCP Endpoints Module
 *
 * Provides HTTP endpoints for MCP operations.
 * Can be mounted as a router in the main planning server.
 *
 * @author @darianrosebrook
 */

import { Router, Request, Response } from 'express';
import { MCPIntegration } from './mcp-integration';

export function createMCPEndpoints(mcpIntegration: MCPIntegration): Router {
  const router = Router();

  // GET /mcp/status - Get MCP integration status
  router.get('/status', (req: Request, res: Response) => {
    try {
      const status = mcpIntegration.getStatus();
      res.json({
        success: true,
        status,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('[MCP] Failed to get status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get MCP status',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // GET /mcp/tools - List available tools
  router.get('/tools', async (req: Request, res: Response) => {
    try {
      const tools = await mcpIntegration.listTools();
      res.json({
        success: true,
        tools,
        count: tools.length,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('[MCP] Failed to list tools:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to list tools',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // GET /mcp/options - List available options
  router.get('/options', async (req: Request, res: Response) => {
    try {
      const status = (req.query.status as string) || 'all';
      const options = await mcpIntegration.listOptions(status);
      res.json({
        success: true,
        options,
        count: options.length,
        status,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('[MCP] Failed to list options:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to list options',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // POST /mcp/register-option - Register a new BT option
  router.post('/register-option', async (req: Request, res: Response) => {
    try {
      const { id, name, description, btDefinition, permissions } = req.body;

      if (!id || !name || !description || !btDefinition) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: id, name, description, btDefinition',
        });
      }

      const result = await mcpIntegration.registerOption({
        id,
        name,
        description,
        btDefinition,
        permissions,
      });

      if (result.success) {
        res.json({
          success: true,
          optionId: result.data,
          message: `Option registered successfully: ${name}`,
          timestamp: Date.now(),
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error || 'Failed to register option',
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      console.error('[MCP] Failed to register option:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to register option',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // POST /mcp/promote-option - Promote an option from shadow to active
  router.post('/promote-option', async (req: Request, res: Response) => {
    try {
      const { optionId } = req.body;

      if (!optionId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: optionId',
        });
      }

      const result = await mcpIntegration.promoteOption(optionId);

      if (result.success) {
        res.json({
          success: true,
          optionId: result.data,
          message: `Option promoted successfully: ${optionId}`,
          timestamp: Date.now(),
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error || 'Failed to promote option',
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      console.error('[MCP] Failed to promote option:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to promote option',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // POST /mcp/run-option - Execute a BT option
  router.post('/run-option', async (req: Request, res: Response) => {
    try {
      const { optionId, args } = req.body;

      if (!optionId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: optionId',
        });
      }

      const result = await mcpIntegration.runOption(optionId, args);

      if (result.success) {
        res.json({
          success: true,
          data: result.data,
          message: `Option executed successfully: ${optionId}`,
          timestamp: Date.now(),
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error || 'Failed to execute option',
          data: result.data,
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      console.error('[MCP] Failed to run option:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to run option',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // POST /mcp/execute-tool - Execute a specific tool
  router.post('/execute-tool', async (req: Request, res: Response) => {
    try {
      const { toolName, args } = req.body;

      if (!toolName) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: toolName',
        });
      }

      const result = await mcpIntegration.executeTool(toolName, args || {});

      if (result.success) {
        res.json({
          success: true,
          data: result.data,
          message: `Tool executed successfully: ${toolName}`,
          timestamp: Date.now(),
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error || 'Failed to execute tool',
          data: result.data,
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      console.error('[MCP] Failed to execute tool:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to execute tool',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // POST /mcp/register-leaf - Register a new leaf
  router.post('/register-leaf', async (req: Request, res: Response) => {
    try {
      const leaf = req.body;

      if (!leaf || !leaf.spec || !leaf.spec.name) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: leaf with spec.name',
        });
      }

      const success = await mcpIntegration.registerLeaf(leaf);

      if (success) {
        res.json({
          success: true,
          message: `Leaf registered successfully: ${leaf.spec.name}`,
          timestamp: Date.now(),
        });
      } else {
        res.status(400).json({
          success: false,
          error: 'Failed to register leaf',
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      console.error('[MCP] Failed to register leaf:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to register leaf',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}
