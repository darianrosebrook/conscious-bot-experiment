import {
  useState,
  useEffect,
  useCallback,
  useRef,
  lazy,
  Suspense,
} from 'react';
import { ScatterChart, RefreshCw, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import s from './embedding-viz-panel.module.scss';
import type { EmbeddingPoint3D } from '@/types';

// Color mapping by memory type (duplicated here for tooltip/legend - avoids importing Three.js file)
// Brighter colors for better visibility against dark background
const TYPE_COLORS: Record<string, string> = {
  episodic: '#60a5fa', // blue
  semantic: '#4ade80', // brighter green
  procedural: '#f472b6', // pink
  emotional: '#fbbf24', // amber
  social: '#c4b5fd', // brighter purple
  thought: '#67e8f9', // cyan (more distinctive)
  unknown: '#9ca3af', // lighter gray
};

// Progressive loading stages
const PROGRESSIVE_STAGES = [
  { limit: 100, delay: 0 }, // Immediate
  { limit: 250, delay: 2000 }, // After 2s
  { limit: 500, delay: 5000 }, // After 5s
  { limit: 1000, delay: 10000 }, // After 10s
];

// Lazy load Three.js canvas component for code splitting
const EmbeddingVizCanvas = lazy(() =>
  import('./embedding-viz-canvas').then((mod) => ({
    default: mod.EmbeddingVizCanvas,
  }))
);

// Loading fallback component
function LoadingFallback() {
  return (
    <div className={s.empty}>
      <Eye className={s.emptyIcon} />
      <p>Loading 3D renderer...</p>
    </div>
  );
}

export function EmbeddingVizPanel() {
  const [points, setPoints] = useState<EmbeddingPoint3D[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<EmbeddingPoint3D | null>(null);
  const [limit, setLimit] = useState(100);
  const [currentStage, setCurrentStage] = useState(0);
  const [autoLoading, setAutoLoading] = useState(true);

  // Cache for fetched points to avoid refetching on tab switches
  const pointsCacheRef = useRef<Map<number, EmbeddingPoint3D[]>>(new Map());
  const progressiveTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const autoLoadingRef = useRef(true); // Ref to track autoLoading in closures

  const fetchEmbeddings = useCallback(
    async (fetchLimit: number, isProgressive = false) => {
      // Check cache first
      const cached = pointsCacheRef.current.get(fetchLimit);
      if (cached && cached.length > 0) {
        setPoints(cached);
        setLimit(fetchLimit);
        if (!isProgressive) {
          setAutoLoading(false);
        }
        return;
      }

      if (!isProgressive) {
        setLoading(true);
      }
      setError(null);
      setSelected(null);

      try {
        const res = await fetch(`/api/embeddings/viz?limit=${fetchLimit}`);
        const data = await res.json();

        if (data.error) {
          throw new Error(data.error);
        }

        if (data.message && (!data.points || data.points.length === 0)) {
          setError(data.message);
          setPoints([]);
        } else {
          const newPoints = data.points || [];
          // Cache the result
          pointsCacheRef.current.set(fetchLimit, newPoints);
          setPoints(newPoints);
          setLimit(fetchLimit);
        }
      } catch (err) {
        console.error('Failed to fetch embeddings:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to load embeddings'
        );
        setPoints([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const handleCanvasClick = useCallback(() => {
    setSelected(null);
  }, []);

  // Clear progressive timers
  const clearProgressiveTimers = useCallback(() => {
    progressiveTimersRef.current.forEach(clearTimeout);
    progressiveTimersRef.current = [];
  }, []);

  // Manual refresh - resets to manual mode and fetches with current limit
  const handleManualRefresh = useCallback(() => {
    setAutoLoading(false);
    autoLoadingRef.current = false;
    clearProgressiveTimers();
    // Clear cache for this limit to force refetch
    pointsCacheRef.current.delete(limit);
    fetchEmbeddings(limit, false);
  }, [limit, fetchEmbeddings, clearProgressiveTimers]);

  // Handle manual limit change
  const handleLimitChange = useCallback(
    (newLimit: number) => {
      setAutoLoading(false);
      autoLoadingRef.current = false;
      clearProgressiveTimers();
      setLimit(newLimit);
      fetchEmbeddings(newLimit, false);
    },
    [fetchEmbeddings, clearProgressiveTimers]
  );

  // Progressive loading on mount
  useEffect(() => {
    // Initial fast load
    fetchEmbeddings(PROGRESSIVE_STAGES[0].limit, false);
    setCurrentStage(0);

    // Set up progressive enhancement timers
    PROGRESSIVE_STAGES.slice(1).forEach((stage, index) => {
      const timer = setTimeout(() => {
        // Only continue if still in auto mode (use ref to avoid stale closure)
        if (autoLoadingRef.current) {
          setCurrentStage(index + 1);
          fetchEmbeddings(stage.limit, true);
        }
      }, stage.delay);
      progressiveTimersRef.current.push(timer);
    });

    // Cleanup on unmount
    return () => {
      clearProgressiveTimers();
    };
    // eslint-disable-next-line -- deps intentionally empty (run on mount only)
  }, []); // Only run on mount

  return (
    <div className={s.root}>
      <div className={s.header}>
        <div className={s.title}>
          <ScatterChart className={s.icon} />
          <h4>Embedding Space</h4>
          <span className={s.count}>
            {points.length} points
            {autoLoading && currentStage < PROGRESSIVE_STAGES.length - 1 && (
              <span className={s.autoLoadHint}> (auto-loading...)</span>
            )}
          </span>
        </div>
        <div className={s.controls}>
          <select
            value={limit}
            onChange={(e) => handleLimitChange(Number(e.target.value))}
            className={s.select}
            disabled={loading}
          >
            <option value={100}>100</option>
            <option value={250}>250</option>
            <option value={500}>500</option>
            <option value={1000}>1000</option>
            <option value={2000}>2000</option>
          </select>
          <Button onClick={handleManualRefresh} disabled={loading} size="sm">
            <RefreshCw className={cn(s.refreshIcon, loading && s.spinning)} />
            {loading ? 'Loading...' : 'Refresh'}
          </Button>
        </div>
      </div>

      <div className={s.canvasContainer}>
        {error && points.length === 0 ? (
          <div className={s.error}>{error}</div>
        ) : points.length === 0 && !loading ? (
          <div className={s.empty}>
            <Eye className={s.emptyIcon} />
            <p>No embeddings available</p>
            <p style={{ fontSize: '0.625rem', opacity: 0.7 }}>
              Requires MLX sidecar with UMAP support (port 5002)
            </p>
          </div>
        ) : points.length === 0 && loading ? (
          <div className={s.loadingOverlay}>
            <div className={s.loadingSpinner} />
            <span>Loading embeddings...</span>
          </div>
        ) : (
          <>
            <Suspense fallback={<LoadingFallback />}>
              <EmbeddingVizCanvas
                points={points}
                selectedId={selected?.id || null}
                onSelect={setSelected}
                onCanvasClick={handleCanvasClick}
              />
            </Suspense>

            {loading && (
              <div className={s.loadingOverlay}>
                <div className={s.loadingSpinner} />
                <span>Processing UMAP reduction...</span>
              </div>
            )}
          </>
        )}

        {selected && (
          <div className={s.tooltip}>
            <div
              className={s.tooltipType}
              style={{
                color:
                  TYPE_COLORS[selected.metadata.type] || TYPE_COLORS.unknown,
              }}
            >
              {selected.metadata.type}
            </div>
            <div className={s.tooltipContent}>{selected.metadata.content}</div>
            <div className={s.tooltipMeta}>
              Importance: {(selected.metadata.importance * 100).toFixed(0)}%
              {selected.metadata.createdAt && (
                <>
                  {' '}
                  • {new Date(selected.metadata.createdAt).toLocaleDateString()}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <div className={s.legend}>
        {Object.entries(TYPE_COLORS).map(([type, color]) => (
          <div key={type} className={s.legendItem}>
            <span className={s.legendDot} style={{ backgroundColor: color }} />
            {type}
          </div>
        ))}
      </div>
    </div>
  );
}
