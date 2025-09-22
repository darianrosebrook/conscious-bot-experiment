/**
 * Server Configuration Module
 *
 * Handles the setup and initialization of different server components.
 * Provides a clean interface for configuring the planning server.
 *
 * @author @darianrosebrook
 */

import express from 'express';
import cors from 'cors';
import type {
  Application,
  Router,
  RequestHandler,
  Request,
  Response,
  NextFunction,
} from 'express';
import type { CorsOptions } from 'cors';
import { MCPIntegration } from './mcp-integration';
import { createMCPEndpoints } from './mcp-endpoints';

export interface ServerConfig {
  port?: number;
  enableCORS?: boolean;
  enableMCP?: boolean;
  mcpConfig?: {
    mcpServerPort?: number;
    registryEndpoint?: string;
    botEndpoint?: string;
  };
  middleware?: {
    cors?: CorsOptions;
    json?: {
      limit?: string;
    };
  };
}

export interface ServerComponents {
  app: Application;
  mcpIntegration: MCPIntegration | null;
}

export class ServerConfiguration {
  private config: ServerConfig;
  private app: Application;
  private _mcpIntegration: MCPIntegration | null = null;
  private httpServer: import('http').Server | null = null;

  constructor(config: ServerConfig = {}) {
    this.config = {
      port: 3002,
      enableCORS: true,
      enableMCP: true, // Enable MCP to connect to Minecraft interface
      mcpConfig: {
        botEndpoint: 'http://localhost:3005',
        ...config.mcpConfig,
      },
      ...config,
    };

    this.app = express();
    this.setupMiddleware();
  }

  /**
   * Setup middleware for the server
   */
  private setupMiddleware(): void {
    // CORS middleware
    if (this.config.enableCORS) {
      this.app.use(cors(this.config.middleware?.cors));
    }

    // JSON body parser
    this.app.use(express.json(this.config.middleware?.json));

    // Basic request logging
    this.app.use((req, res, next) => {
      if (process.env.NODE_ENV === 'development') {
        console.log(`${req.method} ${req.path} - ${new Date().toISOString()}`);
      }
      next();
    });
  }

  /**
   * Initialize MCP integration
   */
  async initializeMCP(bot?: any, registry?: any): Promise<void> {
    if (!this.config.enableMCP) {
      console.log('[Server] MCP integration disabled by configuration');
      return;
    }

    try {
      this._mcpIntegration = new MCPIntegration(this.config.mcpConfig);
      await this._mcpIntegration.initialize(bot, registry);

      // Mount MCP endpoints
      const mcpRouter = createMCPEndpoints(this._mcpIntegration);
      this.app.use('/mcp', mcpRouter);

      console.log('[Server] MCP integration initialized and mounted at /mcp');
    } catch (error) {
      console.error('[Server] Failed to initialize MCP integration:', error);
      // Don't throw - allow server to start without MCP
    }
  }

  /**
   * Add a router to the server
   */
  mountRouter(path: string, router: Router): void {
    this.app.use(path, router);
    console.log(`[Server] Router mounted at ${path}`);
  }

  /**
   * Add middleware to the server
   */
  addMiddleware(middleware: RequestHandler): void {
    this.app.use(middleware);
  }

  /**
   * Add error handling middleware
   */
  addErrorHandling(): void {
    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        path: req.path,
        method: req.method,
        timestamp: Date.now(),
      });
    });

    // Global error handler
    this.app.use(
      (error: any, req: Request, res: Response, next: NextFunction) => {
        console.error('[Server] Unhandled error:', error);

        res.status(500).json({
          success: false,
          error: 'Internal server error',
          details:
            process.env.NODE_ENV === 'development'
              ? error.message
              : 'Unknown error',
          timestamp: Date.now(),
        });
      }
    );
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.httpServer = this.app.listen(this.config.port, () => {
        console.log(
          `[Server] Planning system server running on port ${this.config.port}`
        );
        console.log(
          `[Server] Environment: ${process.env.NODE_ENV || 'development'}`
        );

        if (this._mcpIntegration) {
          const status = this._mcpIntegration.getStatus();
          console.log(
            `[Server] MCP Integration: ${status.initialized ? '✅ Active' : '❌ Inactive'}`
          );
        }

        resolve();
      });

      this.httpServer.on('error', (error) => {
        console.error('[Server] Failed to start server:', error);
        reject(error);
      });
    });
  }

  /**
   * Stop the server (graceful shutdown)
   */
  async stop(): Promise<void> {
    // Close MCP resources if needed in future
    await new Promise<void>((resolve) => {
      if (!this.httpServer) return resolve();
      this.httpServer.close(() => resolve());
      // Do not null immediately; leave for GC after close callback
    });
  }

  /**
   * Get the Express app instance
   */
  getApp(): Application {
    return this.app;
  }

  /**
   * Add a custom endpoint to the server
   */
  addEndpoint(method: 'get' | 'post' | 'put' | 'delete', path: string, handler: RequestHandler): void {
    this.app[method](path, handler);
  }

  /**
   * Get the MCP integration instance
   */
  getMCPIntegration(): MCPIntegration | null {
    return this._mcpIntegration;
  }

  /**
   * Get server components
   */
  getComponents(): ServerComponents {
    return {
      app: this.app,
      mcpIntegration: this._mcpIntegration,
    };
  }

  /**
   * Get server configuration
   */
  getConfig(): ServerConfig {
    return { ...this.config };
  }
}
