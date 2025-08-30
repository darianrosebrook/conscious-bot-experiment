/**
 * Viewer Enhancements Module
 *
 * Provides additional improvements to the prismarine-viewer for better
 * entity rendering, lighting, and animation support.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';

export interface ViewerEnhancementOptions {
  enableEntityAnimation?: boolean;
  enableLightingUpdates?: boolean;
  enableTimeSync?: boolean;
  entityUpdateInterval?: number;
  lightingUpdateInterval?: number;
  timeSyncInterval?: number;
}

/**
 * Default enhancement options
 */
const DEFAULT_OPTIONS: Required<ViewerEnhancementOptions> = {
  enableEntityAnimation: true,
  enableLightingUpdates: true,
  enableTimeSync: true,
  entityUpdateInterval: 100, // ms
  lightingUpdateInterval: 1000, // ms
  timeSyncInterval: 5000, // ms
};

/**
 * Enhanced viewer class that provides better rendering capabilities
 */
export class EnhancedViewer extends EventEmitter {
  private bot: any;
  private options: Required<ViewerEnhancementOptions>;
  private entityUpdateInterval?: NodeJS.Timeout;
  private lightingUpdateInterval?: NodeJS.Timeout;
  private timeSyncInterval?: NodeJS.Timeout;
  private isActive = false;

  constructor(bot: any, options: ViewerEnhancementOptions = {}) {
    super();
    this.bot = bot;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Start the enhanced viewer features
   */
  start(): void {
    if (this.isActive) {
      return;
    }

    this.isActive = true;

    if (this.options.enableEntityAnimation) {
      this.startEntityAnimation();
    }

    if (this.options.enableLightingUpdates) {
      this.startLightingUpdates();
    }

    if (this.options.enableTimeSync) {
      this.startTimeSync();
    }

    this.emit('started');
  }

  /**
   * Stop the enhanced viewer features
   */
  stop(): void {
    this.isActive = false;

    if (this.entityUpdateInterval) {
      clearInterval(this.entityUpdateInterval);
      this.entityUpdateInterval = undefined;
    }

    if (this.lightingUpdateInterval) {
      clearInterval(this.lightingUpdateInterval);
      this.lightingUpdateInterval = undefined;
    }

    if (this.timeSyncInterval) {
      clearInterval(this.timeSyncInterval);
      this.timeSyncInterval = undefined;
    }

    this.emit('stopped');
  }

  /**
   * Start entity animation updates
   */
  private startEntityAnimation(): void {
    this.entityUpdateInterval = setInterval(() => {
      try {
        if (!this.bot.entities || !this.bot.viewer) {
          return;
        }

        // Update all entities for better animation
        Object.values(this.bot.entities).forEach((entity: any) => {
          if (entity && entity.position && entity.type) {
            // Emit entity updates for better rendering
            this.bot.viewer.emit('entity', entity);

            // Emit custom animation events for specific entity types
            if (entity.type === 'player' || entity.type.includes('mob')) {
              this.emit('entityAnimation', {
                id: entity.id,
                type: entity.type,
                position: entity.position,
                yaw: entity.yaw,
                pitch: entity.pitch,
                onGround: entity.onGround,
              });
            }
          }
        });
      } catch (err) {
        // Ignore entity update errors
        this.emit('error', { type: 'entityUpdate', error: err });
      }
    }, this.options.entityUpdateInterval);
  }

  /**
   * Start lighting updates for day/night cycle
   */
  private startLightingUpdates(): void {
    this.lightingUpdateInterval = setInterval(() => {
      try {
        if (!this.bot.world || !this.bot.viewer) {
          return;
        }

        // Emit time updates for lighting changes
        if (this.bot.world.time !== undefined) {
          this.bot.viewer.emit('time', this.bot.world.time);

          // Calculate lighting based on time
          const time = this.bot.world.time;
          const isDay = time >= 0 && time < 12000;
          const isNight = time >= 12000 && time < 24000;

          this.emit('lightingUpdate', {
            time,
            isDay,
            isNight,
            lightLevel: isDay ? 15 : isNight ? 4 : 8,
          });
        }
      } catch (err) {
        // Ignore lighting update errors
        this.emit('error', { type: 'lightingUpdate', error: err });
      }
    }, this.options.lightingUpdateInterval);
  }

  /**
   * Start time synchronization
   */
  private startTimeSync(): void {
    this.timeSyncInterval = setInterval(() => {
      try {
        if (!this.bot.world) {
          return;
        }

        // Emit time sync events
        this.emit('timeSync', {
          time: this.bot.world.time,
          day: Math.floor(this.bot.world.time / 24000),
          hour: Math.floor((this.bot.world.time % 24000) / 1000),
        });
      } catch (err) {
        // Ignore time sync errors
        this.emit('error', { type: 'timeSync', error: err });
      }
    }, this.options.timeSyncInterval);
  }

  /**
   * Get current enhancement status
   */
  getStatus(): {
    isActive: boolean;
    options: Required<ViewerEnhancementOptions>;
    intervals: {
      entityAnimation: boolean;
      lightingUpdates: boolean;
      timeSync: boolean;
    };
  } {
    return {
      isActive: this.isActive,
      options: this.options,
      intervals: {
        entityAnimation: !!this.entityUpdateInterval,
        lightingUpdates: !!this.lightingUpdateInterval,
        timeSync: !!this.timeSyncInterval,
      },
    };
  }
}

/**
 * Create and start enhanced viewer for a bot
 */
export function createEnhancedViewer(
  bot: any,
  options: ViewerEnhancementOptions = {}
): EnhancedViewer {
  const enhancedViewer = new EnhancedViewer(bot, options);
  enhancedViewer.start();
  return enhancedViewer;
}

/**
 * Apply viewer enhancements to an existing bot
 */
export function applyViewerEnhancements(
  bot: any,
  options: ViewerEnhancementOptions = {}
): EnhancedViewer {
  // Create enhanced viewer
  const enhancedViewer = createEnhancedViewer(bot, options);

  // Attach to bot for easy access
  bot.enhancedViewer = enhancedViewer;

  return enhancedViewer;
}
