/**
 * Thought-to-Action Audit Logger
 *
 * Captures the complete pipeline from need identification through action execution
 * for debugging and validation purposes.
 *
 * @author @darianrosebrook
 */

import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface AuditEntry {
  timestamp: number;
  stage: AuditStage;
  data: Record<string, any>;
  duration?: number;
  success?: boolean;
  error?: string;
}

export type AuditStage =
  | 'need_identified'
  | 'thought_generated'
  | 'thought_processed'
  | 'action_planned'
  | 'tool_selected'
  | 'tool_executed'
  | 'action_completed'
  | 'feedback_received';

export interface AuditSession {
  sessionId: string;
  startTime: number;
  endTime?: number;
  entries: AuditEntry[];
  summary?: AuditSummary;
}

export interface AuditSummary {
  totalEntries: number;
  successCount: number;
  failureCount: number;
  averageDuration: number;
  stagesCompleted: AuditStage[];
  stagesFailed: AuditStage[];
}

// ============================================================================
// Audit Logger Implementation
// ============================================================================

export class ThoughtActionAuditLogger {
  private sessions: Map<string, AuditSession> = new Map();
  private currentSessionId: string | null = null;
  private enabled: boolean = true;
  private outputDir: string;

  constructor(outputDir = './logs/audit') {
    this.outputDir = outputDir;
  }

