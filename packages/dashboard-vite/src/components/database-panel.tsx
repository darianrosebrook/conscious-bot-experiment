import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import {
  Database,
  HardDrive,
  Network,
  Activity,
  AlertTriangle,
  BookOpen,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Search,
  Trash2,
  ScatterChart,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Pill } from '@/components/pill';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import s from './database-panel.module.scss';

// Lazy load for Three.js component (code splitting)
const EmbeddingVizPanel = lazy(() =>
  import('@/components/embedding-viz-panel').then((mod) => ({
    default: mod.EmbeddingVizPanel,
  }))
);

import type {
  DatabaseOverview,
  MemoryChunkSummary,
  KnowledgeGraphSummary,
  EmbeddingHealth,
  ReflectionSummary,
  LessonSummary,
  NarrativeSummary,
} from '@/types';

// ============================================================================
// Collapsible Section Wrapper
// ============================================================================

function CollapsibleSection({
  title,
  icon,
  defaultOpen = true,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={s.collapsible}>
      <button onClick={() => setOpen(!open)} className={s.collapsibleBtn}>
        <div className={s.collapsibleTitle}>
          {icon}
          <h3 className={s.collapsibleTitleText}>{title}</h3>
        </div>
        {open ? (
          <ChevronDown className={s.chevronIcon} />
        ) : (
          <ChevronRight className={s.chevronIcon} />
        )}
      </button>
      {open && <div className={s.collapsibleBody}>{children}</div>}
    </div>
  );
}

// ============================================================================
// Database Panel Component
// ============================================================================

