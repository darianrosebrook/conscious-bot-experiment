/**
 * Spatial navigator for pathfinding and navigation.
 *
 * Provides high-level navigation capabilities using the place graph
 * for efficient pathfinding and route planning.
 *
 * @author @darianrosebrook
 */

import { PlaceGraphCore } from './place-graph-core';
import {
  PlaceNode,
  PlaceEdge,
  Vector3,
  NavigationPath,
  PathFindingOptions,
  NavigationInstruction,
  Direction,
  EdgeType,
  SafetyLevel,
  PlaceFunction,
} from './types';

/**
 * Priority queue for A* pathfinding
 */
class PriorityQueue<T> {
  private items: Array<{ item: T; priority: number }> = [];

  enqueue(item: T, priority: number): void {
    this.items.push({ item, priority });
    this.items.sort((a, b) => a.priority - b.priority);
  }

  dequeue(): T | undefined {
    return this.items.shift()?.item;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  contains(item: T): boolean {
    return this.items.some(i => i.item === item);
  }

  updatePriority(item: T, priority: number): void {
    const index = this.items.findIndex(i => i.item === item);
    if (index !== -1) {
      this.items.splice(index, 1);
      this.enqueue(item, priority);
    }
  }
}

/**
 * Spatial navigator for pathfinding and navigation
 */
export class SpatialNavigator {
  private placeGraph: PlaceGraphCore;

  constructor(placeGraph: PlaceGraphCore) {
    this.placeGraph = placeGraph;
  }

  /**
   * Find path between two places using A* algorithm
   */
  findPath(options: PathFindingOptions): NavigationPath | null {
    const startPlace = this.placeGraph.getPlace(options.start);
    const goalPlace = this.placeGraph.getPlace(options.goal);

    if (!startPlace || !goalPlace) {
      return null;
    }

    // A* algorithm
    const openSet = new PriorityQueue<string>();
    const closedSet = new Set<string>();
    const cameFrom = new Map<string, { placeId: string; edgeId: string }>();
    const gScore = new Map<string, number>(); // Cost from start to node
    const fScore = new Map<string, number>(); // Estimated total cost

    // Initialize
    gScore.set(startPlace.id, 0);
    fScore.set(startPlace.id, this.estimateDistance(startPlace, goalPlace));
    openSet.enqueue(startPlace.id, fScore.get(startPlace.id)!);

    while (!openSet.isEmpty()) {
      const current = openSet.dequeue()!;

      // Goal reached
      if (current === goalPlace.id) {
        return this.reconstructPath(cameFrom, current, startPlace, goalPlace);
      }

      closedSet.add(current);

      // Get outgoing edges
      const outgoingEdges = this.placeGraph.getOutgoingEdges(current);
      
      // Add bidirectional incoming edges
      const incomingEdges = this.placeGraph.getIncomingEdges(current)
        .filter(edge => edge.bidirectional);
      
      const edges = [...outgoingEdges, ...incomingEdges];

      for (const edge of edges) {
        // Get neighbor (the other end of the edge)
        const neighbor = edge.source === current ? edge.target : edge.source;
        
        // Skip if in closed set
        if (closedSet.has(neighbor)) {
          continue;
        }

        // Skip if place is in avoid list
        if (options.avoidPlaces && options.avoidPlaces.includes(neighbor)) {
          continue;
        }

        // Skip if edge difficulty exceeds max
        if (options.maxDifficulty !== undefined && edge.difficulty > options.maxDifficulty) {
          continue;
        }

        // Calculate edge cost based on options
        const edgeCost = this.calculateEdgeCost(edge, options);
        
        // Calculate tentative g score
        const tentativeGScore = (gScore.get(current) || Infinity) + edgeCost;
        
        // Check if this path is better
        if (tentativeGScore < (gScore.get(neighbor) || Infinity)) {
          // Record this path
          cameFrom.set(neighbor, { placeId: current, edgeId: edge.id });
          gScore.set(neighbor, tentativeGScore);
          
          // Update f score
          const neighborPlace = this.placeGraph.getPlace(neighbor)!;
          const heuristic = this.estimateDistance(neighborPlace, goalPlace);
          fScore.set(neighbor, tentativeGScore + heuristic);
          
          // Add to open set if not already there
          if (!openSet.contains(neighbor)) {
            openSet.enqueue(neighbor, fScore.get(neighbor)!);
          } else {
            openSet.updatePriority(neighbor, fScore.get(neighbor)!);
          }
        }
      }
    }

    // No path found
    return null;
  }

