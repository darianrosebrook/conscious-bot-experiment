/**
 * D* Lite Core Algorithm - Incremental pathfinding for dynamic environments
 *
 * Implements the D* Lite algorithm for efficient pathfinding in changing
 * environments with minimal replanning overhead when obstacles appear/disappear.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import {
  IDStarLiteCore,
  GraphNode,
  WorldPosition,
  PathPlanningResult,
  PathUpdateResult,
  NavigationStep,
  WorldChange,
  PriorityKey,
  NavigationConfig,
  positionToNodeId,
  nodeIdToPosition,
  compareKeys,
  euclideanDistance,
  validatePathPlanningResult,
} from './types';

export interface DStarLiteEvents {
  'search-started': [{ start: string; goal: string }];
  'search-completed': [{ success: boolean; iterations: number; time: number }];
  'vertex-updated': [{ nodeId: string; gValue: number; rhsValue: number }];
  'path-replanned': [{ changesProcessed: number; time: number }];
}

/**
 * Priority queue for D* Lite vertex processing
 */
class PriorityQueue<T> {
  private items: Array<{ item: T; key: PriorityKey }> = [];

  insert(item: T, key: PriorityKey): void {
    this.items.push({ item, key });
    this.items.sort((a, b) => compareKeys(a.key, b.key));
  }

  extractMin(): T | null {
    const min = this.items.shift();
    return min ? min.item : null;
  }

  updateKey(item: T, newKey: PriorityKey): void {
    const index = this.items.findIndex((entry) => entry.item === item);
    if (index !== -1) {
      this.items[index].key = newKey;
      this.items.sort((a, b) => compareKeys(a.key, b.key));
    }
  }

  remove(item: T): boolean {
    const index = this.items.findIndex((entry) => entry.item === item);
    if (index !== -1) {
      this.items.splice(index, 1);
      return true;
    }
    return false;
  }

