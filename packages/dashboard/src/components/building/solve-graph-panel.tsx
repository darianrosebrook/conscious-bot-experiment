/**
 * SolveGraphPanel — Canvas-based search tree visualization
 *
 * Renders the Sterling search graph as a BFS-layered tree:
 *   - Start node at the top
 *   - Children spread horizontally at each depth level
 *   - Nodes colored by state (gray=explored, green=start, gold=solution)
 *   - Edges: gray=explored, blue=solution path
 *   - Stats bar shows nodes explored, solution path length, duration
 *
 * During playback, highlights the node corresponding to the current
 * block's layer with a pulsing cyan indicator.
 */

import { useRef, useEffect, useCallback } from 'react';
import { useBuildingStore } from '@/stores/building-store';
import type { GraphNode, GraphEdge, SolveStatus, ActionType } from '@/stores/building-store';
import { cn } from '@/lib/utils';
import s from './solve-graph-panel.module.scss';

// ─── Layout constants ────────────────────────────────────────────────────────

const NODE_RADIUS = 5;
const LEVEL_HEIGHT = 40;
const NODE_SPACING = 16;
const PADDING_TOP = 30;
const PADDING_X = 20;

// ─── Colors ──────────────────────────────────────────────────────────────────

const COLORS = {
  edgeDefault: 'rgba(63, 63, 70, 0.5)',
  edgeSolution: 'rgba(96, 165, 250, 0.9)',
  nodeDefault: 'rgba(113, 113, 122, 0.6)',
  nodeStart: 'rgba(74, 222, 128, 0.9)',
  nodeSolution: 'rgba(250, 204, 21, 0.9)',
  nodeSolutionPath: 'rgba(96, 165, 250, 0.9)',
  nodePlaybackCurrent: 'rgba(34, 211, 238, 0.9)', // cyan-400
  nodePrerequisite: 'rgba(251, 146, 60, 0.8)',     // orange-400 (prereq node outline)
  bg: '#09090b',
};

// Action-type → edge color mapping for prerequisite chains
const EDGE_COLORS: Record<ActionType, string> = {
  build:  'rgba(96, 165, 250, 0.9)',   // blue-400
  craft:  'rgba(251, 146, 60, 0.9)',   // orange-400
  mine:   'rgba(248, 113, 113, 0.9)',  // red-400
  smelt:  'rgba(192, 132, 252, 0.9)',  // purple-400
  place:  'rgba(74, 222, 128, 0.9)',   // green-400
};

// Legend entries for color-coded edges (only shown when prerequisites exist)
const EDGE_LEGEND: Array<{ type: ActionType; label: string; color: string }> = [
  { type: 'build', label: 'Build', color: EDGE_COLORS.build },
  { type: 'craft', label: 'Craft', color: EDGE_COLORS.craft },
  { type: 'mine',  label: 'Mine',  color: EDGE_COLORS.mine },
  { type: 'smelt', label: 'Smelt', color: EDGE_COLORS.smelt },
];

// ─── BFS tree layout ─────────────────────────────────────────────────────────

interface LayoutNode {
  id: string;
  x: number;
  y: number;
  isStart: boolean;
  isSolution: boolean;
  isSolutionPath: boolean;
  isPlaybackCurrent: boolean;
  isPrerequisite: boolean;
}

interface LayoutEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  isSolutionPath: boolean;
  actionType?: ActionType;
}

function computeLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  solutionPath: GraphEdge[],
  currentPlaybackNodeId: string | null,
): { layoutNodes: LayoutNode[]; layoutEdges: LayoutEdge[]; width: number; height: number } {
  if (nodes.length === 0) {
    return { layoutNodes: [], layoutEdges: [], width: 0, height: 0 };
  }

  // Build adjacency: parent → children (from search edges, first occurrence = parent)
  const children = new Map<string, string[]>();
  const hasParent = new Set<string>();

  for (const edge of edges) {
    if (!hasParent.has(edge.target)) {
      hasParent.add(edge.target);
      const list = children.get(edge.source) || [];
      list.push(edge.target);
      children.set(edge.source, list);
    }
  }

  // Find root(s): nodes without parents. Prefer the start node.
  const nodeMap = new Map<string, GraphNode>();
  for (const n of nodes) nodeMap.set(n.id, n);

  const roots: string[] = [];
  for (const n of nodes) {
    if (!hasParent.has(n.id)) roots.push(n.id);
  }
  if (roots.length === 0 && nodes.length > 0) {
    roots.push(nodes[0].id);
  }

  // Collect solution path node IDs for highlighting
  const solutionNodeIds = new Set<string>();
  const solutionEdgeKeys = new Set<string>();
  for (const edge of solutionPath) {
    solutionNodeIds.add(edge.source);
    solutionNodeIds.add(edge.target);
    solutionEdgeKeys.add(`${edge.source}->${edge.target}`);
  }

  // BFS to assign levels
  const level = new Map<string, number>();
  const queue: string[] = [...roots];
  for (const r of roots) level.set(r, 0);
  let maxLevel = 0;

  while (queue.length > 0) {
    const id = queue.shift()!;
    const lv = level.get(id)!;
    const kids = children.get(id) || [];
    for (const kid of kids) {
      if (!level.has(kid)) {
        level.set(kid, lv + 1);
        if (lv + 1 > maxLevel) maxLevel = lv + 1;
        queue.push(kid);
      }
    }
  }

  // Assign nodes without a level (disconnected) to the bottom
  for (const n of nodes) {
    if (!level.has(n.id)) {
      level.set(n.id, maxLevel + 1);
    }
  }

  // Group by level
  const levels = new Map<number, string[]>();
  for (const [id, lv] of level) {
    const arr = levels.get(lv) || [];
    arr.push(id);
    levels.set(lv, arr);
  }

  // Compute positions
  let maxWidth = 0;
  const posMap = new Map<string, { x: number; y: number }>();

  for (const [lv, ids] of levels) {
    const y = PADDING_TOP + lv * LEVEL_HEIGHT;
    const totalWidth = ids.length * NODE_SPACING;
    const startX = PADDING_X;

    for (let i = 0; i < ids.length; i++) {
      const x = startX + i * NODE_SPACING + NODE_SPACING / 2;
      posMap.set(ids[i], { x, y });
      if (x + PADDING_X > maxWidth) maxWidth = x + PADDING_X;
    }
    if (totalWidth + PADDING_X * 2 > maxWidth) {
      maxWidth = totalWidth + PADDING_X * 2;
    }
  }

  const height = PADDING_TOP + (maxLevel + 2) * LEVEL_HEIGHT;
  const width = Math.max(maxWidth, 200);

  // Build layout arrays
  const layoutNodes: LayoutNode[] = [];
  for (const n of nodes) {
    const pos = posMap.get(n.id);
    if (!pos) continue;
    layoutNodes.push({
      id: n.id,
      x: pos.x,
      y: pos.y,
      isStart: n.isStart ?? false,
      isSolution: n.isSolution ?? false,
      isSolutionPath: solutionNodeIds.has(n.id),
      isPlaybackCurrent: n.id === currentPlaybackNodeId,
      isPrerequisite: n.id.startsWith('prereq-'),
    });
  }

  // Build a lookup for edge action types from the original edges
  const edgeActionTypes = new Map<string, ActionType | undefined>();
  for (const edge of edges) {
    edgeActionTypes.set(`${edge.source}->${edge.target}`, edge.actionType);
  }

  const layoutEdges: LayoutEdge[] = [];
  for (const edge of edges) {
    const from = posMap.get(edge.source);
    const to = posMap.get(edge.target);
    if (!from || !to) continue;
    const key = `${edge.source}->${edge.target}`;
    layoutEdges.push({
      x1: from.x,
      y1: from.y,
      x2: to.x,
      y2: to.y,
      isSolutionPath: solutionEdgeKeys.has(key),
      actionType: edge.actionType,
    });
  }

  return { layoutNodes, layoutEdges, width, height };
}

// ─── Canvas renderer ─────────────────────────────────────────────────────────

