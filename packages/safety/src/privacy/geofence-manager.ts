/**
 * Geofence Manager - Location-based Privacy and Access Controls
 *
 * Implements geofenced areas with special privacy and access rules
 * @author @darianrosebrook
 */

import { EventEmitter } from 'eventemitter3';
import {
  Geofence,
  Location,
  AccessPermission,
  validateGeofence,
  validateLocation,
  validateAccessPermission,
} from './types';

/**
 * Geofence Registry for managing spatial boundaries
 */
class GeofenceRegistry {
  private geofences: Map<string, Geofence>;
  private spatialIndex: Map<string, string[]>; // Simple spatial indexing by chunk

  constructor() {
    this.geofences = new Map();
    this.spatialIndex = new Map();
  }

  /**
   * Register a new geofenced area
   */
  registerGeofence(geofence: Geofence): void {
    const validatedGeofence = validateGeofence(geofence);
    this.geofences.set(validatedGeofence.geofenceId, validatedGeofence);
    this.indexGeofence(validatedGeofence);
  }

  /**
   * Remove a geofenced area
   */
  removeGeofence(geofenceId: string): boolean {
    const geofence = this.geofences.get(geofenceId);
    if (geofence) {
      this.removeFromIndex(geofence);
      return this.geofences.delete(geofenceId);
    }
    return false;
  }

  /**
   * Find all geofences that contain a given location
   */
  findContainingGeofences(location: Location): Geofence[] {
    const validatedLocation = validateLocation(location);
    const chunkKey = this.getChunkKey(validatedLocation);
    const candidateGeofenceIds = this.spatialIndex.get(chunkKey) || [];

    const containingGeofences: Geofence[] = [];

    for (const geofenceId of candidateGeofenceIds) {
      const geofence = this.geofences.get(geofenceId);
      if (geofence && this.locationInGeofence(validatedLocation, geofence)) {
        containingGeofences.push(geofence);
      }
    }

    // Also check adjacent chunks for edge cases
    const adjacentChunks = this.getAdjacentChunks(chunkKey);
    for (const adjacentChunk of adjacentChunks) {
      const adjacentGeofenceIds = this.spatialIndex.get(adjacentChunk) || [];
      for (const geofenceId of adjacentGeofenceIds) {
        const geofence = this.geofences.get(geofenceId);
        if (
          geofence &&
          this.locationInGeofence(validatedLocation, geofence) &&
          !containingGeofences.some((g) => g.geofenceId === geofenceId)
        ) {
          containingGeofences.push(geofence);
        }
      }
    }

    return containingGeofences;
  }

  /**
   * Get all registered geofences
   */
  getAllGeofences(): Geofence[] {
    return Array.from(this.geofences.values());
  }

  /**
   * Get geofence by ID
   */
  getGeofence(geofenceId: string): Geofence | undefined {
    return this.geofences.get(geofenceId);
  }

  private locationInGeofence(location: Location, geofence: Geofence): boolean {
    const { coordinates } = geofence;
    return (
      location.x >= coordinates.minX &&
      location.x <= coordinates.maxX &&
      location.y >= coordinates.minY &&
      location.y <= coordinates.maxY &&
      location.z >= coordinates.minZ &&
      location.z <= coordinates.maxZ
    );
  }

  private indexGeofence(geofence: Geofence): void {
    const chunks = this.getGeofenceChunks(geofence);
    for (const chunk of chunks) {
      if (!this.spatialIndex.has(chunk)) {
        this.spatialIndex.set(chunk, []);
      }
      this.spatialIndex.get(chunk)!.push(geofence.geofenceId);
    }
  }

  private removeFromIndex(geofence: Geofence): void {
    const chunks = this.getGeofenceChunks(geofence);
    for (const chunk of chunks) {
      const geofenceIds = this.spatialIndex.get(chunk);
      if (geofenceIds) {
        const index = geofenceIds.indexOf(geofence.geofenceId);
        if (index > -1) {
          geofenceIds.splice(index, 1);
        }
        if (geofenceIds.length === 0) {
          this.spatialIndex.delete(chunk);
        }
      }
    }
  }

  private getGeofenceChunks(geofence: Geofence): string[] {
    const chunks: string[] = [];
    const chunkSize = 16; // Minecraft chunk size

    const startChunkX = Math.floor(geofence.coordinates.minX / chunkSize);
    const endChunkX = Math.floor(geofence.coordinates.maxX / chunkSize);
    const startChunkZ = Math.floor(geofence.coordinates.minZ / chunkSize);
    const endChunkZ = Math.floor(geofence.coordinates.maxZ / chunkSize);

    for (let x = startChunkX; x <= endChunkX; x++) {
      for (let z = startChunkZ; z <= endChunkZ; z++) {
        chunks.push(`${x},${z}`);
      }
    }

    return chunks;
  }

