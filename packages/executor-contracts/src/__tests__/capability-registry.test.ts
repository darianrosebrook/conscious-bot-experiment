/**
 * Capability Registry Tests
 *
 * Tests for the MCP-style capability registry that ensures only registered
 * capabilities can be executed.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  CapabilityRegistry,
  CapabilityRegistryBuilder,
  BUILT_IN_CAPABILITIES,
} from '../capability-registry';
import { PBIError } from '../types';

describe('CapabilityRegistry', () => {
  let registry: CapabilityRegistry;

  beforeEach(() => {
    registry = new CapabilityRegistryBuilder().addAllBuiltIns().build();
  });

  afterEach(() => {
    registry.clear();
  });

  describe('Basic Registry Operations', () => {
    it('should register and retrieve capabilities', () => {
      expect(registry.has('navigate')).toBe(true);
      expect(registry.has('craft_item')).toBe(true);
      expect(registry.has('dig_block')).toBe(true);

      const navigateCap = registry.get('navigate');
      expect(navigateCap).toBeDefined();
      expect(navigateCap?.name).toBe('navigate');
      expect(navigateCap?.version).toBe('1.0.0');
    });

    it('should handle versioned capabilities', () => {
      const customRegistry = new CapabilityRegistryBuilder()
        .addBuiltIn('navigate', '2.0.0')
        .build();

      expect(customRegistry.has('navigate')).toBe(true);
      expect(customRegistry.get('navigate')?.version).toBe('2.0.0');

      const versions = customRegistry.getVersions('navigate');
      expect(versions).toContain('2.0.0');
    });

    it('should prevent duplicate registrations', () => {
      const duplicateCapability = {
        name: 'navigate',
        version: '1.0.0',
        inputSchema: BUILT_IN_CAPABILITIES.navigate.inputSchema,
        guard: () => true,
        runner: async () => ({ ok: true, startedAt: 0, endedAt: 0 }),
        acceptance: () => true,
      };

      expect(() => {
        registry.register(duplicateCapability);
      }).toThrow(PBIError);

      expect(() => {
        registry.register(duplicateCapability);
      }).toThrow('already registered');
    });

    it('should return undefined for non-existent capabilities', () => {
      expect(registry.get('nonexistent')).toBeUndefined();
      expect(registry.has('nonexistent')).toBe(false);
    });
  });

  describe('Built-in Capabilities', () => {
    it('should include all built-in capabilities', () => {
      const allNames = registry.getAllNames();
      const expectedBuiltIns = Object.keys(BUILT_IN_CAPABILITIES);

      expectedBuiltIns.forEach((name) => {
        expect(allNames).toContain(name);
      });
    });

    it('should validate built-in capabilities have required properties', () => {
      const navigateCap = registry.get('navigate');
      expect(navigateCap).toBeDefined();
      expect(navigateCap?.inputSchema).toBeDefined();
      expect(navigateCap?.guard).toBeDefined();
      expect(navigateCap?.runner).toBeDefined();
      expect(navigateCap?.acceptance).toBeDefined();
      expect(typeof navigateCap?.guard).toBe('function');
      expect(typeof navigateCap?.runner).toBe('function');
      expect(typeof navigateCap?.acceptance).toBe('function');
    });

    it('should check canonical verb status', () => {
      expect(registry.isCanonicalVerb('navigate')).toBe(true);
      expect(registry.isCanonicalVerb('dig_block')).toBe(true);
      expect(registry.isCanonicalVerb('custom_verb')).toBe(false);
    });
  });

  describe('Registry Health Metrics', () => {
    it('should calculate health metrics correctly', () => {
      const health = registry.getHealthMetrics();

      expect(health.totalCapabilities).toBe(3); // Currently implemented built-ins
      expect(health.canonicalCoverage.missing).toHaveLength(10); // 10 canonical verbs not yet implemented
      expect(health.canonicalCoverage.extra).toHaveLength(0); // No extra capabilities
      expect(health.slaCompliance).toBeGreaterThanOrEqual(0);
      expect(health.versionHealth).toBeGreaterThanOrEqual(0);
      expect(health.averageVersions).toBeGreaterThanOrEqual(1);
    });

    it('should detect missing canonical coverage', () => {
      // Create registry without all canonical verbs
      const partialRegistry = new CapabilityRegistryBuilder()
        .addBuiltIn('navigate')
        .build();

      const health = partialRegistry.getHealthMetrics();
      expect(health.canonicalCoverage.missing).toContain('dig_block');
      expect(health.canonicalCoverage.missing).toContain('craft_item');
    });
  });

  describe('Registry Builder', () => {
    it('should build registry with all built-ins', () => {
      const fullRegistry = new CapabilityRegistryBuilder()
        .addAllBuiltIns()
        .build();

      const allNames = fullRegistry.getAllNames();
      expect(allNames).toContain('navigate');
      expect(allNames).toContain('craft_item');
      expect(allNames).toContain('dig_block');
    });

    it('should build registry with custom versions', () => {
      const customRegistry = new CapabilityRegistryBuilder()
        .addAllBuiltIns({ navigate: '3.0.0', craft_item: '2.1.0' })
        .build();

      expect(customRegistry.get('navigate')?.version).toBe('3.0.0');
      expect(customRegistry.get('craft_item')?.version).toBe('2.1.0');
    });

    it('should build registry with custom capabilities', () => {
      const customCapability = {
        name: 'custom_action',
        version: '1.0.0',
        inputSchema: BUILT_IN_CAPABILITIES.navigate.inputSchema, // Reuse for testing
        guard: () => true,
        runner: async () => ({ ok: true, startedAt: 0, endedAt: 0 }),
        acceptance: () => true,
      };

      const customRegistry = new CapabilityRegistryBuilder()
        .addAllBuiltIns()
        .addCustom(customCapability)
        .build();

      expect(customRegistry.has('custom_action')).toBe(true);
      expect(customRegistry.get('custom_action')?.version).toBe('1.0.0');
    });

    it('should handle builder method chaining', () => {
      const registry = new CapabilityRegistryBuilder()
        .addBuiltIn('navigate')
        .addBuiltIn('craft_item')
        .addBuiltIn('dig_block')
        .build();

      expect(registry.has('navigate')).toBe(true);
      expect(registry.has('craft_item')).toBe(true);
      expect(registry.has('dig_block')).toBe(true);
    });
  });

  describe('Version Management', () => {
    it('should track multiple versions of same capability', () => {
      const multiVersionRegistry = new CapabilityRegistryBuilder()
        .addBuiltIn('navigate', '1.0.0')
        .build();

      // Re-register same capability with different version
      const v2Capability = {
        name: 'navigate',
        version: '2.0.0',
        inputSchema: BUILT_IN_CAPABILITIES.navigate.inputSchema,
        guard: () => true,
        runner: async () => ({ ok: true, startedAt: 0, endedAt: 0 }),
        acceptance: () => true,
      };

      expect(() => {
        multiVersionRegistry.register(v2Capability);
      }).toThrow('already registered');
    });

    it('should get specific versions', () => {
      const registry = new CapabilityRegistryBuilder()
        .addBuiltIn('navigate', '1.0.0')
        .build();

      const v1Cap = registry.getByVersion('navigate', '1.0.0');
      expect(v1Cap?.version).toBe('1.0.0');

      const v2Cap = registry.getByVersion('navigate', '2.0.0');
      expect(v2Cap).toBeUndefined();
    });

    it('should list all versions for a capability', () => {
      const registry = new CapabilityRegistryBuilder()
        .addBuiltIn('navigate', '1.0.0')
        .build();

      const versions = registry.getVersions('navigate');
      expect(versions).toContain('1.0.0');
      expect(versions.length).toBe(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid built-in names gracefully', () => {
      expect(() => {
        new CapabilityRegistryBuilder().addBuiltIn('invalid_capability');
      }).toThrow('No built-in capability definition');
    });

    it('should validate capability name uniqueness', () => {
      const duplicateCapability = {
        name: 'navigate',
        version: '1.0.0',
        inputSchema: BUILT_IN_CAPABILITIES.navigate.inputSchema,
        guard: () => true,
        runner: async () => ({ ok: true, startedAt: 0, endedAt: 0 }),
        acceptance: () => true,
      };

      expect(() => {
        registry.register(duplicateCapability);
      }).toThrow('already registered');
    });
  });

  describe('Registry Utilities', () => {
    it('should clear all capabilities', () => {
      expect(registry.has('navigate')).toBe(true);

      registry.clear();

      expect(registry.has('navigate')).toBe(false);
      expect(registry.getAllNames()).toHaveLength(0);
    });

    it('should validate canonical coverage', () => {
      const coverage = registry.validateCanonicalCoverage();
      expect(coverage.missing).toHaveLength(10); // 10 canonical verbs not yet implemented
      expect(coverage.extra).toHaveLength(0); // No extra capabilities
    });

    it('should provide comprehensive health metrics', () => {
      const health = registry.getHealthMetrics();

      expect(health).toHaveProperty('totalCapabilities');
      expect(health).toHaveProperty('canonicalCoverage');
      expect(health).toHaveProperty('slaCompliance');
      expect(health).toHaveProperty('versionHealth');
      expect(health).toHaveProperty('averageVersions');

      expect(typeof health.totalCapabilities).toBe('number');
      expect(typeof health.slaCompliance).toBe('number');
      expect(typeof health.versionHealth).toBe('number');
      expect(typeof health.averageVersions).toBe('number');
    });
  });
});
