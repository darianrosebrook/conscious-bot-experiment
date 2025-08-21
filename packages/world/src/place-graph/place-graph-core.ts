/**
 * Core place graph implementation.
 *
 * Manages the graph structure of places, their connections, and hierarchical
 * relationships for spatial memory and navigation.
 *
 * @author @darianrosebrook
 */

import {
  PlaceNode,
  PlaceEdge,
  PlaceType,
  BiomeCategory,
  PlaceFunction,
  SafetyLevel,
  EdgeType,
  Vector3,
  Bounds,
  Landmark,
  Resource,
  PlaceGraphConfig,
  PlaceDiscovery,
  PlaceNodeSchema,
  PlaceEdgeSchema,
} from './types';

/**
 * Default configuration for place graph
 */
const DEFAULT_CONFIG: PlaceGraphConfig = {
  minPlaceDistance: 16, // Minimum blocks between places
  maxPlacesPerRegion: 50,
  maxPlacesPerArea: 20,
  maxPlacesTotal: 1000,
  autoCreatePlaces: true,
  autoConnectPlaces: true,
  autoUpdateOnVisit: true,
  memorabilityDecayRate: 0.05,
  importanceThreshold: 0.3,
  landmarkVisibilityThreshold: 0.5,
};

/**
 * Core place graph implementation
 */
export class PlaceGraphCore {
  private places: Map<string, PlaceNode> = new Map();
  private edges: Map<string, PlaceEdge> = new Map();
  private placesByPosition: Map<string, string> = new Map(); // posKey -> placeId
  private placesByType: Map<PlaceType, Set<string>> = new Map();
  private placesByBiome: Map<BiomeCategory, Set<string>> = new Map();
  private placesByFunction: Map<PlaceFunction, Set<string>> = new Map();
  private placesByParent: Map<string, Set<string>> = new Map(); // parentId -> childIds
  private config: PlaceGraphConfig;

  constructor(config: Partial<PlaceGraphConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initializeIndexes();
  }

  /**
   * Initialize index structures
   */
  private initializeIndexes(): void {
    // Initialize placesByType map
    Object.values(PlaceType).forEach(type => {
      this.placesByType.set(type as PlaceType, new Set<string>());
    });

    // Initialize placesByBiome map
    Object.values(BiomeCategory).forEach(biome => {
      this.placesByBiome.set(biome as BiomeCategory, new Set<string>());
    });

    // Initialize placesByFunction map
    Object.values(PlaceFunction).forEach(func => {
      this.placesByFunction.set(func as PlaceFunction, new Set<string>());
    });
  }

