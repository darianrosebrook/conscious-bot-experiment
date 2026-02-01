/**
 * Evaluation Panel Component
 *
 * Displays evaluation metrics, performance data, and insights from the evaluation framework.
 *
 * @author @darianrosebrook
 */

'use client';

import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Target,
} from 'lucide-react';
import { Section } from './section';
import { Pill } from './pill';
import { EmptyState } from './empty-state';
import { cn } from '@/lib/utils';
import s from './evaluation-panel.module.scss';

interface EvaluationMetrics {
  name: string;
  value: number;
  unit: string;
  trend: 'up' | 'down' | 'stable';
  color: string;
}

interface EvaluationAlert {
  id: string;
  severity: 'warning' | 'critical' | 'emergency';
  message: string;
  timestamp: number;
  type: string;
}

interface EvaluationData {
  metrics: EvaluationMetrics[];
  alerts: EvaluationAlert[];
  statistics: {
    totalEvaluations: number;
    successfulEvaluations: number;
    averageScore: number;
    averageDuration: number;
    activeScenarios: number;
    activeAgents: number;
  };
  systemHealth: 'healthy' | 'degraded' | 'critical' | 'emergency';
  lastUpdated: number;
}

/**
 * Evaluation Panel Component
 */
export function EvaluationPanel() {
  const [evaluationData, setEvaluationData] = useState<EvaluationData | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch evaluation data
  const fetchEvaluationData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Fetch data from the evaluation API endpoint
      const response = await fetch('/api/evaluation');
      if (!response.ok) {
        throw new Error('Failed to fetch evaluation data');
      }

      const data = await response.json();
      setEvaluationData(data);
    } catch (err) {
      setError('Failed to fetch evaluation data');
      console.error('Error fetching evaluation data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEvaluationData();

    // Refresh data every 30 seconds
    const interval = setInterval(fetchEvaluationData, 30000);
    return () => clearInterval(interval);
  }, []);

  const getHealthColor = (health: string) => {
    switch (health) {
      case 'healthy':
        return s.healthGreen;
      case 'degraded':
        return s.healthYellow;
      case 'critical':
        return s.healthOrange;
      case 'emergency':
        return s.healthRed;
      default:
        return s.healthDefault;
    }
  };

  const getHealthBgColor = (health: string) => {
    switch (health) {
      case 'healthy':
        return s.bgGreen;
      case 'degraded':
        return s.bgYellow;
      case 'critical':
        return s.bgOrange;
      case 'emergency':
        return s.bgRed;
      default:
        return s.bgDefault;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'warning':
        return s.healthYellow;
      case 'critical':
        return s.healthOrange;
      case 'emergency':
        return s.healthRed;
      default:
        return s.healthDefault;
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up':
        return <TrendingUp className={cn(s.metricTrendIcon, s.trendUp)} />;
      case 'down':
        return <TrendingUp className={cn(s.metricTrendIcon, s.trendDown)} />;
      default:
        return <div className={s.trendStable} />;
    }
  };

  if (isLoading) {
    return (
      <Section title="Evaluation" icon={<BarChart3 className="size-4" />}>
        <div className={s.centerPy8}>
          <div className={s.loadingRow}>
            <div className={s.spinner} />
            <span>Loading evaluation data...</span>
          </div>
        </div>
      </Section>
    );
  }

  if (error) {
    return (
      <Section title="Evaluation" icon={<BarChart3 className="size-4" />}>
        <div className={s.centerPy8}>
          <div className={s.errorCenter}>
            <AlertTriangle className={s.errorIcon} />
            <p className={s.errorText}>{error}</p>
            <button
              onClick={fetchEvaluationData}
              className={s.retryLink}
            >
              Retry
            </button>
          </div>
        </div>
      </Section>
    );
  }

  if (!evaluationData) {
    return (
      <Section title="Evaluation" icon={<BarChart3 className="size-4" />}>
        <EmptyState
          icon={BarChart3}
          title="No evaluation data"
          description="Evaluation metrics will appear here when the evaluation system is running."
        />
      </Section>
    );
  }

  return (
    <div className={s.spacer}>
      {/* System Health */}
      <Section
        title="System Health"
        icon={<CheckCircle className="size-4" />}
        tight
      >
        <div className={s.healthRow}>
          <div className={s.alertBadgeRow}>
            <div
              className={cn(s.healthDot, getHealthBgColor(evaluationData.systemHealth))}
            />
            <span
              className={cn(s.healthLabel, getHealthColor(evaluationData.systemHealth))}
            >
              {evaluationData.systemHealth.charAt(0).toUpperCase() +
                evaluationData.systemHealth.slice(1)}
            </span>
          </div>
          <span className={s.healthTime}>
            {new Date(evaluationData.lastUpdated).toLocaleTimeString()}
          </span>
        </div>
      </Section>

      {/* Key Metrics */}
      <Section title="Performance Metrics" icon={<Target className="size-4" />}>
        <div className={s.metricsGrid}>
          {evaluationData.metrics.map((metric) => (
            <div
              key={metric.name}
              className={s.metricCard}
            >
              <div className={s.metricHeader}>
                <span className={s.metricName}>{metric.name}</span>
                {getTrendIcon(metric.trend)}
              </div>
              <div className={s.metricValue}>
                {metric.value}
                {metric.unit}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Statistics */}
      <Section title="Statistics" icon={<BarChart3 className="size-4" />} tight>
        <div className={s.statsGrid}>
          <div className={s.statRow}>
            <span className={s.statLabel}>Total Evaluations</span>
            <span className={s.statValue}>
              {evaluationData.statistics.totalEvaluations}
            </span>
          </div>
          <div className={s.statRow}>
            <span className={s.statLabel}>Success Rate</span>
            <span className={s.statValue}>
              {(
                (evaluationData.statistics.successfulEvaluations /
                  evaluationData.statistics.totalEvaluations) *
                100
              ).toFixed(1)}
              %
            </span>
          </div>
          <div className={s.statRow}>
            <span className={s.statLabel}>Avg Score</span>
            <span className={s.statValue}>
              {evaluationData.statistics.averageScore.toFixed(1)}%
            </span>
          </div>
          <div className={s.statRow}>
            <span className={s.statLabel}>Avg Duration</span>
            <span className={s.statValue}>
              {evaluationData.statistics.averageDuration.toFixed(1)}s
            </span>
          </div>
          <div className={s.statRow}>
            <span className={s.statLabel}>Active Scenarios</span>
            <span className={s.statValue}>
              {evaluationData.statistics.activeScenarios}
            </span>
          </div>
          <div className={s.statRow}>
            <span className={s.statLabel}>Active Agents</span>
            <span className={s.statValue}>
              {evaluationData.statistics.activeAgents}
            </span>
          </div>
        </div>
      </Section>

      {/* Alerts */}
      <Section
        title="Active Alerts"
        icon={<AlertTriangle className="size-4" />}
      >
        {evaluationData.alerts.length > 0 ? (
          <div className={s.alertSpacer}>
            {evaluationData.alerts.map((alert) => (
              <div
                key={alert.id}
                className={s.alertCard}
              >
                <div className={s.alertHeader}>
                  <div className={s.alertBadgeRow}>
                    <AlertTriangle
                      className={cn(s.alertSeverityIcon, getSeverityColor(alert.severity))}
                    />
                    <Pill>{alert.severity}</Pill>
                  </div>
                  <span className={s.alertTime}>
                    {new Date(alert.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <p className={s.alertMessage}>{alert.message}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className={s.noAlerts}>
            <CheckCircle className={s.noAlertsIcon} />
            <p className={s.noAlertsText}>No active alerts</p>
          </div>
        )}
      </Section>
    </div>
  );
}
