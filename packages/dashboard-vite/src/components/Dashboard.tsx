/**
 * Dashboard Component
 * Main dashboard for the Conscious Minecraft Bot
 * Migrated from Next.js to Vite
 *
 * @author @darianrosebrook
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Activity,
  Brain,
  ChevronDown,
  ChevronUp,
  FileText,
  History,
  ListChecks,
  Map,
  MessageSquare,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Search,
  Tag,
  UploadCloud,
} from 'lucide-react';

import { useDashboardStore } from '@/stores/dashboard-store';
import type { Task } from '@/types';
import { cn, debugLog, formatTime } from '@/lib/utils';
import { useCognitiveStream } from '@/hooks/use-cognitive-stream';
import { useWsBotState } from '@/hooks/use-ws-bot-state';
import { useInitialDataFetch } from '@/hooks/use-initial-data-fetch';
import { useTaskStream } from '@/hooks/use-task-stream';
import { usePeriodicRefresh } from '@/hooks/use-periodic-refresh';
import { parseGoalTags, goalToLabel } from '@/lib/text-utils';
import { ViewerHudOverlay } from '@/components/viewer-hud-overlay';
import { StressHexHeatmap } from '@/components/stress-hex-heatmap';
import { Section } from '@/components/section';
import { Pill } from '@/components/pill';
import { EmptyState } from '@/components/empty-state';
import { InventoryDisplay } from '@/components/inventory-display';
import { EvaluationTab } from '@/components/evaluation-tab';
import { DatabasePanel } from '@/components/database-panel';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDashboardContext } from '@/contexts/dashboard-context';
import styles from '@/styles/dashboard.module.scss';
import tc from '@/styles/thought-colors.module.scss';

// ─── Thought color map ───────────────────────────────────────────────────────

type ThoughtColorKey =
  | 'intrusive'
  | 'chatIn'
  | 'chatOut'
  | 'social'
  | 'internal'
  | 'systemEvent'
  | 'thoughtProcessing'
  | 'taskCreation'
  | 'status'
  | 'systemMetric'
  | 'systemLog'
  | 'environmental'
  | 'default';

const THOUGHT_COLORS: Record<
  ThoughtColorKey,
  { border: string; bg: string; text: string }
> = {
  intrusive: {
    border: tc.intrusiveBorder,
    bg: tc.intrusiveBg,
    text: tc.intrusiveText,
  },
  chatIn: { border: tc.chatInBorder, bg: tc.chatInBg, text: tc.chatInText },
  chatOut: { border: tc.chatOutBorder, bg: tc.chatOutBg, text: tc.chatOutText },
  social: { border: tc.socialBorder, bg: tc.socialBg, text: tc.socialText },
  internal: {
    border: tc.internalBorder,
    bg: tc.internalBg,
    text: tc.internalText,
  },
  systemEvent: {
    border: tc.systemEventBorder,
    bg: tc.systemEventBg,
    text: tc.systemEventText,
  },
  thoughtProcessing: {
    border: tc.thoughtProcessingBorder,
    bg: tc.thoughtProcessingBg,
    text: tc.thoughtProcessingText,
  },
  taskCreation: {
    border: tc.taskCreationBorder,
    bg: tc.taskCreationBg,
    text: tc.taskCreationText,
  },
  status: { border: tc.statusBorder, bg: tc.statusBg, text: tc.statusText },
  systemMetric: {
    border: tc.systemMetricBorder,
    bg: tc.systemMetricBg,
    text: tc.systemMetricText,
  },
  systemLog: {
    border: tc.systemLogBorder,
    bg: tc.systemLogBg,
    text: tc.systemLogText,
  },
  environmental: {
    border: tc.environmentalBorder,
    bg: tc.environmentalBg,
    text: tc.environmentalText,
  },
  default: { border: tc.defaultBorder, bg: tc.defaultBg, text: tc.defaultText },
};

// ─── Status / environmental helpers ──────────────────────────────────────────

const STATUS_TYPES = [
  'system_status',
  'system_metric',
  'system_log',
  'environmental',
  'status',
  'idle-reflection',
];

function isStatusOrEnvironmental(t: {
  type?: string;
  thoughtType?: string;
  text?: string;
}) {
  const thoughtType = (t.thoughtType || '').toLowerCase();
  const rawType = (t.type || '').toLowerCase();
  if (STATUS_TYPES.includes(thoughtType) || STATUS_TYPES.includes(rawType))
    return true;
  const text = (t.text || '').trim().toLowerCase();
  return (
    text.startsWith('health:') ||
    text.startsWith('system status:') ||
    text.startsWith('awareness:') ||
    text === 'maintaining awareness of surroundings.' ||
    /observing\s+environment\s+and\s+deciding/.test(text)
  );
}

// ─── Main dashboard component ────────────────────────────────────────────────

export default function Dashboard() {
  const {
    isLive,
    hud,
    thoughts,
    tasks,
    tasksFallback,
    events,
    memories,
    notes,
    environment,
    inventory,
    plannerData,
    setIsLive,
  } = useDashboardStore();

  const { config } = useDashboardContext();

  // ── Local UI state ──────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('live');
  const [intrusion, setIntrusion] = useState('');
  const [viewerKey, setViewerKey] = useState(0);
  const [expandedThoughtIds, setExpandedThoughtIds] = useState<Set<string>>(
    () => new Set()
  );
  const [viewerStatus, setViewerStatus] = useState<{
    canStart: boolean;
    viewerActive?: boolean;
    reason?: string;
    details?: any;
  } | null>(null);
  const thoughtsEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // ── Viewer status check ─────────────────────────────────────────────────
  const checkViewerStatus = useCallback(async () => {
    try {
      const response = await fetch(config.routes.viewerStatus());
      const result = await response.json();
      setViewerStatus(result);
    } catch (error) {
      debugLog('Error checking viewer status:', error);
      setViewerStatus({
        canStart: false,
        reason: 'Failed to check viewer status',
      });
    }
  }, [config.routes]);

  // ── Domain hooks ────────────────────────────────────────────────────────
  const {
    botState,
    setBotState,
    botConnections,
    setBotConnections,
    dwellCounts,
    botStateWebSocket,
  } = useWsBotState();

  const { sendIntrusiveThought } = useCognitiveStream();

  useInitialDataFetch({
    setBotState,
    setBotConnections,
    checkViewerStatus,
  });

  useTaskStream();

  usePeriodicRefresh({
    setBotState,
    setBotConnections,
    checkViewerStatus,
  });

  // ── Polling fallback when WebSocket fails ───────────────────────────────
  useEffect(() => {
    let pollInterval: ReturnType<typeof setInterval>;

    if (!botStateWebSocket.isConnected && botStateWebSocket.error) {
      debugLog('Starting polling fallback for bot state');

      const pollBotState = async () => {
        try {
          const response = await fetch('/api/ws/bot-state', {
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(10000),
          });
          if (response.ok) {
            const data = await response.json();
            if (data.data) {
              const botStateData = data.data;
              if (
                botStateData.vitals ||
                botStateData.intero ||
                botStateData.mood
              ) {
                useDashboardStore.getState().setHud({
                  ts: new Date().toISOString(),
                  vitals: botStateData.vitals || {
                    health: 20,
                    hunger: 20,
                    stamina: 100,
                    sleep: 100,
                  },
                  intero: botStateData.intero || {
                    stress: 20,
                    focus: 80,
                    curiosity: 75,
                  },
                  mood: botStateData.mood || 'neutral',
                });
              }

              if (botStateData.inventory) {
                useDashboardStore
                  .getState()
                  .setInventory(botStateData.inventory);
              }

              setBotState({
                position: botStateData.position
                  ? {
                      x: botStateData.position[0],
                      y: botStateData.position[1],
                      z: botStateData.position[2],
                    }
                  : undefined,
                health: botStateData.vitals?.health,
                food: botStateData.vitals?.hunger,
                inventory: botStateData.inventory || [],
                time: undefined,
                weather: undefined,
              });

              setBotConnections([
                {
                  name: 'minecraft-bot',
                  connected: botStateData.connected,
                  viewerActive: false,
                  viewerUrl: 'http://localhost:3006',
                },
              ]);
            }
          }
        } catch (error) {
          debugLog('Polling fallback error:', error);
        }
      };

      pollBotState();
      pollInterval = setInterval(pollBotState, 10000);
    }

    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [
    botStateWebSocket.isConnected,
    botStateWebSocket.error,
    setBotState,
    setBotConnections,
  ]);

  // ── Auto-scroll thoughts ────────────────────────────────────────────────
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (scrollAreaRef.current) {
        const scrollElement = scrollAreaRef.current.querySelector(
          '[data-radix-scroll-area-viewport]'
        );
        if (scrollElement) {
          scrollElement.scrollTop = scrollElement.scrollHeight;
        }
      } else {
        thoughtsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }, 100);
    return () => clearTimeout(timeoutId);
  }, [thoughts]);

  // ── Periodic viewer status check ────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(checkViewerStatus, 60000);
    checkViewerStatus();
    return () => clearInterval(interval);
  }, [checkViewerStatus]);

  // ── Submit intrusive thought ────────────────────────────────────────────
  const handleSubmitIntrusion = async () => {
    const text = intrusion.trim();
    if (!text) return;

    try {
      const success = await sendIntrusiveThought(text, {
        tags: ['external', 'intrusion'],
        strength: 0.8,
      });

      if (success) {
        setIntrusion('');
        debugLog('Intrusive thought submitted successfully');
      } else {
        console.error('Failed to submit intrusive thought');
      }
    } catch (error) {
      console.error('Error submitting intrusive thought:', error);
    }
  };

  // ── Thought rendering ──────────────────────────────────────────────────

  const sortByTime = (a: (typeof thoughts)[0], b: (typeof thoughts)[0]) =>
    (a.ts || '').localeCompare(b.ts || '');

  const cognitiveThoughts = thoughts
    .filter((t) => !isStatusOrEnvironmental(t))
    .sort(sortByTime);

  const statusEnvironmentalThoughts = thoughts
    .filter(isStatusOrEnvironmental)
    .sort(sortByTime);

  const renderThoughtCard = (thought: (typeof thoughts)[0]) => {
    const isIntrusive =
      thought.provenance === 'intrusion' || thought.thoughtType === 'intrusive';
    const isExternalChat = thought.thoughtType === 'external_chat_in';
    const isBotResponse = thought.thoughtType === 'external_chat_out';
    const isSocial = thought.thoughtType === 'social';
    const isInternal =
      thought.thoughtType === 'internal' ||
      thought.thoughtType === 'reflection' ||
      thought.thoughtType === 'idle-reflection' ||
      thought.thoughtType === 'observation' ||
      thought.thoughtType === 'planning';
    const isSystemEvent = thought.thoughtType === 'system_event';
    const isThoughtProcessing = thought.thoughtType === 'thought_processing';
    const isTaskCreation = thought.thoughtType === 'task_creation';
    const isSocialConsideration =
      thought.thoughtType === 'social_consideration';
    const isSystemStatus = thought.thoughtType === 'system_status';
    const isSystemMetric = thought.thoughtType === 'system_metric';
    const isSystemLog = thought.thoughtType === 'system_log';

    let prefix = '';
    let typeLabel = thought.thoughtType || thought.type;
    let colorKey: ThoughtColorKey = 'default';

    if (isIntrusive) {
      colorKey = 'intrusive';
      prefix = ' ';
      typeLabel = 'intrusive';
    } else if (isExternalChat) {
      colorKey = 'chatIn';
      prefix = ` ${thought.sender}: `;
      typeLabel = 'chat_in';
    } else if (isBotResponse) {
      colorKey = 'chatOut';
      prefix = ' ';
      typeLabel = 'chat_out';
    } else if (isSocial || isSocialConsideration) {
      colorKey = 'social';
      prefix = ' ';
      typeLabel = isSocialConsideration ? 'social_consideration' : 'social';
    } else if (isInternal) {
      colorKey = 'internal';
      prefix = ' ';
      typeLabel = 'internal';
    } else if (isSystemEvent) {
      colorKey = 'systemEvent';
      typeLabel = 'system_event';
    } else if (isThoughtProcessing) {
      colorKey = 'thoughtProcessing';
      prefix = '⚡ ';
      typeLabel = 'thought_processing';
    } else if (isTaskCreation) {
      colorKey = 'taskCreation';
      typeLabel = 'task_creation';
    } else if (isSystemStatus || thought.thoughtType === 'status') {
      colorKey = 'status';
      typeLabel = 'status';
    } else if (isSystemMetric) {
      colorKey = 'systemMetric';
      prefix = '📈 ';
      typeLabel = 'system_metric';
    } else if (isSystemLog) {
      colorKey = 'systemLog';
      prefix = '📝 ';
      typeLabel = 'system_log';
    } else if (thought.thoughtType === 'environmental') {
      colorKey = 'environmental';
      typeLabel = 'environmental';
    }

    const colors = THOUGHT_COLORS[colorKey];
    const isExpanded = expandedThoughtIds.has(thought.id);
    const toggleExpanded = () => {
      setExpandedThoughtIds((prev) => {
        const next = new Set(prev);
        if (next.has(thought.id)) next.delete(thought.id);
        else next.add(thought.id);
        return next;
      });
    };

    const rawContent = `${prefix}${thought.content ?? thought.text ?? ''}`;
    const { displayText, goals } = parseGoalTags(rawContent);

    // Only show expand/collapse when content would overflow (2-line clamp)
    // or when there are goal tags, or when already expanded (to allow collapse).
    const wouldOverflow = (displayText?.length ?? 0) > 100 || goals.length > 0;
    const showExpandTrigger = wouldOverflow || isExpanded;

    return (
      <div
        className={cn(
          styles.thoughtCard,
          !showExpandTrigger && styles.thoughtCardNoExpand,
          colors.border,
          colors.bg
        )}
      >
        <div className={styles.thoughtHeader}>
          <span className={styles.thoughtTypeLabel}>{typeLabel}</span>
          <time className={styles.tabularNums}>{formatTime(thought.ts)}</time>
        </div>
        <p
          className={cn(
            isExpanded
              ? styles.thoughtTextExpanded
              : styles.thoughtTextTruncated,
            colors.text
          )}
        >
          {displayText || '\u00A0'}
        </p>
        {goals.length > 0 && (
          <div className={styles.thoughtGoalTags}>
            <Tag className={styles.thoughtGoalTagIcon} aria-hidden />
            {goals.map((goal, i) => (
              <span
                key={`${thought.id}-goal-${i}`}
                className={styles.thoughtGoalChip}
              >
                [GOAL] {goalToLabel(goal)}
              </span>
            ))}
          </div>
        )}
        {showExpandTrigger && (
          <button
            type="button"
            onClick={toggleExpanded}
            className={styles.thoughtExpandBtn}
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? (
              <ChevronUp className={styles.thoughtExpandIcon} />
            ) : (
              <ChevronDown className={styles.thoughtExpandIcon} />
            )}
          </button>
        )}
      </div>
    );
  };

  // ── Requirement progress helper ─────────────────────────────────────────
  const renderRequirementProgress = (task: Task) => {
    const req = task.requirement as any;
    if (!req) return null;
    let reqProgress = 0;
    if (req.kind === 'collect' || req.kind === 'mine') {
      const total = Math.max(1, req.quantity || 0);
      reqProgress = Math.max(0, Math.min(1, (req.have || 0) / total));
    } else if (req.kind === 'craft') {
      const q = Math.max(1, req.quantity || 1);
      if ((req.have || 0) >= q) reqProgress = 1;
      else if (typeof req.proxyHave === 'number') {
        reqProgress = Math.max(0, Math.min(1, req.proxyHave / 3));
      } else reqProgress = 0;
    }
    const pct = Math.round(reqProgress * 100);
    return (
      <div className={styles.requirementProgressWrapper}>
        <div className={styles.requirementProgressHeader}>
          <span className={styles.requirementProgressLabel}>
            Requirement Progress
          </span>
          <span className={styles.requirementProgressValue}>{pct}%</span>
        </div>
        <div className={styles.requirementProgressTrack}>
          <div
            className={styles.requirementProgressFill}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  };

  // ═════════════════════════════════════════════════════════════════════════
  // JSX
  // ═════════════════════════════════════════════════════════════════════════

  return (
    <div className={styles.root}>
      {/* Top Navigation */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerLogo}>
            <Brain className={styles.icon4} />
          </div>
          <div className={styles.headerTitle}>Cognitive Stream</div>
          <nav className={styles.headerNav}>
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className={styles.tabsAuto}
            >
              <TabsList className={styles.tabsBg}>
                <TabsTrigger value="live">Live</TabsTrigger>
                <TabsTrigger value="evaluation">Evaluation</TabsTrigger>
                <TabsTrigger value="database">Database</TabsTrigger>
              </TabsList>
            </Tabs>
          </nav>
        </div>
        <div className={styles.headerRight}>
          <Button variant="outline" size="sm" className={styles.headerBtn}>
            <Search className={styles.iconMr} />
            Search
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={styles.headerBtn}
            onClick={() => setIsLive(!isLive)}
          >
            {isLive ? (
              <PauseCircle className={styles.iconMr} />
            ) : (
              <PlayCircle className={styles.iconMr} />
            )}
            {isLive ? 'Pause' : 'Go Live'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={styles.headerBtn}
            onClick={() => {
              botStateWebSocket.reconnect();
              setViewerKey((prev) => prev + 1);
            }}
          >
            <RefreshCw className={styles.iconMr} />
            Refresh
          </Button>
          <div className={styles.statusGroup}>
            <div
              className={cn(
                styles.statusDot,
                botStateWebSocket.isConnected
                  ? styles.statusDotGreen
                  : botStateWebSocket.error
                    ? styles.statusDotRed
                    : styles.statusDotYellow
              )}
            />
            <span className={styles.statusLabel}>Bot State</span>
            {botStateWebSocket.error && (
              <button
                onClick={() => botStateWebSocket.reconnect()}
                className={styles.reconnectBtn}
              >
                Reconnect
              </button>
            )}
          </div>
        </div>
      </header>
      <div className={styles.headerTabsMobile}>
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className={styles.tabsAuto}
        >
          <TabsList className={styles.tabsBg}>
            <TabsTrigger value="live">Live</TabsTrigger>
            <TabsTrigger value="evaluation">Evaluation</TabsTrigger>
            <TabsTrigger value="database">Database</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Main Content with Tabs */}
      <div className={styles.mainContent}>
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className={styles.tabsFull}
        >
          <TabsContent value="live" className={styles.tabContentFull}>
            <div className={styles.liveGrid}>
              {/* Left: Stress heatmap, Tasks, Planner, Reflective Notes, Environment, Events, Memories */}
              <aside className={styles.leftSidebar}>
                {hud?.intero && (
                  <Section
                    title="Stress / Interoception"
                    icon={<Brain className={styles.icon4} />}
                  >
                    <div className={styles.stressContent}>
                      <StressHexHeatmap
                        intero={hud.intero}
                        dwellCounts={dwellCounts}
                        className={styles.shrink0}
                      />
                      <div className={styles.moodText}>
                        Mood:{' '}
                        <span className={styles.moodValue}>{hud.mood}</span>
                      </div>
                    </div>
                  </Section>
                )}
                <Section
                  title="Tasks"
                  icon={<ListChecks className={styles.icon4} />}
                >
                  {tasks.length > 0 ? (
                    <div className={styles.taskList}>
                      {tasks.map((task) => (
                        <div key={task.id} className={styles.taskCard}>
                          <div className={styles.taskHeader}>
                            <div className={styles.taskTitle}>{task.title}</div>
                            <Pill>{task.source}</Pill>
                          </div>
                          <div className={styles.taskProgressTrack}>
                            <div
                              className={styles.taskProgressFill}
                              style={{
                                width: `${Math.round(task.progress * 100)}%`,
                              }}
                            />
                          </div>
                          {task.requirement && (
                            <div className={styles.taskRequirement}>
                              <div className={styles.requirementHeader}>
                                <span className={styles.requirementLabel}>
                                  Requirement
                                </span>
                                {task.requirement?.kind === 'craft' &&
                                task.requirement?.outputPattern ? (
                                  <span>
                                    Output: {task.requirement.outputPattern}
                                    {task.requirement.have >=
                                    (task.requirement.quantity || 1)
                                      ? ' • Crafted'
                                      : task.requirement.proxyHave !== undefined
                                        ? ` • Materials ~${task.requirement.proxyHave}`
                                        : ''}
                                  </span>
                                ) : (
                                  <span>
                                    Have {task.requirement?.have ?? 0}/
                                    {task.requirement?.quantity ?? 0}
                                    {typeof task.requirement?.needed ===
                                    'number'
                                      ? ` • Need ${task.requirement.needed}`
                                      : ''}
                                  </span>
                                )}
                              </div>
                              {Array.isArray(task.requirement?.patterns) &&
                              task.requirement?.patterns?.length ? (
                                <div className={styles.requirementPatterns}>
                                  Items: {task.requirement.patterns.join(', ')}
                                </div>
                              ) : null}
                              {renderRequirementProgress(task)}
                            </div>
                          )}
                          {task.steps && (
                            <ul className={styles.taskSteps}>
                              {task.steps.map((step) => (
                                <li key={step.id} className={styles.stepItem}>
                                  <input
                                    type="checkbox"
                                    checked={step.done}
                                    onChange={() => {}}
                                    className={styles.stepCheckbox}
                                  />
                                  <span
                                    className={
                                      step.done ? styles.stepDone : undefined
                                    }
                                  >
                                    {step.label}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      icon={ListChecks}
                      title="No tasks available"
                      description={
                        tasksFallback
                          ? 'Planning system temporarily unavailable.'
                          : 'Tasks will appear here when the bot is actively planning or executing goals.'
                      }
                    />
                  )}
                </Section>

                <Section
                  title="Current Status"
                  icon={<Activity className={styles.icon4} />}
                  tight
                >
                  {plannerData ? (
                    <div className={styles.plannerContent}>
                      {plannerData.currentAction && (
                        <div className={styles.plannerCard}>
                          <div className={styles.plannerCardHeader}>
                            <h4 className={styles.plannerCardTitle}>
                              Current Action
                            </h4>
                            <span className={styles.plannerCardPercent}>
                              {Math.round(
                                (plannerData.currentAction.progress || 0) * 100
                              )}
                              %
                            </span>
                          </div>
                          <p className={styles.plannerCardDesc}>
                            {plannerData.currentAction.name}
                            {plannerData.currentAction.target && (
                              <span className={styles.plannerCardTarget}>
                                {' '}
                                → {plannerData.currentAction.target}
                              </span>
                            )}
                          </p>
                        </div>
                      )}

                      {plannerData.planQueue.length > 0 && (
                        <div className={styles.plannerCard}>
                          <h4 className={styles.plannerCardTitle}>
                            Upcoming Plans
                          </h4>
                          <div className={styles.plannerUpcomingContent}>
                            {plannerData.planQueue.slice(0, 2).map((plan) => (
                              <div
                                key={plan.id}
                                className={styles.plannerUpcomingItem}
                              >
                                • {plan.name}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <EmptyState
                      icon={Activity}
                      title="No status data"
                      description="Status information will appear here when the bot is active."
                    />
                  )}
                </Section>

                <Section
                  title="Reflective Notes"
                  icon={<FileText className={styles.icon4} />}
                  tight
                >
                  {notes.length > 0 ? (
                    <div className={styles.notesList}>
                      {notes.slice(0, 5).map((note) => (
                        <div key={note.id} className={styles.noteCard}>
                          <div className={styles.noteHeader}>
                            <Pill>{note.type}</Pill>
                            <time className={styles.tabularNums}>
                              {formatTime(note.ts)}
                            </time>
                          </div>
                          {note.title && (
                            <div className={styles.noteTitle}>{note.title}</div>
                          )}
                          <p className={styles.noteContent}>{note.content}</p>
                          <div className={styles.noteFooter}>
                            <Pill>{note.source}</Pill>
                            <span className={styles.noteConfidence}>
                              {Math.round(note.confidence * 100)}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      icon={FileText}
                      title="No reflective notes"
                      description="Reflective insights will appear here as the bot processes experiences."
                    />
                  )}
                </Section>

                <Section
                  title="Environment"
                  icon={<Map className={styles.icon4} />}
                >
                  {environment ? (
                    <div className={styles.envGrid}>
                      <div className={styles.envCell}>
                        <span className={styles.envLabel}>Biome</span>
                        <div>{environment.biome}</div>
                      </div>
                      <div className={styles.envCell}>
                        <span className={styles.envLabel}>Weather</span>
                        <div>{environment.weather}</div>
                      </div>
                      <div className={styles.envCell}>
                        <span className={styles.envLabel}>Time</span>
                        <div>{environment.timeOfDay}</div>
                      </div>
                      <div className={styles.envCell}>
                        <span className={styles.envLabel}>Nearby</span>
                        <div>{environment.nearbyEntities.join(', ')}</div>
                      </div>
                    </div>
                  ) : (
                    <EmptyState
                      icon={Map}
                      title="No environment data"
                      description="Environment information will appear here when the bot is connected to the world."
                    />
                  )}
                </Section>

                <Section
                  title="Events"
                  icon={<History className={styles.icon4} />}
                >
                  {events.length > 0 ? (
                    <div className={styles.eventMemoryList}>
                      {events
                        .slice(-8)
                        .reverse()
                        .map((event) => (
                          <div key={event.id} className={styles.eventCard}>
                            <div className={styles.eventHeader}>
                              <Pill>{event.kind}</Pill>
                              <time className={styles.tabularNums}>
                                {formatTime(event.ts)}
                              </time>
                            </div>
                            <p className={styles.eventContent}>
                              {(event.payload?.content as string) ||
                                (event.payload?.title as string) ||
                                event.kind}
                            </p>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <EmptyState
                      icon={History}
                      title="No events recorded"
                      description="Events will appear here as the bot interacts with the world."
                    />
                  )}
                </Section>

                <Section
                  title="Memories"
                  icon={<Brain className={styles.icon4} />}
                >
                  {memories.length > 0 ? (
                    <div className={styles.eventMemoryList}>
                      {memories
                        .slice(-6)
                        .reverse()
                        .map((memory) => (
                          <div key={memory.id} className={styles.eventCard}>
                            <div className={styles.eventHeader}>
                              <Pill>{memory.type}</Pill>
                              <time className={styles.tabularNums}>
                                {formatTime(memory.ts)}
                              </time>
                            </div>
                            <p className={styles.eventContent}>{memory.text}</p>
                            {memory.score != null && (
                              <div className={styles.memorySalience}>
                                Salience: {Math.round(memory.score * 100)}%
                              </div>
                            )}
                          </div>
                        ))}
                    </div>
                  ) : (
                    <EmptyState
                      icon={Brain}
                      title="No memories available"
                      description="Memories will appear here as the bot forms and recalls experiences."
                    />
                  )}
                </Section>
              </aside>

              {/* Center: Live Stream + Inventory */}
              <main className={styles.centerColumn}>
                <Section
                  title="Live Stream"
                  icon={<Activity className={styles.icon4} />}
                  actions={
                    botConnections.find((c) => c.name === 'minecraft-bot')
                      ?.viewerActive ? (
                      <div className={styles.streamHeaderButtons}>
                        <button
                          onClick={async () => {
                            setViewerKey((prev) => prev + 1);
                            await checkViewerStatus();
                          }}
                          className={styles.viewerBtn}
                        >
                          Refresh Viewer
                        </button>
                        <button
                          onClick={() => {
                            window.open(
                              botConnections.find(
                                (c) => c.name === 'minecraft-bot'
                              )?.viewerUrl || 'http://localhost:3006',
                              '_blank'
                            );
                          }}
                          className={styles.viewerBtn}
                        >
                          Full Screen
                        </button>
                        <button
                          onClick={async () => {
                            try {
                              const response = await fetch(
                                config.routes.stopViewer(),
                                { method: 'POST' }
                              );
                              const result = await response.json();
                              if (result.success) {
                                setBotConnections((prev) =>
                                  prev.map((conn) =>
                                    conn.name === 'minecraft-bot'
                                      ? { ...conn, viewerActive: false }
                                      : conn
                                  )
                                );
                                await checkViewerStatus();
                              }
                            } catch (error) {
                              console.error('Error stopping viewer:', error);
                            }
                          }}
                          className={styles.viewerBtnStop}
                        >
                          Stop Viewer
                        </button>
                      </div>
                    ) : null
                  }
                >
                  <div className={styles.streamWrapper}>
                    {botConnections.find((c) => c.name === 'minecraft-bot')
                      ?.viewerActive ? (
                      <>
                        <iframe
                          key={viewerKey}
                          src={
                            botConnections.find(
                              (c) => c.name === 'minecraft-bot'
                            )?.viewerUrl || 'http://localhost:3006'
                          }
                          className={styles.streamIframe}
                          title="Minecraft Bot View"
                          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        />
                        <ViewerHudOverlay
                          health={hud?.vitals?.health ?? botState?.health ?? 20}
                          hunger={hud?.vitals?.hunger ?? botState?.food ?? 20}
                          armor={0}
                          breath={20}
                          experience={0}
                          hotbarItems={inventory.filter(
                            (item) => item.slot >= 0 && item.slot <= 8
                          )}
                          selectedSlot={botState?.selectedSlot ?? 0}
                        />
                      </>
                    ) : (
                      <>
                        <div className={styles.streamPlaceholder}>
                          <div className={styles.streamPlaceholderContent}>
                            <div className={styles.streamPlaceholderIcon}>
                              <Activity
                                className={cn(styles.icon6, styles.statusLabel)}
                              />
                            </div>
                            <h3 className={styles.streamPlaceholderTitle}>
                              Bot Status
                            </h3>
                            <p className={styles.streamPlaceholderDesc}>
                              {botConnections.find(
                                (c) => c.name === 'minecraft-bot'
                              )?.connected
                                ? 'Bot connected, starting viewer...'
                                : 'Waiting for Minecraft bot to connect...'}
                            </p>
                            {botConnections.find(
                              (c) => c.name === 'minecraft-bot'
                            )?.connected && (
                              <button
                                onClick={async () => {
                                  try {
                                    await checkViewerStatus();
                                    if (!viewerStatus?.canStart) {
                                      console.error(
                                        'Cannot start viewer:',
                                        viewerStatus?.reason
                                      );
                                      return;
                                    }
                                    const response = await fetch(
                                      config.routes.startViewer(),
                                      { method: 'POST' }
                                    );
                                    const result = await response.json();
                                    if (result.success) {
                                      setBotConnections((prev) =>
                                        prev.map((conn) =>
                                          conn.name === 'minecraft-bot'
                                            ? { ...conn, viewerActive: true }
                                            : conn
                                        )
                                      );
                                      await checkViewerStatus();
                                      setViewerKey((prev) => prev + 1);
                                    } else {
                                      console.error(
                                        'Failed to start viewer:',
                                        result.message
                                      );
                                      if (result.details) {
                                        console.error(
                                          'Details:',
                                          result.details
                                        );
                                      }
                                    }
                                  } catch (error) {
                                    console.error(
                                      'Error starting viewer:',
                                      error
                                    );
                                  }
                                }}
                                className={cn(
                                  styles.startViewerBtn,
                                  viewerStatus?.canStart
                                    ? styles.startViewerReady
                                    : styles.startViewerDisabled
                                )}
                                disabled={!viewerStatus?.canStart}
                                title={
                                  viewerStatus?.reason ||
                                  'Start Minecraft viewer'
                                }
                              >
                                {viewerStatus?.canStart
                                  ? 'Start Viewer'
                                  : 'Viewer Not Ready'}
                              </button>
                            )}
                            <div className={styles.botStatusInfo}>
                              {botState ? (
                                <>
                                  <div>
                                    Position: X: {botState.position?.x || 0}, Y:{' '}
                                    {botState.position?.y || 0}, Z:{' '}
                                    {botState.position?.z || 0}
                                  </div>
                                  <div>
                                    Health: {botState.health || 0}/20 | Food:{' '}
                                    {botState.food || 0}/20
                                  </div>
                                  <div>
                                    Time: Day{' '}
                                    {Math.floor((botState.time || 0) / 24000) +
                                      1}
                                    ,{' '}
                                    {Math.floor(
                                      ((botState.time || 0) % 24000) / 1000
                                    )}
                                    :
                                    {(
                                      Math.floor((botState.time || 0) % 1000) /
                                      16.67
                                    )
                                      .toString()
                                      .padStart(2, '0')}
                                  </div>
                                  <div>
                                    Weather: {botState.weather || 'Unknown'}
                                  </div>
                                  {botState.inventory &&
                                    botState.inventory.length > 0 && (
                                      <div>
                                        Inventory: {botState.inventory.length}{' '}
                                        items
                                      </div>
                                    )}
                                </>
                              ) : (
                                <>
                                  <div>Position: X: 0, Y: 0, Z: 0</div>
                                  <div>Health: 0/20 | Food: 0/20</div>
                                  <div>Time: Day 1, 0:00</div>
                                  <div>Weather: Unknown</div>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <ViewerHudOverlay
                          health={hud?.vitals?.health ?? botState?.health ?? 20}
                          hunger={hud?.vitals?.hunger ?? botState?.food ?? 20}
                          armor={0}
                          breath={20}
                          experience={0}
                          hotbarItems={inventory.filter(
                            (item) => item.slot >= 0 && item.slot <= 8
                          )}
                          selectedSlot={botState?.selectedSlot ?? 0}
                        />
                      </>
                    )}
                    <div className={styles.streamStatusBadge}>
                      <div
                        className={cn(
                          styles.statusDot,
                          botConnections.find((c) => c.name === 'minecraft-bot')
                            ?.viewerActive
                            ? styles.statusDotPulse
                            : botConnections.find(
                                  (c) => c.name === 'minecraft-bot'
                                )?.connected
                              ? styles.statusDotYellow
                              : styles.statusDotRed
                        )}
                      />
                      {botConnections.find((c) => c.name === 'minecraft-bot')
                        ?.viewerActive
                        ? 'VIEWER LIVE'
                        : botConnections.find((c) => c.name === 'minecraft-bot')
                              ?.connected
                          ? 'BOT CONNECTED'
                          : 'DISCONNECTED'}
                      <div className={styles.cogDot} />
                      <span className={styles.cogLabel}>COG</span>
                    </div>
                  </div>
                </Section>

                <InventoryDisplay
                  inventory={inventory}
                  selectedSlot={botState?.selectedSlot || 0}
                />
              </main>

              {/* Right: Cognitive Stream + Thought Input */}
              <aside className={styles.rightSidebar}>
                <Section
                  title="Cognitive Stream"
                  icon={<MessageSquare className={styles.icon4} />}
                  actions={<Pill>consciousness flow</Pill>}
                  className={styles.cognitiveSection}
                  fullHeight
                >
                  <div
                    className={styles.cognitiveContainer}
                    data-testid="cognitive-stream-container"
                  >
                    <Tabs
                      defaultValue="cognitive"
                      className={styles.cognitiveContainer}
                    >
                      <TabsList className={styles.innerTabsList}>
                        <TabsTrigger
                          value="cognitive"
                          className={styles.innerTabTrigger}
                        >
                          Cognitive Stream
                        </TabsTrigger>
                        <TabsTrigger
                          value="status"
                          className={styles.innerTabTrigger}
                        >
                          Status / Environmental
                        </TabsTrigger>
                      </TabsList>
                      <TabsContent
                        value="cognitive"
                        className={styles.innerTabContent}
                      >
                        {cognitiveThoughts.length > 0 ? (
                          <ScrollArea
                            className={styles.scrollFull}
                            ref={scrollAreaRef}
                          >
                            <div className={styles.thoughtsList}>
                              {cognitiveThoughts.map((thought) => (
                                <React.Fragment key={thought.id}>
                                  {renderThoughtCard(thought)}
                                </React.Fragment>
                              ))}
                              <div ref={thoughtsEndRef} />
                            </div>
                          </ScrollArea>
                        ) : (
                          <EmptyState
                            icon={MessageSquare}
                            title="No thoughts yet"
                            description="Cognitive thoughts will appear here as the bot processes and reflects."
                          />
                        )}
                      </TabsContent>
                      <TabsContent
                        value="status"
                        className={styles.innerTabContent}
                      >
                        {statusEnvironmentalThoughts.length > 0 ? (
                          <ScrollArea className={styles.scrollFull}>
                            <div className={styles.thoughtsList}>
                              {statusEnvironmentalThoughts.map((thought) => (
                                <React.Fragment key={thought.id}>
                                  {renderThoughtCard(thought)}
                                </React.Fragment>
                              ))}
                            </div>
                          </ScrollArea>
                        ) : (
                          <EmptyState
                            icon={Activity}
                            title="No status updates yet"
                            description="Health, hunger, and environmental updates will appear here."
                          />
                        )}
                      </TabsContent>
                    </Tabs>
                  </div>
                </Section>

                {/* Intrusive Thought Input */}
                <div className={styles.intrusiveInputWrapper}>
                  <div className={styles.intrusiveInputRow}>
                    <input
                      value={intrusion}
                      onChange={(e) => setIntrusion(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSubmitIntrusion();
                      }}
                      placeholder="Enter an intrusive thought… (appears as bot's own idea)"
                      className={styles.intrusiveInput}
                    />
                    <Button
                      onClick={handleSubmitIntrusion}
                      className={styles.injectBtn}
                    >
                      <UploadCloud className={styles.iconMr} />
                      Inject
                    </Button>
                  </div>
                  <div className={styles.intrusiveHint}>
                    Try: "craft a wooden pickaxe", "mine some
                    stone", "explore the area", "build a
                    house"
                  </div>
                </div>
              </aside>
            </div>
          </TabsContent>

          {/* Evaluation Tab Content */}
          <TabsContent value="evaluation" className={styles.tabContentFull}>
            <EvaluationTab />
          </TabsContent>

          {/* Database Tab Content */}
          <TabsContent value="database" className={styles.tabContentFull}>
            <DatabasePanel />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