  private getChunkKey(location: Location): string {
    const chunkSize = 16;
    const chunkX = Math.floor(location.x / chunkSize);
    const chunkZ = Math.floor(location.z / chunkSize);
    return `${chunkX},${chunkZ}`;
  }

  private getAdjacentChunks(chunkKey: string): string[] {
    const [x, z] = chunkKey.split(',').map(Number);
    return [
      `${x - 1},${z - 1}`,
      `${x},${z - 1}`,
      `${x + 1},${z - 1}`,
      `${x - 1},${z}`,
      `${x + 1},${z}`,
      `${x - 1},${z + 1}`,
      `${x},${z + 1}`,
      `${x + 1},${z + 1}`,
    ];
  }
}

/**
 * Access policy evaluator for geofenced areas
 */
class GeofenceAccessPolicies {
  /**
   * Evaluate access permission for specific action at location
   */
  evaluateAccess(
    geofences: Geofence[],
    action: string,
    actor: string,
    location: Location
  ): AccessPermission {
    if (geofences.length === 0) {
      return {
        allowed: true,
        restrictions: [],
        reason: 'No geofence restrictions apply',
        privacyRequirements: [],
      };
    }

    // Process geofences by priority (most restrictive first)
    const sortedGeofences = this.sortGeofencesByPriority(geofences);

    for (const geofence of sortedGeofences) {
      const permission = this.evaluateGeofenceAccess(
        geofence,
        action,
        actor,
        location
      );
      if (!permission.allowed) {
        return permission;
      }
    }

    // All geofences allow the action, but may have privacy requirements
    const allPrivacyRequirements = geofences.flatMap((g) =>
      this.getPrivacyRequirements(g, action)
    );

    return {
      allowed: true,
      restrictions: [],
      reason: 'Action permitted with privacy requirements',
      privacyRequirements: [...new Set(allPrivacyRequirements)],
    };
  }

  private evaluateGeofenceAccess(
    geofence: Geofence,
    action: string,
    actor: string,
    location: Location
  ): AccessPermission {
    const { permissions } = geofence;

    // Check ownership-based permissions
    if (geofence.owner && geofence.owner !== actor) {
      if (permissions.entry === 'owner_only') {
        return {
          allowed: false,
          restrictions: ['owner_only_access'],
          reason: `Access restricted to owner: ${geofence.owner}`,
          privacyRequirements: [],
        };
      }
    }

    // Check action-specific permissions
    const actionPermissions = this.getActionPermissions(action, permissions);
    if (actionPermissions === 'prohibited') {
      return {
        allowed: false,
        restrictions: [`${action}_prohibited`],
        reason: `Action ${action} is prohibited in ${geofence.name}`,
        privacyRequirements: [],
      };
    }

    if (actionPermissions === 'limited') {
      return {
        allowed: true,
        restrictions: [`${action}_limited`],
        reason: `Action ${action} is limited in ${geofence.name}`,
        privacyRequirements: this.getPrivacyRequirements(geofence, action),
      };
    }

    return {
      allowed: true,
      restrictions: [],
      reason: `Action ${action} is allowed in ${geofence.name}`,
      privacyRequirements: this.getPrivacyRequirements(geofence, action),
    };
  }

  private getActionPermissions(
    action: string,
    permissions: Geofence['permissions']
  ): string {
    if (
      action.includes('build') ||
      action.includes('place') ||
      action.includes('break')
    ) {
      return permissions.building;
    }
    if (
      action.includes('mine') ||
      action.includes('extract') ||
      action.includes('harvest')
    ) {
      return permissions.resourceExtraction;
    }
    if (
      action.includes('observe') ||
      action.includes('scan') ||
      action.includes('look')
    ) {
      return permissions.observation;
    }
    if (action.includes('enter') || action.includes('move')) {
      return permissions.entry;
    }
    return 'allowed'; // Default to allowed for unknown actions
  }

  private getPrivacyRequirements(geofence: Geofence, action: string): string[] {
    const requirements: string[] = [];

    if (geofence.privacySettings.anonymizeActivities) {
      requirements.push('anonymize_activity');
    }

    if (!geofence.privacySettings.detailedLogging) {
      requirements.push('limit_logging');
    }

    if (geofence.privacySettings.logRetention !== 'permanent') {
      requirements.push(`retention_${geofence.privacySettings.logRetention}`);
    }

    return requirements;
  }

