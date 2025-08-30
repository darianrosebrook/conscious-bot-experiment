/**
 * Enhanced Viewer Tests
 *
 * Tests for the enhanced viewer functionality that improves
 * entity rendering and lighting in the Prismarine viewer.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  EnhancedViewer,
  createEnhancedViewer,
  applyViewerEnhancements,
} from '../viewer-enhancements';

describe('Enhanced Viewer', () => {
  let mockBot: any;
  let enhancedViewer: EnhancedViewer;

  beforeEach(() => {
    // Create a mock bot with required properties
    mockBot = {
      entities: {
        '1': {
          id: 1,
          type: 'player',
          position: { x: 0, y: 64, z: 0 },
          yaw: 0,
          pitch: 0,
          onGround: true,
        },
        '2': {
          id: 2,
          type: 'zombie',
          position: { x: 5, y: 64, z: 5 },
          yaw: 45,
          pitch: 0,
          onGround: true,
        },
      },
      world: {
        time: 6000, // Day time
      },
      viewer: {
        emit: vi.fn(),
      },
    };

    enhancedViewer = new EnhancedViewer(mockBot);
  });

  afterEach(() => {
    enhancedViewer.stop();
  });

  describe('Initialization', () => {
    it('should create enhanced viewer with default options', () => {
      expect(enhancedViewer).toBeInstanceOf(EnhancedViewer);
      expect(enhancedViewer.getStatus().isActive).toBe(false);
    });

    it('should create enhanced viewer with custom options', () => {
      const customViewer = new EnhancedViewer(mockBot, {
        enableEntityAnimation: false,
        enableLightingUpdates: true,
        entityUpdateInterval: 200,
      });

      expect(customViewer).toBeInstanceOf(EnhancedViewer);
      expect(customViewer.getStatus().options.entityUpdateInterval).toBe(200);
      expect(customViewer.getStatus().options.enableEntityAnimation).toBe(
        false
      );
    });
  });

  describe('Lifecycle', () => {
    it('should start and stop correctly', () => {
      expect(enhancedViewer.getStatus().isActive).toBe(false);

      enhancedViewer.start();
      expect(enhancedViewer.getStatus().isActive).toBe(true);

      enhancedViewer.stop();
      expect(enhancedViewer.getStatus().isActive).toBe(false);
    });

    it('should not start if already active', () => {
      enhancedViewer.start();
      const initialStatus = enhancedViewer.getStatus();

      enhancedViewer.start(); // Try to start again
      expect(enhancedViewer.getStatus()).toEqual(initialStatus);
    });
  });

  describe('Entity Animation', () => {
    it('should emit entity animation events when enabled', async () => {
      const events: any[] = [];
      enhancedViewer.on('entityAnimation', (event) => {
        events.push(event);
      });

      enhancedViewer.start();

      // Wait for entity animation to trigger
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(events.length).toBeGreaterThan(0);
      expect(events[0]).toHaveProperty('id');
      expect(events[0]).toHaveProperty('type');
      expect(events[0]).toHaveProperty('position');
    });

    it('should not emit entity animation events when disabled', async () => {
      const disabledViewer = new EnhancedViewer(mockBot, {
        enableEntityAnimation: false,
      });

      const events: any[] = [];
      disabledViewer.on('entityAnimation', (event) => {
        events.push(event);
      });

      disabledViewer.start();

      // Wait for potential entity animation
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(events.length).toBe(0);
      disabledViewer.stop();
    });
  });

  describe('Lighting Updates', () => {
    it('should emit lighting update events when enabled', async () => {
      const events: any[] = [];
      enhancedViewer.on('lightingUpdate', (event) => {
        events.push(event);
      });

      enhancedViewer.start();

      // Wait for lighting update to trigger
      await new Promise((resolve) => setTimeout(resolve, 1100));

      expect(events.length).toBeGreaterThan(0);
      expect(events[0]).toHaveProperty('time');
      expect(events[0]).toHaveProperty('isDay');
      expect(events[0]).toHaveProperty('isNight');
      expect(events[0]).toHaveProperty('lightLevel');
    });

    it('should calculate correct lighting levels', async () => {
      const events: any[] = [];
      enhancedViewer.on('lightingUpdate', (event) => {
        events.push(event);
      });

      enhancedViewer.start();

      // Wait for lighting update
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const event = events[0];
      expect(event.time).toBe(6000);
      expect(event.isDay).toBe(true);
      expect(event.isNight).toBe(false);
      expect(event.lightLevel).toBe(15);
    });
  });

  describe('Time Sync', () => {
    it('should emit time sync events when enabled', async () => {
      const events: any[] = [];
      enhancedViewer.on('timeSync', (event) => {
        events.push(event);
      });

      enhancedViewer.start();

      // Wait for time sync to trigger
      await new Promise((resolve) => setTimeout(resolve, 5100));

      expect(events.length).toBeGreaterThan(0);
      expect(events[0]).toHaveProperty('time');
      expect(events[0]).toHaveProperty('day');
      expect(events[0]).toHaveProperty('hour');
    });

    it('should calculate correct time values', async () => {
      const events: any[] = [];
      enhancedViewer.on('timeSync', (event) => {
        events.push(event);
      });

      enhancedViewer.start();

      // Wait for time sync
      await new Promise((resolve) => setTimeout(resolve, 5100));

      const event = events[0];
      expect(event.time).toBe(6000);
      expect(event.day).toBe(0);
      expect(event.hour).toBe(6);
    });
  });

  describe('Error Handling', () => {
    it('should handle entity update errors gracefully', async () => {
      const errorEvents: any[] = [];
      enhancedViewer.on('error', (error) => {
        errorEvents.push(error);
      });

      // Create a bot with invalid entities
      const invalidBot = {
        entities: null,
        world: { time: 6000 },
        viewer: { emit: vi.fn() },
      };

      const invalidViewer = new EnhancedViewer(invalidBot);
      invalidViewer.start();

      // Wait for potential errors
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should not crash, may emit error events
      expect(invalidViewer.getStatus().isActive).toBe(true);
      invalidViewer.stop();
    });

    it('should handle missing world gracefully', async () => {
      const errorEvents: any[] = [];
      enhancedViewer.on('error', (error) => {
        errorEvents.push(error);
      });

      // Create a bot with missing world
      const invalidBot = {
        entities: {},
        world: null,
        viewer: { emit: vi.fn() },
      };

      const invalidViewer = new EnhancedViewer(invalidBot);
      invalidViewer.start();

      // Wait for potential errors
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Should not crash
      expect(invalidViewer.getStatus().isActive).toBe(true);
      invalidViewer.stop();
    });
  });

  describe('Factory Functions', () => {
    it('should create enhanced viewer with factory function', () => {
      const viewer = createEnhancedViewer(mockBot);
      expect(viewer).toBeInstanceOf(EnhancedViewer);
      expect(viewer.getStatus().isActive).toBe(true);
      viewer.stop();
    });

    it('should apply enhancements to bot', () => {
      const bot = { ...mockBot };
      const viewer = applyViewerEnhancements(bot);

      expect(viewer).toBeInstanceOf(EnhancedViewer);
      expect(bot.enhancedViewer).toBe(viewer);
      expect(viewer.getStatus().isActive).toBe(true);

      viewer.stop();
    });
  });

  describe('Status Information', () => {
    it('should provide accurate status information', () => {
      const status = enhancedViewer.getStatus();

      expect(status).toHaveProperty('isActive');
      expect(status).toHaveProperty('options');
      expect(status).toHaveProperty('intervals');

      expect(status.options).toHaveProperty('enableEntityAnimation');
      expect(status.options).toHaveProperty('enableLightingUpdates');
      expect(status.options).toHaveProperty('enableTimeSync');

      expect(status.intervals).toHaveProperty('entityAnimation');
      expect(status.intervals).toHaveProperty('lightingUpdates');
      expect(status.intervals).toHaveProperty('timeSync');
    });

    it('should update status when started/stopped', () => {
      expect(enhancedViewer.getStatus().isActive).toBe(false);

      enhancedViewer.start();
      expect(enhancedViewer.getStatus().isActive).toBe(true);
      expect(enhancedViewer.getStatus().intervals.entityAnimation).toBe(true);
      expect(enhancedViewer.getStatus().intervals.lightingUpdates).toBe(true);
      expect(enhancedViewer.getStatus().intervals.timeSync).toBe(true);

      enhancedViewer.stop();
      expect(enhancedViewer.getStatus().isActive).toBe(false);
      expect(enhancedViewer.getStatus().intervals.entityAnimation).toBe(false);
      expect(enhancedViewer.getStatus().intervals.lightingUpdates).toBe(false);
      expect(enhancedViewer.getStatus().intervals.timeSync).toBe(false);
    });
  });
});
