import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
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

// Lazy load Three.js canvas component for code splitting
const EmbeddingVizCanvas = lazy(() =>
  import('./embedding-viz-canvas').then((mod) => ({ default: mod.EmbeddingVizCanvas }))
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
  const [limit, setLimit] = useState(500);

  const fetchEmbeddings = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelected(null);

    try {
      const res = await fetch(`/api/embeddings/viz?limit=${limit}`);
      const data = await res.json();

      if (data.error) {
        throw new Error(data.error);
      }

      if (data.message && (!data.points || data.points.length === 0)) {
        setError(data.message);
        setPoints([]);
      } else {
        setPoints(data.points || []);
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
  }, [limit]);

  const handleCanvasClick = useCallback(() => {
    setSelected(null);
  }, []);

  // Autoload embeddings on mount
  useEffect(() => {
    fetchEmbeddings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount, not when limit changes

  return (
    <div className={s.root}>
      <div className={s.header}>
        <div className={s.title}>
          <ScatterChart className={s.icon} />
          <h4>Embedding Space</h4>
          <span className={s.count}>{points.length} points</span>
        </div>
        <div className={s.controls}>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className={s.select}
            disabled={loading}
          >
            <option value={100}>100</option>
            <option value={500}>500</option>
            <option value={1000}>1000</option>
            <option value={2000}>2000</option>
          </select>
          <Button onClick={fetchEmbeddings} disabled={loading} size="sm">
            <RefreshCw className={cn(s.refreshIcon, loading && s.spinning)} />
            {loading ? 'Loading...' : 'Load'}
          </Button>
        </div>
      </div>

      <div className={s.canvasContainer}>
        {error && points.length === 0 ? (
          <div className={s.error}>{error}</div>
        ) : points.length === 0 ? (
          <div className={s.empty}>
            <Eye className={s.emptyIcon} />
            <p>Click &quot;Load&quot; to visualize embedding space</p>
            <p style={{ fontSize: '0.625rem', opacity: 0.7 }}>
              Requires UMAP service running on port 5003
            </p>
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
