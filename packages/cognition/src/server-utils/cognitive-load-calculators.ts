/**
 * Cognitive load, attention, creativity, and system metric calculators.
 */

/**
 * Calculate current cognitive load based on system resources and activity
 */
export function calculateCognitiveLoad(getNetworkRequestCount: () => number): number {
  const cpuLoad = getSystemCpuUsage();
  const memoryLoad = getMemoryLoad();
  const processLoad = getProcessLoad();
  const networkLoad = getNetworkLoad(getNetworkRequestCount);

  // Weighted average of different load factors
  const cognitiveLoad =
    cpuLoad * 0.3 + // CPU usage 30%
    memoryLoad * 0.25 + // Memory usage 25%
    processLoad * 0.25 + // Active processes 25%
    networkLoad * 0.2; // Network activity 20%

  // Normalize to 0-1 range
  return Math.min(1.0, Math.max(0.0, cognitiveLoad));
}

/**
 * Calculate attention level based on system responsiveness
 */
export function calculateAttentionLevel(): number {
  const uptime = process.uptime();
  const memoryUsage = process.memoryUsage();

  // High attention when system is fresh and not overloaded
  const attentionBase = Math.max(0, 1 - uptime / 3600); // Decreases over time
  const memoryAttention = Math.max(
    0,
    1 - memoryUsage.heapUsed / memoryUsage.heapTotal
  );

  return Math.min(1.0, Math.max(0.0, (attentionBase + memoryAttention) / 2));
}

/**
 * Calculate creativity level based on system capacity and rest periods
 */
export function calculateCreativityLevel(): number {
  const uptime = process.uptime();
  const memoryUsage = process.memoryUsage();

  // Creativity is higher when system is rested and has available resources
  const restFactor = Math.max(0, 1 - Math.min(1, uptime / 1800)); // Higher after rest
  const capacityFactor = Math.max(
    0,
    1 - memoryUsage.heapUsed / memoryUsage.heapTotal
  );

  return Math.min(1.0, Math.max(0.0, (restFactor + capacityFactor) / 2));
}

/**
 * Get number of active processes
 */
export function getActiveProcessCount(): number {
  // In a real implementation, this would track active cognitive processes
  // For now, return a simulated value based on system activity
  const baseProcesses = 3; // Base cognitive processes always running
  const uptime = process.uptime();
  const activityBonus = Math.floor(uptime / 300); // +1 process per 5 minutes of uptime

  return baseProcesses + Math.min(5, activityBonus); // Cap at 8 processes
}

/**
 * Get system CPU usage as percentage (0-1)
 */
export function getSystemCpuUsage(): number {
  try {
    // Get current CPU usage
    const cpuUsage = process.cpuUsage();
    const totalTime = cpuUsage.user + cpuUsage.system;

    // Convert to percentage (simplified calculation)
    // In production, this would track over time intervals
    return Math.min(1.0, Math.max(0.0, totalTime / 100000)); // Normalize to 0-1
  } catch (error) {
    console.warn('Failed to get CPU usage:', error);
    return 0.5; // Default moderate load
  }
}

/**
 * Get memory load as percentage (0-1)
 */
export function getMemoryLoad(): number {
  try {
    const memoryUsage = process.memoryUsage();
    const memoryLoad = memoryUsage.heapUsed / memoryUsage.heapTotal;

    return Math.min(1.0, Math.max(0.0, memoryLoad));
  } catch (error) {
    console.warn('Failed to get memory usage:', error);
    return 0.5; // Default moderate load
  }
}

/**
 * Get process load based on active operations
 */
export function getProcessLoad(): number {
  try {
    // Simulate process load based on uptime and activity patterns
    const uptime = process.uptime();
    const timeOfDay = new Date().getHours();

    // Higher load during peak hours and after long uptime
    const uptimeLoad = Math.min(1.0, uptime / 3600); // Max after 1 hour
    const timeLoad = timeOfDay >= 9 && timeOfDay <= 17 ? 0.7 : 0.3; // Higher during business hours

    return (uptimeLoad + timeLoad) / 2;
  } catch (error) {
    console.warn('Failed to calculate process load:', error);
    return 0.5; // Default moderate load
  }
}

/**
 * Get network load based on recent activity
 */
export function getNetworkLoad(getNetworkRequestCount: () => number): number {
  try {
    // Track recent network requests
    const recentRequests = getNetworkRequestCount();
    // Normalize to 0-1 based on request rate
    return Math.min(1.0, Math.max(0.0, recentRequests / 100)); // Max 100 requests per minute
  } catch (error) {
    console.warn('Failed to calculate network load:', error);
    return 0.5; // Default moderate load
  }
}
