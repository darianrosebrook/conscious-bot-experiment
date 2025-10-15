/**
 * Message Parser Utility
 *
 * Parses and formats various system messages for better user experience
 * Converts raw JSON and technical messages into human-readable descriptions
 *
 * @author @darianrosebrook
 */

/**
 * Parse planner action messages into human-readable descriptions
 */
export function parsePlannerAction(
  action: string,
  parameters: Record<string, unknown> = {}
): string {
  // Handle common action patterns
  if (action === 'mine') {
    const depth = parameters.depth as number;
    const resource = parameters.resource as string;
    return `Mine ${resource} at depth ${depth}`;
  }

  if (action === 'farm') {
    const crop = parameters.crop as string;
    const area = parameters.area as number;
    return `Plant ${crop} in ${area}x${area} area`;
  }

  if (action === 'explore') {
    const distance = parameters.distance as number;
    const direction = parameters.direction as string;
    return `Explore ${distance} blocks ${direction}`;
  }

  if (action === 'craft') {
    const item = parameters.item as string;
    const count = parameters.count as number;
    return `Craft ${count || 1} ${item}`;
  }

  if (action === 'build') {
    const structure = parameters.structure as string;
    const material = parameters.material as string;
    return `Build ${structure} using ${material || 'available materials'}`;
  }

  if (action === 'move') {
    const direction = parameters.direction as string;
    const distance = parameters.distance as number;
    return `Move ${distance} blocks ${direction}`;
  }

  if (action === 'turn') {
    const direction = parameters.direction as string;
    const angle = parameters.angle as number;
    return `Turn ${direction} by ${angle}°`;
  }

  if (action === 'gather') {
    const resource = parameters.resource as string;
    const amount = parameters.amount as number;
    return `Gather ${amount || 'some'} ${resource}`;
  }

  if (action === 'search') {
    const target = parameters.target as string;
    const radius = parameters.radius as number;
    return `Search for ${target} within ${radius} blocks`;
  }

  if (action === 'defend') {
    const threat = parameters.threat as string;
    return `Defend against ${threat || 'threats'}`;
  }

  if (action === 'rest') {
    const duration = parameters.duration as number;
    return `Rest for ${duration || 'a while'}`;
  }

  if (action === 'eat') {
    const food = parameters.food as string;
    return `Eat ${food || 'available food'}`;
  }

  // Enhanced fallback: format as action with parameters and better error handling
  if (Object.keys(parameters).length > 0) {
    try {
      const paramDescriptions = Object.entries(parameters)
        .filter(([_, value]) => value !== null && value !== undefined)
        .map(([key, value]) => {
          // Format parameter values more intelligently
          if (typeof value === 'string') {
            return `${key}: ${value}`;
          } else if (typeof value === 'number') {
            return `${key}: ${value}`;
          } else if (typeof value === 'object') {
            return `${key}: ${JSON.stringify(value)}`;
          }
          return `${key}: ${String(value)}`;
        })
        .join(', ');

      return paramDescriptions
        ? `${action.charAt(0).toUpperCase() + action.slice(1)} (${paramDescriptions})`
        : action.charAt(0).toUpperCase() + action.slice(1);
    } catch (error) {
      console.warn('Error formatting action parameters:', error);
      return action.charAt(0).toUpperCase() + action.slice(1);
    }
  }

  return action.charAt(0).toUpperCase() + action.slice(1);
}

/**
 * Parse task type and parameters into a readable description
 */
export function parseTaskDescription(task: {
  type?: string;
  description?: string;
  parameters?: Record<string, unknown>;
}): string {
  if (task.description) {
    return task.description;
  }

  if (task.type && task.parameters) {
    return parsePlannerAction(task.type, task.parameters);
  }

  if (task.type) {
    return task.type.charAt(0).toUpperCase() + task.type.slice(1);
  }

  return 'Unknown Task';
}

/**
 * Parse step description from various formats
 */
export function parseStepDescription(step: {
  label?: string;
  description?: string;
  action?: string;
  parameters?: Record<string, unknown>;
}): string {
  if (step.label) {
    return step.label;
  }

  if (step.description) {
    return step.description;
  }

  if (step.action && step.parameters) {
    return parsePlannerAction(step.action, step.parameters);
  }

  if (step.action) {
    return step.action.charAt(0).toUpperCase() + step.action.slice(1);
  }

  return 'Unknown Step';
}

/**
 * Parse goal description from various formats
 */
export function parseGoalDescription(goal: {
  name?: string;
  description?: string;
  type?: string;
  parameters?: Record<string, unknown>;
}): string {
  if (goal.description) {
    return goal.description;
  }

  if (goal.name) {
    return goal.name;
  }

  if (goal.type && goal.parameters) {
    return parsePlannerAction(goal.type, goal.parameters);
  }

  if (goal.type) {
    return goal.type.charAt(0).toUpperCase() + goal.type.slice(1);
  }

  return 'Unknown Goal';
}

/**
 * Parse current action description
 */
export function parseCurrentAction(
  action: string | Record<string, unknown>
): string {
  if (typeof action === 'string') {
    // Try to parse as JSON first
    try {
      const parsed = JSON.parse(action);
      if (parsed.type && parsed.parameters) {
        return parsePlannerAction(parsed.type, parsed.parameters);
      }
    } catch {
      // Not JSON, return as is
    }
    return action;
  }

  if (typeof action === 'object' && action !== null) {
    // Handle planning system action format
    if ('name' in action) {
      return action.name as string;
    }

    if ('type' in action && 'parameters' in action) {
      return parsePlannerAction(
        action.type as string,
        action.parameters as Record<string, unknown>
      );
    }

    if ('type' in action && 'target' in action) {
      const type = action.type as string;
      const target = action.target as string;
      return `${type.charAt(0).toUpperCase() + type.slice(1)} ${target}`;
    }

    if ('description' in action) {
      return action.description as string;
    }

    if ('action' in action) {
      return action.action as string;
    }
  }

  return 'Unknown Action';
}

/**
 * Format task progress as a human-readable status
 */
export function formatTaskStatus(status: string, progress: number): string {
  if (status === 'completed') return 'Completed';
  if (status === 'failed') return 'Failed';
  if (status === 'blocked') return 'Blocked';
  if (status === 'in_progress') return 'In Progress';
  if (status === 'pending') return 'Pending';

  // Enhanced fallback based on progress with better granularity
  if (progress >= 1.0) return 'Completed';
  if (progress > 0.9) return 'Nearly Complete';
  if (progress > 0.7) return 'Mostly Complete';
  if (progress > 0.5) return 'In Progress';
  if (progress > 0.3) return 'Making Progress';
  if (progress > 0.1) return 'Started';
  if (progress > 0.0) return 'Initialized';
  return 'Pending';
}

/**
 * Format priority as a human-readable level
 */
export function formatPriority(priority: number): string {
  if (priority >= 0.9) return 'Critical';
  if (priority >= 0.7) return 'High';
  if (priority >= 0.5) return 'Medium';
  if (priority >= 0.3) return 'Low';
  return 'Very Low';
}