  /**
   * Add a new place to the graph
   */
  addPlace(place: Omit<PlaceNode, 'id'>): PlaceNode {
    // Generate ID if not provided
    const id = `place-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const newPlace: PlaceNode = {
      ...place,
      id,
      children: place.children || [],
    };

    // Validate place
    const validation = PlaceNodeSchema.safeParse(newPlace);
    if (!validation.success) {
      console.warn('Invalid place node:', validation.error);
      throw new Error(`Invalid place node: ${validation.error.message}`);
    }

    // Check for duplicate places
    const posKey = this.getPositionKey(newPlace.position);
    if (this.placesByPosition.has(posKey)) {
      throw new Error(`Place already exists at position ${posKey}`);
    }

    // Add to collections
    this.places.set(id, newPlace);
    this.placesByPosition.set(posKey, id);
    
    // Add to indexes
    this.placesByType.get(newPlace.type)?.add(id);
    this.placesByBiome.get(newPlace.biome)?.add(id);
    this.placesByFunction.get(newPlace.function)?.add(id);

    // Update parent-child relationship
    if (newPlace.parent) {
      const parentPlace = this.places.get(newPlace.parent);
      if (parentPlace) {
        if (!parentPlace.children.includes(id)) {
          parentPlace.children.push(id);
        }
        
        let parentSet = this.placesByParent.get(newPlace.parent);
        if (!parentSet) {
          parentSet = new Set<string>();
          this.placesByParent.set(newPlace.parent, parentSet);
        }
        parentSet.add(id);
      }
    }

    return newPlace;
  }

  /**
   * Update an existing place
   */
  updatePlace(placeId: string, updates: Partial<PlaceNode>): PlaceNode | null {
    const place = this.places.get(placeId);
    if (!place) {
      return null;
    }

    // Handle position update (need to update indexes)
    if (updates.position && 
        (updates.position.x !== place.position.x || 
         updates.position.y !== place.position.y || 
         updates.position.z !== place.position.z)) {
      // Remove from position index
      const oldPosKey = this.getPositionKey(place.position);
      this.placesByPosition.delete(oldPosKey);
      
      // Add to new position index
      const newPosKey = this.getPositionKey(updates.position);
      this.placesByPosition.set(newPosKey, placeId);
    }

    // Handle type update
    if (updates.type && updates.type !== place.type) {
      this.placesByType.get(place.type)?.delete(placeId);
      this.placesByType.get(updates.type)?.add(placeId);
    }

    // Handle biome update
    if (updates.biome && updates.biome !== place.biome) {
      this.placesByBiome.get(place.biome)?.delete(placeId);
      this.placesByBiome.get(updates.biome)?.add(placeId);
    }

    // Handle function update
    if (updates.function && updates.function !== place.function) {
      this.placesByFunction.get(place.function)?.delete(placeId);
      this.placesByFunction.get(updates.function)?.add(placeId);
    }

    // Handle parent update
    if (updates.parent !== undefined && updates.parent !== place.parent) {
      // Remove from old parent
      if (place.parent) {
        const oldParent = this.places.get(place.parent);
        if (oldParent) {
          oldParent.children = oldParent.children.filter(id => id !== placeId);
        }
        this.placesByParent.get(place.parent)?.delete(placeId);
      }
      
      // Add to new parent
      if (updates.parent) {
        const newParent = this.places.get(updates.parent);
        if (newParent && !newParent.children.includes(placeId)) {
          newParent.children.push(placeId);
        }
        
        let parentSet = this.placesByParent.get(updates.parent);
        if (!parentSet) {
          parentSet = new Set<string>();
          this.placesByParent.set(updates.parent, parentSet);
        }
        parentSet.add(placeId);
      }
    }

    // Update place
    const updatedPlace = { ...place, ...updates };
    this.places.set(placeId, updatedPlace);

    return updatedPlace;
  }

  /**
   * Remove a place from the graph
   */
  removePlace(placeId: string): boolean {
    const place = this.places.get(placeId);
    if (!place) {
      return false;
    }

    // Remove from indexes
    const posKey = this.getPositionKey(place.position);
    this.placesByPosition.delete(posKey);
    this.placesByType.get(place.type)?.delete(placeId);
    this.placesByBiome.get(place.biome)?.delete(placeId);
    this.placesByFunction.get(place.function)?.delete(placeId);

    // Update parent-child relationships
    if (place.parent) {
      const parentPlace = this.places.get(place.parent);
      if (parentPlace) {
        parentPlace.children = parentPlace.children.filter(id => id !== placeId);
      }
      this.placesByParent.get(place.parent)?.delete(placeId);
    }

    // Handle children
    for (const childId of place.children) {
      const childPlace = this.places.get(childId);
      if (childPlace) {
        childPlace.parent = place.parent; // Reparent to grandparent
        
        // Update parent's children list
        if (place.parent) {
          const parentPlace = this.places.get(place.parent);
          if (parentPlace && !parentPlace.children.includes(childId)) {
            parentPlace.children.push(childId);
          }
          
          // Update parent index
          this.placesByParent.get(place.parent)?.add(childId);
        }
      }
    }

    // Remove all edges connected to this place
    const edgesToRemove: string[] = [];
    for (const [edgeId, edge] of this.edges.entries()) {
      if (edge.source === placeId || edge.target === placeId) {
        edgesToRemove.push(edgeId);
      }
    }
    
    for (const edgeId of edgesToRemove) {
      this.edges.delete(edgeId);
    }

    // Remove the place
    this.places.delete(placeId);

    return true;
  }

  /**
   * Add an edge between places
   */
  addEdge(edge: Omit<PlaceEdge, 'id'>): PlaceEdge {
    // Generate ID if not provided
    const id = `edge-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const newEdge: PlaceEdge = {
      ...edge,
      id,
    };

    // Validate edge
    const validation = PlaceEdgeSchema.safeParse(newEdge);
    if (!validation.success) {
      console.warn('Invalid place edge:', validation.error);
      throw new Error(`Invalid place edge: ${validation.error.message}`);
    }

    // Verify places exist
    if (!this.places.has(newEdge.source)) {
      throw new Error(`Source place ${newEdge.source} does not exist`);
    }
    if (!this.places.has(newEdge.target)) {
      throw new Error(`Target place ${newEdge.target} does not exist`);
    }

    // Add edge
    this.edges.set(id, newEdge);

    return newEdge;
  }