function renderGraph(
  ctx: CanvasRenderingContext2D,
  layoutNodes: LayoutNode[],
  layoutEdges: LayoutEdge[],
  canvasWidth: number,
  canvasHeight: number,
  graphWidth: number,
  graphHeight: number,
  time: number,
) {
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Clear
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  if (layoutNodes.length === 0) return;

  // Auto-fit: scale to fill available space
  const scaleX = canvasWidth / Math.max(graphWidth, 1);
  const scaleY = canvasHeight / Math.max(graphHeight, 1);
  const scale = Math.min(scaleX, scaleY, 3); // Cap zoom at 3×

  const offsetX = (canvasWidth - graphWidth * scale) / 2;
  const offsetY = 0;

  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

  // Draw edges (non-solution first, then solution on top)
  ctx.lineWidth = 1 / scale;
  for (const edge of layoutEdges) {
    if (edge.isSolutionPath) continue;
    ctx.strokeStyle = COLORS.edgeDefault;
    ctx.beginPath();
    ctx.moveTo(edge.x1, edge.y1);
    ctx.lineTo(edge.x2, edge.y2);
    ctx.stroke();
  }

  ctx.lineWidth = 2 / scale;
  for (const edge of layoutEdges) {
    if (!edge.isSolutionPath) continue;
    // Use action-type color if available, otherwise default solution blue
    ctx.strokeStyle = edge.actionType
      ? (EDGE_COLORS[edge.actionType] ?? COLORS.edgeSolution)
      : COLORS.edgeSolution;
    ctx.beginPath();
    ctx.moveTo(edge.x1, edge.y1);
    ctx.lineTo(edge.x2, edge.y2);
    ctx.stroke();
  }

  // Draw nodes
  const r = NODE_RADIUS / Math.max(scale, 1);
  for (const node of layoutNodes) {
    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, Math.PI * 2);

    if (node.isPlaybackCurrent) {
      ctx.fillStyle = COLORS.nodePlaybackCurrent;
    } else if (node.isStart) {
      ctx.fillStyle = COLORS.nodeStart;
    } else if (node.isSolution) {
      ctx.fillStyle = COLORS.nodeSolution;
    } else if (node.isSolutionPath) {
      ctx.fillStyle = COLORS.nodeSolutionPath;
    } else {
      ctx.fillStyle = COLORS.nodeDefault;
    }
    ctx.fill();

    // Diamond outline for prerequisite nodes
    if (node.isPrerequisite) {
      const d = r * 1.6;
      ctx.beginPath();
      ctx.moveTo(node.x, node.y - d);
      ctx.lineTo(node.x + d, node.y);
      ctx.lineTo(node.x, node.y + d);
      ctx.lineTo(node.x - d, node.y);
      ctx.closePath();
      ctx.strokeStyle = COLORS.nodePrerequisite;
      ctx.lineWidth = 1.5 / scale;
      ctx.stroke();
    }

    // Pulsing ring for current playback node
    if (node.isPlaybackCurrent) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 4); // ~0.6 Hz pulse
      ctx.beginPath();
      ctx.arc(node.x, node.y, r * 2, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(34, 211, 238, ${0.3 + pulse * 0.5})`;
      ctx.lineWidth = 2 / scale;
      ctx.stroke();
    }
  }

  ctx.restore();
}

// ─── Status badge ────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<SolveStatus, string> = {
  idle: 'Idle',
  connecting: 'Connecting…',
  solving: 'Solving…',
  solving_prerequisites: 'Resolving Prerequisites…',
  solved: 'Solved',
  deficit: 'Materials Needed',
  error: 'Error',
};

const STATUS_CLASSES: Record<SolveStatus, string> = {
  idle: s.statusIdle,
  connecting: s.statusConnecting,
  solving: s.statusSolving,
  solving_prerequisites: s.statusSolving,
  solved: s.statusSolved,
  deficit: s.statusSolved,
  error: s.statusError,
};

// ─── Component ───────────────────────────────────────────────────────────────

export function SolveGraphPanel() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);

  const solveStatus = useBuildingStore((s) => s.solveStatus);
  const graphNodes = useBuildingStore((s) => s.graphNodes);
  const graphEdges = useBuildingStore((s) => s.graphEdges);
  const solutionPath = useBuildingStore((s) => s.solutionPath);
  const solveError = useBuildingStore((s) => s.solveError);
  const solveDurationMs = useBuildingStore((s) => s.solveDurationMs);
  const totalNodesExplored = useBuildingStore((s) => s.totalNodesExplored);
  const hasDeficit = useBuildingStore((s) => s.hasDeficit);

  // Playback sync
  const playbackMode = useBuildingStore((s) => s.playbackMode);
  const currentBlockIndex = useBuildingStore((s) => s.currentBlockIndex);
  const playbackBlocks = useBuildingStore((s) => s.playbackBlocks);

  // Determine the current playback node ID based on the current block's Y level
  const currentPlaybackNodeId = (() => {
    if (playbackMode === 'off' || currentBlockIndex <= 0 || playbackBlocks.length === 0) {
      return null;
    }
    const currentBlock = playbackBlocks[currentBlockIndex - 1];
    if (!currentBlock) return null;

    // Map the block's Y level to a solution path edge's target node
    const layerId = `layer_${currentBlock.position.y}`;
    for (const edge of solutionPath) {
      if (edge.label && edge.label.includes(layerId)) {
        return edge.target;
      }
    }
    return null;
  })();

  // Resize canvas to container
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = wrap.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
  }, []);

  // Redraw on data or size change
  useEffect(() => {
    resizeCanvas();

    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // If there's a playback current node, animate the pulse
    const needsAnimation = currentPlaybackNodeId !== null;

    const draw = (time: number) => {
      const { layoutNodes, layoutEdges, width, height } = computeLayout(
        graphNodes,
        graphEdges,
        solutionPath,
        currentPlaybackNodeId,
      );

      const dpr = window.devicePixelRatio || 1;
      const cw = canvas.width / dpr;
      const ch = canvas.height / dpr;

      renderGraph(ctx, layoutNodes, layoutEdges, cw, ch, width, height, time / 1000);

      if (needsAnimation) {
        animRef.current = requestAnimationFrame(draw);
      }
    };

    if (needsAnimation) {
      animRef.current = requestAnimationFrame(draw);
    } else {
      draw(0);
    }

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [graphNodes, graphEdges, solutionPath, resizeCanvas, currentPlaybackNodeId]);

  // Resize observer
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const observer = new ResizeObserver(() => {
      resizeCanvas();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const store = useBuildingStore.getState();
      const { layoutNodes, layoutEdges, width, height } = computeLayout(
        store.graphNodes,
        store.graphEdges,
        store.solutionPath,
        currentPlaybackNodeId,
      );

      const dpr = window.devicePixelRatio || 1;
      const cw = canvas.width / dpr;
      const ch = canvas.height / dpr;
      renderGraph(ctx, layoutNodes, layoutEdges, cw, ch, width, height, performance.now() / 1000);
    });
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [resizeCanvas, currentPlaybackNodeId]);

  const showCanvas = solveStatus !== 'idle';

  return (
    <div className={s.root}>
      {/* Stats bar */}
      <div className={s.statsBar}>
        <span className={cn(s.statusBadge, STATUS_CLASSES[solveStatus])}>
          {STATUS_LABELS[solveStatus]}
        </span>
        {totalNodesExplored > 0 && (
          <span className={s.stat}>
            Nodes: <strong>{totalNodesExplored}</strong>
          </span>
        )}
        {solutionPath.length > 0 && (
          <span className={s.stat}>
            Path: <strong>{solutionPath.length} steps</strong>
          </span>
        )}
        {solveDurationMs > 0 && (
          <span className={s.stat}>
            Time: <strong>{(solveDurationMs / 1000).toFixed(2)}s</strong>
          </span>
        )}
      </div>

      {/* Color legend (visible when prerequisites detected) */}
      {hasDeficit && (
        <div className={s.edgeLegend}>
          {EDGE_LEGEND.map(({ type, label, color }) => (
            <span key={type} className={s.legendItem}>
              <span className={s.legendDot} style={{ backgroundColor: color }} />
              {label}
            </span>
          ))}
        </div>
      )}

      {/* Canvas or empty state */}
      {showCanvas ? (
        <div className={s.canvasWrap} ref={wrapRef}>
          <canvas ref={canvasRef} className={s.canvas} />
        </div>
      ) : (
        <div className={s.empty}>
          Node Graph
          <span className={s.emptyHint}>
            Place blocks and press Solve to visualize the search tree
          </span>
        </div>
      )}

      {/* Error */}
      {solveError && <div className={s.errorMsg}>{solveError}</div>}
    </div>
  );
}
