/**
 * Evaluation Tab
 *
 * Self-contained evaluation dashboard with intero timeline, sparklines,
 * current snapshot, task performance, decision quality, system health,
 * and recent task history. Manages its own data fetching.
 *
 * @author @darianrosebrook
 */

import  { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  BarChart3,
  CheckCircle,
  Heart,
  ListChecks,
  Server,
  Shield,
} from 'lucide-react';
import { Section } from './section';
import { InteroTimelineChart } from './intero-timeline-chart';
import { SparklineChart, type SparklinePoint } from './sparkline-chart';
import { InteroCurrentSnapshot } from './intero-current-snapshot';
import { ValuationPanel } from './valuation-panel';
import { cn } from '@/lib/utils';
import s from './evaluation-tab.module.scss';
import type { InteroSnapshot, ServiceHealthStatus, Task } from '@/types';

interface InteroHistoryResponse {
  success: boolean;
  snapshots: InteroSnapshot[];
  summary: { count: number; oldestTs: number; newestTs: number };
  currentIntero: {
    stress: number;
    focus: number;
    curiosity: number;
    stressAxes: InteroSnapshot['stressAxes'];
  } | null;
}

interface BoundaryStatsResponse {
  success: boolean;
  totalEvents: number;
  eventCounts: Record<string, number>;
  acceptResistRatio: number;
}

interface TasksResponse {
  tasks: Task[];
  fallback?: boolean;
  timestamp: string;
}

interface ServiceHealthResponse {
  services: ServiceHealthStatus[];
  timestamp: number;
}

const REFRESH_INTERVAL = 30_000;

