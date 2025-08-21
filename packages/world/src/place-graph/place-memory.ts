/**
 * Place memory system.
 *
 * Manages the integration of spatial knowledge with episodic memory,
 * providing location-based memory organization and recall.
 *
 * @author @darianrosebrook
 */

import { PlaceGraphCore } from './place-graph-core';
import {
  PlaceNode,
  PlaceType,
  Vector3,
  BiomeCategory,
  PlaceFunction,
  SafetyLevel,
} from './types';

/**
 * Memory entry associated with a place
 */
export interface PlaceMemoryEntry {
  id: string;
  placeId: string;
  title: string;
  content: string;
  timestamp: number;
  importance: number; // 0-1
  emotionalValence: number; // -1 to 1
  tags: string[];
  associatedPlaces: string[];
  associatedEntities: string[];
}

/**
 * Memory recall options
 */
export interface MemoryRecallOptions {
  placeId?: string;
  position?: Vector3;
  radius?: number;
  tags?: string[];
  timeStart?: number;
  timeEnd?: number;
  minImportance?: number;
  limit?: number;
  sortBy?: 'time' | 'importance' | 'relevance';
}

/**
 * Place memory system for spatial memory organization
 */
export class PlaceMemory {
  private placeGraph: PlaceGraphCore;
  private memories: Map<string, PlaceMemoryEntry> = new Map();
  private memoriesByPlace: Map<string, Set<string>> = new Map(); // placeId -> memoryIds
  private memoriesByTag: Map<string, Set<string>> = new Map(); // tag -> memoryIds

  constructor(placeGraph: PlaceGraphCore) {
    this.placeGraph = placeGraph;
  }

  /**
   * Add a memory associated with a place
   */
  addMemory(
    placeId: string,
    options: {
      title: string;
      content: string;
      importance?: number;
      emotionalValence?: number;
      tags?: string[];
      associatedPlaces?: string[];
      associatedEntities?: string[];
      timestamp?: number;
    }
  ): PlaceMemoryEntry | null {
    // Verify place exists
    const place = this.placeGraph.getPlace(placeId);
    if (!place) {
      return null;
    }

    const now = Date.now();
    const id = `memory-${now}-${Math.random().toString(36).substring(2, 9)}`;
    
    const memory: PlaceMemoryEntry = {
      id,
      placeId,
      title: options.title,
      content: options.content,
      timestamp: options.timestamp || now,
      importance: options.importance !== undefined ? options.importance : 0.5,
      emotionalValence: options.emotionalValence !== undefined ? options.emotionalValence : 0,
      tags: options.tags || [],
      associatedPlaces: options.associatedPlaces || [],
      associatedEntities: options.associatedEntities || [],
    };

    // Store memory
    this.memories.set(id, memory);

    // Update indexes
    let placeMemories = this.memoriesByPlace.get(placeId);
    if (!placeMemories) {
      placeMemories = new Set<string>();
      this.memoriesByPlace.set(placeId, placeMemories);
    }
    placeMemories.add(id);

    // Update tag index
    for (const tag of memory.tags) {
      let tagMemories = this.memoriesByTag.get(tag);
      if (!tagMemories) {
        tagMemories = new Set<string>();
        this.memoriesByTag.set(tag, tagMemories);
      }
      tagMemories.add(id);
    }

    // Increase place memorability
    place.memorability = Math.min(1.0, place.memorability + (memory.importance * 0.2));

    return memory;
  }

  /**
   * Update an existing memory
   */
  updateMemory(memoryId: string, updates: Partial<PlaceMemoryEntry>): PlaceMemoryEntry | null {
    const memory = this.memories.get(memoryId);
    if (!memory) {
      return null;
    }

    // Handle tag updates (need to update indexes)
    if (updates.tags) {
      // Remove from old tags
      for (const tag of memory.tags) {
        this.memoriesByTag.get(tag)?.delete(memoryId);
      }
      
      // Add to new tags
      for (const tag of updates.tags) {
        let tagMemories = this.memoriesByTag.get(tag);
        if (!tagMemories) {
          tagMemories = new Set<string>();
          this.memoriesByTag.set(tag, tagMemories);
        }
        tagMemories.add(memoryId);
      }
    }

    // Handle place change
    if (updates.placeId && updates.placeId !== memory.placeId) {
      // Verify new place exists
      const newPlace = this.placeGraph.getPlace(updates.placeId);
      if (!newPlace) {
        return null;
      }

      // Remove from old place
      this.memoriesByPlace.get(memory.placeId)?.delete(memoryId);
      
      // Add to new place
      let placeMemories = this.memoriesByPlace.get(updates.placeId);
      if (!placeMemories) {
        placeMemories = new Set<string>();
        this.memoriesByPlace.set(updates.placeId, placeMemories);
      }
      placeMemories.add(memoryId);
    }

    // Update memory
    const updatedMemory = { ...memory, ...updates };
    this.memories.set(memoryId, updatedMemory);

    return updatedMemory;
  }

