/**
 * Capability Registry
 *
 * Unified registry interface for MCP leaf registration and capability discovery.
 * Consolidates EnhancedRegistry/MCPLeafRegistry behavior across modular-server
 * and skill-integration.
 *
 * @author @darianrosebrook
 */

export interface ExecutionRequest {
  id: string;
  type: string;
  params: any;
  parameters?: any;
  capabilityId?: string;
  requestedBy?: string;
  priority?: number;
  timeout?: number;
  metadata?: any;
  timestamp?: number;
  [key: string]: any;
}

export interface ICapabilityRegistry {
  register(name: string, handler: any): void;
  registerLeaf?(name: string, leaf: any): void;
  listCapabilities?(): any[];
  getCapability?(id: string): any;
  executeShadowRun?(context: any): any;
  executeCapability?(request: ExecutionRequest): Promise<any>;
}

/**
 * Default implementation satisfying the full registry contract.
 * Stub methods for optional behavior.
 */
export class CapabilityRegistry implements ICapabilityRegistry {
  private leaves = new Map<string, any>();
  private handlers = new Map<string, any>();
  private capabilities = new Map<string, any>();

  register(name: string, handler: any): void {
    this.handlers.set(name, handler);
  }

  registerLeaf(name: string, leaf: any): void {
    this.leaves.set(name, leaf);
  }

  listCapabilities(): any[] {
    return Array.from(this.capabilities.values());
  }

  getCapability(id: string): any {
    return this.capabilities.get(id) ?? null;
  }

  executeShadowRun(_context: any): { success: boolean; data: any } {
    return { success: true, data: null };
  }

  executeCapability(request: ExecutionRequest): Promise<any> {
    return Promise.resolve({ success: true, data: request });
  }
}

/**
 * MCP leaf registry for executor integration.
 * Minimal implementation for modular-server (register, registerLeaf only).
 */
export class MCPLeafRegistry implements ICapabilityRegistry {
  private leafCount = 0;
  private capabilityCount = 0;

  register(name: string, _handler: any): void {
    this.capabilityCount++;
    // Verbose logging removed - summary logged by caller
  }

  registerLeaf(name: string, _leaf: any): void {
    this.leafCount++;
    // Verbose logging removed - summary logged by caller
  }

  getLeafCount(): number {
    return this.leafCount;
  }

  getCapabilityCount(): number {
    return this.capabilityCount;
  }
}
