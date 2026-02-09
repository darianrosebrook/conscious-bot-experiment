/**
 * useSterling Solve — Hybrid WS+REST hook for Sterling building domain solves
 *
 * Uses WebSocket for live search tree streaming (discover, search_edge,
 * solution_path messages), then augments with REST-based prerequisite
 * resolution when the building solve completes with a material deficit.
 *
 * After a successful solve, derives a block-by-block placement sequence
 * from the solution path for animated playback. When prerequisites are
 * needed, prerequisite graph edges are fetched from the planning service
 * and merged into the building graph with action-type metadata for
 * color-coded rendering.
 *
 * Message flow:
 *   discover       → addGraphNode (search tree grows)
 *   search_edge    → addGraphEdge (exploration edges)
 *   solution_path  → setSolutionPath (winning route highlighted)
 *   complete       → check for deficit → if deficit, call REST for prereqs
 *   complete (no deficit) → setSolveStatus('solved'), derive playback blocks
 *   error          → setSolveError
 */

import { useRef, useCallback } from 'react';
import { useBuildingStore } from '@/stores/building-store';
import type { BuildingSolveRequest } from '@/lib/blocks-to-solve-request';
import type { GraphEdge, PrerequisiteChain, ActionType } from '@/stores/building-store';
import type { PlacedBlock } from '@/types/building';

// ─── Sterling WS URL ─────────────────────────────────────────────────────────

const STERLING_WS_URL =
  import.meta.env.VITE_STERLING_WS_URL ||
  `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/sterling`;

// ─── Solution → playback blocks ──────────────────────────────────────────────

/**
 * Derive an ordered block-by-block placement sequence from the solution.
 *
 * Each solution path edge label maps to a layer action. We sort blocks
 * bottom-to-top (by Y level), and within each layer, sort by X then Z
 * to create a sweep pattern.
 *
 * This gives Sterling's build order: foundation first, then each
 * successive layer, creating a visually meaningful construction animation.
 */