  /**
   * Update an existing edge
   */
  updateEdge(edgeId: string, updates: Partial<PlaceEdge>): PlaceEdge | null {
    const edge = this.edges.get(edgeId);
    if (!edge) {
      return null;
    }

    // Update edge
    const updatedEdge = { ...edge, ...updates };
    this.edges.set(edgeId, updatedEdge);

    return updatedEdge;
  }

  /**
   * Remove an edge from the graph
   */
  removeEdge(edgeId: string): boolean {
    if (!this.edges.has(edgeId)) {
      return false;
    }

    this.edges.delete(edgeId);
    return true;
  }

  /**
   * Get a place by ID
   */
  getPlace(placeId: string): PlaceNode | null {
    return this.places.get(placeId) || null;
  }

  /**
   * Get an edge by ID
   */
  getEdge(edgeId: string): PlaceEdge | null {
    return this.edges.get(edgeId) || null;
  }

  /**
   * Get place by position (approximate)
   */
  getPlaceByPosition(position: Vector3, threshold: number = 10): PlaceNode | null {
    // Exact match first
    const posKey = this.getPositionKey(position);
    const exactMatchId = this.placesByPosition.get(posKey);
    if (exactMatchId) {
      return this.places.get(exactMatchId) || null;
    }

    // Approximate match within threshold
    let closestPlace: PlaceNode | null = null;
    let closestDistance = threshold;

    for (const place of this.places.values()) {
      const distance = this.calculateDistance(position, place.position);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestPlace = place;
      }
    }

