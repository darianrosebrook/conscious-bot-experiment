/**
 * Version Resolver - Fetches and parses Mojang's version manifest.
 *
 * This module handles fetching the Minecraft version manifest from Mojang's servers,
 * parsing version metadata, and caching results to minimize API calls.
 *
 * @module asset-pipeline/version-resolver
 */

import type {
  MojangVersionManifest,
  MojangVersionEntry,
  MojangVersionDetails,
  ResolvedVersion,
  VersionResolverOptions,
} from './types.js';

const MOJANG_MANIFEST_URL =
  'https://launchermeta.mojang.com/mc/game/version_manifest_v2.json';

const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * VersionResolver fetches and caches Mojang's version manifest,
 * providing methods to resolve version details including JAR download URLs.
 */
export class VersionResolver {
  private manifestCache: MojangVersionManifest | null = null;
  private manifestCacheTime: number = 0;
  private versionDetailsCache: Map<string, MojangVersionDetails> = new Map();
  private readonly cacheTtlMs: number;
  private readonly manifestUrl: string;

  constructor(options: VersionResolverOptions = {}) {
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.manifestUrl = options.manifestUrl ?? MOJANG_MANIFEST_URL;
  }

  /**
   * Fetches the version manifest from Mojang's servers.
   * Results are cached for the configured TTL.
   */
  async getManifest(): Promise<MojangVersionManifest> {
    const now = Date.now();
    if (this.manifestCache && now - this.manifestCacheTime < this.cacheTtlMs) {
      return this.manifestCache;
    }

    const response = await fetch(this.manifestUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch version manifest: ${response.status} ${response.statusText}`
      );
    }

    this.manifestCache = (await response.json()) as MojangVersionManifest;
    this.manifestCacheTime = now;
    return this.manifestCache;
  }

  /**
   * Gets the latest release version ID.
   */
  async getLatestRelease(): Promise<string> {
    const manifest = await this.getManifest();
    return manifest.latest.release;
  }

  /**
   * Gets the latest snapshot version ID.
   */
  async getLatestSnapshot(): Promise<string> {
    const manifest = await this.getManifest();
    return manifest.latest.snapshot;
  }

  /**
   * Lists all available versions.
   * @param type - Optional filter by version type
   */
  async listVersions(
    type?: 'release' | 'snapshot' | 'old_beta' | 'old_alpha'
  ): Promise<MojangVersionEntry[]> {
    const manifest = await this.getManifest();
    if (type) {
      return manifest.versions.filter((v) => v.type === type);
    }
    return manifest.versions;
  }

  /**
   * Gets detailed version info for a specific version.
   * Results are cached indefinitely (version details don't change).
   */
  async getVersionDetails(version: string): Promise<MojangVersionDetails> {
    // Check cache first
    const cached = this.versionDetailsCache.get(version);
    if (cached) {
      return cached;
    }

    const manifest = await this.getManifest();
    const entry = manifest.versions.find((v) => v.id === version);
    if (!entry) {
      throw new Error(`Version ${version} not found in manifest`);
    }

    const response = await fetch(entry.url);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch version details for ${version}: ${response.status} ${response.statusText}`
      );
    }

    const details = (await response.json()) as MojangVersionDetails;
    this.versionDetailsCache.set(version, details);
    return details;
  }

  /**
   * Resolves a version string to full download information.
   * This is the main entry point for the pipeline.
   *
   * @param version - Version ID (e.g., "1.21.4") or "latest" for latest release
   */
  async resolve(version: string): Promise<ResolvedVersion> {
    // Handle "latest" alias
    const versionId =
      version === 'latest' ? await this.getLatestRelease() : version;

    const details = await this.getVersionDetails(versionId);

    if (!details.downloads?.client) {
      throw new Error(`Version ${versionId} does not have client download info`);
    }

    return {
      id: details.id,
      type: details.type,
      clientJarUrl: details.downloads.client.url,
      clientJarSha1: details.downloads.client.sha1,
      clientJarSize: details.downloads.client.size,
      releaseTime: details.releaseTime,
    };
  }

  /**
   * Checks if a version exists in the manifest.
   */
  async versionExists(version: string): Promise<boolean> {
    const manifest = await this.getManifest();
    return manifest.versions.some((v) => v.id === version);
  }

  /**
   * Finds the closest available version to the requested one.
   * Useful for fallback scenarios.
   *
   * @param version - The requested version
   * @returns The closest release version, or null if none found
   */
  async findClosestVersion(version: string): Promise<string | null> {
    const manifest = await this.getManifest();

    // First, check if exact version exists
    if (manifest.versions.some((v) => v.id === version)) {
      return version;
    }

    // Parse version numbers for comparison
    const parseVersion = (v: string): number[] => {
      const match = v.match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
      if (!match) return [0, 0, 0];
      return [
        parseInt(match[1], 10),
        parseInt(match[2], 10),
        parseInt(match[3] || '0', 10),
      ];
    };

    const targetParts = parseVersion(version);
    const releases = manifest.versions.filter((v) => v.type === 'release');

    // Find closest version by comparing parts
    let closest: string | null = null;
    let closestDiff = Infinity;

    for (const release of releases) {
      const parts = parseVersion(release.id);
      const diff =
        Math.abs(parts[0] - targetParts[0]) * 10000 +
        Math.abs(parts[1] - targetParts[1]) * 100 +
        Math.abs(parts[2] - targetParts[2]);

      if (diff < closestDiff) {
        closestDiff = diff;
        closest = release.id;
      }
    }

    return closest;
  }

  /**
   * Clears all caches (useful for testing or forcing refresh).
   */
  clearCache(): void {
    this.manifestCache = null;
    this.manifestCacheTime = 0;
    this.versionDetailsCache.clear();
  }
}

// Default singleton instance
let defaultResolver: VersionResolver | null = null;

/**
 * Gets the default VersionResolver instance.
 */
export function getVersionResolver(
  options?: VersionResolverOptions
): VersionResolver {
  if (!defaultResolver || options) {
    defaultResolver = new VersionResolver(options);
  }
  return defaultResolver;
}