  private sortGeofencesByPriority(geofences: Geofence[]): Geofence[] {
    const priorityOrder = [
      'private_area',
      'protected_region',
      'restricted_resource',
      'social_space',
    ];

    return geofences.sort((a, b) => {
      const aPriority = priorityOrder.indexOf(a.type);
      const bPriority = priorityOrder.indexOf(b.type);
      return aPriority - bPriority;
    });
  }
}

/**
 * Geofence violation detector
 */
class GeofenceViolationDetector extends EventEmitter {
  private violationHistory: Map<string, number[]>;
  private readonly violationThreshold: number;

  constructor(violationThreshold: number = 3) {
    super();
    this.violationHistory = new Map();
    this.violationThreshold = violationThreshold;
  }

  /**
   * Detect and report geofence violations
   */
  detectViolation(
    actor: string,
    action: string,
    location: Location,
    geofence: Geofence,
    attemptedAccess: AccessPermission
  ): boolean {
    if (attemptedAccess.allowed) {
      return false; // No violation
    }

    const violationKey = `${actor}_${geofence.geofenceId}`;
    const currentTime = Date.now();

    if (!this.violationHistory.has(violationKey)) {
      this.violationHistory.set(violationKey, []);
    }

    const violations = this.violationHistory.get(violationKey)!;
    violations.push(currentTime);

    // Clean old violations (older than 1 hour)
    const oneHourAgo = currentTime - 60 * 60 * 1000;
    this.violationHistory.set(
      violationKey,
      violations.filter((time) => time > oneHourAgo)
    );

    const recentViolations = this.violationHistory.get(violationKey)!.length;

    // Emit violation event
    this.emit('geofence-violation', {
      actor,
      action,
      location,
      geofence,
      violationCount: recentViolations,
      severity: recentViolations >= this.violationThreshold ? 'high' : 'low',
      timestamp: currentTime,
    });

    return true;
  }

  /**
   * Get violation history for actor
   */
  getViolationHistory(actor: string): Record<string, number> {
    const history: Record<string, number> = {};

    for (const [key, violations] of this.violationHistory.entries()) {
      if (key.startsWith(`${actor}_`)) {
        const geofenceId = key.substring(actor.length + 1);
        history[geofenceId] = violations.length;
      }
    }

    return history;
  }
}

/**
 * Main Geofence Manager class
 */
export class GeofenceManager extends EventEmitter {
  private readonly geofenceRegistry: GeofenceRegistry;
  private readonly accessPolicies: GeofenceAccessPolicies;
  private readonly violationDetector: GeofenceViolationDetector;

  constructor() {
    super();
    this.geofenceRegistry = new GeofenceRegistry();
    this.accessPolicies = new GeofenceAccessPolicies();
    this.violationDetector = new GeofenceViolationDetector();

    // Forward violation events
    this.violationDetector.on('geofence-violation', (violation) => {
      this.emit('violation-detected', violation);
    });
  }

  /**
   * Register new geofenced area with associated policies
   */
  registerGeofence(geofence: Geofence, owner?: string): boolean {
    try {
      const geofenceWithOwner = owner ? { ...geofence, owner } : geofence;
      this.geofenceRegistry.registerGeofence(geofenceWithOwner);

      this.emit('geofence-registered', {
        geofence: geofenceWithOwner,
        timestamp: Date.now(),
      });

      return true;
    } catch (error) {
      console.error('Failed to register geofence:', error);
      return false;
    }
  }

  /**
   * Check if actor has permission for action at location
   */
  checkAccessPermission(
    location: Location,
    action: string,
    actor: string
  ): AccessPermission {
    const validatedLocation = validateLocation(location);
    const containingGeofences =
      this.geofenceRegistry.findContainingGeofences(validatedLocation);

    const permission = this.accessPolicies.evaluateAccess(
      containingGeofences,
      action,
      actor,
      validatedLocation
    );

    // Check for violations
    if (!permission.allowed && containingGeofences.length > 0) {
      for (const geofence of containingGeofences) {
        this.violationDetector.detectViolation(
          actor,
          action,
          validatedLocation,
          geofence,
          permission
        );
      }
    }

    return validateAccessPermission(permission);
  }

  /**
   * Get applicable restrictions for specific location
   */
  getLocationRestrictions(location: Location): {
    geofences: Geofence[];
    restrictions: string[];
    privacyRequirements: string[];
  } {
    const validatedLocation = validateLocation(location);
    const containingGeofences =
      this.geofenceRegistry.findContainingGeofences(validatedLocation);

    const allRestrictions = new Set<string>();
    const allPrivacyRequirements = new Set<string>();

    for (const geofence of containingGeofences) {
      // Add basic restriction types
      if (geofence.permissions.building === 'prohibited')
        allRestrictions.add('no_building');
      if (geofence.permissions.entry === 'owner_only')
        allRestrictions.add('restricted_entry');
      if (geofence.permissions.observation === 'limited')
        allRestrictions.add('limited_observation');

      // Add privacy requirements
      if (geofence.privacySettings.anonymizeActivities) {
        allPrivacyRequirements.add('anonymize_activities');
      }
      if (!geofence.privacySettings.detailedLogging) {
        allPrivacyRequirements.add('limited_logging');
      }
    }

    return {
      geofences: containingGeofences,
      restrictions: Array.from(allRestrictions),
      privacyRequirements: Array.from(allPrivacyRequirements),
    };
  }

