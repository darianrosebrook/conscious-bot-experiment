/**
 * Memory Versioning Manager
 *
 * Manages memory namespaces and context isolation based on world seeds.
 * Provides seed-based memory separation to prevent cross-contamination
 * between different Minecraft worlds.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import {
  MemoryContext,
  MemoryNamespace,
  MemoryVersioningConfig,
} from './types';

/**
 * Default memory versioning configuration
 */
const DEFAULT_CONFIG: MemoryVersioningConfig = {
  enableVersioning: true,
  defaultNamespace: 'default',
  autoCreateNamespaces: true,
  namespaceCleanupInterval: 3600000, // 1 hour
  maxInactiveNamespaces: 10,
  seedBasedIsolation: true,
};

/**
 * Memory versioning manager events
 */
export interface MemoryVersioningEvents {
  namespaceCreated: (namespace: MemoryNamespace) => void;
  namespaceActivated: (namespace: MemoryNamespace) => void;
  namespaceDeactivated: (namespace: MemoryNamespace) => void;
  namespaceCleaned: (namespaceId: string) => void;
}

/**
 * Memory Versioning Manager
 *
 * Handles creation, activation, and cleanup of memory namespaces
 * based on world seeds and session contexts.
 */
export class MemoryVersioningManager extends EventEmitter {
  private config: MemoryVersioningConfig;
  private namespaces: Map<string, MemoryNamespace> = new Map();
  private activeNamespace: string | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<MemoryVersioningConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };

    if (this.config.enableVersioning) {
      this.startCleanupInterval();
    }
  }

  /**
   * Create or get a memory namespace for the given context
   */
  createNamespace(context: MemoryContext): MemoryNamespace {
    const namespaceId = this.generateNamespaceId(context);
    
    let namespace = this.namespaces.get(namespaceId);
    
    if (!namespace) {
      namespace = {
        context,
        id: namespaceId,
        createdAt: Date.now(),
        lastAccessed: Date.now(),
        memoryCount: 0,
        isActive: false,
      };
      
      this.namespaces.set(namespaceId, namespace);
      this.emit('namespaceCreated', namespace);
    }

    return namespace;
  }

  /**
   * Activate a namespace for the current session
   */
  activateNamespace(context: MemoryContext): MemoryNamespace {
    const namespace = this.createNamespace(context);
    
    // Deactivate previous namespace if different
    if (this.activeNamespace && this.activeNamespace !== namespace.id) {
      const previousNamespace = this.namespaces.get(this.activeNamespace);
      if (previousNamespace) {
        previousNamespace.isActive = false;
        this.emit('namespaceDeactivated', previousNamespace);
      }
    }

    // Activate new namespace
    namespace.isActive = true;
    namespace.lastAccessed = Date.now();
    this.activeNamespace = namespace.id;
    
    this.emit('namespaceActivated', namespace);
    return namespace;
  }

  /**
   * Get the currently active namespace
   */
  getActiveNamespace(): MemoryNamespace | null {
    if (!this.activeNamespace) {
      return null;
    }
    return this.namespaces.get(this.activeNamespace) || null;
  }

  /**
   * Get namespace by ID
   */
  getNamespace(namespaceId: string): MemoryNamespace | null {
    return this.namespaces.get(namespaceId) || null;
  }

  /**
   * Get all namespaces
   */
  getAllNamespaces(): MemoryNamespace[] {
    return Array.from(this.namespaces.values());
  }

  /**
   * Update memory count for a namespace
   */
  updateMemoryCount(namespaceId: string, count: number): void {
    const namespace = this.namespaces.get(namespaceId);
    if (namespace) {
      namespace.memoryCount = count;
      namespace.lastAccessed = Date.now();
    }
  }

  /**
   * Clean up inactive namespaces
   */
  private cleanupInactiveNamespaces(): void {
    const now = Date.now();
    const inactiveThreshold = now - this.config.namespaceCleanupInterval;
    
    const inactiveNamespaces = Array.from(this.namespaces.values())
      .filter(namespace => 
        !namespace.isActive && 
        namespace.lastAccessed < inactiveThreshold
      )
      .sort((a, b) => a.lastAccessed - b.lastAccessed);

    // Remove oldest inactive namespaces, keeping within max limit
    const namespacesToRemove = inactiveNamespaces.slice(
      0,
      Math.max(0, inactiveNamespaces.length - this.config.maxInactiveNamespaces)
    );

    for (const namespace of namespacesToRemove) {
      this.namespaces.delete(namespace.id);
      this.emit('namespaceCleaned', namespace.id);
    }
  }

  /**
   * Generate a unique namespace ID based on context
   */
  private generateNamespaceId(context: MemoryContext): string {
    if (this.config.seedBasedIsolation && context.worldSeed) {
      // Use seed-based isolation for deterministic namespaces
      return `seed_${context.worldSeed}_${context.sessionId}`;
    } else if (context.worldName) {
      // Fall back to world name if seed not available
      return `world_${context.worldName}_${context.sessionId}`;
    } else {
      // Default namespace for unknown contexts
      return `${this.config.defaultNamespace}_${context.sessionId}`;
    }
  }

  /**
   * Start the cleanup interval
   */
  private startCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(() => {
      this.cleanupInactiveNamespaces();
    }, this.config.namespaceCleanupInterval);
  }

  /**
   * Stop the cleanup interval
   */
  stopCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Get statistics about namespaces
   */
  getStats(): {
    totalNamespaces: number;
    activeNamespaces: number;
    inactiveNamespaces: number;
    totalMemories: number;
  } {
    const namespaces = Array.from(this.namespaces.values());
    const activeNamespaces = namespaces.filter(ns => ns.isActive);
    const inactiveNamespaces = namespaces.filter(ns => !ns.isActive);
    const totalMemories = namespaces.reduce((sum, ns) => sum + ns.memoryCount, 0);

    return {
      totalNamespaces: namespaces.length,
      activeNamespaces: activeNamespaces.length,
      inactiveNamespaces: inactiveNamespaces.length,
      totalMemories,
    };
  }

  /**
   * Shutdown the versioning manager
   */
  shutdown(): void {
    this.stopCleanupInterval();
    this.namespaces.clear();
    this.activeNamespace = null;
  }
}
