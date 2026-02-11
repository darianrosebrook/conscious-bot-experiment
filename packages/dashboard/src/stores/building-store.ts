/**
 * Building Designer Store
 *
 * Zustand store for the 3D block builder tab.
 * Manages placed blocks, selected material, build mode, grid config,
 * saved layouts (persisted to localStorage), Sterling solve state,
 * playback state for animated solve visualization, and dual-mode inventory.
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { Vec3, PlacedBlock, BuildMode } from '@/types/building';
import { DEFAULT_BLOCK_TYPE, DEFAULT_GRID_SIZE } from '@/types/building';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Encode a Vec3 as a string key for O(1) lookups. */
const posKey = (p: Vec3) => `${p.x},${p.y},${p.z}`;

// ─── Saved Layout ────────────────────────────────────────────────────────────

export interface SavedLayout {
  id: string;
  name: string;
  blocks: PlacedBlock[];
  savedAt: number; // epoch ms
}

// ─── Solve Graph Types ──────────────────────────────────────────────────────

export type SolveStatus = 'idle' | 'connecting' | 'solving' | 'solving_prerequisites' | 'solved' | 'deficit' | 'error';

export interface GraphNode {
  id: string;
  g: number;
  h: number;
  isStart?: boolean;
  isSolution?: boolean;
}

export type ActionType = 'build' | 'craft' | 'mine' | 'smelt' | 'place';

export interface GraphEdge {
  source: string;
  target: string;
  label?: string;
  isSolutionPath?: boolean;
  actionType?: ActionType;
  prerequisiteGoal?: string;
}

// ─── Prerequisite Types ─────────────────────────────────────────────────────

export interface PrerequisiteStep {
  action: string;
  actionType: ActionType;
  produces: { name: string; count: number }[];
  consumes: { name: string; count: number }[];
}

export interface PrerequisiteChain {
  goalItem: string;
  count: number;
  solved: boolean;
  steps: PrerequisiteStep[];
  error?: string;
}

// ─── Playback Types ──────────────────────────────────────────────────────────

export type PlaybackMode = 'off' | 'playing' | 'paused';

// ─── Inventory Types ─────────────────────────────────────────────────────────

export type InventoryMode = 'auto' | 'manual';

// ─── Store Interface ─────────────────────────────────────────────────────────

export interface BuildingStore {
  blocks: PlacedBlock[];
  /** Set of "x,y,z" keys for fast collision checks. */
  blockIndex: Set<string>;
  selectedBlockType: string;
  buildMode: BuildMode;
  gridSize: Vec3;
  savedLayouts: SavedLayout[];

  // Solve state
  solveStatus: SolveStatus;
  graphNodes: GraphNode[];
  graphEdges: GraphEdge[];
  solutionPath: GraphEdge[];
  solveError: string | null;
  solveDurationMs: number;
  totalNodesExplored: number;

  // Playback state
  playbackMode: PlaybackMode;
  playbackBlocks: PlacedBlock[];
  currentBlockIndex: number;
  playbackSpeed: number; // blocks per second

  // Prerequisite state
  prerequisiteChains: PrerequisiteChain[];
  hasDeficit: boolean;
  deficitSummary: Record<string, number>;

  // Provenance
  solveRunId: string | null;
  inputsDigest: string | null;

  // Inventory state
  inventoryMode: InventoryMode;
  manualInventory: Record<string, number>;

  // Actions
  placeBlock: (_pos: Vec3, _type: string) => void;
  removeBlock: (_pos: Vec3) => void;
  clearBlocks: () => void;
  setSelectedBlockType: (_type: string) => void;
  setBuildMode: (_mode: BuildMode) => void;
  /** Look up the block type at a position (for pick-block). */
  getBlockAt: (_pos: Vec3) => string | null;

  /** Replace current blocks wholesale (used by templates and imports). */
  loadBlocks: (_blocks: PlacedBlock[]) => void;

  // Layout persistence
  saveLayout: (_name: string) => void;
  loadLayout: (_id: string) => void;
  deleteLayout: (_id: string) => void;
  exportLayoutJSON: () => string;
  importLayoutJSON: (_json: string) => boolean;

  // Solve actions
  setSolveStatus: (_status: SolveStatus) => void;
  addGraphNode: (_node: GraphNode) => void;
  addGraphEdge: (_edge: GraphEdge) => void;
  setSolutionPath: (_path: GraphEdge[]) => void;
  setSolveError: (_error: string) => void;
  setSolveDuration: (_ms: number) => void;
  resetSolve: () => void;

  // Prerequisite actions
  setPrerequisiteData: (_data: { chains: PrerequisiteChain[]; deficit: Record<string, number> }) => void;
  clearPrerequisites: () => void;
  setSolveRunId: (_runId: string) => void;
  setInputsDigest: (_digest: string) => void;

