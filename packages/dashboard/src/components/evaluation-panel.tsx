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
  // Clock,
  Target,
} from 'lucide-react';
import { Section } from './section';
import { Pill } from './pill';
import { EmptyState } from './empty-state';

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
        return 'text-green-500';
      case 'degraded':
        return 'text-yellow-500';
      case 'critical':
        return 'text-orange-500';
      case 'emergency':
        return 'text-red-500';
      default:
        return 'text-zinc-500';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'warning':
        return 'text-yellow-500';
      case 'critical':
        return 'text-orange-500';
      case 'emergency':
        return 'text-red-500';
      default:
        return 'text-zinc-500';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="size-3 text-green-500" />;
      case 'down':
        return <TrendingUp className="size-3 text-red-500 rotate-180" />;
      default:
        return <div className="size-3" />;
    }
  };

  if (isLoading) {
    return (
      <Section title="Evaluation" icon={<BarChart3 className="size-4" />}>
        <div className="flex items-center justify-center py-8">
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <div className="size-4 rounded-full border-2 border-zinc-600 border-t-zinc-300 animate-spin" />
            <span>Loading evaluation data...</span>
          </div>
        </div>
      </Section>
    );
  }

  if (error) {
    return (
      <Section title="Evaluation" icon={<BarChart3 className="size-4" />}>
        <div className="flex items-center justify-center py-8">
          <div className="text-center">
            <AlertTriangle className="size-8 text-red-500 mx-auto mb-2" />
            <p className="text-sm text-zinc-400 mb-2">{error}</p>
            <button
              onClick={fetchEvaluationData}
              className="text-xs text-zinc-500 hover:text-zinc-300 underline"
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
    <div className="space-y-3">
      {/* System Health */}
      <Section
        title="System Health"
        icon={<CheckCircle className="size-4" />}
        tight
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className={`size-2 rounded-full ${getHealthColor(evaluationData.systemHealth).replace('text-', 'bg-')}`}
            />
            <span
              className={`text-sm font-medium ${getHealthColor(evaluationData.systemHealth)}`}
            >
              {evaluationData.systemHealth.charAt(0).toUpperCase() +
                evaluationData.systemHealth.slice(1)}
            </span>
          </div>
          <span className="text-xs text-zinc-500">
            {new Date(evaluationData.lastUpdated).toLocaleTimeString()}
          </span>
        </div>
      </Section>

      {/* Key Metrics */}
      <Section title="Performance Metrics" icon={<Target className="size-4" />}>
        <div className="grid grid-cols-2 gap-3">
          {evaluationData.metrics.map((metric) => (
            <div
              key={metric.name}
              className="rounded-lg border border-zinc-800 bg-zinc-950 p-3"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-zinc-500">{metric.name}</span>
                {getTrendIcon(metric.trend)}
              </div>
              <div className="text-lg font-semibold text-zinc-200">
                {metric.value}
                {metric.unit}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Statistics */}
      <Section title="Statistics" icon={<BarChart3 className="size-4" />} tight>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex justify-between">
            <span className="text-zinc-500">Total Evaluations</span>
            <span className="text-zinc-200">
              {evaluationData.statistics.totalEvaluations}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Success Rate</span>
            <span className="text-zinc-200">
              {(
                (evaluationData.statistics.successfulEvaluations /
                  evaluationData.statistics.totalEvaluations) *
                100
              ).toFixed(1)}
              %
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Avg Score</span>
            <span className="text-zinc-200">
              {evaluationData.statistics.averageScore.toFixed(1)}%
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Avg Duration</span>
            <span className="text-zinc-200">
              {evaluationData.statistics.averageDuration.toFixed(1)}s
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Active Scenarios</span>
            <span className="text-zinc-200">
              {evaluationData.statistics.activeScenarios}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Active Agents</span>
            <span className="text-zinc-200">
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
          <div className="space-y-2">
            {evaluationData.alerts.map((alert) => (
              <div
                key={alert.id}
                className="rounded-lg border border-zinc-800 bg-zinc-950 p-3"
              >
                <div className="flex items-start justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <AlertTriangle
                      className={`size-3 ${getSeverityColor(alert.severity)}`}
                    />
                    <Pill className="text-xs">{alert.severity}</Pill>
                  </div>
                  <span className="text-xs text-zinc-500">
                    {new Date(alert.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-sm text-zinc-300">{alert.message}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-4">
            <CheckCircle className="size-6 text-green-500 mx-auto mb-2" />
            <p className="text-sm text-zinc-400">No active alerts</p>
          </div>
        )}
      </Section>
    </div>
  );
}