    return closestPlace;
  }

  /**
   * Get places by type
   */
  getPlacesByType(type: PlaceType): PlaceNode[] {
    const placeIds = this.placesByType.get(type);
    if (!placeIds) {
      return [];
    }

    return Array.from(placeIds)
      .map(id => this.places.get(id))
      .filter((place): place is PlaceNode => !!place);
  }

  /**
   * Get places by biome
   */
  getPlacesByBiome(biome: BiomeCategory): PlaceNode[] {
    const placeIds = this.placesByBiome.get(biome);
    if (!placeIds) {
      return [];
    }

    return Array.from(placeIds)
      .map(id => this.places.get(id))
      .filter((place): place is PlaceNode => !!place);
  }

  /**
   * Get places by function
   */
  getPlacesByFunction(func: PlaceFunction): PlaceNode[] {
    const placeIds = this.placesByFunction.get(func);
    if (!placeIds) {
      return [];
    }

    return Array.from(placeIds)
      .map(id => this.places.get(id))
      .filter((place): place is PlaceNode => !!place);
  }

  /**
   * Get child places of a parent
   */
  getChildPlaces(parentId: string): PlaceNode[] {
    const childIds = this.placesByParent.get(parentId);
    if (!childIds) {
      return [];
    }

    return Array.from(childIds)
      .map(id => this.places.get(id))
      .filter((place): place is PlaceNode => !!place);
  }

  /**
   * Get all places in the graph
   */
  getAllPlaces(): PlaceNode[] {
    return Array.from(this.places.values());
  }

  /**
   * Get all edges in the graph
   */
  getAllEdges(): PlaceEdge[] {
    return Array.from(this.edges.values());
  }

  /**
   * Get edges connected to a place
   */
  getEdgesForPlace(placeId: string): PlaceEdge[] {
    return Array.from(this.edges.values())
      .filter(edge => edge.source === placeId || edge.target === placeId);
  }

  /**
   * Get outgoing edges from a place
   */
  getOutgoingEdges(placeId: string): PlaceEdge[] {
    return Array.from(this.edges.values())
      .filter(edge => edge.source === placeId);
  }

  /**
   * Get incoming edges to a place
   */
  getIncomingEdges(placeId: string): PlaceEdge[] {
    return Array.from(this.edges.values())
      .filter(edge => edge.target === placeId);
  }

  /**
   * Get edge between two places if it exists
   */
  getEdgeBetweenPlaces(sourceId: string, targetId: string): PlaceEdge | null {
    for (const edge of this.edges.values()) {
      if ((edge.source === sourceId && edge.target === targetId) ||
          (edge.bidirectional && edge.source === targetId && edge.target === sourceId)) {
        return edge;
      }
    }
    return null;
  }

  /**
   * Record a visit to a place
   */
  recordVisit(placeId: string): boolean {
    const place = this.places.get(placeId);
    if (!place) {
      return false;
    }

    const now = Date.now();
    place.lastVisit = now;
    place.visitCount += 1;

    // Increase memorability based on visit
    place.memorability = Math.min(1.0, place.memorability + 0.1);

    return true;
  }

  /**
   * Record traversal of an edge
   */
  recordTraversal(edgeId: string): boolean {
    const edge = this.edges.get(edgeId);
    if (!edge) {
      return false;
    }

    const now = Date.now();
    edge.lastTraversed = now;
    edge.traversalCount += 1;

    // Reduce difficulty slightly as path becomes more familiar
    edge.difficulty = Math.max(0.1, edge.difficulty * 0.95);

    return true;
  }

  /**
   * Discover a new place or update existing one
   */
  discoverPlace(
    position: Vector3,
    options: {
      name?: string;
      type?: PlaceType;
      biome?: BiomeCategory;
      function?: PlaceFunction;
      safety?: SafetyLevel;
      landmarks?: Landmark[];
      resources?: Resource[];
      tags?: string[];
      description?: string;
      parent?: string;
    } = {}
  ): PlaceDiscovery {
    // Check if place already exists nearby
    const existingPlace = this.getPlaceByPosition(position, this.config.minPlaceDistance);
    let place: PlaceNode;
    let isNew = false;

    if (existingPlace) {
      // Update existing place
      place = this.updatePlace(existingPlace.id, {
        ...options,
        lastVisit: Date.now(),
        visitCount: existingPlace.visitCount + 1,
      }) as PlaceNode;
    } else {
      // Create new place
      const now = Date.now();
      place = this.addPlace({
        name: options.name || `Place at ${Math.round(position.x)},${Math.round(position.y)},${Math.round(position.z)}`,
        type: options.type || PlaceType.LOCATION,
        position,
        biome: options.biome || BiomeCategory.PLAINS,
        function: options.function || PlaceFunction.UNKNOWN,
        safety: options.safety || SafetyLevel.UNKNOWN,
        landmarks: options.landmarks || [],
        resources: options.resources || [],
        tags: options.tags || [],
        description: options.description || '',
        firstVisit: now,
        lastVisit: now,
        visitCount: 1,
        parent: options.parent,
        children: [],
        importance: 0.5, // Default importance
        memorability: 0.7, // New places are memorable
        accessibility: 0.5, // Default accessibility
      });
      isNew = true;

      // Auto-connect to nearby places
      if (this.config.autoConnectPlaces) {
        this.connectToNearbyPlaces(place.id);
      }
    }

    // Find similar places
    const similarPlaces = this.findSimilarPlaces(place.id);

    // Get parent place
    const parentPlace = place.parent ? this.getPlace(place.parent) : null;

    // Get child places
    const childPlaces = this.getChildPlaces(place.id);

    // Get nearby landmarks
    const nearbyLandmarks = place.landmarks;

    // Get connecting edges
    const connectingEdges = this.getEdgesForPlace(place.id);

    return {
      place,
      isNew,
      similarPlaces: similarPlaces.map(p => p.id),
      parentPlace: parentPlace?.id,
      childPlaces: childPlaces.map(p => p.id),
      nearbyLandmarks,
      connectingEdges,
    };
  }

  /**
   * Connect a place to nearby places
   */
  connectToNearbyPlaces(placeId: string, maxDistance: number = 100): PlaceEdge[] {
    const place = this.places.get(placeId);
    if (!place) {
      return [];
    }

    const newEdges: PlaceEdge[] = [];
    const now = Date.now();

    // Find nearby places
    for (const otherPlace of this.places.values()) {
      // Skip self
      if (otherPlace.id === placeId) {
        continue;
      }

      // Skip if already connected
      if (this.getEdgeBetweenPlaces(placeId, otherPlace.id)) {
        continue;
      }

      // Check distance
      const distance = this.calculateDistance(place.position, otherPlace.position);
      if (distance <= maxDistance) {
        // Create edge
        const edge = this.addEdge({
          source: placeId,
          target: otherPlace.id,
          type: EdgeType.PATH,
          distance,
          travelTime: distance / 5, // Assume 5 blocks per second
          difficulty: 0.3, // Default difficulty
          bidirectional: true,
          description: `Path from ${place.name} to ${otherPlace.name}`,
          lastTraversed: now,
          traversalCount: 0,
          waypoints: [place.position, otherPlace.position],
        });

        newEdges.push(edge);
      }
    }

    return newEdges;
  }

  /**
   * Find similar places to the given place
   */
  findSimilarPlaces(placeId: string, limit: number = 5): PlaceNode[] {
    const place = this.places.get(placeId);
    if (!place) {
      return [];
    }

    // Score all places by similarity
    const scoredPlaces: Array<{ place: PlaceNode; score: number }> = [];

    for (const otherPlace of this.places.values()) {
      // Skip self
      if (otherPlace.id === placeId) {
        continue;
      }

      let score = 0;

      // Same type
      if (otherPlace.type === place.type) {
        score += 0.3;
      }

      // Same biome
      if (otherPlace.biome === place.biome) {
        score += 0.2;
      }

      // Same function
      if (otherPlace.function === place.function) {
        score += 0.3;
      }

      // Similar resources
      const resourceOverlap = place.resources.filter(r1 => 
        otherPlace.resources.some(r2 => r1.type === r2.type)
      ).length;
      
      score += resourceOverlap * 0.1;

      // Tag overlap
      const tagOverlap = place.tags.filter(t => otherPlace.tags.includes(t)).length;
      score += tagOverlap * 0.05;

      // Distance penalty (further = less similar)
      const distance = this.calculateDistance(place.position, otherPlace.position);
      score -= Math.min(0.3, distance / 1000); // Max 0.3 penalty

      scoredPlaces.push({ place: otherPlace, score });
    }

    // Sort by score and take top N
    return scoredPlaces
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => item.place);
  }

  /**
   * Calculate Euclidean distance between two points
   */
  calculateDistance(pos1: Vector3, pos2: Vector3): number {
    const dx = pos2.x - pos1.x;
    const dy = pos2.y - pos1.y;
    const dz = pos2.z - pos1.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Get string key for position (for indexing)
   */
  private getPositionKey(position: Vector3): string {
    // Round to nearest block for indexing
    const x = Math.round(position.x);
    const y = Math.round(position.y);
    const z = Math.round(position.z);
    return `${x},${y},${z}`;
  }

  /**
   * Check if a point is within bounds
   */
  isPointInBounds(point: Vector3, bounds: Bounds): boolean {
    return (
      point.x >= bounds.min.x && point.x <= bounds.max.x &&
      point.y >= bounds.min.y && point.y <= bounds.max.y &&
      point.z >= bounds.min.z && point.z <= bounds.max.z
    );
  }

  /**
   * Get statistics about the place graph
   */
  getStats() {
    return {
      totalPlaces: this.places.size,
      totalEdges: this.edges.size,
      placesByType: Object.values(PlaceType).reduce(
        (acc, type) => {
          acc[type] = this.placesByType.get(type as PlaceType)?.size || 0;
          return acc;
        },
        {} as Record<string, number>
      ),
      placesByBiome: Object.values(BiomeCategory).reduce(
        (acc, biome) => {
          acc[biome] = this.placesByBiome.get(biome as BiomeCategory)?.size || 0;
          return acc;
        },
        {} as Record<string, number>
      ),
      placesByFunction: Object.values(PlaceFunction).reduce(
        (acc, func) => {
          acc[func] = this.placesByFunction.get(func as PlaceFunction)?.size || 0;
          return acc;
        },
        {} as Record<string, number>
      ),
      edgesByType: Object.values(EdgeType).reduce(
        (acc, type) => {
          acc[type] = Array.from(this.edges.values()).filter(e => e.type === type).length;
          return acc;
        },
        {} as Record<string, number>
      ),
      averageEdgesPerPlace: this.places.size > 0 ? 
        this.edges.size / this.places.size : 0,
    };
  }

  /**
   * Clear the entire place graph
   */
  clear(): void {
    this.places.clear();
    this.edges.clear();
    this.placesByPosition.clear();
    
    // Clear indexes
    for (const placeSet of this.placesByType.values()) {
      placeSet.clear();
    }
    
    for (const placeSet of this.placesByBiome.values()) {
      placeSet.clear();
    }
    
    for (const placeSet of this.placesByFunction.values()) {
      placeSet.clear();
    }
    
    this.placesByParent.clear();
  }
}
