/**
 * @conscious-bot/world - World sensing, navigation, and embodied interaction
 *
 * Exports all world-related components for embodied cognition including
 * visible-only sensing, spatial navigation, and sensorimotor integration.
 *
 * @author @darianrosebrook
 */

// Main sensing system
export { VisibleSensing } from './sensing/visible-sensing';
export { RaycastEngine } from './sensing/raycast-engine';
export { ObservedResourcesIndex } from './sensing/observed-resources-index';

// Advanced perception system
export { PerceptionIntegration } from './perception/perception-integration';
export { VisualFieldManager } from './perception/visual-field-manager';
export { ObjectRecognition } from './perception/object-recognition';
export { ConfidenceTracker } from './perception/confidence-tracker';

// Navigation system
export { NavigationSystem } from './navigation/navigation-system';
export { DStarLiteCore } from './navigation/dstar-lite-core';
export { NavigationGraph } from './navigation/navigation-graph';
export { DynamicCostCalculator } from './navigation/cost-calculator';

// Sensorimotor system
export { SensorimotorSystem } from './sensorimotor/sensorimotor-system';
export { MotorController } from './sensorimotor/motor-controller';
export { SensoryFeedbackProcessor } from './sensorimotor/sensory-feedback-processor';

// Place Graph system
export { PlaceGraphCore } from './place-graph/place-graph-core';
export { PlaceMemory } from './place-graph/place-memory';
export { SpatialNavigator } from './place-graph/spatial-navigator';
export { createPlaceGraph } from './place-graph';

// Types and interfaces  
export * from './types';
export * from './perception/types';
export * from './navigation/types';
// Export sensorimotor types without the normalize function to avoid conflict
export type * from './sensorimotor/types';
// Export place graph types with namespace to avoid conflicts
export { 
  PlaceType,
  BiomeCategory,
  PlaceFunction,
  SafetyLevel,
  EdgeType,
  PlaceNode,
  PlaceEdge,
  Landmark,
  Resource,
  PathFindingOptions,
  NavigationPath,
  NavigationInstruction,
  SpatialQuery as PlaceSpatialQuery,
  PlaceGraphConfig,
  PlaceDiscovery,
} from './place-graph/types';

// Version info
export const WORLD_VERSION = '0.1.0';