  // Playback actions
  setPlaybackBlocks: (_blocks: PlacedBlock[]) => void;
  startPlayback: () => void;
  pausePlayback: () => void;
  stepForward: () => void;
  stepBackward: () => void;
  setPlaybackSpeed: (_speed: number) => void;
  resetPlayback: () => void;

  // Inventory actions
  setInventoryMode: (_mode: InventoryMode) => void;
  setManualInventoryItem: (_blockType: string, _count: number) => void;
  clearManualInventory: () => void;
  getActiveInventory: () => Record<string, number>;
}

// ─── Rebuild index helper ────────────────────────────────────────────────────

function buildIndex(blocks: PlacedBlock[]): Set<string> {
  const idx = new Set<string>();
  for (const b of blocks) idx.add(posKey(b.position));
  return idx;
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useBuildingStore = create<BuildingStore>()(
  devtools(
    persist(
      (set, get) => ({
        blocks: [],
        blockIndex: new Set<string>(),
        selectedBlockType: DEFAULT_BLOCK_TYPE,
        buildMode: 'place',
        gridSize: { ...DEFAULT_GRID_SIZE },
        savedLayouts: [],

        // Solve state defaults
        solveStatus: 'idle' as SolveStatus,
        graphNodes: [],
        graphEdges: [],
        solutionPath: [],
        solveError: null,
        solveDurationMs: 0,
        totalNodesExplored: 0,

        // Playback defaults
        playbackMode: 'off' as PlaybackMode,
        playbackBlocks: [],
        currentBlockIndex: 0,
        playbackSpeed: 4,

        // Prerequisite defaults
        prerequisiteChains: [],
        hasDeficit: false,
        deficitSummary: {},

        // Provenance defaults
        solveRunId: null,
        inputsDigest: null,

        // Inventory defaults
        inventoryMode: 'auto' as InventoryMode,
        manualInventory: {},

        placeBlock: (pos, type) => {
          const key = posKey(pos);
          const { blockIndex, blocks, gridSize } = get();

          // Bounds check
          if (
            pos.x < 0 || pos.x >= gridSize.x ||
            pos.y < 0 || pos.y >= gridSize.y ||
            pos.z < 0 || pos.z >= gridSize.z
          ) return;

          // No duplicate position
          if (blockIndex.has(key)) return;

          const newIndex = new Set(blockIndex);
          newIndex.add(key);
          set({
            blocks: [...blocks, { position: { ...pos }, blockType: type }],
            blockIndex: newIndex,
          });
        },

        removeBlock: (pos) => {
          const key = posKey(pos);
          const { blockIndex, blocks } = get();
          if (!blockIndex.has(key)) return;

          const newIndex = new Set(blockIndex);
          newIndex.delete(key);
          set({
            blocks: blocks.filter((b) => posKey(b.position) !== key),
            blockIndex: newIndex,
          });
        },

        clearBlocks: () =>
          set({ blocks: [], blockIndex: new Set<string>() }),

        setSelectedBlockType: (type) =>
          set({ selectedBlockType: type }),

        setBuildMode: (mode) =>
          set({ buildMode: mode }),

        getBlockAt: (pos) => {
          const key = posKey(pos);
          const { blocks } = get();
          const block = blocks.find((b) => posKey(b.position) === key);
          return block?.blockType ?? null;
        },

        loadBlocks: (newBlocks) => {
          // Deduplicate: last write wins (later block at same position overwrites)
          const seen = new Map<string, PlacedBlock>();
          for (const bl of newBlocks) {
            seen.set(posKey(bl.position), {
              position: { ...bl.position },
              blockType: bl.blockType,
            });
          }
          const blocks = Array.from(seen.values());
          set({ blocks, blockIndex: buildIndex(blocks) });
        },

        // ── Layout persistence ───────────────────────────────────────────

        saveLayout: (name) => {
          const { blocks, savedLayouts } = get();
          if (blocks.length === 0) return;
          const layout: SavedLayout = {
            id: `layout-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name,
            blocks: blocks.map((b) => ({
              position: { ...b.position },
              blockType: b.blockType,
            })),
            savedAt: Date.now(),
          };
          set({ savedLayouts: [...savedLayouts, layout] });
        },

        loadLayout: (id) => {
          const { savedLayouts } = get();
          const layout = savedLayouts.find((l) => l.id === id);
          if (!layout) return;
          const blocks = layout.blocks.map((b) => ({
            position: { ...b.position },
            blockType: b.blockType,
          }));
          set({ blocks, blockIndex: buildIndex(blocks) });
        },

        deleteLayout: (id) => {
          const { savedLayouts } = get();
          set({ savedLayouts: savedLayouts.filter((l) => l.id !== id) });
        },

        exportLayoutJSON: () => {
          const { blocks } = get();
          return JSON.stringify({ version: 1, blocks }, null, 2);
        },

        importLayoutJSON: (json) => {
          try {
            const data = JSON.parse(json);
            if (!Array.isArray(data?.blocks)) return false;
            const blocks: PlacedBlock[] = data.blocks.map((b: any) => ({
              position: { x: Number(b.position.x), y: Number(b.position.y), z: Number(b.position.z) },
              blockType: String(b.blockType),
            }));
            set({ blocks, blockIndex: buildIndex(blocks) });
            return true;
          } catch {
            return false;
          }
        },

        // ── Solve actions ─────────────────────────────────────────────────

        setSolveStatus: (status) =>
          set({ solveStatus: status }),

        addGraphNode: (node) =>
          set((state) => ({
            graphNodes: [...state.graphNodes, node],
            totalNodesExplored: state.totalNodesExplored + 1,
          })),

        addGraphEdge: (edge) =>
          set((state) => ({
            graphEdges: [...state.graphEdges, edge],
          })),

        setSolutionPath: (path) =>
          set({ solutionPath: path }),

        setSolveError: (error) =>
          set({ solveError: error, solveStatus: 'error' }),

        setSolveDuration: (ms) =>
          set({ solveDurationMs: ms }),

        resetSolve: () =>
          set({
            solveStatus: 'idle',
            graphNodes: [],
            graphEdges: [],
            solutionPath: [],
            solveError: null,
            solveDurationMs: 0,
            totalNodesExplored: 0,
            playbackMode: 'off',
            playbackBlocks: [],
            currentBlockIndex: 0,
            prerequisiteChains: [],
            hasDeficit: false,
            deficitSummary: {},
            solveRunId: null,
            inputsDigest: null,
          }),

        // ── Prerequisite actions ──────────────────────────────────────────

        setPrerequisiteData: ({ chains, deficit }) =>
          set({
            prerequisiteChains: chains,
            hasDeficit: Object.keys(deficit).length > 0,
            deficitSummary: deficit,
          }),

        clearPrerequisites: () =>
          set({
            prerequisiteChains: [],
            hasDeficit: false,
            deficitSummary: {},
          }),

        setSolveRunId: (runId) =>
          set({ solveRunId: runId }),

        setInputsDigest: (digest) =>
          set({ inputsDigest: digest }),

        // ── Playback actions ──────────────────────────────────────────────

        setPlaybackBlocks: (blocks) =>
          set({ playbackBlocks: blocks }),

        startPlayback: () =>
          set({ playbackMode: 'playing', currentBlockIndex: 0 }),

        pausePlayback: () =>
          set({ playbackMode: 'paused' }),

        stepForward: () => {
          const { currentBlockIndex, playbackBlocks } = get();
          if (currentBlockIndex >= playbackBlocks.length) {
            set({ playbackMode: 'paused' });
            return;
          }
          const next = currentBlockIndex + 1;
          set({
            currentBlockIndex: next,
            ...(next >= playbackBlocks.length ? { playbackMode: 'paused' } : {}),
          });
        },

        stepBackward: () => {
          const { currentBlockIndex } = get();
          if (currentBlockIndex <= 0) return;
          set({ currentBlockIndex: currentBlockIndex - 1 });
        },

        setPlaybackSpeed: (speed) =>
          set({ playbackSpeed: Math.max(1, Math.min(8, speed)) }),

        resetPlayback: () =>
          set({
            playbackMode: 'off',
            currentBlockIndex: 0,
          }),

        // ── Inventory actions ─────────────────────────────────────────────

        setInventoryMode: (mode) =>
          set({ inventoryMode: mode }),

        setManualInventoryItem: (blockType, count) =>
          set((state) => ({
            manualInventory: {
              ...state.manualInventory,
              [blockType]: Math.max(0, count),
            },
          })),

        clearManualInventory: () =>
          set({ manualInventory: {} }),

        getActiveInventory: () => {
          const { inventoryMode, manualInventory, blocks } = get();
          if (inventoryMode === 'manual') return { ...manualInventory };

          // Auto mode: count block types from placed blocks
          const inv: Record<string, number> = {};
          for (const b of blocks) {
            inv[b.blockType] = (inv[b.blockType] || 0) + 1;
          }
          return inv;
        },
      }),
      {
        name: 'building-layouts',
        // Persist savedLayouts + manualInventory
        partialize: (state) => ({
          savedLayouts: state.savedLayouts,
          manualInventory: state.manualInventory,
        }),
        // On rehydration, merge persisted data into fresh state
        merge: (persisted: any, current) => ({
          ...current,
          savedLayouts: persisted?.savedLayouts ?? [],
          manualInventory: persisted?.manualInventory ?? {},
        }),
      }
    ),
    { name: 'building-store' }
  )
);