  /**
   * Remove geofence by ID
   */
  removeGeofence(geofenceId: string): boolean {
    const removed = this.geofenceRegistry.removeGeofence(geofenceId);

    if (removed) {
      this.emit('geofence-removed', {
        geofenceId,
        timestamp: Date.now(),
      });
    }

    return removed;
  }

  /**
   * Get all registered geofences
   */
  getAllGeofences(): Geofence[] {
    return this.geofenceRegistry.getAllGeofences();
  }

  /**
   * Get violation statistics
   */
  getViolationStats(): {
    totalGeofences: number;
    violationsDetected: number;
    restrictedAreas: number;
  } {
    // This would be tracked over time in a real implementation
    const allGeofences = this.geofenceRegistry.getAllGeofences();
    return {
      totalGeofences: allGeofences.length,
      violationsDetected: 0,
      restrictedAreas: allGeofences.filter(
        (g: Geofence) => g.type === 'restricted_resource'
      ).length,
    };
  }

  /**
   * Auto-detect private areas based on building patterns
   */
  autoDetectPrivateAreas(
    buildingData: Array<{
      location: Location;
      builder: string;
      timestamp: number;
    }>
  ): Geofence[] {
    // Group buildings by builder and proximity
    const builderClusters = this.clusterBuildingsByBuilder(buildingData);
    const detectedGeofences: Geofence[] = [];

    for (const [builder, clusters] of builderClusters.entries()) {
      for (const cluster of clusters) {
        if (cluster.length >= 3) {
          // Minimum buildings to constitute a private area
          const bounds = this.calculateClusterBounds(cluster);
          const geofence: Geofence = {
            geofenceId: `auto_${builder}_${Date.now()}`,
            name: `${builder}'s Area`,
            type: 'private_area',
            coordinates: bounds,
            owner: builder,
            permissions: {
              entry: 'owner_only',
              building: 'prohibited',
              resourceExtraction: 'prohibited',
              observation: 'limited',
            },
            privacySettings: {
              anonymizeActivities: true,
              logRetention: '24h',
              detailedLogging: false,
            },
          };

          detectedGeofences.push(geofence);
        }
      }
    }

    return detectedGeofences;
  }

  private clusterBuildingsByBuilder(
    buildingData: Array<{
      location: Location;
      builder: string;
      timestamp: number;
    }>
  ): Map<string, Location[][]> {
    const builderClusters = new Map<string, Location[][]>();
    const clusterDistance = 50; // Maximum distance between buildings in same cluster

    for (const building of buildingData) {
      if (!builderClusters.has(building.builder)) {
        builderClusters.set(building.builder, []);
      }

      const clusters = builderClusters.get(building.builder)!;
      let addedToCluster = false;

      // Try to add to existing cluster
      for (const cluster of clusters) {
        if (
          this.isWithinClusterDistance(
            building.location,
            cluster,
            clusterDistance
          )
        ) {
          cluster.push(building.location);
          addedToCluster = true;
          break;
        }
      }

      // Create new cluster if not added to existing one
      if (!addedToCluster) {
        clusters.push([building.location]);
      }
    }

    return builderClusters;
  }

  private isWithinClusterDistance(
    location: Location,
    cluster: Location[],
    maxDistance: number
  ): boolean {
    return cluster.some((clusterLocation) => {
      const distance = Math.sqrt(
        Math.pow(location.x - clusterLocation.x, 2) +
          Math.pow(location.z - clusterLocation.z, 2)
      );
      return distance <= maxDistance;
    });
  }

  private calculateClusterBounds(cluster: Location[]): Geofence['coordinates'] {
    const padding = 10; // Add padding around cluster

    const xs = cluster.map((loc) => loc.x);
    const ys = cluster.map((loc) => loc.y);
    const zs = cluster.map((loc) => loc.z);

    return {
      minX: Math.min(...xs) - padding,
      maxX: Math.max(...xs) + padding,
      minY: Math.min(...ys) - padding,
      maxY: Math.max(...ys) + padding,
      minZ: Math.min(...zs) - padding,
      maxZ: Math.max(...zs) + padding,
    };
  }
}