export function EvaluationTab() {
  const [snapshots, setSnapshots] = useState<InteroSnapshot[]>([]);
  const [currentIntero, setCurrentIntero] = useState<InteroSnapshot | null>(
    null
  );
  const [boundaryStats, setBoundaryStats] =
    useState<BoundaryStatsResponse | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksFallback, setTasksFallback] = useState(false);
  const [services, setServices] = useState<ServiceHealthStatus[]>([]);
  const [lastRefresh, setLastRefresh] = useState(0);

  const fetchAll = useCallback(async () => {
    const results = await Promise.allSettled([
      fetch('/api/intero/history?limit=300').then((r) =>
        r.json()
      ) as Promise<InteroHistoryResponse>,
      fetch('/api/tasks').then((r) => r.json()) as Promise<TasksResponse>,
      fetch('/api/service-health').then((r) =>
        r.json()
      ) as Promise<ServiceHealthResponse>,
      fetch('/api/intero/boundary-stats', {
        signal: AbortSignal.timeout(3000),
      }).then((r) => r.json()) as Promise<BoundaryStatsResponse>,
    ]);

    // Intero history
    if (results[0].status === 'fulfilled') {
      const data = results[0].value;
      if (data.snapshots) setSnapshots(data.snapshots);
      if (data.currentIntero) {
        setCurrentIntero({
          ts: Date.now(),
          stress: data.currentIntero.stress,
          focus: data.currentIntero.focus,
          curiosity: data.currentIntero.curiosity,
          stressAxes: data.currentIntero.stressAxes,
          emotionalState:
            data.currentIntero.stress > 60
              ? 'uneasy'
              : data.currentIntero.stress > 35
                ? 'attentive'
                : 'neutral',
        });
      }
    }

    // Tasks
    if (results[1].status === 'fulfilled') {
      const data = results[1].value;
      setTasks(data.tasks || []);
      setTasksFallback(!!data.fallback);
    }

    // Services
    if (results[2].status === 'fulfilled') {
      const data = results[2].value;
      if (data.services) setServices(data.services);
    }

    // Boundary stats
    if (results[3].status === 'fulfilled') {
      const data = results[3].value;
      if (data.success !== false) setBoundaryStats(data);
    }

    setLastRefresh(Date.now());
  }, []);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [fetchAll]);

  // Derived sparkline data
  const stressSparkline: SparklinePoint[] = snapshots.map((snap) => ({
    ts: snap.ts,
    value: snap.stress,
  }));
  const focusSparkline: SparklinePoint[] = snapshots.map((snap) => ({
    ts: snap.ts,
    value: snap.focus,
  }));
  const curiositySparkline: SparklinePoint[] = snapshots.map((snap) => ({
    ts: snap.ts,
    value: snap.curiosity,
  }));

  // Task stats
  const completedTasks = tasks.filter((t) => t.progress >= 1);
  const failedTasks = tasks.filter(
    (t) => t.progress < 1 && t.source === 'system'
  );
  const successRate =
    tasks.length > 0
      ? Math.round((completedTasks.length / tasks.length) * 100)
      : 0;

  return (
    <div className={s.root}>
      {/* Left column: Intero visualization */}
      <aside className={s.aside}>
        {/* Intero Timeline */}
        <Section
          title="Interoception Timeline"
          icon={<Activity className={s.icon4} />}
        >
          <InteroTimelineChart snapshots={snapshots} height={240} />
        </Section>

        {/* Sparklines row */}
        <Section title="Trends" icon={<BarChart3 className={s.icon4} />} tight>
          <div className={s.sparklineGrid}>
            <SparklineChart
              data={stressSparkline}
              label="Stress"
              color="#ef4444"
              width={140}
              height={48}
            />
            <SparklineChart
              data={focusSparkline}
              label="Focus"
              color="#3b82f6"
              width={140}
              height={48}
            />
            <SparklineChart
              data={curiositySparkline}
              label="Curiosity"
              color="#a855f7"
              width={140}
              height={48}
            />
          </div>
        </Section>

        {/* Current Snapshot */}
        <Section
          title="Current State"
          icon={<Heart className={s.icon4} />}
          tight
        >
          <InteroCurrentSnapshot snapshot={currentIntero} />
        </Section>
      </aside>

      {/* Right column: Performance & Health */}
      <main className={s.main}>
        {/* Task Performance */}
        <Section
          title="Task Performance"
          icon={<ListChecks className={s.icon4} />}
          tight
        >
          {tasksFallback ? (
            <div className={s.fallbackCenter}>
              <Server className={s.fallbackIcon} />
              <p className={s.fallbackText}>Planning service offline</p>
            </div>
          ) : (
            <div className={s.statsGrid}>
              <div className={s.statCard}>
                <div className={s.statLabel}>Total</div>
                <div className={s.statValueDefault}>{tasks.length}</div>
              </div>
              <div className={s.statCard}>
                <div className={s.statLabel}>Completed</div>
                <div className={s.statValueGreen}>{completedTasks.length}</div>
              </div>
              <div className={s.statCard}>
                <div className={s.statLabel}>Failed</div>
                <div className={s.statValueRed}>{failedTasks.length}</div>
              </div>
              <div className={s.statCard}>
                <div className={s.statLabel}>Success Rate</div>
                <div className={s.statValueDefault}>{successRate}%</div>
              </div>
            </div>
          )}
        </Section>

        {/* Decision Quality */}
        <Section
          title="Decision Quality"
          icon={<Shield className={s.icon4} />}
          tight
        >
          {boundaryStats ? (
            <div className={s.decisionSpacer}>
              <div className={s.decisionRow}>
                <span className={s.decisionLabel}>
                  Intrusion Accept/Resist Ratio
                </span>
                <span className={s.decisionValue}>
                  {boundaryStats.acceptResistRatio.toFixed(2)}
                </span>
              </div>
              <div className={s.progressTrack}>
                <div
                  className={s.progressFill}
                  style={{
                    width: `${Math.max(2, boundaryStats.acceptResistRatio * 100)}%`,
                  }}
                />
              </div>
              <div className={s.eventCountsGrid}>
                {Object.entries(boundaryStats.eventCounts).map(
                  ([key, count]) => (
                    <div key={key} className={s.eventCountCell}>
                      <div className={s.eventCountKey}>
                        {key.replace(/_/g, ' ')}
                      </div>
                      <div className={s.eventCountValue}>{count}</div>
                    </div>
                  )
                )}
              </div>
            </div>
          ) : (
            <div className={s.decisionEmpty}>
              <p className={s.decisionEmptyText}>
                No boundary decision data yet
              </p>
            </div>
          )}
        </Section>

        {/* System Health */}
        <Section
          title="System Health"
          icon={<Server className={s.icon4} />}
          tight
        >
          <div className={s.healthWrap}>
            {services.length > 0 ? (
              services.map((svc) => (
                <div
                  key={svc.name}
                  className={cn(
                    s.serviceBadge,
                    svc.status === 'up' ? s.serviceBadgeUp : s.serviceBadgeDown
                  )}
                >
                  <span
                    className={cn(
                      s.serviceDot,
                      svc.status === 'up' ? s.serviceDotUp : s.serviceDotDown
                    )}
                  />
                  {svc.name}
                </div>
              ))
            ) : (
              <div className={s.healthChecking}>Checking services...</div>
            )}
          </div>
          {lastRefresh > 0 && (
            <div className={s.lastChecked}>
              Last checked: {new Date(lastRefresh).toLocaleTimeString()}
            </div>
          )}
        </Section>

        {/* Valuation Observability */}
        <ValuationPanel />

        {/* Recent Task History */}
        <Section
          title="Recent Tasks"
          icon={<CheckCircle className={s.icon4} />}
          tight
        >
          {tasks.length > 0 ? (
            <div className={s.taskList}>
              {tasks.slice(0, 10).map((task) => (
                <div key={task.id} className={s.taskRow}>
                  <span
                    className={cn(
                      s.taskDot,
                      task.progress >= 1
                        ? s.taskDotDone
                        : task.progress > 0
                          ? s.taskDotInProgress
                          : s.taskDotPending
                    )}
                  />
                  <span className={s.taskTitle}>{task.title}</span>
                  <span
                    className={
                      task.progress >= 1
                        ? s.taskStatusDone
                        : task.progress > 0
                          ? s.taskStatusInProgress
                          : s.taskStatusPending
                    }
                  >
                    {task.progress >= 1
                      ? 'done'
                      : task.progress > 0
                        ? `${Math.round(task.progress * 100)}%`
                        : 'pending'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className={s.taskEmpty}>
              <p className={s.taskEmptyText}>No task history</p>
            </div>
          )}
        </Section>
      </main>
    </div>
  );
}
