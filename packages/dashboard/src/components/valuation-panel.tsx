/**
 * Valuation Panel (Rig F Observability Layer)
 *
 * Self-contained panel for displaying valuation decision records.
 * Three collapsible sections: Summary, Decision Records, Failure Modes.
 * Runs fast verification client-side on each incoming record.
 * Connects to /api/valuation-updates SSE for live data.
 *
 * @author @darianrosebrook
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  Scale,
  ChevronDown,
  CheckCircle,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import { Section } from './section';
import { Pill } from './pill';
import { SparklineChart, type SparklinePoint } from './sparkline-chart';
import { useSSE } from '@/hooks/use-sse';
import { useDashboardStore } from '@/stores/dashboard-store';
import { cn } from '@/lib/utils';
import s from './valuation-panel.module.scss';
import type { ValuationDashboardRecord } from '@/types';

// ============================================================================
// Helpers
// ============================================================================

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function truncateId(id: string, len = 16): string {
  return id.length > len ? id.slice(0, len) + '...' : id;
}

/**
 * Transform raw SSE event data into a ValuationDashboardRecord.
 * Extracts display fields from the nested decision/event structure.
 */
function transformEvent(
  eventData: Record<string, unknown>
): ValuationDashboardRecord | null {
  try {
    const decision = eventData.decision as Record<string, unknown> | undefined;
    if (!decision) return null;

    const output = decision.output as Record<string, unknown>;
    const witness = output?.witness as Record<string, unknown>;
    const correlation =
      (eventData.correlation as Record<string, unknown>) ?? {};
    const actions = (output?.actions as Array<Record<string, unknown>>) ?? [];

    return {
      eventId: eventData.eventId as string,
      decisionId: decision.decisionId as string,
      timestamp: eventData.timestamp as number,
      correlation: {
        taskId: correlation.taskId as string | undefined,
        tickId: correlation.tickId as number | undefined,
        plannerCycleId: correlation.plannerCycleId as string | undefined,
      },
      solved: output?.solved as boolean,
      error: output?.error as string | undefined,
      slotModel: (witness?.slotModel as string) ?? '',
      unknownItemPolicy: (witness?.unknownItemPolicy as string) ?? '',
      countPolicy: (witness?.countPolicy as string) ?? '',
      slotsBefore: (witness?.occupiedSlotsBefore as number) ?? 0,
      slotsAfter: (witness?.occupiedSlotsAfter as number) ?? 0,
      slotBudget: (witness?.slotBudget as number) ?? 0,
      actionsCount: actions.length,
      droppedCount: actions.filter((a) => a.actionType === 'drop').length,
      storedCount: actions.filter((a) => a.actionType === 'store').length,
      keptCount: actions.filter((a) => a.actionType === 'keep').length,
      unknownItems: (witness?.unknownItems as string[]) ?? [],
      protectedItems: (witness?.protectedItems as string[]) ?? [],
      rulesetLintIssueCodes: (witness?.rulesetLintIssueCodes as string[]) ?? [],
      valuationInputDigest: (output?.valuationInputDigest as string) ?? '',
      decisionDigest: (output?.decisionDigest as string) ?? '',
      inventoryStateHash: (output?.inventoryStateHash as string) ?? '',
      rulesetDigest: (decision.rulesetDigest as string) ?? '',
      fullRecord: decision as Record<string, unknown>,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// Collapsible Section Wrapper
// ============================================================================

function CollapsibleSection({
  title,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Section
      title=""
      actions={
        <button
          className={s.collapsibleTrigger}
          onClick={() => setOpen(!open)}
          type="button"
        >
          <span
            style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}
          >
            {icon}
            <span style={{ fontSize: '0.8125rem', fontWeight: 500 }}>
              {title}
            </span>
          </span>
          <ChevronDown className={cn(s.chevron, open && s.chevronOpen)} />
        </button>
      }
      tight
    >
      {open ? children : null}
    </Section>
  );
}

// ============================================================================
// ValuationPanel
// ============================================================================

export function ValuationPanel() {
  const records = useDashboardStore((state) => state.valuationRecords);
  const addRecord = useDashboardStore((state) => state.addValuationRecord);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  // SSE subscription
  const handleMessage = useCallback(
    (data: unknown) => {
      const msg = data as Record<string, unknown>;
      if (msg.type !== 'valuation_update') return;
      const eventData = msg.data as Record<string, unknown>;
      if (!eventData) return;

      const record = transformEvent(eventData);
      if (record) {
        addRecord(record);
      }
    },
    [addRecord]
  );

  useSSE({
    url: '/api/valuation-updates',
    onMessage: handleMessage,
  });

  // Derived aggregations
  const sortedRecords = useMemo(
    () => [...records].sort((a, b) => b.timestamp - a.timestamp),
    [records]
  );

  const totalRecords = records.length;
  const solvedCount = records.filter((r) => r.solved).length;
  const _failedCount = records.filter((r) => !r.solved).length;
  void _failedCount; // Reserved for future use
  const uniqueDecisions = new Set(records.map((r) => r.decisionId)).size;
  const solveRate =
    totalRecords > 0 ? Math.round((solvedCount / totalRecords) * 100) : 0;
  const avgEvictions =
    totalRecords > 0
      ? Math.round(
          records.reduce((sum, r) => sum + r.droppedCount + r.storedCount, 0) /
            totalRecords
        )
      : 0;

  // Digest mismatch count (from fast verification)
  const digestMismatchCount = records.filter(
    (r) => r.fastVerification && !r.fastVerification.valid
  ).length;

  // Sparkline: solved/failed over recent records
  const solveSparkline: SparklinePoint[] = records.map((r) => ({
    ts: r.timestamp,
    value: r.solved ? 1 : 0,
  }));

  // Failure mode aggregation
  const failureModes = useMemo(() => {
    const modes = new Map<
      string,
      { count: number; lastTs: number; items: string[] }
    >();

    for (const r of records) {
      if (r.error) {
        const existing = modes.get(r.error) ?? {
          count: 0,
          lastTs: 0,
          items: [],
        };
        existing.count++;
        existing.lastTs = Math.max(existing.lastTs, r.timestamp);
        if (r.error === 'UNKNOWN_ITEM_VALUATION') {
          for (const item of r.unknownItems) {
            if (!existing.items.includes(item)) existing.items.push(item);
          }
        }
        if (r.error === 'UNSUPPORTED_POLICY') {
          existing.items = [r.slotModel, r.unknownItemPolicy, r.countPolicy];
        }
        modes.set(r.error, existing);
      }
      if (r.fastVerification && !r.fastVerification.valid) {
        const key = 'DIGEST_MISMATCH';
        const existing = modes.get(key) ?? { count: 0, lastTs: 0, items: [] };
        existing.count++;
        existing.lastTs = Math.max(existing.lastTs, r.timestamp);
        existing.items = r.fastVerification.failedChecks;
        modes.set(key, existing);
      }
    }
    return modes;
  }, [records]);

  const latest = sortedRecords[0] ?? null;

  if (totalRecords === 0) {
    return (
      <div className={s.root}>
        <Section title="Valuation" icon={<Scale className={s.icon4} />} tight>
          <div className={s.emptyCenter}>
            <p className={s.emptyText}>No valuation decisions recorded yet</p>
          </div>
        </Section>
      </div>
    );
  }

  return (
    <div className={s.root}>
      {/* Section A: Summary (default open) */}
      <Section
        title="Valuation Summary"
        icon={<Scale className={s.icon4} />}
        tight
      >
        {/* Latest status */}
        {latest && (
          <div className={s.latestRow}>
            <Pill variant={latest.solved ? 'success' : 'danger'}>
              {latest.solved ? 'Solved' : 'Failed'}
            </Pill>
            <span className={s.latestSlots}>
              {latest.slotsBefore} &rarr; {latest.slotsAfter} /{' '}
              {latest.slotBudget} slots
            </span>
            {latest.fastVerification && (
              <Pill
                variant={latest.fastVerification.valid ? 'success' : 'danger'}
              >
                {latest.fastVerification.valid ? 'Verified' : 'Mismatch'}
              </Pill>
            )}
          </div>
        )}

        {/* Stat cards */}
        <div className={s.statsGrid}>
          <div className={s.statCard}>
            <div className={s.statLabel}>Solve Rate</div>
            <div
              className={
                solveRate >= 80
                  ? s.statValueGreen
                  : solveRate >= 50
                    ? s.statValueAmber
                    : s.statValueRed
              }
            >
              {solveRate}%
            </div>
          </div>
          <div className={s.statCard}>
            <div className={s.statLabel}>Avg Evictions</div>
            <div className={s.statValueDefault}>{avgEvictions}</div>
          </div>
          <div className={s.statCard}>
            <div className={s.statLabel}>Unique / Total</div>
            <div className={s.statValueDefault}>
              {uniqueDecisions} / {totalRecords}
            </div>
          </div>
          <div className={s.statCard}>
            <div className={s.statLabel}>Mismatches</div>
            <div
              className={
                digestMismatchCount > 0 ? s.statValueRed : s.statValueGreen
              }
            >
              {digestMismatchCount}
            </div>
          </div>
        </div>

        {/* Sparkline */}
        {solveSparkline.length > 1 && (
          <div className={s.sparklineRow}>
            <SparklineChart
              data={solveSparkline}
              label="Solve/Fail"
              color="#4ade80"
              width={180}
              height={40}
              min={0}
              max={1}
            />
          </div>
        )}
      </Section>

      {/* Section B: Decision Records (default collapsed) */}
      <CollapsibleSection
        title={`Decision Records (${totalRecords})`}
        icon={<CheckCircle className={s.icon4} />}
      >
        <div className={s.recordList}>
          {sortedRecords.slice(0, 20).map((r) => (
            <React.Fragment key={r.eventId}>
              <div
                className={s.recordRow}
                onClick={() =>
                  setExpandedEventId(
                    expandedEventId === r.eventId ? null : r.eventId
                  )
                }
              >
                <span
                  className={cn(s.recordDot, r.solved ? s.dotGreen : s.dotRed)}
                />
                <span className={s.recordTs}>{formatTime(r.timestamp)}</span>
                <span className={s.recordId}>{truncateId(r.decisionId)}</span>
                <span className={s.recordSlots}>
                  {r.slotsAfter}/{r.slotBudget}
                </span>
                {r.fastVerification && (
                  <span>
                    {r.fastVerification.valid ? (
                      <CheckCircle
                        style={{
                          width: 12,
                          height: 12,
                          color: 'rgb(74 222 128)',
                        }}
                      />
                    ) : (
                      <XCircle
                        style={{
                          width: 12,
                          height: 12,
                          color: 'rgb(248 113 113)',
                        }}
                      />
                    )}
                  </span>
                )}
                <button className={s.expandBtn} type="button">
                  <ChevronDown
                    className={cn(
                      s.chevron,
                      expandedEventId === r.eventId && s.chevronOpen
                    )}
                  />
                </button>
              </div>

              {/* Expanded case file */}
              {expandedEventId === r.eventId && (
                <div className={s.caseFile}>
                  {/* Canonical input */}
                  <div>
                    <div className={s.caseSection}>Canonical Input</div>
                    <div className={s.caseGrid}>
                      <span className={s.caseKey}>Slot Budget</span>
                      <span className={s.caseVal}>{r.slotBudget}</span>
                      <span className={s.caseKey}>Protected</span>
                      <span className={s.caseVal}>
                        {r.protectedItems.length > 0 ? (
                          <span className={s.pillRow}>
                            {r.protectedItems.map((item) => (
                              <Pill key={item}>{item}</Pill>
                            ))}
                          </span>
                        ) : (
                          'none'
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Policy knobs */}
                  <div>
                    <div className={s.caseSection}>Policy Knobs</div>
                    <div className={s.caseGrid}>
                      <span className={s.caseKey}>slotModel</span>
                      <span className={s.caseMono}>{r.slotModel}</span>
                      <span className={s.caseKey}>unknownItemPolicy</span>
                      <span className={s.caseMono}>{r.unknownItemPolicy}</span>
                      <span className={s.caseKey}>countPolicy</span>
                      <span className={s.caseMono}>{r.countPolicy}</span>
                    </div>
                  </div>

                  {/* Slot accounting */}
                  <div>
                    <div className={s.caseSection}>Slot Accounting</div>
                    <div className={s.caseGrid}>
                      <span className={s.caseKey}>Before</span>
                      <span className={s.caseVal}>{r.slotsBefore}</span>
                      <span className={s.caseKey}>After</span>
                      <span className={s.caseVal}>{r.slotsAfter}</span>
                      <span className={s.caseKey}>Budget</span>
                      <span className={s.caseVal}>{r.slotBudget}</span>
                    </div>
                  </div>

                  {/* Action summary */}
                  <div>
                    <div className={s.caseSection}>
                      Actions ({r.actionsCount})
                    </div>
                    <div className={s.caseGrid}>
                      <span className={s.caseKey}>Kept</span>
                      <span className={s.caseVal}>{r.keptCount}</span>
                      <span className={s.caseKey}>Dropped</span>
                      <span className={s.caseVal}>{r.droppedCount}</span>
                      <span className={s.caseKey}>Stored</span>
                      <span className={s.caseVal}>{r.storedCount}</span>
                    </div>
                  </div>

                  {/* Unknown items */}
                  {r.unknownItems.length > 0 && (
                    <div>
                      <div className={s.caseSection}>Unknown Items</div>
                      <div className={s.pillRow}>
                        {r.unknownItems.map((item) => (
                          <Pill key={item} variant="warning">
                            {item}
                          </Pill>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Lint issues */}
                  {r.rulesetLintIssueCodes.length > 0 && (
                    <div>
                      <div className={s.caseSection}>Lint Issues</div>
                      <div className={s.pillRow}>
                        {r.rulesetLintIssueCodes.map((code) => (
                          <Pill key={code} variant="warning">
                            {code}
                          </Pill>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Digests */}
                  <div>
                    <div className={s.caseSection}>Digests</div>
                    <div className={s.caseGrid}>
                      <span className={s.caseKey}>decisionId</span>
                      <span className={s.caseMono}>{r.decisionId}</span>
                      <span className={s.caseKey}>inputDigest</span>
                      <span className={s.caseMono}>
                        {r.valuationInputDigest}
                      </span>
                      <span className={s.caseKey}>decisionDigest</span>
                      <span className={s.caseMono}>{r.decisionDigest}</span>
                      <span className={s.caseKey}>inventoryHash</span>
                      <span className={s.caseMono}>{r.inventoryStateHash}</span>
                      <span className={s.caseKey}>rulesetDigest</span>
                      <span className={s.caseMono}>{r.rulesetDigest}</span>
                    </div>
                  </div>

                  {/* Fast verification detail */}
                  {r.fastVerification && (
                    <div>
                      <div className={s.caseSection}>
                        Fast Verification{' '}
                        {r.fastVerification.valid ? '(Passed)' : '(Failed)'}
                      </div>
                      {r.fastVerification.failedChecks.length > 0 && (
                        <div className={s.checkList}>
                          {r.fastVerification.failedChecks.map((check) => (
                            <div key={check} className={s.checkRow}>
                              <XCircle
                                style={{
                                  width: 10,
                                  height: 10,
                                  color: 'rgb(248 113 113)',
                                }}
                              />
                              <span className={s.checkName}>{check}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </CollapsibleSection>

      {/* Section C: Failure Modes (default collapsed) */}
      {failureModes.size > 0 && (
        <CollapsibleSection
          title={`Failure Modes (${failureModes.size})`}
          icon={<AlertTriangle className={s.icon4} />}
        >
          <div className={s.failureCards}>
            {Array.from(failureModes.entries()).map(([code, info]) => (
              <div key={code} className={s.failureCard}>
                <div className={s.failureCode}>{code}</div>
                <div className={s.failureDetail}>
                  Count: {info.count} | Last: {formatTime(info.lastTs)}
                  {info.items.length > 0 && (
                    <>
                      <br />
                      {code === 'UNKNOWN_ITEM_VALUATION' &&
                        `Items: ${info.items.join(', ')}`}
                      {code === 'UNSUPPORTED_POLICY' &&
                        `Knobs: ${info.items.join(', ')}`}
                      {code === 'DIGEST_MISMATCH' &&
                        `Failed checks: ${info.items.join(', ')}`}
                      {code === 'INSUFFICIENT_CAPACITY_PROTECTED' &&
                        `Protected items exceed budget`}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
}
