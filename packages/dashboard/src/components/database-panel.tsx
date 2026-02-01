'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Database,
  HardDrive,
  Network,
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';

import { Pill } from '@/components/pill';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

import type {
  DatabaseOverview,
  MemoryChunkSummary,
  KnowledgeGraphSummary,
  EmbeddingHealth,
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
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-3 py-2 border-b border-zinc-800/80 hover:bg-zinc-900/40 transition-colors"
      >
        <div className="flex items-center gap-2 text-zinc-200">
          {icon}
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
        {open ? (
          <ChevronDown className="size-4 text-zinc-400" />
        ) : (
          <ChevronRight className="size-4 text-zinc-400" />
        )}
      </button>
      {open && <div className="px-3 py-3">{children}</div>}
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
        await Promise.all([fetchOverview(), fetchMemories(), fetchHealth()]);
      } catch (err) {
        setError('Failed to load database information');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [fetchOverview, fetchMemories, fetchHealth]);

  // Refetch memories when filters change
  useEffect(() => {
    fetchMemories();
  }, [fetchMemories]);

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
      <div className="flex items-center justify-center p-12">
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <RefreshCw className="size-4 animate-spin" />
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
              ]).finally(() => setLoading(false));
            }}
          >
            <RefreshCw className="size-4 mr-2" />
            Retry
          </Button>
        }
      />
    );
  }

  const seedStr = overview?.worldSeed?.toString() ?? '';
  const dbName = overview?.databaseName ?? '';

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-3 p-3">
        {/* 4A: Overview Panel */}
        <CollapsibleSection
          title="Overview"
          icon={<Database className="size-4" />}
        >
          {overview ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-2.5">
                  <div className="text-[11px] text-zinc-500 uppercase tracking-wide">
                    Database
                  </div>
                  <div className="text-sm font-medium text-zinc-200 truncate">
                    {overview.databaseName}
                  </div>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-2.5">
                  <div className="text-[11px] text-zinc-500 uppercase tracking-wide">
                    World Seed
                  </div>
                  <div className="text-sm font-medium text-zinc-200">
                    {overview.worldSeed}
                  </div>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-2.5">
                  <div className="text-[11px] text-zinc-500 uppercase tracking-wide">
                    Total Chunks
                  </div>
                  <div className="text-sm font-medium text-zinc-200">
                    {overview.totalChunks.toLocaleString()}
                  </div>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-2.5">
                  <div className="text-[11px] text-zinc-500 uppercase tracking-wide">
                    Entities / Relationships
                  </div>
                  <div className="text-sm font-medium text-zinc-200">
                    {overview.entityCount} / {overview.relationshipCount}
                  </div>
                </div>
              </div>

              {/* Memory type distribution */}
              {Object.keys(overview.memoryTypeDistribution).length > 0 && (
                <div>
                  <div className="text-[11px] text-zinc-500 uppercase tracking-wide mb-1.5">
                    Memory Type Distribution
                  </div>
                  <div className="flex gap-1 h-3 rounded-full overflow-hidden bg-zinc-800">
                    {(() => {
                      const entries = Object.entries(
                        overview.memoryTypeDistribution
                      );
                      const total = entries.reduce(
                        (sum, [, count]) => sum + count,
                        0
                      );
                      const colors = [
                        'bg-sky-500',
                        'bg-emerald-500',
                        'bg-amber-500',
                        'bg-purple-500',
                        'bg-rose-500',
                      ];
                      return entries.map(([type, count], i) => (
                        <div
                          key={type}
                          className={`${colors[i % colors.length]} transition-all`}
                          style={{
                            width: `${total > 0 ? (count / total) * 100 : 0}%`,
                          }}
                          title={`${type}: ${count}`}
                        />
                      ));
                    })()}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-1.5">
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
                  <div className="text-[11px] text-zinc-500 uppercase tracking-wide mb-1.5">
                    Indexes
                  </div>
                  <div className="space-y-1">
                    {overview.indexInfo.map((idx, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-xs text-zinc-300"
                      >
                        <span>{idx.name}</span>
                        <span className="text-zinc-500">
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
              className="p-3"
            />
          )}
        </CollapsibleSection>

        {/* 4B: Memory Explorer */}
        <CollapsibleSection
          title="Memory Explorer"
          icon={<Search className="size-4" />}
          defaultOpen={false}
        >
          <div className="space-y-3">
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={memoriesType}
                onChange={(e) => {
                  setMemoriesType(e.target.value);
                  setMemoriesPage(1);
                }}
                className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 outline-none"
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
                className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 outline-none"
              >
                <option value="created">Sort: Created</option>
                <option value="accessed">Sort: Last Accessed</option>
                <option value="importance">Sort: Importance</option>
              </select>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs bg-zinc-900 border-zinc-800"
                onClick={() => fetchMemories()}
              >
                <RefreshCw className="size-3 mr-1" />
                Refresh
              </Button>
            </div>

            {/* Memory table */}
            {memories.length > 0 ? (
              <div className="space-y-1.5">
                {memories.map((mem) => (
                  <div
                    key={mem.id}
                    className="rounded-lg border border-zinc-800 bg-zinc-950 overflow-hidden"
                  >
                    <button
                      onClick={() =>
                        setExpandedMemory(
                          expandedMemory === mem.id ? null : mem.id
                        )
                      }
                      className="w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-zinc-900/40 transition-colors"
                    >
                      {expandedMemory === mem.id ? (
                        <ChevronDown className="size-3 text-zinc-500 shrink-0" />
                      ) : (
                        <ChevronRight className="size-3 text-zinc-500 shrink-0" />
                      )}
                      <span className="text-[10px] text-zinc-500 font-mono w-16 shrink-0 truncate">
                        {mem.id.slice(0, 8)}
                      </span>
                      <span className="text-xs text-zinc-300 flex-1 truncate">
                        {mem.content}
                      </span>
                      <Pill>{mem.memoryType}</Pill>
                      <span className="text-[10px] text-zinc-500 tabular-nums">
                        imp: {mem.importance.toFixed(2)}
                      </span>
                    </button>
                    {expandedMemory === mem.id && (
                      <div className="px-3 pb-2.5 pt-1 border-t border-zinc-800/50 space-y-1.5">
                        <p className="text-xs text-zinc-300 whitespace-pre-wrap">
                          {mem.content}
                        </p>
                        <div className="flex flex-wrap gap-2 text-[10px] text-zinc-500">
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
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-zinc-500">
                    Showing {memories.length} of {memoriesTotal} memories
                  </span>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] bg-zinc-900 border-zinc-800"
                      disabled={memoriesPage <= 1}
                      onClick={() => setMemoriesPage((p) => Math.max(1, p - 1))}
                    >
                      Prev
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] bg-zinc-900 border-zinc-800"
                      disabled={memories.length < 20}
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
                className="p-3"
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
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-2.5">
                  <div className="text-[11px] text-zinc-500 uppercase tracking-wide">
                    Total Entities
                  </div>
                  <div className="text-sm font-medium text-zinc-200">
                    {knowledgeGraph.totalEntities}
                  </div>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-2.5">
                  <div className="text-[11px] text-zinc-500 uppercase tracking-wide">
                    Total Relationships
                  </div>
                  <div className="text-sm font-medium text-zinc-200">
                    {knowledgeGraph.totalRelationships}
                  </div>
                </div>
              </div>

              {/* Top entities */}
              {knowledgeGraph.topEntities.length > 0 && (
                <div>
                  <div className="text-[11px] text-zinc-500 uppercase tracking-wide mb-1.5">
                    Top Entities
                  </div>
                  <div className="space-y-1">
                    {knowledgeGraph.topEntities.map((entity, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-xs rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-200">{entity.name}</span>
                          <Pill>{entity.type}</Pill>
                        </div>
                        <span className="text-zinc-500">
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
                  <div className="text-[11px] text-zinc-500 uppercase tracking-wide mb-1.5">
                    Entity Types
                  </div>
                  <div className="flex flex-wrap gap-2">
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
                  <div className="text-[11px] text-zinc-500 uppercase tracking-wide mb-1.5">
                    Relationship Types
                  </div>
                  <div className="flex flex-wrap gap-2">
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
              className="p-3"
            />
          )}
        </CollapsibleSection>

        {/* 4D: Embedding Health */}
        <CollapsibleSection
          title="Embedding Health"
          icon={<Activity className="size-4" />}
          defaultOpen={false}
        >
          {embeddingHealth ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-2.5">
                  <div className="text-[11px] text-zinc-500 uppercase tracking-wide">
                    Dimension
                  </div>
                  <div className="text-sm font-medium text-zinc-200">
                    {embeddingHealth.dimension}
                  </div>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-2.5">
                  <div className="text-[11px] text-zinc-500 uppercase tracking-wide">
                    Total Embeddings
                  </div>
                  <div className="text-sm font-medium text-zinc-200">
                    {embeddingHealth.totalEmbeddings.toLocaleString()}
                  </div>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-2.5">
                  <div className="text-[11px] text-zinc-500 uppercase tracking-wide">
                    Index Type
                  </div>
                  <div className="text-sm font-medium text-zinc-200">
                    {embeddingHealth.indexType}
                  </div>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-2.5">
                  <div className="text-[11px] text-zinc-500 uppercase tracking-wide">
                    Index Size
                  </div>
                  <div className="text-sm font-medium text-zinc-200">
                    {embeddingHealth.indexSize}
                  </div>
                </div>
              </div>

              {/* Norm statistics */}
              <div>
                <div className="text-[11px] text-zinc-500 uppercase tracking-wide mb-1.5">
                  Norm Statistics
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {(['min', 'max', 'avg', 'stddev'] as const).map((stat) => (
                    <div
                      key={stat}
                      className="rounded-lg border border-zinc-800 bg-zinc-950 p-2 text-center"
                    >
                      <div className="text-[10px] text-zinc-500 uppercase">
                        {stat}
                      </div>
                      <div className="text-xs font-medium text-zinc-200">
                        {embeddingHealth.normStats[stat].toFixed(4)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Similarity distribution */}
              {embeddingHealth.sampleSimilarityDistribution.length > 0 && (
                <div>
                  <div className="text-[11px] text-zinc-500 uppercase tracking-wide mb-1.5">
                    Similarity Distribution
                  </div>
                  <div className="space-y-1">
                    {embeddingHealth.sampleSimilarityDistribution.map(
                      (bucket) => (
                        <div
                          key={bucket.bucket}
                          className="flex items-center gap-2 text-xs"
                        >
                          <span className="w-20 text-zinc-400 text-right">
                            {bucket.bucket}
                          </span>
                          <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-sky-500 rounded-full"
                              style={{
                                width: `${Math.min(100, bucket.count * 5)}%`,
                              }}
                            />
                          </div>
                          <span className="w-8 text-zinc-500 text-right">
                            {bucket.count}
                          </span>
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
              className="p-3"
            />
          )}
        </CollapsibleSection>

        {/* 4E: Danger Zone */}
        <CollapsibleSection
          title="Danger Zone"
          icon={<AlertTriangle className="size-4 text-red-400" />}
          defaultOpen={false}
        >
          <div className="space-y-4 rounded-lg border-2 border-red-900/50 bg-red-950/10 p-3">
            {dangerResult && (
              <div
                className={`rounded-lg border px-3 py-2 text-xs ${
                  dangerResult.startsWith('Error')
                    ? 'border-red-800 bg-red-950/30 text-red-300'
                    : 'border-emerald-800 bg-emerald-950/30 text-emerald-300'
                }`}
              >
                {dangerResult}
              </div>
            )}

            {/* Reset Database */}
            <div>
              <h4 className="text-sm font-medium text-red-300 mb-1">
                Reset Database
              </h4>
              <p className="text-xs text-zinc-400 mb-2">
                Truncates all memory tables for the current seed database. This
                removes all stored memories, entities, and relationships but
                keeps the database structure intact.
              </p>
              <div className="flex items-center gap-2">
                <input
                  value={resetConfirm}
                  onChange={(e) => setResetConfirm(e.target.value)}
                  placeholder={`Type "${seedStr}" to confirm`}
                  className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-300 outline-none placeholder:text-zinc-600"
                />
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={resetConfirm !== seedStr || dangerLoading}
                  onClick={() => setShowResetDialog(true)}
                >
                  <Trash2 className="size-3 mr-1" />
                  Reset
                </Button>
              </div>
              {showResetDialog && resetConfirm === seedStr && (
                <div className="mt-2 rounded-lg border border-red-800 bg-red-950/30 p-2.5">
                  <p className="text-xs text-red-300 mb-2">
                    Are you sure? This will remove all memory data for seed{' '}
                    {seedStr}. This action cannot be undone.
                  </p>
                  <div className="flex gap-2">
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

            <hr className="border-red-900/30" />

            {/* Drop Database */}
            <div>
              <h4 className="text-sm font-medium text-red-300 mb-1">
                Drop Database
              </h4>
              <p className="text-xs text-zinc-400 mb-2">
                Drops the entire per-seed database. This is the most destructive
                operation and removes all data including the database itself.
              </p>
              <div className="flex items-center gap-2">
                <input
                  value={dropConfirm}
                  onChange={(e) => setDropConfirm(e.target.value)}
                  placeholder={`Type "${dbName}" to confirm`}
                  className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-300 outline-none placeholder:text-zinc-600"
                />
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={dropConfirm !== dbName || dangerLoading}
                  onClick={() => setShowDropDialog(true)}
                >
                  <HardDrive className="size-3 mr-1" />
                  Drop
                </Button>
              </div>
              {showDropDialog && dropConfirm === dbName && (
                <div className="mt-2 rounded-lg border border-red-800 bg-red-950/30 p-2.5">
                  <p className="text-xs text-red-300 mb-2">
                    Are you sure? This will permanently drop the database &quot;
                    {dbName}&quot;. This action cannot be undone.
                  </p>
                  <div className="flex gap-2">
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