  /**
   * Remove a memory
   */
  removeMemory(memoryId: string): boolean {
    const memory = this.memories.get(memoryId);
    if (!memory) {
      return false;
    }

    // Remove from place index
    this.memoriesByPlace.get(memory.placeId)?.delete(memoryId);
    
    // Remove from tag indexes
    for (const tag of memory.tags) {
      this.memoriesByTag.get(tag)?.delete(memoryId);
    }

    // Remove memory
    this.memories.delete(memoryId);

    return true;
  }

  /**
   * Get a memory by ID
   */
  getMemory(memoryId: string): PlaceMemoryEntry | null {
    return this.memories.get(memoryId) || null;
  }

  /**
   * Get memories for a specific place
   */
  getMemoriesForPlace(
    placeId: string,
    options: {
      includeChildren?: boolean;
      includeParent?: boolean;
      tags?: string[];
      timeStart?: number;
      timeEnd?: number;
      minImportance?: number;
      limit?: number;
      sortBy?: 'time' | 'importance';
    } = {}
  ): PlaceMemoryEntry[] {
    const placeIds = new Set<string>([placeId]);
    
    // Include child places if requested
    if (options.includeChildren) {
      const childPlaces = this.placeGraph.getChildPlaces(placeId);
      for (const child of childPlaces) {
        placeIds.add(child.id);
      }
    }
    
    // Include parent place if requested
    if (options.includeParent) {
      const place = this.placeGraph.getPlace(placeId);
      if (place?.parent) {
        placeIds.add(place.parent);
      }
    }
    
    // Collect all memories for the places
    const memories: PlaceMemory[] = [];
    for (const pid of placeIds) {
      const placeMemories = this.memoriesByPlace.get(pid);
      if (placeMemories) {
        for (const memoryId of placeMemories) {
          const memory = this.memories.get(memoryId);
          if (memory) {
            // Apply filters
            if (options.tags && !options.tags.some(tag => memory.tags.includes(tag))) {
              continue;
            }
            
            if (options.timeStart !== undefined && memory.timestamp < options.timeStart) {
              continue;
            }
            
            if (options.timeEnd !== undefined && memory.timestamp > options.timeEnd) {
              continue;
            }
            
            if (options.minImportance !== undefined && memory.importance < options.minImportance) {
              continue;
            }
            
            memories.push(memory);
          }
        }
      }
    }
    
    // Sort memories
    if (options.sortBy === 'importance') {
      memories.sort((a, b) => b.importance - a.importance);
    } else {
      // Default to time (newest first)
      memories.sort((a, b) => b.timestamp - a.timestamp);
    }
    
    // Apply limit
    if (options.limit !== undefined && options.limit > 0) {
      return memories.slice(0, options.limit);
    }
    
    return memories;
  }