function derivePlaybackBlocks(
  blocks: PlacedBlock[],
  solutionEdges: GraphEdge[],
): PlacedBlock[] {
  if (blocks.length === 0) return [];

  // Group blocks by Y level
  const layers = new Map<number, PlacedBlock[]>();
  for (const block of blocks) {
    const y = block.position.y;
    const arr = layers.get(y) || [];
    arr.push(block);
    layers.set(y, arr);
  }

  // Sort layer keys ascending (bottom to top)
  const sortedYLevels = Array.from(layers.keys()).sort((a, b) => a - b);

  // Build the layer order from solution edges if available
  // Each edge label like "layer_0", "layer_1" maps to a Y level
  const edgeLayerOrder: number[] = [];
  for (const edge of solutionEdges) {
    if (edge.label) {
      const match = edge.label.match(/layer_(\d+)/);
      if (match) {
        const y = parseInt(match[1], 10);
        if (!edgeLayerOrder.includes(y)) {
          edgeLayerOrder.push(y);
        }
      }
    }
  }

  // Use edge order if we got meaningful data, otherwise Y-sorted
  const layerOrder = edgeLayerOrder.length > 0 ? edgeLayerOrder : sortedYLevels;

  // Flatten: within each layer, sort blocks by X then Z (sweep pattern)
  const ordered: PlacedBlock[] = [];
  for (const y of layerOrder) {
    const layerBlocks = layers.get(y);
    if (!layerBlocks) continue;
    layerBlocks.sort((a, b) => {
      if (a.position.x !== b.position.x) return a.position.x - b.position.x;
      return a.position.z - b.position.z;
    });
    ordered.push(...layerBlocks);
  }

  // Include any blocks from Y levels not in the order (edge case)
  const coveredYs = new Set(layerOrder);
  for (const y of sortedYLevels) {
    if (!coveredYs.has(y)) {
      const layerBlocks = layers.get(y)!;
      layerBlocks.sort((a, b) => {
        if (a.position.x !== b.position.x) return a.position.x - b.position.x;
        return a.position.z - b.position.z;
      });
      ordered.push(...layerBlocks);
    }
  }

  return ordered;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export interface UseSterlinSolveReturn {
  startSolve: (request: BuildingSolveRequest) => void;
  cancel: () => void;
}

export function useSterlingSolve(): UseSterlinSolveReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const solveStartRef = useRef<number>(0);

  // Accumulate solution path edges so we can set them all at once on complete
  const solutionEdgesRef = useRef<GraphEdge[]>([]);

  // Store actions (stable references via Zustand)
  const setSolveStatus = useBuildingStore((s) => s.setSolveStatus);
  const addGraphNode = useBuildingStore((s) => s.addGraphNode);
  const addGraphEdge = useBuildingStore((s) => s.addGraphEdge);
  const setSolutionPath = useBuildingStore((s) => s.setSolutionPath);
  const setSolveError = useBuildingStore((s) => s.setSolveError);
  const setSolveDuration = useBuildingStore((s) => s.setSolveDuration);
  const resetSolve = useBuildingStore((s) => s.resetSolve);
  const setPlaybackBlocks = useBuildingStore((s) => s.setPlaybackBlocks);
  const setPrerequisiteData = useBuildingStore((s) => s.setPrerequisiteData);
  const setSolveRunId = useBuildingStore((s) => s.setSolveRunId);
  const setInputsDigest = useBuildingStore((s) => s.setInputsDigest);

  const cancel = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const startSolve = useCallback(
    (request: BuildingSolveRequest) => {
      // Clean up previous connection
      cancel();
      resetSolve();
      solutionEdgesRef.current = [];

      setSolveStatus('connecting');
      solveStartRef.current = Date.now();

      const ws = new WebSocket(STERLING_WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setSolveStatus('solving');

        // Send solve command
        ws.send(
          JSON.stringify({
            command: 'solve',
            domain: 'building',
            ...request,
          }),
        );
      };

      ws.onmessage = (event) => {
        let msg: any;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }

        switch (msg.type) {
          case 'discover':
            addGraphNode({
              id: msg.u,
              g: msg.g ?? 0,
              h: msg.h ?? 0,
              isStart: msg.isStart ?? false,
              isSolution: msg.isSolution ?? false,
            });
            break;

          case 'search_edge':
            addGraphEdge({
              source: msg.source,
              target: msg.target,
              label: typeof msg.label === 'string'
                ? msg.label
                : JSON.stringify(msg.label),
            });
            break;

          case 'solution_path':
            solutionEdgesRef.current.push({
              source: msg.source,
              target: msg.target,
              label: typeof msg.label === 'string'
                ? msg.label
                : msg.label
                  ? JSON.stringify(msg.label)
                  : undefined,
              isSolutionPath: true,
            });
            break;

          case 'complete': {
            const duration = Date.now() - solveStartRef.current;
            setSolveDuration(msg.metrics?.durationMs ?? duration);
            setSolutionPath(solutionEdgesRef.current);

            // Check for material deficit in complete metrics OR compute client-side
            let deficit = msg.metrics?.needsMaterials?.deficit as Record<string, number> | undefined;
            if (!deficit || Object.keys(deficit).length === 0) {
              // Fallback: compute deficit from modules vs inventory
              const totalNeeded: Record<string, number> = {};
              for (const mod of request.modules) {
                if (request.goalModules.includes(mod.moduleId) && mod.materialsNeeded) {
                  for (const mat of mod.materialsNeeded) {
                    totalNeeded[mat.name] = (totalNeeded[mat.name] || 0) + mat.count;
                  }
                }
              }
              const clientDeficit: Record<string, number> = {};
              for (const [item, needed] of Object.entries(totalNeeded)) {
                const have = request.inventory[item] || 0;
                if (have < needed) {
                  clientDeficit[item] = needed - have;
                }
              }
              if (Object.keys(clientDeficit).length > 0) {
                deficit = clientDeficit;
              }
            }
            const hasDeficit = deficit && Object.keys(deficit).length > 0;

            if (hasDeficit) {
              // Deficit detected — resolve prerequisites via REST endpoint
              setSolveStatus('solving_prerequisites');
              ws.close();

              resolvePrerequisites(request)
                .then((prereqResult) => {
                  if (prereqResult) {
                    // Merge prerequisite graph edges into the building graph
                    if (prereqResult.prerequisites?.chains) {
                      const chains: PrerequisiteChain[] = prereqResult.prerequisites.chains.map(
                        (c: any) => ({
                          goalItem: c.goalItem,
                          count: c.count,
                          solved: c.solved,
                          steps: (c.steps || []).map((step: any) => ({
                            action: step.action,
                            actionType: step.actionType as ActionType,
                            produces: step.produces || [],
                            consumes: step.consumes || [],
                          })),
                          error: c.error,
                        })
                      );

                      setPrerequisiteData({
                        chains,
                        deficit: prereqResult.prerequisites.deficit || {},
                      });

                      // Add prerequisite steps as graph edges with action-type metadata
                      let prereqNodeCounter = 0;
                      for (const chain of chains) {
                        if (!chain.solved || chain.steps.length === 0) continue;
                        let prevNodeId = `prereq-${chain.goalItem}-start`;
                        addGraphNode({
                          id: prevNodeId,
                          g: 0,
                          h: chain.steps.length,
                          isStart: true,
                        });

                        for (const step of chain.steps) {
                          prereqNodeCounter++;
                          const nodeId = `prereq-${chain.goalItem}-${prereqNodeCounter}`;
                          addGraphNode({
                            id: nodeId,
                            g: prereqNodeCounter,
                            h: chain.steps.length - prereqNodeCounter,
                          });
                          addGraphEdge({
                            source: prevNodeId,
                            target: nodeId,
                            label: step.action,
                            isSolutionPath: true,
                            actionType: step.actionType as ActionType,
                            prerequisiteGoal: chain.goalItem,
                          });
                          prevNodeId = nodeId;
                        }
                      }
                    }

                    if (prereqResult.runId) setSolveRunId(prereqResult.runId);
                    if (prereqResult.inputsDigest) setInputsDigest(prereqResult.inputsDigest);
                  }

                  // Final status: solved with deficit info visible
                  setSolveStatus('deficit');

                  // Still derive playback blocks for the building portion
                  const blocks = useBuildingStore.getState().blocks;
                  const playbackBlocks = derivePlaybackBlocks(blocks, solutionEdgesRef.current);
                  setPlaybackBlocks(playbackBlocks);
                })
                .catch((err) => {
                  setSolveError(`Prerequisite resolution failed: ${err.message}`);
                });
            } else {
              // No deficit — standard solve completion
              setSolveStatus('solved');

              // Derive playback blocks from the current placed blocks + solution path
              const blocks = useBuildingStore.getState().blocks;
              const playbackBlocks = derivePlaybackBlocks(blocks, solutionEdgesRef.current);
              setPlaybackBlocks(playbackBlocks);

              // Close the WebSocket — solve is done
              ws.close();
            }
            break;
          }

          case 'error':
            setSolveError(msg.message || 'Sterling solve failed');
            ws.close();
            break;

          // Ignore pong, status, metrics, etc.
          default:
            break;
        }
      };

      ws.onerror = () => {
        setSolveError('WebSocket connection to Sterling failed');
      };

      ws.onclose = () => {
        wsRef.current = null;
      };
    },
    [
      cancel,
      resetSolve,
      setSolveStatus,
      addGraphNode,
      addGraphEdge,
      setSolutionPath,
      setSolveError,
      setSolveDuration,
      setPlaybackBlocks,
      setPrerequisiteData,
      setSolveRunId,
      setInputsDigest,
    ],
  );

  return { startSolve, cancel };
}

// ─── REST prerequisite resolver ───────────────────────────────────────────────

/**
 * Call the planning service's solve-with-prerequisites endpoint.
 * This sends the same building solve request and receives the full
 * orchestrated result including prerequisite crafting chains.
 */
async function resolvePrerequisites(
  request: BuildingSolveRequest,
): Promise<any> {
  const res = await fetch('/api/building-solve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `HTTP ${res.status}`);
  }

  return res.json();
}