  /**
   * Start a new audit session
   */
  startSession(sessionId?: string): string {
    const id =
      sessionId ||
      `audit-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    const session: AuditSession = {
      sessionId: id,
      startTime: Date.now(),
      entries: [],
    };

    this.sessions.set(id, session);
    this.currentSessionId = id;

    console.log(`✅ [AuditLogger] Started audit session: ${id}`);
    return id;
  }

  /**
   * End current audit session
   */
  async endSession(sessionId?: string): Promise<AuditSession | null> {
    const id = sessionId || this.currentSessionId;
    if (!id) {
      console.warn('[AuditLogger] No active session to end');
      return null;
    }

    const session = this.sessions.get(id);
    if (!session) {
      console.warn(`[AuditLogger] Session not found: ${id}`);
      return null;
    }

    session.endTime = Date.now();
    session.summary = this.generateSummary(session);

    console.log(`✅ [AuditLogger] Ended audit session: ${id}`);
    console.log(
      `   Duration: ${((session.endTime - session.startTime) / 1000).toFixed(2)}s`
    );
    console.log(`   Entries: ${session.entries.length}`);
    console.log(
      `   Success: ${session.summary.successCount}, Failed: ${session.summary.failureCount}`
    );

    // Save to disk
    await this.saveSession(session);

    if (this.currentSessionId === id) {
      this.currentSessionId = null;
    }

    return session;
  }

  /**
   * Log an audit entry
   */
  log(
    stage: AuditStage,
    data: Record<string, any>,
    options?: {
      duration?: number;
      success?: boolean;
      error?: string;
      sessionId?: string;
    }
  ): void {
    if (!this.enabled) return;

    const sessionId = options?.sessionId || this.currentSessionId;
    if (!sessionId) {
      console.warn('[AuditLogger] No active session, entry not logged');
      return;
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      console.warn(`[AuditLogger] Session not found: ${sessionId}`);
      return;
    }

    const entry: AuditEntry = {
      timestamp: Date.now(),
      stage,
      data,
      duration: options?.duration,
      success: options?.success,
      error: options?.error,
    };

    session.entries.push(entry);

    // Log to console for immediate visibility
    const statusEmoji =
      options?.success === false
        ? '❌'
        : options?.success === true
          ? '✅'
          : '🔵';
    const durationStr = options?.duration ? ` (${options.duration}ms)` : '';
    console.log(`${statusEmoji} [AuditLogger] ${stage}${durationStr}`);

    if (options?.error) {
      console.log(`   Error: ${options.error}`);
    }
  }

  /**
   * Get current session
   */
  getCurrentSession(): AuditSession | null {
    if (!this.currentSessionId) return null;
    return this.sessions.get(this.currentSessionId) || null;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): AuditSession | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Generate summary for a session
   */
  private generateSummary(session: AuditSession): AuditSummary {
    const entries = session.entries;
    const successCount = entries.filter((e) => e.success === true).length;
    const failureCount = entries.filter((e) => e.success === false).length;

    const durations = entries
      .filter((e) => e.duration !== undefined)
      .map((e) => e.duration!);
    const averageDuration =
      durations.length > 0
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : 0;

    const stagesCompleted = [
      ...new Set(entries.filter((e) => e.success === true).map((e) => e.stage)),
    ] as AuditStage[];

    const stagesFailed = [
      ...new Set(
        entries.filter((e) => e.success === false).map((e) => e.stage)
      ),
    ] as AuditStage[];

    return {
      totalEntries: entries.length,
      successCount,
      failureCount,
      averageDuration,
      stagesCompleted,
      stagesFailed,
    };
  }

  /**
   * Save session to disk
   */
  private async saveSession(session: AuditSession): Promise<void> {
    try {
      // Ensure output directory exists
      if (!existsSync(this.outputDir)) {
        await mkdir(this.outputDir, { recursive: true });
      }

      // Generate filename
      const timestamp = new Date(session.startTime)
        .toISOString()
        .replace(/[:.]/g, '-');
      const filename = `audit-${timestamp}.json`;
      const filepath = path.join(this.outputDir, filename);

      // Write JSON
      await writeFile(filepath, JSON.stringify(session, null, 2));

      // Also write a readable text version
      const textFilename = `audit-${timestamp}.txt`;
      const textFilepath = path.join(this.outputDir, textFilename);
      const textContent = this.formatSessionAsText(session);
      await writeFile(textFilepath, textContent);

      console.log(`✅ [AuditLogger] Saved session to ${filepath}`);
      console.log(`✅ [AuditLogger] Saved readable log to ${textFilepath}`);
    } catch (error) {
      console.error('[AuditLogger] Failed to save session:', error);
    }
  }

  /**
   * Format session as readable text
   */
  private formatSessionAsText(session: AuditSession): string {
    const lines: string[] = [];

    lines.push('='.repeat(80));
    lines.push(`THOUGHT-TO-ACTION AUDIT LOG`);
    lines.push('='.repeat(80));
    lines.push('');
    lines.push(`Session ID: ${session.sessionId}`);
    lines.push(`Start Time: ${new Date(session.startTime).toISOString()}`);

    if (session.endTime) {
      lines.push(`End Time: ${new Date(session.endTime).toISOString()}`);
      lines.push(
        `Duration: ${((session.endTime - session.startTime) / 1000).toFixed(2)}s`
      );
    }

    lines.push('');

    if (session.summary) {
      lines.push('SUMMARY:');
      lines.push(`  Total Entries: ${session.summary.totalEntries}`);
      lines.push(`  Successful: ${session.summary.successCount}`);
      lines.push(`  Failed: ${session.summary.failureCount}`);
      lines.push(
        `  Average Duration: ${session.summary.averageDuration.toFixed(2)}ms`
      );
      lines.push(
        `  Stages Completed: ${session.summary.stagesCompleted.join(', ') || 'none'}`
      );

      if (session.summary.stagesFailed.length > 0) {
        lines.push(
          `  Stages Failed: ${session.summary.stagesFailed.join(', ')}`
        );
      }

      lines.push('');
    }

    lines.push('='.repeat(80));
    lines.push(`PIPELINE TRACE (${session.entries.length} entries)`);
    lines.push('='.repeat(80));
    lines.push('');

    // Group entries by logical chain
    let currentChain = 1;
    let lastTimestamp = session.startTime;

    session.entries.forEach((entry, index) => {
      const elapsed = ((entry.timestamp - session.startTime) / 1000).toFixed(3);
      const delta = ((entry.timestamp - lastTimestamp) / 1000).toFixed(3);

      // Detect new chain (gap of more than 2 seconds)
      if (entry.timestamp - lastTimestamp > 2000 && index > 0) {
        currentChain++;
        lines.push('');
        lines.push(`--- CHAIN ${currentChain} ---`);
        lines.push('');
      }

      const statusIcon =
        entry.success === false ? '❌' : entry.success === true ? '✅' : '🔵';
      const durationStr = entry.duration ? ` [${entry.duration}ms]` : '';

      lines.push(
        `[+${elapsed}s] (+${delta}s) ${statusIcon} ${entry.stage.toUpperCase()}${durationStr}`
      );

      // Add relevant data
      if (entry.data.thoughtContent) {
        lines.push(
          `  Thought: "${entry.data.thoughtContent.substring(0, 100)}..."`
        );
      }
      if (entry.data.selectedTool) {
        lines.push(`  Tool: ${entry.data.selectedTool}`);
      }
      if (entry.data.action) {
        lines.push(`  Action: ${entry.data.action}`);
      }
      if (entry.data.taskTitle) {
        lines.push(`  Task: ${entry.data.taskTitle}`);
      }
      if (entry.error) {
        lines.push(`  ERROR: ${entry.error}`);
      }

      // Show key-value pairs for other data
      const relevantKeys = Object.keys(entry.data).filter(
        (k) =>
          !['thoughtContent', 'selectedTool', 'action', 'taskTitle'].includes(k)
      );

      if (relevantKeys.length > 0 && relevantKeys.length < 5) {
        relevantKeys.forEach((key) => {
          const value = entry.data[key];
          const valueStr =
            typeof value === 'object' ? JSON.stringify(value) : String(value);
          if (valueStr.length < 100) {
            lines.push(`  ${key}: ${valueStr}`);
          }
        });
      }

      lines.push('');
      lastTimestamp = entry.timestamp;
    });

    lines.push('='.repeat(80));
    lines.push('END OF AUDIT LOG');
    lines.push('='.repeat(80));

    return lines.join('\n');
  }

  /**
   * Enable/disable logging
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    console.log(`[AuditLogger] Logging ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Clear all sessions from memory (doesn't delete files)
   */
  clearSessions(): void {
    this.sessions.clear();
    this.currentSessionId = null;
    console.log('[AuditLogger] Cleared all sessions from memory');
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const auditLogger = new ThoughtActionAuditLogger();

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convenience function to start a 2-minute audit session
 */
export async function startTwoMinuteAudit(): Promise<string> {
  const sessionId = auditLogger.startSession();

  console.log('🔍 [Audit] Starting 2-minute audit session...');
  console.log(
    '   Monitoring: need identification → thought → tool selection → execution'
  );

  // Auto-end after 2 minutes
  setTimeout(
    async () => {
      console.log('⏰ [Audit] 2 minutes elapsed, ending session...');
      await auditLogger.endSession(sessionId);
      console.log('✅ [Audit] Session saved to ./logs/audit/');
    },
    2 * 60 * 1000
  );

  return sessionId;
}

/**
 * Convenience function for quick testing (30 seconds)
 */
export async function startQuickAudit(): Promise<string> {
  const sessionId = auditLogger.startSession();

  console.log('🔍 [Audit] Starting 30-second audit session...');

  setTimeout(async () => {
    console.log('⏰ [Audit] 30 seconds elapsed, ending session...');
    await auditLogger.endSession(sessionId);
  }, 30 * 1000);

  return sessionId;
}
