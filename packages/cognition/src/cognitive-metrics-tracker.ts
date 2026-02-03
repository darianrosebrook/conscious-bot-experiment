/**
 * Cognitive Metrics Tracker
 *
 * Tracks cognitive system metrics: optimizations, conversations,
 * solutions, violations, and intrusions.
 *
 * @author @darianrosebrook
 */

export class CognitiveMetricsTracker {
  private optimizationCount = 0;
  private conversationCount = 0;
  private solutionsGenerated = 0;
  private violationsBlocked = 0;
  private intrusionsHandled = 0;

  incrementOptimizationCount(): void {
    this.optimizationCount++;
  }

  getOptimizationCount(): number {
    return this.optimizationCount;
  }

  incrementConversationCount(): void {
    this.conversationCount++;
  }

  getConversationCount(): number {
    return this.conversationCount;
  }

  incrementSolutionsGenerated(): void {
    this.solutionsGenerated++;
  }

  getSolutionsGenerated(): number {
    return this.solutionsGenerated;
  }

  incrementViolationsBlocked(): void {
    this.violationsBlocked++;
  }

  getViolationsBlocked(): number {
    return this.violationsBlocked;
  }

  incrementIntrusionsHandled(): void {
    this.intrusionsHandled++;
  }

  getIntrusionsHandled(): number {
    return this.intrusionsHandled;
  }

  reset(): void {
    this.optimizationCount = 0;
    this.conversationCount = 0;
    this.solutionsGenerated = 0;
    this.violationsBlocked = 0;
    this.intrusionsHandled = 0;
  }

  getAllMetrics(): Record<string, number> {
    return {
      optimizationCount: this.optimizationCount,
      conversationCount: this.conversationCount,
      solutionsGenerated: this.solutionsGenerated,
      violationsBlocked: this.violationsBlocked,
      intrusionsHandled: this.intrusionsHandled,
    };
  }
}
