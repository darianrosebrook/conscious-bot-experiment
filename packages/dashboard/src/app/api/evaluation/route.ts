/**
 * Evaluation API Route
 *
 * Provides evaluation metrics and data to the dashboard.
 *
 * @author @darianrosebrook
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Dev-only mock; disabled by default
    if (process.env.ALLOW_DASHBOARD_MOCKS === 'true') {
      const evaluationData = {
        metrics: [
          { name: 'Overall Score', value: 87.5, unit: '%', trend: 'up', color: 'blue' },
          { name: 'Success Rate', value: 92.3, unit: '%', trend: 'stable', color: 'green' },
          { name: 'Avg Planning Time', value: 2.4, unit: 's', trend: 'down', color: 'orange' },
          { name: 'Avg Execution Time', value: 1.8, unit: 's', trend: 'down', color: 'purple' },
        ],
        alerts: [
          {
            id: '1',
            severity: 'warning',
            message: 'Planning latency increased by 15% in last 10 evaluations',
            timestamp: Date.now() - 300000,
            type: 'performance',
          },
          {
            id: '2',
            severity: 'critical',
            message: 'Success rate dropped below 85% threshold',
            timestamp: Date.now() - 600000,
            type: 'regression',
          },
        ],
        statistics: {
          totalEvaluations: 156,
          successfulEvaluations: 144,
          averageScore: 87.5,
          averageDuration: 4.2,
          activeScenarios: 8,
          activeAgents: 3,
        },
        systemHealth: 'healthy',
        lastUpdated: Date.now(),
      };
      return NextResponse.json(evaluationData);
    }

    return NextResponse.json(
      { error: 'Evaluation service unavailable (no mocks in production)' },
      { status: 503 }
    );
  } catch (error) {
    console.error('Error fetching evaluation data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch evaluation data' },
      { status: 500 }
    );
  }
}
