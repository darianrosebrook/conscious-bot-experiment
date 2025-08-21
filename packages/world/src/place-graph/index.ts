/**
 * Place Graph System
 * 
 * Provides spatial memory, navigation, and location-based memory organization.
 * 
 * @author @darianrosebrook
 */

export * from './types';
export * from './place-graph-core';
export * from './place-memory';
export * from './spatial-navigator';

import { PlaceGraphCore } from './place-graph-core';
import { PlaceMemory } from './place-memory';
import { SpatialNavigator } from './spatial-navigator';

/**
 * Create a complete place graph system
 */
export function createPlaceGraph() {
  const placeGraphCore = new PlaceGraphCore();
  const placeMemory = new PlaceMemory(placeGraphCore);
  const spatialNavigator = new SpatialNavigator(placeGraphCore);
  
  return {
    placeGraphCore,
    placeMemory,
    spatialNavigator,
  };
}