  /**
   * Get memories by tag
   */
  getMemoriesByTag(
    tags: string[],
    options: {
      timeStart?: number;
      timeEnd?: number;
      minImportance?: number;
      limit?: number;
      sortBy?: 'time' | 'importance';
    } = {}
  ): PlaceMemoryEntry[] {
    if (tags.length === 0) {
      return [];
    }
    
    // Find memories with all specified tags
    const memoryIds = new Set<string>();
    let isFirst = true;
    
    for (const tag of tags) {
      const tagMemories = this.memoriesByTag.get(tag);
      if (!tagMemories) {
        return []; // No memories with this tag
      }
      
      if (isFirst) {
        // Initialize with first tag's memories
        for (const id of tagMemories) {
          memoryIds.add(id);
        }
        isFirst = false;
      } else {
        // Intersect with subsequent tags
        const intersection = new Set<string>();
        for (const id of memoryIds) {
          if (tagMemories.has(id)) {
            intersection.add(id);
          }
        }
        memoryIds.clear();
        for (const id of intersection) {
          memoryIds.add(id);
        }
      }
    }
    
    // Collect and filter memories
    const memories: PlaceMemory[] = [];
    for (const id of memoryIds) {
      const memory = this.memories.get(id);
      if (memory) {
        // Apply filters
        if (options.timeStart !== undefined && memory.timestamp < options.timeStart) {
          continue;
        }
        
        if (options.timeEnd !== undefined && memory.timestamp > options.timeEnd) {
          continue;
        }
        
        if (options.minImportance !== undefined && memory.importance < options.minImportance) {
          continue;
        }
        
        memories.push(memory);
      }
    }
    
    // Sort memories
    if (options.sortBy === 'importance') {
      memories.sort((a, b) => b.importance - a.importance);
    } else {
      // Default to time (newest first)
      memories.sort((a, b) => b.timestamp - a.timestamp);
    }
    
    // Apply limit
    if (options.limit !== undefined && options.limit > 0) {
      return memories.slice(0, options.limit);
    }
    
    return memories;
  }

  /**
   * Recall memories based on location and other criteria
   */
  recallMemories(options: MemoryRecallOptions = {}): PlaceMemory[] {
    let placeIds: Set<string> = new Set();
    
    // Get memories by place ID
    if (options.placeId) {
      placeIds.add(options.placeId);
    }
    
    // Get memories by position
    if (options.position) {
      const place = this.placeGraph.getPlaceByPosition(options.position, options.radius || 50);
      if (place) {
        placeIds.add(place.id);
      }
    }
    
    // If no place specified, include all places
    if (placeIds.size === 0 && !options.tags) {
      for (const place of this.placeGraph.getAllPlaces()) {
        placeIds.add(place.id);
      }
    }
    
    // Collect memories from places
    const memories: PlaceMemory[] = [];
    
    // If we have place IDs, get memories for those places
    if (placeIds.size > 0) {
      for (const placeId of placeIds) {
        const placeMemories = this.memoriesByPlace.get(placeId);
        if (placeMemories) {
          for (const memoryId of placeMemories) {
            const memory = this.memories.get(memoryId);
            if (memory) {
              // Apply tag filter if specified
              if (options.tags && !options.tags.some(tag => memory.tags.includes(tag))) {
                continue;
              }
              
              // Apply time filters
              if (options.timeStart !== undefined && memory.timestamp < options.timeStart) {
                continue;
              }
              
              if (options.timeEnd !== undefined && memory.timestamp > options.timeEnd) {
                continue;
              }
              
              // Apply importance filter
              if (options.minImportance !== undefined && memory.importance < options.minImportance) {
                continue;
              }
              
              memories.push(memory);
            }
          }
        }
      }
    } 
    // If we only have tags, get memories by tag
    else if (options.tags) {
      const tagMemories = this.getMemoriesByTag(options.tags, {
        timeStart: options.timeStart,
        timeEnd: options.timeEnd,
        minImportance: options.minImportance,
      });
      
      memories.push(...tagMemories);
    }
    
    // Sort memories
    if (options.sortBy === 'importance') {
      memories.sort((a, b) => b.importance - a.importance);
    } else if (options.sortBy === 'relevance') {
      // For relevance, we combine recency and importance
      memories.sort((a, b) => {
        const recencyA = Math.max(0, 1 - ((Date.now() - a.timestamp) / (30 * 24 * 60 * 60 * 1000))); // 30 days max
        const recencyB = Math.max(0, 1 - ((Date.now() - b.timestamp) / (30 * 24 * 60 * 60 * 1000)));
        const scoreA = (a.importance * 0.7) + (recencyA * 0.3);
        const scoreB = (b.importance * 0.7) + (recencyB * 0.3);
        return scoreB - scoreA;
      });
    } else {
      // Default to time (newest first)
      memories.sort((a, b) => b.timestamp - a.timestamp);
    }
    
    // Apply limit
    if (options.limit !== undefined && options.limit > 0) {
      return memories.slice(0, options.limit);
    }
    
    return memories;
  }