  /**
   * Find nearest place of a specific function
   */
  findNearestPlaceByFunction(
    startPosition: Vector3,
    targetFunction: PlaceFunction,
    options: {
      maxDistance?: number;
      minSafety?: SafetyLevel;
    } = {}
  ): { place: PlaceNode; distance: number } | null {
    const maxDistance = options.maxDistance || 1000;
    let nearestPlace: PlaceNode | null = null;
    let nearestDistance = maxDistance;

    // Get places with the target function
    const places = this.placeGraph.getPlacesByFunction(targetFunction);

    // Filter by safety if needed
    const safetyValues = Object.values(SafetyLevel);
    const minSafetyIndex = options.minSafety ? 
      safetyValues.indexOf(options.minSafety) : 0;

    for (const place of places) {
      // Check safety
      if (options.minSafety) {
        const placeSafetyIndex = safetyValues.indexOf(place.safety);
        if (placeSafetyIndex < minSafetyIndex) {
          continue;
        }
      }

      // Calculate distance
      const distance = this.placeGraph.calculateDistance(startPosition, place.position);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestPlace = place;
      }
    }

    if (!nearestPlace) {
      return null;
    }

    return {
      place: nearestPlace,
      distance: nearestDistance,
    };
  }

  /**
   * Generate navigation instructions for a path
   */
  generateNavigationInstructions(path: NavigationPath): NavigationInstruction[] {
    const instructions: NavigationInstruction[] = [];
    
    // Need at least two places for instructions
    if (path.places.length < 2) {
      return instructions;
    }

    // Get place and edge objects
    const places: PlaceNode[] = [];
    const edges: PlaceEdge[] = [];
    
    for (const placeId of path.places) {
      const place = this.placeGraph.getPlace(placeId);
      if (place) {
        places.push(place);
      }
    }
    
    for (const edgeId of path.edges) {
      const edge = this.placeGraph.getEdge(edgeId);
      if (edge) {
        edges.push(edge);
      }
    }

    // Generate instructions for each segment
    for (let i = 0; i < places.length - 1; i++) {
      const currentPlace = places[i];
      const nextPlace = places[i + 1];
      const edge = edges[i];

      // Determine direction
      const direction = this.calculateDirection(currentPlace.position, nextPlace.position);
      
      // Create instruction based on edge type
      switch (edge.type) {
        case EdgeType.PATH:
        case EdgeType.ROAD:
          instructions.push({
            type: 'move',
            direction,
            distance: edge.distance,
            target: nextPlace.name,
            description: `Follow the ${edge.type} ${direction} for ${Math.round(edge.distance)} blocks to reach ${nextPlace.name}.`,
          });
          break;
        
        case EdgeType.TUNNEL:
          instructions.push({
            type: 'move',
            direction,
            target: nextPlace.name,
            description: `Enter the tunnel and follow it ${direction} for ${Math.round(edge.distance)} blocks to reach ${nextPlace.name}.`,
          });
          break;
        
        case EdgeType.BRIDGE:
          instructions.push({
            type: 'cross',
            direction,
            target: nextPlace.name,
            description: `Cross the bridge ${direction} for ${Math.round(edge.distance)} blocks to reach ${nextPlace.name}.`,
          });
          break;
        
        case EdgeType.DOOR:
          instructions.push({
            type: 'enter',
            target: nextPlace.name,
            description: `Go through the door to enter ${nextPlace.name}.`,
          });
          break;
        
        case EdgeType.PORTAL:
          instructions.push({
            type: 'enter',
            target: nextPlace.name,
            description: `Enter the portal to teleport to ${nextPlace.name}.`,
          });
          break;
        
        default:
          instructions.push({
            type: 'move',
            direction,
            distance: edge.distance,
            target: nextPlace.name,
            description: `Travel ${direction} for ${Math.round(edge.distance)} blocks to reach ${nextPlace.name}.`,
          });
      }

      // Add landmark-based instruction if available
      if (nextPlace.landmarks.length > 0) {
        const landmark = nextPlace.landmarks[0];
        instructions.push({
          type: 'move',
          landmark: landmark.name,
          target: nextPlace.name,
          description: `Look for ${landmark.name} to identify ${nextPlace.name}.`,
        });
      }
    }

    return instructions;
  }

