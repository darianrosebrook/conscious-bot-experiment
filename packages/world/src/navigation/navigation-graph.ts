/**
 * Navigation Graph - Spatial graph representation for Minecraft world
 *
 * Represents walkable space in a 3D block-based environment with efficient
 * neighbor queries and dynamic updates for real-time pathfinding.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import {
  INavigationGraph,
  GraphNode,
  WorldPosition,
  BlockChange,
  CostContext,
  NavigationConfig,
  positionToNodeId,
  nodeIdToPosition,
  euclideanDistance,
  manhattanDistance,
  areAdjacent,
  isValidPosition,
} from './types';

export interface NavigationGraphEvents {
  'graph-built': [{ nodes: number; edges: number; time: number }];
  'graph-updated': [{ changedNodes: number; time: number }];
  'node-added': [{ nodeId: string; position: WorldPosition }];
  'node-removed': [{ nodeId: string; reason: string }];
  'edge-updated': [{ from: string; to: string; newCost: number }];
}

/**
 * Spatial bounds for graph regions
 */
interface GraphBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

/**
 * Efficient spatial graph for 3D navigation
 */
export class NavigationGraph
  extends EventEmitter<NavigationGraphEvents>
  implements INavigationGraph
{
  private nodes = new Map<string, GraphNode>();
  private spatialIndex = new Map<string, Set<string>>(); // Spatial grid -> node IDs
  private edgeCache = new Map<string, number>(); // Edge cost cache
  private bounds?: GraphBounds;
  private resolution: number = 1; // Blocks per node
  private gridSize: number = 16; // Spatial index grid size

  constructor(private config: NavigationConfig) {
    super();
  }

  /**
   * Build navigation graph from world state
   */
  buildGraph(
    worldRegion: {
      bounds: GraphBounds;
      isWalkable: (pos: WorldPosition) => boolean;
      getBlockType: (pos: WorldPosition) => string;
      isHazardous: (pos: WorldPosition) => boolean;
    },
    resolution: number = 1
  ): { success: boolean; nodes: number } {
    const startTime = Date.now();
    this.resolution = resolution;
    this.bounds = worldRegion.bounds;

    // Clear existing graph
    this.clear();

    let nodesCreated = 0;
    let edgesCreated = 0;

    // Create nodes for walkable positions
    for (
      let x = worldRegion.bounds.minX;
      x <= worldRegion.bounds.maxX;
      x += resolution
    ) {
      for (
        let z = worldRegion.bounds.minZ;
        z <= worldRegion.bounds.maxZ;
        z += resolution
      ) {
        for (
          let y = worldRegion.bounds.minY;
          y <= worldRegion.bounds.maxY;
          y += resolution
        ) {
          const position: WorldPosition = { x, y, z };

          if (worldRegion.isWalkable(position)) {
            const nodeId = positionToNodeId(position);
            const node: GraphNode = {
              id: nodeId,
              position,
              walkable: true,
              cost: this.calculateBaseCost(position, worldRegion),
              gValue: Infinity,
              rhsValue: Infinity,
              neighbors: [],
              blocked: false,
              hazardLevel: worldRegion.isHazardous(position) ? 0.5 : 0,
              lastUpdated: Date.now(),
            };

            this.addNode(node);
            nodesCreated++;
          }
        }
      }
    }

    // Build edges between adjacent nodes
    for (const node of this.nodes.values()) {
      const neighbors = this.findAdjacentNodes(node.position);
      node.neighbors = neighbors.map((n) => n.nodeId);
      edgesCreated += neighbors.length;
    }

    const buildTime = Date.now() - startTime;
    this.emit('graph-built', {
      nodes: nodesCreated,
      edges: edgesCreated,
      time: buildTime,
    });

    return { success: true, nodes: nodesCreated };
  }

  /**
   * Update graph when blocks change in world
   */
  updateGraph(changes: BlockChange[]): {
    success: boolean;
    affectedNodes: string[];
  } {
    const startTime = Date.now();
    const affectedNodes: string[] = [];

    for (const change of changes) {
      const nodeId = positionToNodeId(change.position);
      let node = this.getNode(nodeId);

      if (change.walkable && !node) {
        // Create new walkable node
        node = {
          id: nodeId,
          position: change.position,
          walkable: true,
          cost: change.cost,
          gValue: Infinity,
          rhsValue: Infinity,
          neighbors: [],
          blocked: false,
          hazardLevel: change.hazardous ? 0.5 : 0,
          lastUpdated: Date.now(),
        };

        this.addNode(node);
        this.updateNodeNeighbors(nodeId);
        affectedNodes.push(nodeId);
      } else if (!change.walkable && node) {
        // Remove or block existing node
        if (this.config.caching.invalidateOnBlockChange) {
          this.removeNode(nodeId);
        } else {
          node.blocked = true;
          node.walkable = false;
        }
        affectedNodes.push(nodeId);
      } else if (node) {
        // Update existing node
        node.cost = change.cost;
        node.hazardLevel = change.hazardous ? 0.5 : 0;
        node.lastUpdated = Date.now();
        this.clearEdgeCache(nodeId);
        affectedNodes.push(nodeId);
      }
    }

    const updateTime = Date.now() - startTime;
    this.emit('graph-updated', {
      changedNodes: affectedNodes.length,
      time: updateTime,
    });

    return { success: true, affectedNodes };
  }

  /**
   * Get neighboring nodes for pathfinding expansion
   */
  getNeighbors(nodeId: string): { nodeId: string; cost: number }[] {
    const node = this.getNode(nodeId);
    if (!node || node.blocked) return [];

    const neighbors: { nodeId: string; cost: number }[] = [];

    for (const neighborId of node.neighbors) {
      const neighbor = this.getNode(neighborId);
      if (!neighbor || neighbor.blocked) continue;

      const cost = this.getEdgeCost(nodeId, neighborId);
      neighbors.push({ nodeId: neighborId, cost });
    }

    return neighbors;
  }

  /**
   * Calculate movement cost between adjacent nodes
   */
  calculateEdgeCost(
    fromNodeId: string,
    toNodeId: string,
    context: CostContext
  ): number {
    const edgeKey = `${fromNodeId}->${toNodeId}`;

    // Check cache first
    if (this.edgeCache.has(edgeKey)) {
      return this.edgeCache.get(edgeKey)!;
    }

    const fromNode = this.getNode(fromNodeId);
    const toNode = this.getNode(toNodeId);

    if (!fromNode || !toNode || fromNode.blocked || toNode.blocked) {
      return Infinity;
    }

    let cost = this.config.costCalculation.baseMoveCost;

    // Distance-based cost
    const distance = euclideanDistance(fromNode.position, toNode.position);
    if (distance > 1.5) {
      // Diagonal movement
      cost *= this.config.costCalculation.diagonalMultiplier;
    }

    // Vertical movement penalty
    const verticalDiff = Math.abs(toNode.position.y - fromNode.position.y);
    if (verticalDiff > 0) {
      cost *= this.config.costCalculation.verticalMultiplier;
    }

    // Node-specific costs
    cost += toNode.cost;

    // Hazard penalties
    if (toNode.hazardLevel > 0) {
      cost *= 1 + toNode.hazardLevel * 10; // Scale hazard impact
    }

    // Context-based adjustments
    if (context) {
      cost = this.applyContextualCosts(cost, toNode.position, context);
    }

    // Cache the result
    this.edgeCache.set(edgeKey, cost);

    return cost;
  }

  /**
   * Project world position to nearest graph node
   */
  worldToGraph(
    worldPos: WorldPosition
  ): { nodeId: string; distance: number } | null {
    // Find the closest node by snapping to grid
    const snappedPos: WorldPosition = {
      x: Math.round(worldPos.x / this.resolution) * this.resolution,
      y: Math.round(worldPos.y / this.resolution) * this.resolution,
      z: Math.round(worldPos.z / this.resolution) * this.resolution,
    };

    const nodeId = positionToNodeId(snappedPos);
    const node = this.getNode(nodeId);

    if (node && !node.blocked) {
      const distance = euclideanDistance(worldPos, node.position);
      return { nodeId, distance };
    }

    // If snapped position doesn't have a valid node, search nearby
    return this.findNearestNode(worldPos);
  }

  /**
   * Convert graph path to world coordinates
   */
  graphToWorld(nodeId: string): WorldPosition | null {
    const node = this.getNode(nodeId);
    return node ? { ...node.position } : null;
  }

  /**
   * Get specific graph node
   */
  getNode(nodeId: string): GraphNode | null {
    return this.nodes.get(nodeId) || null;
  }

  /**
   * Get all graph nodes
   */
  getAllNodes(): GraphNode[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Clear entire graph
   */
  clear(): void {
    this.nodes.clear();
    this.spatialIndex.clear();
    this.edgeCache.clear();
    this.bounds = undefined;
  }

  /**
   * Get graph statistics
   */
  getStatistics(): {
    nodes: number;
    edges: number;
    spatialGrids: number;
    cacheSize: number;
    memoryUsage: number;
  } {
    let totalEdges = 0;
    for (const node of this.nodes.values()) {
      totalEdges += node.neighbors.length;
    }

    return {
      nodes: this.nodes.size,
      edges: totalEdges,
      spatialGrids: this.spatialIndex.size,
      cacheSize: this.edgeCache.size,
      memoryUsage: this.estimateMemoryUsage(),
    };
  }

  // ===== PRIVATE METHODS =====

  private addNode(node: GraphNode): void {
    this.nodes.set(node.id, node);
    this.addToSpatialIndex(node);
    this.emit('node-added', { nodeId: node.id, position: node.position });
  }

  private removeNode(nodeId: string): void {
    const node = this.getNode(nodeId);
    if (!node) return;

    // Remove from neighbors' neighbor lists
    for (const neighborId of node.neighbors) {
      const neighbor = this.getNode(neighborId);
      if (neighbor) {
        const index = neighbor.neighbors.indexOf(nodeId);
        if (index !== -1) {
          neighbor.neighbors.splice(index, 1);
        }
      }
    }

    // Remove from spatial index
    this.removeFromSpatialIndex(node);

    // Clear edge cache for this node
    this.clearEdgeCache(nodeId);

    // Remove from nodes map
    this.nodes.delete(nodeId);

    this.emit('node-removed', { nodeId, reason: 'blocked' });
  }

  private addToSpatialIndex(node: GraphNode): void {
    const gridKey = this.getSpatialGridKey(node.position);

    if (!this.spatialIndex.has(gridKey)) {
      this.spatialIndex.set(gridKey, new Set());
    }

    this.spatialIndex.get(gridKey)!.add(node.id);
  }

  private removeFromSpatialIndex(node: GraphNode): void {
    const gridKey = this.getSpatialGridKey(node.position);
    const gridNodes = this.spatialIndex.get(gridKey);

    if (gridNodes) {
      gridNodes.delete(node.id);
      if (gridNodes.size === 0) {
        this.spatialIndex.delete(gridKey);
      }
    }
  }

  private getSpatialGridKey(position: WorldPosition): string {
    const gridX = Math.floor(position.x / this.gridSize);
    const gridY = Math.floor(position.y / this.gridSize);
    const gridZ = Math.floor(position.z / this.gridSize);
    return `${gridX},${gridY},${gridZ}`;
  }

  private findAdjacentNodes(
    position: WorldPosition
  ): { nodeId: string; cost: number }[] {
    const neighbors: { nodeId: string; cost: number }[] = [];

    // Check 26 neighboring positions (3x3x3 cube minus center)
    for (
      let dx = -this.resolution;
      dx <= this.resolution;
      dx += this.resolution
    ) {
      for (
        let dy = -this.resolution;
        dy <= this.resolution;
        dy += this.resolution
      ) {
        for (
          let dz = -this.resolution;
          dz <= this.resolution;
          dz += this.resolution
        ) {
          if (dx === 0 && dy === 0 && dz === 0) continue; // Skip center

          const neighborPos: WorldPosition = {
            x: position.x + dx,
            y: position.y + dy,
            z: position.z + dz,
          };

          // Check bounds
          if (!this.isInBounds(neighborPos)) continue;

          const neighborId = positionToNodeId(neighborPos);
          const neighbor = this.getNode(neighborId);

          if (neighbor && !neighbor.blocked) {
            const cost = this.getEdgeCost(
              positionToNodeId(position),
              neighborId
            );
            neighbors.push({ nodeId: neighborId, cost });
          }
        }
      }
    }

    return neighbors;
  }

  private updateNodeNeighbors(nodeId: string): void {
    const node = this.getNode(nodeId);
    if (!node) return;

    // Update this node's neighbors
    const neighbors = this.findAdjacentNodes(node.position);
    node.neighbors = neighbors.map((n) => n.nodeId);

    // Update neighbors to include this node
    for (const { nodeId: neighborId } of neighbors) {
      const neighbor = this.getNode(neighborId);
      if (neighbor && !neighbor.neighbors.includes(nodeId)) {
        neighbor.neighbors.push(nodeId);
      }
    }
  }

  private getEdgeCost(fromNodeId: string, toNodeId: string): number {
    const edgeKey = `${fromNodeId}->${toNodeId}`;

    if (this.edgeCache.has(edgeKey)) {
      return this.edgeCache.get(edgeKey)!;
    }

    // Calculate basic cost
    const fromNode = this.getNode(fromNodeId);
    const toNode = this.getNode(toNodeId);

    if (!fromNode || !toNode) return Infinity;

    let cost = this.config.costCalculation.baseMoveCost;

    // Distance-based cost
    const distance = euclideanDistance(fromNode.position, toNode.position);
    if (distance > 1.5) {
      cost *= this.config.costCalculation.diagonalMultiplier;
    }

    // Vertical movement
    const verticalDiff = Math.abs(toNode.position.y - fromNode.position.y);
    if (verticalDiff > 0) {
      cost *= this.config.costCalculation.verticalMultiplier;
    }

    // Node cost
    cost += toNode.cost;

    this.edgeCache.set(edgeKey, cost);
    return cost;
  }

  private findNearestNode(
    worldPos: WorldPosition
  ): { nodeId: string; distance: number } | null {
    let nearestNode: string | null = null;
    let nearestDistance = Infinity;

    // Search in expanding radius
    const maxSearchRadius = 5;

    for (let radius = 1; radius <= maxSearchRadius; radius++) {
      const gridKeys = this.getSpatialGridsInRadius(worldPos, radius);

      for (const gridKey of gridKeys) {
        const gridNodes = this.spatialIndex.get(gridKey);
        if (!gridNodes) continue;

        for (const nodeId of gridNodes) {
          const node = this.getNode(nodeId);
          if (!node || node.blocked) continue;

          const distance = euclideanDistance(worldPos, node.position);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestNode = nodeId;
          }
        }
      }

      if (nearestNode) break; // Found a node, stop searching
    }

    return nearestNode
      ? { nodeId: nearestNode, distance: nearestDistance }
      : null;
  }

  private getSpatialGridsInRadius(
    center: WorldPosition,
    radius: number
  ): string[] {
    const grids: string[] = [];
    const centerGridX = Math.floor(center.x / this.gridSize);
    const centerGridY = Math.floor(center.y / this.gridSize);
    const centerGridZ = Math.floor(center.z / this.gridSize);

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dz = -radius; dz <= radius; dz++) {
          const gridKey = `${centerGridX + dx},${centerGridY + dy},${centerGridZ + dz}`;
          grids.push(gridKey);
        }
      }
    }

    return grids;
  }

  private clearEdgeCache(nodeId: string): void {
    const keysToDelete: string[] = [];

    for (const key of this.edgeCache.keys()) {
      if (key.startsWith(nodeId + '->') || key.endsWith('->' + nodeId)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.edgeCache.delete(key);
    }
  }

  private calculateBaseCost(
    position: WorldPosition,
    worldRegion: {
      getBlockType: (pos: WorldPosition) => string;
      isHazardous: (pos: WorldPosition) => boolean;
    }
  ): number {
    let cost = this.config.costCalculation.baseMoveCost;

    // Block type specific costs
    const blockType = worldRegion.getBlockType(position);
    switch (blockType) {
      case 'water':
        cost *= 2.0; // Swimming is slower
        break;
      case 'soul_sand':
        cost *= 2.5; // Slow block
        break;
      case 'honey_block':
        cost *= 4.0; // Very slow block
        break;
    }

    // Hazard penalty
    if (worldRegion.isHazardous(position)) {
      cost *= 5.0;
    }

    return cost;
  }

  private applyContextualCosts(
    baseCost: number,
    position: WorldPosition,
    context: CostContext
  ): number {
    let cost = baseCost;

    // Light level penalty
    if (context.lightLevel < 7) {
      cost *= 1 + (7 - context.lightLevel) * 0.1; // 10% per light level
    }

    // Mob proximity penalty
    for (const mobPos of context.mobPositions) {
      const distance = euclideanDistance(position, mobPos);
      if (distance < 5) {
        cost *= 1 + (5 - distance) * 0.2; // 20% per block closer
      }
    }

    // Hazard proximity penalty
    for (const hazard of context.hazards) {
      const distance = euclideanDistance(position, hazard.position);
      if (distance < hazard.radius) {
        cost *= hazard.costMultiplier;
      }
    }

    return cost;
  }

  private isInBounds(position: WorldPosition): boolean {
    if (!this.bounds) return true;
    return isValidPosition(position, this.bounds);
  }

  private estimateMemoryUsage(): number {
    // Rough estimation in bytes
    const nodeSize = 200; // Approximate size per node
    const edgeCacheSize = 16; // Approximate size per cached edge

    return (
      this.nodes.size * nodeSize +
      this.edgeCache.size * edgeCacheSize +
      this.spatialIndex.size * 50 // Spatial index overhead
    );
  }
}