export function DatabasePanel() {
  const [overview, setOverview] = useState<DatabaseOverview | null>(null);
  const [memories, setMemories] = useState<MemoryChunkSummary[]>([]);
  const [memoriesPage, setMemoriesPage] = useState(1);
  const [memoriesTotal, setMemoriesTotal] = useState(0);
  const [memoriesType, setMemoriesType] = useState('');
  const [memoriesSortBy, setMemoriesSortBy] = useState('created');
  const [expandedMemory, setExpandedMemory] = useState<string | null>(null);

  const [knowledgeGraph, setKnowledgeGraph] =
    useState<KnowledgeGraphSummary | null>(null);
  const [embeddingHealth, setEmbeddingHealth] =
    useState<EmbeddingHealth | null>(null);

  // Reflections & narrative state
  const [reflections, setReflections] = useState<ReflectionSummary[]>([]);
  const [lessons, setLessons] = useState<LessonSummary[]>([]);
  const [narrative, setNarrative] = useState<NarrativeSummary | null>(null);
  const [reflectionsPage, setReflectionsPage] = useState(1);
  const [reflectionsTotal, setReflectionsTotal] = useState(0);

  // Lazy full-content state for memory expansion
  const [fullContentCache, setFullContentCache] = useState<
    Record<string, string>
  >({});
  const [fullContentLoading, setFullContentLoading] = useState<string | null>(
    null
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Danger zone state
  const [resetConfirm, setResetConfirm] = useState('');
  const [dropConfirm, setDropConfirm] = useState('');
  const [dangerLoading, setDangerLoading] = useState(false);
  const [dangerResult, setDangerResult] = useState<string | null>(null);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showDropDialog, setShowDropDialog] = useState(false);

  // Fetch overview data
  const fetchOverview = useCallback(async () => {
    try {
      const res = await fetch('/api/database', {
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const data = await res.json();
        setOverview(data);
      }
    } catch (err) {
      console.error('Failed to fetch database overview:', err);
    }
  }, []);

  // Fetch memories
  const fetchMemories = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        page: memoriesPage.toString(),
        limit: '20',
        sortBy: memoriesSortBy,
      });
      if (memoriesType) params.set('type', memoriesType);

      const res = await fetch(`/api/database/memories?${params.toString()}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const data = await res.json();
        setMemories(data.memories ?? []);
        setMemoriesTotal(data.total ?? 0);
      }
    } catch (err) {
      console.error('Failed to fetch memories:', err);
    }
  }, [memoriesPage, memoriesType, memoriesSortBy]);

  // Fetch reflections
  const fetchReflections = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        page: reflectionsPage.toString(),
        limit: '20',
        includePlaceholders: 'true',
      });
      const res = await fetch(
        `/api/database/reflections?${params.toString()}`,
        {
          signal: AbortSignal.timeout(10000),
        }
      );
      if (res.ok) {
        const data = await res.json();
        setReflections(data.reflections ?? []);
        setLessons(data.lessons ?? []);
        setNarrative(data.narrative ?? null);
        setReflectionsTotal(data.total ?? 0);
      }
    } catch (err) {
      console.error('Failed to fetch reflections:', err);
    }
  }, [reflectionsPage]);

  // Fetch full content for a memory by ID
  const fetchFullContent = useCallback(
    async (id: string) => {
      if (fullContentCache[id]) return; // Already cached
      setFullContentLoading(id);
      try {
        const res = await fetch(`/api/database/memories/${id}`, {
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.content) {
            setFullContentCache((prev) => ({ ...prev, [id]: data.content }));
          }
        }
      } catch (err) {
        console.error('Failed to fetch full content:', err);
      } finally {
        setFullContentLoading(null);
      }
    },
    [fullContentCache]
  );

  // Fetch health data
  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/database/health', {
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const data = await res.json();
        setEmbeddingHealth(data.embeddingHealth ?? null);
        setKnowledgeGraph(data.knowledgeGraph ?? null);
      }
    } catch (err) {
      console.error('Failed to fetch health data:', err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        await Promise.all([
          fetchOverview(),
          fetchMemories(),
          fetchHealth(),
          fetchReflections(),
        ]);
      } catch (err) {
        setError('Failed to load database information');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [fetchOverview, fetchMemories, fetchHealth, fetchReflections]);

  // Refetch memories when filters change
  useEffect(() => {
    fetchMemories();
  }, [fetchMemories]);

  // Refetch reflections when page changes
  useEffect(() => {
    fetchReflections();
  }, [fetchReflections]);

  // Danger zone actions
  const handleDangerAction = async (
    action: 'reset' | 'drop',
    confirm: string
  ) => {
    setDangerLoading(true);
    setDangerResult(null);
    try {
      const res = await fetch('/api/database/danger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, confirm }),
      });
      const data = await res.json();
      if (res.ok) {
        setDangerResult(data.message || 'Operation completed successfully.');
        setResetConfirm('');
        setDropConfirm('');
        setShowResetDialog(false);
        setShowDropDialog(false);
        // Refresh data
        await fetchOverview();
        await fetchMemories();
        await fetchHealth();
      } else {
        setDangerResult(`Error: ${data.message || 'Operation failed.'}`);
      }
    } catch (err) {
      setDangerResult('Error: Failed to execute operation.');
    } finally {
      setDangerLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={s.loadingCenter}>
        <div className={s.loadingRow}>
          <RefreshCw className={s.spinIcon} />
          <span>Loading database information...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={Database}
        title="Database Unavailable"
        description={error}
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setError(null);
              setLoading(true);
              Promise.all([
                fetchOverview(),
                fetchMemories(),
                fetchHealth(),
                fetchReflections(),
              ]).finally(() => setLoading(false));
            }}
          >
            <RefreshCw className={s.spinIcon} />
            Retry
          </Button>
        }
      />
    );
  }

  const seedStr = overview?.worldSeed?.toString() ?? '';
  const dbName = overview?.databaseName ?? '';

  const distColors = [
    s.distSky,
    s.distEmerald,
    s.distAmber,
    s.distPurple,
    s.distRose,
  ];

  return (
    <ScrollArea className="h-full">
      <div className={s.scrollContent}>
        {/* 4A: Overview Panel */}
        <CollapsibleSection
          title="Overview"
          icon={<Database className="size-4" />}
        >
          {overview ? (
            <div className={s.overviewSpacer}>
              <div className={s.overviewGrid}>
                <div className={s.statCard}>
                  <div className={s.statLabel}>Database</div>
                  <div className={s.statValue}>{overview.databaseName}</div>
                </div>
                <div className={s.statCard}>
                  <div className={s.statLabel}>World Seed</div>
                  <div className={s.statValue}>{overview.worldSeed}</div>
                </div>
                <div className={s.statCard}>
                  <div className={s.statLabel}>Total Chunks</div>
                  <div className={s.statValue}>
                    {overview.totalChunks.toLocaleString()}
                  </div>
                </div>
                <div className={s.statCard}>
                  <div className={s.statLabel}>Entities / Relationships</div>
                  <div className={s.statValue}>
                    {overview.entityCount} / {overview.relationshipCount}
                  </div>
                </div>
              </div>

              {/* Memory type distribution */}
              {Object.keys(overview.memoryTypeDistribution).length > 0 && (
                <div>
                  <div className={s.sectionLabel}>Memory Type Distribution</div>
                  <div className={s.distBar}>
                    {(() => {
                      const entries = Object.entries(
                        overview.memoryTypeDistribution
                      );
                      const total = entries.reduce(
                        (sum, [, count]) => sum + count,
                        0
                      );
                      return entries.map(([type, count], i) => (
                        <div
                          key={type}
                          className={distColors[i % distColors.length]}
                          style={{
                            width: `${total > 0 ? (count / total) * 100 : 0}%`,
                          }}
                          title={`${type}: ${count}`}
                        />
                      ));
                    })()}
                  </div>
                  <div className={s.pillWrap}>
                    {Object.entries(overview.memoryTypeDistribution).map(
                      ([type, count]) => (
                        <Pill key={type}>
                          {type}: {count}
                        </Pill>
                      )
                    )}
                  </div>
                </div>
              )}

              {/* Index info */}
              {overview.indexInfo.length > 0 && (
                <div>
                  <div className={s.sectionLabel}>Indexes</div>
                  <div className={s.indexSpacer}>
                    {overview.indexInfo.map((idx, i) => (
                      <div key={i} className={s.indexRow}>
                        <span className={s.indexName}>{idx.name}</span>
                        <span className={s.indexMeta}>
                          {idx.type} &middot; {idx.size}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <EmptyState
              icon={Database}
              title="No overview data"
              description="Database overview will appear when the memory service is connected."
            />
          )}
        </CollapsibleSection>

        {/* 4B: Memory Explorer */}
        <CollapsibleSection
          title="Memory Explorer"
          icon={<Search className="size-4" />}
          defaultOpen={false}
        >
          <div className={s.overviewSpacer}>
            {/* Filters */}
            <div className={s.filterRow}>
              <select
                value={memoriesType}
                onChange={(e) => {
                  setMemoriesType(e.target.value);
                  setMemoriesPage(1);
                }}
                className={s.filterSelect}
              >
                <option value="">All Types</option>
                <option value="episodic">Episodic</option>
                <option value="semantic">Semantic</option>
                <option value="procedural">Procedural</option>
                <option value="emotional">Emotional</option>
                <option value="social">Social</option>
              </select>
              <select
                value={memoriesSortBy}
                onChange={(e) => {
                  setMemoriesSortBy(e.target.value);
                  setMemoriesPage(1);
                }}
                className={s.filterSelect}
              >
                <option value="created">Sort: Created</option>
                <option value="accessed">Sort: Last Accessed</option>
                <option value="importance">Sort: Importance</option>
              </select>
              <Button
                variant="outline"
                size="sm"
                className={s.refreshBtn}
                onClick={() => fetchMemories()}
              >
                <RefreshCw className={s.refreshIcon} />
                Refresh
              </Button>
            </div>

            {/* Memory table */}
            {memories.length > 0 ? (
              <div className={s.memorySpacer}>
                {memories.map((mem) => (
                  <div key={mem.id} className={s.memoryCard}>
                    <button
                      onClick={() => {
                        const newExpanded =
                          expandedMemory === mem.id ? null : mem.id;
                        setExpandedMemory(newExpanded);
                        // Lazy fetch full content on expand
                        if (newExpanded && !fullContentCache[mem.id]) {
                          fetchFullContent(mem.id);
                        }
                      }}
                      className={s.memoryBtn}
                    >
                      {expandedMemory === mem.id ? (
                        <ChevronDown className={s.memChevron} />
                      ) : (
                        <ChevronRight className={s.memChevron} />
                      )}
                      <span className={s.memId}>{mem.id.slice(0, 8)}</span>
                      <span className={s.memContent}>{mem.content}</span>
                      <Pill>{mem.memoryType}</Pill>
                      <span className={s.memImportance}>
                        imp: {mem.importance.toFixed(2)}
                      </span>
                    </button>
                    {expandedMemory === mem.id && (
                      <div className={s.memExpanded}>
                        {fullContentLoading === mem.id ? (
                          <p className={s.memFullContentLoading}>
                            Loading full content...
                          </p>
                        ) : (
                          <p className={s.memExpandedText}>
                            {fullContentCache[mem.id] || mem.content}
                          </p>
                        )}
                        <div className={s.memExpandedMeta}>
                          <span>Access Count: {mem.accessCount}</span>
                          <span>Entities: {mem.entityCount}</span>
                          <span>Relationships: {mem.relationshipCount}</span>
                          {mem.createdAt > 0 && (
                            <span>
                              Created:{' '}
                              {new Date(mem.createdAt).toLocaleString()}
                            </span>
                          )}
                          {mem.lastAccessed > 0 && (
                            <span>
                              Last Accessed:{' '}
                              {new Date(mem.lastAccessed).toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* Pagination */}
                <div className={s.paginationRow}>
                  <span className={s.paginationLabel}>
                    Showing {memories.length} of {memoriesTotal} memories
                  </span>
                  <div className={s.paginationBtns}>
                    <Button
                      variant="outline"
                      size="sm"
                      className={s.paginationBtn}
                      disabled={memoriesPage <= 1}
                      onClick={() => setMemoriesPage((p) => Math.max(1, p - 1))}
                    >
                      Prev
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className={s.paginationBtn}
                      disabled={memoriesPage * 20 >= memoriesTotal}
                      onClick={() => setMemoriesPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState
                icon={Search}
                title="No memories found"
                description="Memory chunks will appear here when the memory system has stored data."
              />
            )}
          </div>
        </CollapsibleSection>

        {/* 4C: Knowledge Graph Stats */}
        <CollapsibleSection
          title="Knowledge Graph"
          icon={<Network className="size-4" />}
          defaultOpen={false}
        >
          {knowledgeGraph ? (
            <div className={s.overviewSpacer}>
              <div className={s.kgGrid}>
                <div className={s.statCard}>
                  <div className={s.statLabel}>Total Entities</div>
                  <div className={s.statValue}>
                    {knowledgeGraph.totalEntities}
                  </div>
                </div>
                <div className={s.statCard}>
                  <div className={s.statLabel}>Total Relationships</div>
                  <div className={s.statValue}>
                    {knowledgeGraph.totalRelationships}
                  </div>
                </div>
              </div>

              {/* Top entities */}
              {knowledgeGraph.topEntities.length > 0 && (
                <div>
                  <div className={s.sectionLabel}>Top Entities</div>
                  <div className={s.indexSpacer}>
                    {knowledgeGraph.topEntities.map((entity, i) => (
                      <div key={i} className={s.kgEntityRow}>
                        <div className={s.kgEntityName}>
                          <span>{entity.name}</span>
                          <Pill>{entity.type}</Pill>
                        </div>
                        <span className={s.kgEntityConn}>
                          {entity.connectionCount} connections
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Entity type distribution */}
              {Object.keys(knowledgeGraph.entityTypeDistribution).length >
                0 && (
                <div>
                  <div className={s.sectionLabel}>Entity Types</div>
                  <div className={s.pillWrap}>
                    {Object.entries(knowledgeGraph.entityTypeDistribution).map(
                      ([type, count]) => (
                        <Pill key={type}>
                          {type}: {count}
                        </Pill>
                      )
                    )}
                  </div>
                </div>
              )}

              {/* Relationship type distribution */}
              {Object.keys(knowledgeGraph.relationshipTypeDistribution).length >
                0 && (
                <div>
                  <div className={s.sectionLabel}>Relationship Types</div>
                  <div className={s.pillWrap}>
                    {Object.entries(
                      knowledgeGraph.relationshipTypeDistribution
                    ).map(([type, count]) => (
                      <Pill key={type}>
                        {type}: {count}
                      </Pill>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <EmptyState
              icon={Network}
              title="No knowledge graph data"
              description="Knowledge graph statistics will appear when the memory system has entity data."
            />
          )}
        </CollapsibleSection>

        {/* 4D: Reflections & Narrative */}
        <CollapsibleSection
          title="Reflections & Narrative"
          icon={<BookOpen className="size-4" />}
          defaultOpen={false}
        >
          <div className={s.overviewSpacer}>
            {/* Latest narrative checkpoint */}
            {narrative && (
              <div>
                <div className={s.sectionLabel}>Latest Narrative</div>
                <div className={s.narrativeCard}>
                  <div className={s.narrativeTitle}>{narrative.title}</div>
                  <div className={s.narrativeSummary}>{narrative.summary}</div>
                  <div className={s.narrativeMeta}>
                    <span>Arc: {narrative.narrativeArc}</span>
                    <span>Tone: {narrative.emotionalTone}</span>
                    <span>
                      Significance: {(narrative.significance * 100).toFixed(0)}%
                    </span>
                    {narrative.timestamp > 0 && (
                      <span>
                        {new Date(narrative.timestamp).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Lessons learned */}
            {lessons.length > 0 && (
              <div>
                <div className={s.sectionLabel}>
                  Lessons Learned ({lessons.length})
                </div>
                <div className={s.memorySpacer}>
                  {lessons.slice(0, 10).map((lesson) => (
                    <div key={lesson.id} className={s.lessonCard}>
                      <span className={s.lessonContent}>{lesson.content}</span>
                      <Pill>{lesson.category}</Pill>
                      <span className={s.lessonEffectiveness}>
                        eff: {(lesson.effectiveness * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reflections list */}
            {reflections.length > 0 ? (
              <div>
                <div className={s.sectionLabel}>Reflections</div>
                <div className={s.memorySpacer}>
                  {reflections.map((ref) => (
                    <div
                      key={ref.id}
                      className={cn(
                        s.reflectionCard,
                        ref.isPlaceholder && s.reflectionCardPlaceholder
                      )}
                    >
                      <div className={s.reflectionHeader}>
                        <span className={s.reflectionType}>{ref.type}</span>
                        <Pill>{ref.memorySubtype || 'reflection'}</Pill>
                        {ref.isPlaceholder && (
                          <span className={s.placeholderBadge}>
                            Placeholder
                          </span>
                        )}
                        {ref.timestamp > 0 && (
                          <span className={s.reflectionTime}>
                            {new Date(ref.timestamp).toLocaleString()}
                          </span>
                        )}
                      </div>
                      <div className={s.reflectionContent}>{ref.content}</div>
                      <div className={s.reflectionMeta}>
                        {ref.emotionalValence !== 0 && (
                          <span>
                            Valence: {ref.emotionalValence.toFixed(2)}
                          </span>
                        )}
                        <span>
                          Confidence: {(ref.confidence * 100).toFixed(0)}%
                        </span>
                        {ref.insights.length > 0 && (
                          <span>Insights: {ref.insights.length}</span>
                        )}
                        {ref.lessons.length > 0 && (
                          <span>Lessons: {ref.lessons.length}</span>
                        )}
                        {ref.tags.length > 0 && (
                          <span>Tags: {ref.tags.join(', ')}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                <div className={s.paginationRow}>
                  <span className={s.paginationLabel}>
                    Showing {reflections.length} of {reflectionsTotal}{' '}
                    reflections (page {reflectionsPage})
                  </span>
                  <div className={s.paginationBtns}>
                    <Button
                      variant="outline"
                      size="sm"
                      className={s.paginationBtn}
                      disabled={reflectionsPage <= 1}
                      onClick={() =>
                        setReflectionsPage((p) => Math.max(1, p - 1))
                      }
                    >
                      Prev
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className={s.paginationBtn}
                      disabled={reflectionsPage * 20 >= reflectionsTotal}
                      onClick={() => setReflectionsPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState
                icon={BookOpen}
                title="No reflections yet"
                description="Reflections will appear here when the bot sleeps, dies, or triggers memory consolidation."
              />
            )}
          </div>
        </CollapsibleSection>

        {/* 4E: Embedding Health */}
        <CollapsibleSection
          title="Embedding Health"
          icon={<Activity className="size-4" />}
          defaultOpen={false}
        >
          {embeddingHealth ? (
            <div className={s.overviewSpacer}>
              <div className={s.overviewGrid}>
                <div className={s.statCard}>
                  <div className={s.statLabel}>Dimension</div>
                  <div className={s.statValue}>{embeddingHealth.dimension}</div>
                </div>
                <div className={s.statCard}>
                  <div className={s.statLabel}>Total Embeddings</div>
                  <div className={s.statValue}>
                    {embeddingHealth.totalEmbeddings.toLocaleString()}
                  </div>
                </div>
                <div className={s.statCard}>
                  <div className={s.statLabel}>Index Type</div>
                  <div className={s.statValue}>{embeddingHealth.indexType}</div>
                </div>
                <div className={s.statCard}>
                  <div className={s.statLabel}>Index Size</div>
                  <div className={s.statValue}>{embeddingHealth.indexSize}</div>
                </div>
              </div>

              {/* Norm statistics */}
              <div>
                <div className={s.sectionLabel}>Norm Statistics</div>
                <div className={s.normGrid}>
                  {(['min', 'max', 'avg', 'stddev'] as const).map((stat) => (
                    <div key={stat} className={s.normCard}>
                      <div className={s.normLabel}>{stat}</div>
                      <div className={s.normValue}>
                        {embeddingHealth.normStats[stat].toFixed(4)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Similarity distribution */}
              {embeddingHealth.sampleSimilarityDistribution.length > 0 && (
                <div>
                  <div className={s.sectionLabel}>Similarity Distribution</div>
                  <div className={s.indexSpacer}>
                    {embeddingHealth.sampleSimilarityDistribution.map(
                      (bucket) => (
                        <div key={bucket.bucket} className={s.simRow}>
                          <span className={s.simBucket}>{bucket.bucket}</span>
                          <div className={s.simBar}>
                            <div
                              className={s.simBarFill}
                              style={{
                                width: `${Math.min(100, bucket.count * 5)}%`,
                              }}
                            />
                          </div>
                          <span className={s.simCount}>{bucket.count}</span>
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <EmptyState
              icon={Activity}
              title="No embedding data"
              description="Embedding health metrics will appear when the vector database is active."
            />
          )}
        </CollapsibleSection>

        {/* 4F: Embedding Space Visualization */}
        <CollapsibleSection
          title="Embedding Space Visualization"
          icon={<ScatterChart className="size-4" />}
          defaultOpen={false}
        >
          <Suspense fallback={<div className={s.loadingFallback}>Loading 3D visualization...</div>}>
            <EmbeddingVizPanel />
          </Suspense>
        </CollapsibleSection>

        {/* 4G: Danger Zone */}
        <CollapsibleSection
          title="Danger Zone"
          icon={<AlertTriangle className="size-4" />}
          defaultOpen={false}
        >
          <div className={s.dangerOuter}>
            {dangerResult && (
              <div
                className={cn(
                  s.dangerResult,
                  dangerResult.startsWith('Error')
                    ? s.dangerResultError
                    : s.dangerResultOk
                )}
              >
                {dangerResult}
              </div>
            )}

            {/* Reset Database */}
            <div>
              <h4 className={s.dangerTitle}>Reset Database</h4>
              <p className={s.dangerDesc}>
                Truncates all memory tables for the current seed database. This
                removes all stored memories, entities, and relationships but
                keeps the database structure intact.
              </p>
              <div className={s.dangerInputRow}>
                <input
                  value={resetConfirm}
                  onChange={(e) => setResetConfirm(e.target.value)}
                  placeholder={`Type "${seedStr}" to confirm`}
                  className={s.dangerInput}
                />
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={resetConfirm !== seedStr || dangerLoading}
                  onClick={() => setShowResetDialog(true)}
                >
                  <Trash2 className={s.dangerBtnIcon} />
                  Reset
                </Button>
              </div>
              {showResetDialog && resetConfirm === seedStr && (
                <div className={s.dangerConfirmBox}>
                  <p className={s.dangerConfirmText}>
                    Are you sure? This will remove all memory data for seed{' '}
                    {seedStr}. This action cannot be undone.
                  </p>
                  <div className={s.dangerConfirmBtns}>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={dangerLoading}
                      onClick={() => handleDangerAction('reset', resetConfirm)}
                    >
                      {dangerLoading ? 'Resetting...' : 'Yes, Reset'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowResetDialog(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <hr className={s.dangerSep} />

            {/* Drop Database */}
            <div>
              <h4 className={s.dangerTitle}>Drop Database</h4>
              <p className={s.dangerDesc}>
                Drops the entire per-seed database. This is the most destructive
                operation and removes all data including the database itself.
              </p>
              <div className={s.dangerInputRow}>
                <input
                  value={dropConfirm}
                  onChange={(e) => setDropConfirm(e.target.value)}
                  placeholder={`Type "${dbName}" to confirm`}
                  className={s.dangerInput}
                />
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={dropConfirm !== dbName || dangerLoading}
                  onClick={() => setShowDropDialog(true)}
                >
                  <HardDrive className={s.dangerBtnIcon} />
                  Drop
                </Button>
              </div>
              {showDropDialog && dropConfirm === dbName && (
                <div className={s.dangerConfirmBox}>
                  <p className={s.dangerConfirmText}>
                    Are you sure? This will permanently drop the database &quot;
                    {dbName}&quot;. This action cannot be undone.
                  </p>
                  <div className={s.dangerConfirmBtns}>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={dangerLoading}
                      onClick={() => handleDangerAction('drop', dropConfirm)}
                    >
                      {dangerLoading ? 'Dropping...' : 'Yes, Drop'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowDropDialog(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CollapsibleSection>
      </div>
    </ScrollArea>
  );
}