  /**
   * Calculate edge cost based on options
   */
  private calculateEdgeCost(edge: PlaceEdge, options: PathFindingOptions): number {
    let cost = edge.distance;

    // Prioritize safety
    if (options.prioritizeSafety) {
      cost *= (1 + edge.difficulty * 2);
    }

    // Prioritize speed
    if (options.prioritizeSpeed) {
      cost = edge.travelTime;
    }

    // Prefer specified places
    if (options.preferPlaces) {
      const targetPlace = edge.target;
      if (options.preferPlaces.includes(targetPlace)) {
        cost *= 0.8; // 20% discount for preferred places
      }
    }

    return cost;
  }

  /**
   * Estimate distance between two places (heuristic for A*)
   */
  private estimateDistance(place1: PlaceNode, place2: PlaceNode): number {
    return this.placeGraph.calculateDistance(place1.position, place2.position);
  }

  /**
   * Reconstruct path from A* result
   */
  private reconstructPath(
    cameFrom: Map<string, { placeId: string; edgeId: string }>,
    current: string,
    startPlace: PlaceNode,
    goalPlace: PlaceNode
  ): NavigationPath {
    const places: string[] = [current];
    const edges: string[] = [];
    const waypoints: Vector3[] = [goalPlace.position];
    
    let totalDistance = 0;
    let estimatedTime = 0;
    let difficulty = 0;
    let safety = 1;
    let edgeCount = 0;

    while (cameFrom.has(current)) {
      const { placeId, edgeId } = cameFrom.get(current)!;
      places.unshift(placeId);
      edges.unshift(edgeId);
      
      const place = this.placeGraph.getPlace(placeId);
      if (place) {
        waypoints.unshift(place.position);
      }
      
      const edge = this.placeGraph.getEdge(edgeId);
      if (edge) {
        totalDistance += edge.distance;
        estimatedTime += edge.travelTime;
        difficulty += edge.difficulty;
        edgeCount++;
        
        // Add intermediate waypoints if available
        if (edge.waypoints.length > 0) {
          for (const waypoint of edge.waypoints) {
            waypoints.push(waypoint);
          }
        }
      }
      
      current = placeId;
    }
    
    // Calculate average difficulty
    difficulty = edgeCount > 0 ? difficulty / edgeCount : 0;
    
    // Calculate safety based on difficulty (inverse relationship)
    safety = Math.max(0, Math.min(1, 1 - (difficulty * 0.8)));

    // Generate navigation instructions
    const path: NavigationPath = {
      places,
      edges,
      totalDistance,
      estimatedTime,
      difficulty,
      safety,
      waypoints,
      instructions: [],
    };
    
    path.instructions = this.generateNavigationInstructions(path);

    return path;
  }

  /**
   * Calculate cardinal direction between two points
   */
  private calculateDirection(from: Vector3, to: Vector3): Direction {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const dy = to.y - from.y;
    
    // Check if vertical movement is dominant
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > Math.abs(dz)) {
      return dy > 0 ? Direction.UP : Direction.DOWN;
    }
    
    // Calculate angle in degrees (0° is North, 90° is East)
    const angle = Math.atan2(dx, -dz) * (180 / Math.PI);
    
    // Convert angle to cardinal/ordinal direction
    if (angle >= -22.5 && angle < 22.5) {
      return Direction.NORTH;
    } else if (angle >= 22.5 && angle < 67.5) {
      return Direction.NORTHEAST;
    } else if (angle >= 67.5 && angle < 112.5) {
      return Direction.EAST;
    } else if (angle >= 112.5 && angle < 157.5) {
      return Direction.SOUTHEAST;
    } else if (angle >= 157.5 || angle < -157.5) {
      return Direction.SOUTH;
    } else if (angle >= -157.5 && angle < -112.5) {
      return Direction.SOUTHWEST;
    } else if (angle >= -112.5 && angle < -67.5) {
      return Direction.WEST;
    } else {
      return Direction.NORTHWEST;
    }
  }

  /**
   * Record path traversal in the graph
   */
  recordPathTraversal(path: NavigationPath): void {
    for (const edgeId of path.edges) {
      this.placeGraph.recordTraversal(edgeId);
    }
    
    for (const placeId of path.places) {
      this.placeGraph.recordVisit(placeId);
    }
  }
}
