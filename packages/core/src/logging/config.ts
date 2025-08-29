/**
 * Centralized Logging Configuration
 * 
 * Manages debug levels and logging verbosity across all packages
 * 
 * @author @darianrosebrook
 */

export interface LoggingConfig {
  // Environment update logging
  debugEnvironment: boolean;
  debugInventory: boolean;
  debugResources: boolean;
  
  // Live stream logging
  debugLiveStream: boolean;
  debugActions: boolean;
  debugFeedback: boolean;
  debugMiniMap: boolean;
  debugScreenshots: boolean;
  
  // API logging
  debugApi: boolean;
  
  // Service health logging
  debugHealthChecks: boolean;
  
  // General debug mode
  debugMode: boolean;
}

/**
 * Get logging configuration from environment variables
 */
export function getLoggingConfig(): LoggingConfig {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const debugMode = process.env.DEBUG_MODE === 'true';
  
  return {
    // Environment update logging - only in debug mode
    debugEnvironment: isDevelopment && (debugMode || process.env.DEBUG_ENVIRONMENT === 'true'),
    debugInventory: isDevelopment && (debugMode || process.env.DEBUG_INVENTORY === 'true'),
    debugResources: isDevelopment && (debugMode || process.env.DEBUG_RESOURCES === 'true'),
    
    // Live stream logging - only in debug mode
    debugLiveStream: isDevelopment && (debugMode || process.env.DEBUG_LIVESTREAM === 'true'),
    debugActions: isDevelopment && (debugMode || process.env.DEBUG_ACTIONS === 'true'),
    debugFeedback: isDevelopment && (debugMode || process.env.DEBUG_FEEDBACK === 'true'),
    debugMiniMap: isDevelopment && (debugMode || process.env.DEBUG_MINIMAP === 'true'),
    debugScreenshots: isDevelopment && (debugMode || process.env.DEBUG_SCREENSHOTS === 'true'),
    
    // API logging - only in debug mode
    debugApi: isDevelopment && (debugMode || process.env.DEBUG_API === 'true'),
    
    // Service health logging - only in debug mode
    debugHealthChecks: isDevelopment && (debugMode || process.env.DEBUG_HEALTH === 'true'),
    
    // General debug mode
    debugMode: isDevelopment && debugMode,
  };
}

/**
 * Check if a specific debug category is enabled
 */
export function isDebugEnabled(category: keyof LoggingConfig): boolean {
  const config = getLoggingConfig();
  return config[category] || false;
}

/**
 * Log only if debug is enabled for the given category
 */
export function debugLog(category: keyof LoggingConfig, message: string, ...args: any[]): void {
  if (isDebugEnabled(category)) {
    console.log(`[DEBUG:${category}] ${message}`, ...args);
  }
}

/**
 * Log environment updates only if debug is enabled
 */
export function logEnvironmentUpdate(biome: string, timeOfDay: string): void {
  debugLog('debugEnvironment', 'Environment updated:', biome, timeOfDay);
}

/**
 * Log inventory updates only if debug is enabled
 */
export function logInventoryUpdate(itemCount: number): void {
  debugLog('debugInventory', 'Inventory updated:', itemCount, 'items');
}

/**
 * Log resource updates only if debug is enabled
 */
export function logResourceUpdate(scarcityLevel: string): void {
  debugLog('debugResources', 'Resources updated:', scarcityLevel, 'scarcity');
}

/**
 * Log live stream updates only if debug is enabled
 */
export function logLiveStreamUpdate(status: string, connected: boolean): void {
  debugLog('debugLiveStream', 'Live stream updated:', status, connected);
}

/**
 * Log mini-map updates only if debug is enabled
 */
export function logMiniMapUpdate(position: any): void {
  debugLog('debugMiniMap', 'Mini-map updated:', position);
}

/**
 * Log API requests only if debug is enabled
 */
export function logApiRequest(endpoint: string, statusCode: number, duration: number): void {
  debugLog('debugApi', `POST ${endpoint} ${statusCode} in ${duration}ms`);
}
