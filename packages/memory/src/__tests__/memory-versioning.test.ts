/**
 * Memory Versioning Tests
 *
 * Tests for seed-based memory isolation and namespace management.
 *
 * @author @darianrosebrook
 */

import { MemoryVersioningManager } from '../memory-versioning-manager';
import { MemoryContext } from '../types';

describe('Memory Versioning Manager', () => {
  let versioningManager: MemoryVersioningManager;

  beforeEach(() => {
    versioningManager = new MemoryVersioningManager({
      enableVersioning: true,
      seedBasedIsolation: true,
    });
  });

  afterEach(() => {
    versioningManager.shutdown();
  });

  describe('Namespace Creation', () => {
    it('should create seed-based namespaces', () => {
      const context1: MemoryContext = {
        worldSeed: '12345',
        worldName: 'Test World 1',
        sessionId: 'session1',
        timestamp: Date.now(),
        version: '1.0.0',
      };

      const context2: MemoryContext = {
        worldSeed: '67890',
        worldName: 'Test World 2',
        sessionId: 'session2',
        timestamp: Date.now(),
        version: '1.0.0',
      };

      const namespace1 = versioningManager.createNamespace(context1);
      const namespace2 = versioningManager.createNamespace(context2);

      expect(namespace1.id).toBe('seed_12345_session1');
      expect(namespace2.id).toBe('seed_67890_session2');
      expect(namespace1.id).not.toBe(namespace2.id);
    });

    it('should create world name based namespaces when seed is not available', () => {
      const context: MemoryContext = {
        worldName: 'Test World',
        sessionId: 'session1',
        timestamp: Date.now(),
        version: '1.0.0',
      };

      const namespace = versioningManager.createNamespace(context);
      expect(namespace.id).toBe('world_Test World_session1');
    });

    it('should create default namespaces when no world info is available', () => {
      const context: MemoryContext = {
        sessionId: 'session1',
        timestamp: Date.now(),
        version: '1.0.0',
      };

      const namespace = versioningManager.createNamespace(context);
      expect(namespace.id).toBe('default_session1');
    });
  });

  describe('Namespace Activation', () => {
    it('should activate and deactivate namespaces correctly', () => {
      const context1: MemoryContext = {
        worldSeed: '12345',
        sessionId: 'session1',
        timestamp: Date.now(),
        version: '1.0.0',
      };

      const context2: MemoryContext = {
        worldSeed: '67890',
        sessionId: 'session2',
        timestamp: Date.now(),
        version: '1.0.0',
      };

      // Activate first namespace
      const namespace1 = versioningManager.activateNamespace(context1);
      expect(namespace1.isActive).toBe(true);
      expect(versioningManager.getActiveNamespace()).toBe(namespace1);

      // Activate second namespace
      const namespace2 = versioningManager.activateNamespace(context2);
      expect(namespace2.isActive).toBe(true);
      expect(versioningManager.getActiveNamespace()).toBe(namespace2);

      // Check that first namespace is deactivated
      expect(namespace1.isActive).toBe(false);
    });

    it('should reuse existing namespaces when activating same context', () => {
      const context: MemoryContext = {
        worldSeed: '12345',
        sessionId: 'session1',
        timestamp: Date.now(),
        version: '1.0.0',
      };

      const namespace1 = versioningManager.activateNamespace(context);
      const namespace2 = versioningManager.activateNamespace(context);

      expect(namespace1.id).toBe(namespace2.id);
      expect(namespace1).toBe(namespace2);
    });
  });

  describe('Statistics', () => {
    it('should provide accurate statistics', () => {
      const context1: MemoryContext = {
        worldSeed: '12345',
        sessionId: 'session1',
        timestamp: Date.now(),
        version: '1.0.0',
      };

      const context2: MemoryContext = {
        worldSeed: '67890',
        sessionId: 'session2',
        timestamp: Date.now(),
        version: '1.0.0',
      };

      // Create namespaces
      versioningManager.createNamespace(context1);
      versioningManager.createNamespace(context2);

      // Activate one namespace
      versioningManager.activateNamespace(context1);

      // Update memory counts
      versioningManager.updateMemoryCount('seed_12345_session1', 10);
      versioningManager.updateMemoryCount('seed_67890_session2', 5);

      const stats = versioningManager.getStats();

      expect(stats.totalNamespaces).toBe(2);
      expect(stats.activeNamespaces).toBe(1);
      expect(stats.inactiveNamespaces).toBe(1);
      expect(stats.totalMemories).toBe(15);
    });
  });

  describe('Configuration', () => {
    it('should respect seed-based isolation setting', () => {
      const managerWithoutSeedIsolation = new MemoryVersioningManager({
        seedBasedIsolation: false,
      });

      const context: MemoryContext = {
        worldSeed: '12345',
        worldName: 'Test World',
        sessionId: 'session1',
        timestamp: Date.now(),
        version: '1.0.0',
      };

      const namespace = managerWithoutSeedIsolation.createNamespace(context);
      expect(namespace.id).toBe('world_Test World_session1');

      managerWithoutSeedIsolation.shutdown();
    });

    it('should handle disabled versioning', () => {
      const managerWithoutVersioning = new MemoryVersioningManager({
        enableVersioning: false,
      });

      const context: MemoryContext = {
        worldSeed: '12345',
        sessionId: 'session1',
        timestamp: Date.now(),
        version: '1.0.0',
      };

      const namespace = managerWithoutVersioning.createNamespace(context);
      expect(namespace.id).toBe('seed_12345_session1');

      managerWithoutVersioning.shutdown();
    });
  });
});