  topKey(): PriorityKey | null {
    return this.items.length > 0 ? this.items[0].key : null;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  size(): number {
    return this.items.length;
  }
}

/**
 * Core D* Lite pathfinding algorithm implementation
 */
export class DStarLiteCore
  extends EventEmitter<DStarLiteEvents>
  implements IDStarLiteCore
{
  private graph = new Map<string, GraphNode>();
  private priorityQueue = new PriorityQueue<string>();
  private startNodeId?: string;
  private goalNodeId?: string;
  private lastStartNodeId?: string;
  private km = 0; // Key modifier for incremental search

  constructor(
    private config: NavigationConfig,
    private getNeighbors: (
      nodeId: string
    ) => Array<{ nodeId: string; cost: number }>,
    private getEdgeCost: (from: string, to: string) => number
  ) {
    super();
  }

  /**
   * Initialize pathfinding from start to goal
   */
  initializePath(
    start: WorldPosition,
    goal: WorldPosition,
    graphNodes?: Map<string, GraphNode>
  ): PathPlanningResult {
    const startTime = Date.now();
    const startNodeId = positionToNodeId(start);
    const goalNodeId = positionToNodeId(goal);

    this.emit('search-started', { start: startNodeId, goal: goalNodeId });

    // Initialize graph if provided
    if (graphNodes) {
      this.graph = new Map(graphNodes);
    }

    // Ensure start and goal nodes exist
    this.ensureNode(startNodeId, start);
    this.ensureNode(goalNodeId, goal);

    this.startNodeId = startNodeId;
    this.goalNodeId = goalNodeId;
    this.lastStartNodeId = startNodeId;
    this.km = 0;

    // Initialize D* Lite algorithm
    this.initializeDStarLite();

    // Compute initial path
    const computeResult = this.computeShortestPath();
    const planningTime = Date.now() - startTime;

    if (computeResult.success) {
      const path = this.extractPath();
      const totalCost = this.getNode(startNodeId)?.gValue || Infinity;

      const result: PathPlanningResult = {
        success: true,
        path,
        totalCost,
        planningTime,
        nodesExpanded: computeResult.iterations,
        metadata: {
          goalReached: totalCost < Infinity,
          isPartialPath: false,
          hazardsAvoided: 0,
        },
      };

      this.emit('search-completed', {
        success: true,
        iterations: computeResult.iterations,
        time: planningTime,
      });

      return validatePathPlanningResult(result);
    } else {
      const result: PathPlanningResult = {
        success: false,
        path: [],
        totalCost: Infinity,
        planningTime,
        nodesExpanded: computeResult.iterations,
        reason: 'No path found within computation limits',
      };

      this.emit('search-completed', {
        success: false,
        iterations: computeResult.iterations,
        time: planningTime,
      });

      return validatePathPlanningResult(result);
    }
  }

  /**
   * Update path when world changes detected
   */
  updatePath(changes: WorldChange[]): PathUpdateResult {
    const startTime = Date.now();
    let changesProcessed = 0;
    const affectedNodes: string[] = [];

    if (!this.startNodeId || !this.goalNodeId) {
      return {
        success: false,
        updatedPath: [],
        changesProcessed: 0,
        replanTime: Date.now() - startTime,
        affectedNodes: [],
        reason: 'No active path to update',
      };
    }

    // Process each world change
    for (const change of changes) {
      if (!change.affectsNavigation) continue;

      const nodeId = positionToNodeId(change.position);
      this.ensureNode(nodeId, change.position);

      const node = this.getNode(nodeId);
      if (!node) continue;

      // Update node based on change type
      switch (change.changeType) {
        case 'block_added':
          node.walkable = false;
          node.blocked = true;
          break;
        case 'block_removed':
          node.walkable = true;
          node.blocked = false;
          break;
        case 'hazard_added':
          node.hazardLevel = Math.min(1, node.hazardLevel + 0.5);
          break;
        case 'hazard_removed':
          node.hazardLevel = Math.max(0, node.hazardLevel - 0.5);
          break;
      }

      node.lastUpdated = Date.now();
      affectedNodes.push(nodeId);
      changesProcessed++;

      // Update affected edges in D* Lite
      this.updateEdgeCosts(nodeId);
    }

    // Recompute path if there were changes
    let success = true;
    if (changesProcessed > 0) {
      const computeResult = this.computeShortestPath();
      success = computeResult.success;
    }

    const updatedPath = success ? this.extractPath() : [];
    const replanTime = Date.now() - startTime;

    this.emit('path-replanned', { changesProcessed, time: replanTime });

    return {
      success,
      updatedPath,
      changesProcessed,
      replanTime,
      affectedNodes,
      reason: success ? undefined : 'Replan failed to find valid path',
    };
  }

  /**
   * Get next movement step from current position
   */
  getNextStep(currentPosition: WorldPosition): NavigationStep | null {
    if (!this.startNodeId || !this.goalNodeId) return null;

    const currentNodeId = positionToNodeId(currentPosition);

    // Update start position for dynamic replanning
    if (currentNodeId !== this.startNodeId) {
      this.updateStartPosition(currentPosition);
    }

    const currentNode = this.getNode(currentNodeId);
    if (!currentNode) return null;

    // Find best neighbor (minimum g-value + edge cost)
    const neighbors = this.getNeighbors(currentNodeId);
    let bestNeighbor: string | null = null;
    let bestCost = Infinity;

    for (const { nodeId: neighborId, cost } of neighbors) {
      const neighbor = this.getNode(neighborId);
      if (!neighbor || neighbor.blocked) continue;

      const totalCost = neighbor.gValue + cost;
      if (totalCost < bestCost) {
        bestCost = totalCost;
        bestNeighbor = neighborId;
      }
    }

    if (!bestNeighbor) return null;

    const nextPosition = nodeIdToPosition(bestNeighbor);
    if (!nextPosition) return null;

    // Determine action type based on movement
    const action = this.determineAction(currentPosition, nextPosition);

    return {
      position: nextPosition,
      action,
      speed: 1.0,
      precision: 0.5,
      conditions: [],
    };
  }

  /**
   * Compute shortest path using D* Lite algorithm
   */
  computeShortestPath(): { success: boolean; iterations: number } {
    if (!this.startNodeId || !this.goalNodeId) {
      return { success: false, iterations: 0 };
    }

    const maxIterations = this.config.dstarLite.maxComputationTime * 100; // Rough iteration limit
    let iterations = 0;
    const startTime = Date.now();

    const startNode = this.getNode(this.startNodeId);
    if (!startNode) return { success: false, iterations: 0 };

    while (
      !this.priorityQueue.isEmpty() &&
      (compareKeys(this.priorityQueue.topKey()!, this.calculateKey(startNode)) <
        0 ||
        startNode.rhsValue !== startNode.gValue)
    ) {
      iterations++;

      // Check time/iteration limits
      if (
        iterations > maxIterations ||
        Date.now() - startTime > this.config.dstarLite.maxComputationTime
      ) {
        return { success: false, iterations };
      }

      const currentNodeId = this.priorityQueue.extractMin();
      if (!currentNodeId) break;

      const currentNode = this.getNode(currentNodeId);
      if (!currentNode) continue;

      const oldKey = this.calculateKey(currentNode);

      if (compareKeys(currentNode.key || [Infinity, Infinity], oldKey) < 0) {
        // Key has changed, reinsert with new key
        currentNode.key = this.calculateKey(currentNode);
        this.priorityQueue.insert(currentNodeId, currentNode.key);
      } else if (currentNode.gValue > currentNode.rhsValue) {
        // Overconsistent vertex
        currentNode.gValue = currentNode.rhsValue;
        this.emit('vertex-updated', {
          nodeId: currentNodeId,
          gValue: currentNode.gValue,
          rhsValue: currentNode.rhsValue,
        });

        // Update predecessors
        const neighbors = this.getNeighbors(currentNodeId);
        for (const { nodeId: neighborId } of neighbors) {
          if (neighborId !== this.goalNodeId) {
            this.updateVertex(neighborId);
          }
        }
      } else {
        // Underconsistent vertex or consistent
        currentNode.gValue = Infinity;
        this.updateVertex(currentNodeId);

        // Update predecessors
        const neighbors = this.getNeighbors(currentNodeId);
        for (const { nodeId: neighborId } of neighbors) {
          if (neighborId !== this.goalNodeId) {
            this.updateVertex(neighborId);
          }
        }
      }
    }

    return { success: startNode.gValue < Infinity, iterations };
  }

  /**
   * Calculate priority key for vertex in search queue
   */
  calculateKey(node: GraphNode): PriorityKey {
    if (!this.startNodeId) return [Infinity, Infinity];

    const minGRhs = Math.min(node.gValue, node.rhsValue);
    const heuristic = this.heuristic(
      positionToNodeId(node.position),
      this.startNodeId
    );

    return [minGRhs + heuristic + this.km, minGRhs];
  }

  /**
   * Update vertex costs when conditions change
   */
  updateVertex(nodeId: string): void {
    const node = this.getNode(nodeId);
    if (!node || !this.goalNodeId) return;

    if (nodeId !== this.goalNodeId) {
      // Calculate minimum cost to goal through neighbors
      const neighbors = this.getNeighbors(nodeId);
      let minRhs = Infinity;

      for (const { nodeId: neighborId, cost } of neighbors) {
        const neighbor = this.getNode(neighborId);
        if (neighbor && !neighbor.blocked) {
          minRhs = Math.min(minRhs, neighbor.gValue + cost);
        }
      }

      node.rhsValue = minRhs;
    }

    // Remove from queue if present
    this.priorityQueue.remove(nodeId);

    // Add to queue if inconsistent
    if (node.gValue !== node.rhsValue) {
      node.key = this.calculateKey(node);
      this.priorityQueue.insert(nodeId, node.key);
    }

    this.emit('vertex-updated', {
      nodeId,
      gValue: node.gValue,
      rhsValue: node.rhsValue,
    });
  }

  /**
   * Get or create graph node
   */
  private getNode(nodeId: string): GraphNode | null {
    return this.graph.get(nodeId) || null;
  }

  /**
   * Ensure node exists in graph
   */
  private ensureNode(nodeId: string, position: WorldPosition): GraphNode {
    let node = this.graph.get(nodeId);
    if (!node) {
      node = {
        id: nodeId,
        position,
        walkable: true,
        cost: 1,
        gValue: Infinity,
        rhsValue: Infinity,
        neighbors: [],
        blocked: false,
        hazardLevel: 0,
        lastUpdated: Date.now(),
      };
      this.graph.set(nodeId, node);
    }
    return node;
  }

  /**
   * Initialize D* Lite algorithm state
   */
  private initializeDStarLite(): void {
    if (!this.goalNodeId) return;

    // Clear previous state
    this.priorityQueue = new PriorityQueue<string>();
    this.km = 0;

    // Initialize all nodes
    for (const node of this.graph.values()) {
      node.gValue = Infinity;
      node.rhsValue = Infinity;
    }

    // Initialize goal node
    const goalNode = this.getNode(this.goalNodeId);
    if (goalNode) {
      goalNode.rhsValue = 0;
      goalNode.key = this.calculateKey(goalNode);
      this.priorityQueue.insert(this.goalNodeId, goalNode.key);
    }
  }

  /**
   * Update edge costs for a node and its neighbors
   */
  private updateEdgeCosts(nodeId: string): void {
    const neighbors = this.getNeighbors(nodeId);

    // Update the node itself
    this.updateVertex(nodeId);

    // Update all neighbors
    for (const { nodeId: neighborId } of neighbors) {
      this.updateVertex(neighborId);
    }
  }

  /**
   * Update start position for incremental replanning
   */
  private updateStartPosition(newPosition: WorldPosition): void {
    if (!this.lastStartNodeId || !this.startNodeId) return;

    const newStartNodeId = positionToNodeId(newPosition);

    // Update key modifier for incremental search
    const lastStartNode = this.getNode(this.lastStartNodeId);
    if (lastStartNode) {
      this.km += this.heuristic(this.lastStartNodeId, this.startNodeId);
    }

    this.startNodeId = newStartNodeId;
    this.ensureNode(newStartNodeId, newPosition);
  }

  /**
   * Extract path from goal to start
   */
  private extractPath(): WorldPosition[] {
    if (!this.startNodeId || !this.goalNodeId) return [];

    const path: WorldPosition[] = [];
    let currentNodeId = this.startNodeId;
    const visited = new Set<string>();
    const maxPathLength = 1000; // Prevent infinite loops

    while (currentNodeId !== this.goalNodeId && path.length < maxPathLength) {
      if (visited.has(currentNodeId)) break; // Cycle detection
      visited.add(currentNodeId);

      const currentPosition = nodeIdToPosition(currentNodeId);
      if (!currentPosition) break;

      path.push(currentPosition);

      // Find best next node
      const neighbors = this.getNeighbors(currentNodeId);
      let bestNeighbor: string | null = null;
      let bestCost = Infinity;

      for (const { nodeId: neighborId, cost } of neighbors) {
        const neighbor = this.getNode(neighborId);
        if (!neighbor || neighbor.blocked) continue;

        const totalCost = neighbor.gValue + cost;
        if (totalCost < bestCost) {
          bestCost = totalCost;
          bestNeighbor = neighborId;
        }
      }

      if (!bestNeighbor || bestCost === Infinity) break;
      currentNodeId = bestNeighbor;
    }

    // Add goal if reached
    if (currentNodeId === this.goalNodeId) {
      const goalPosition = nodeIdToPosition(this.goalNodeId);
      if (goalPosition) {
        path.push(goalPosition);
      }
    }

    return path;
  }

  /**
   * Calculate heuristic distance between nodes
   */
  private heuristic(fromNodeId: string, toNodeId: string): number {
    const fromPos = nodeIdToPosition(fromNodeId);
    const toPos = nodeIdToPosition(toNodeId);

    if (!fromPos || !toPos) return Infinity;

    return (
      euclideanDistance(fromPos, toPos) * this.config.dstarLite.heuristicWeight
    );
  }

  /**
   * Determine movement action based on position change
   */
  private determineAction(
    from: WorldPosition,
    to: WorldPosition
  ): NavigationStep['action'] {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;

    // Vertical movement
    if (Math.abs(dy) > 0.5) {
      if (dy > 0) return 'jump'; // Moving up
      return 'move'; // Moving down
    }

    // Check for swimming (would need water block detection)
    // For now, default to move
    return 'move';
  }

  /**
   * Get current graph statistics
   */
  getStatistics(): {
    nodes: number;
    queueSize: number;
    km: number;
    hasPath: boolean;
  } {
    const startNode = this.startNodeId ? this.getNode(this.startNodeId) : null;

    return {
      nodes: this.graph.size,
      queueSize: this.priorityQueue.size(),
      km: this.km,
      hasPath: startNode ? startNode.gValue < Infinity : false,
    };
  }

  /**
   * Clear all algorithm state
   */
  clear(): void {
    this.graph.clear();
    this.priorityQueue = new PriorityQueue<string>();
    this.startNodeId = undefined;
    this.goalNodeId = undefined;
    this.lastStartNodeId = undefined;
    this.km = 0;
  }
}