  /**
   * Find nearest place with memories matching criteria
   */
  findNearestMemoryPlace(
    position: Vector3,
    options: {
      tags?: string[];
      minImportance?: number;
      maxDistance?: number;
    } = {}
  ): { place: PlaceNode; distance: number; memories: PlaceMemory[] } | null {
    const maxDistance = options.maxDistance || 1000;
    let nearestPlace: PlaceNode | null = null;
    let nearestDistance = maxDistance;
    let nearestMemories: PlaceMemory[] = [];

    // Check all places
    for (const place of this.placeGraph.getAllPlaces()) {
      // Calculate distance
      const distance = this.placeGraph.calculateDistance(position, place.position);
      if (distance > maxDistance) {
        continue;
      }

      // Get memories for this place
      const placeMemories = this.getMemoriesForPlace(place.id, {
        tags: options.tags,
        minImportance: options.minImportance,
      });

      // Skip if no matching memories
      if (placeMemories.length === 0) {
        continue;
      }

      // Check if this is the nearest place with memories
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestPlace = place;
        nearestMemories = placeMemories;
      }
    }

    if (!nearestPlace) {
      return null;
    }

    return {
      place: nearestPlace,
      distance: nearestDistance,
      memories: nearestMemories,
    };
  }

  /**
   * Generate a memory summary for a place
   */
  generatePlaceSummary(placeId: string): string {
    const place = this.placeGraph.getPlace(placeId);
    if (!place) {
      return "Place not found";
    }

    // Get memories for this place
    const memories = this.getMemoriesForPlace(placeId, {
      includeChildren: true,
      sortBy: 'importance',
    });

    // Get child places
    const childPlaces = this.placeGraph.getChildPlaces(placeId);

    // Build summary
    let summary = `${place.name} (${place.type}):\n`;
    summary += `${place.description}\n\n`;

    // Add biome and function
    summary += `Biome: ${place.biome}\n`;
    summary += `Function: ${place.function}\n`;
    summary += `Safety: ${place.safety}\n\n`;

    // Add landmarks
    if (place.landmarks.length > 0) {
      summary += "Notable landmarks:\n";
      for (const landmark of place.landmarks) {
        summary += `- ${landmark.name}: ${landmark.description}\n`;
      }
      summary += "\n";
    }

    // Add resources
    if (place.resources.length > 0) {
      summary += "Available resources:\n";
      for (const resource of place.resources) {
        summary += `- ${resource.type} (${resource.quantity}): ${resource.description}\n`;
      }
      summary += "\n";
    }

    // Add child places
    if (childPlaces.length > 0) {
      summary += "Contains:\n";
      for (const child of childPlaces) {
        summary += `- ${child.name} (${child.type}): ${child.description}\n`;
      }
      summary += "\n";
    }

    // Add key memories
    if (memories.length > 0) {
      summary += "Key memories:\n";
      const topMemories = memories.slice(0, 5);
      for (const memory of topMemories) {
        summary += `- ${memory.title}: ${memory.content.substring(0, 100)}${memory.content.length > 100 ? '...' : ''}\n`;
      }
    } else {
      summary += "No significant memories associated with this place.";
    }

    return summary;
  }

  /**
   * Get all memories
   */
  getAllMemories(): PlaceMemory[] {
    return Array.from(this.memories.values());
  }

  /**
   * Get statistics about place memories
   */
  getStats() {
    return {
      totalMemories: this.memories.size,
      memoriesByPlace: Array.from(this.memoriesByPlace.entries()).reduce(
        (acc, [placeId, memories]) => {
          acc[placeId] = memories.size;
          return acc;
        },
        {} as Record<string, number>
      ),
      topTags: Array.from(this.memoriesByTag.entries())
        .map(([tag, memories]) => ({ tag, count: memories.size }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      averageMemoriesPerPlace: this.memoriesByPlace.size > 0 ?
        this.memories.size / this.memoriesByPlace.size : 0,
    };
  }

  /**
   * Clear all memories
   */
  clear(): void {
    this.memories.clear();
    this.memoriesByPlace.clear();
    this.memoriesByTag.clear();
  }
}
