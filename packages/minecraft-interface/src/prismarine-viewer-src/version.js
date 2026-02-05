/**
 * version.js - Enhanced Version Management
 *
 * This is a patched version of prismarine-viewer's version.js that provides:
 * 1. Extended version support (1.21.5-1.21.9+)
 * 2. Dynamic version registration for custom asset pipeline
 * 3. Version fallback logic for unsupported versions
 * 4. Status reporting for version compatibility
 *
 * This file is copied to node_modules/prismarine-viewer/viewer/lib/version.js
 * by scripts/rebuild-prismarine-viewer.cjs during postinstall.
 *
 * @module prismarine-viewer/viewer/lib/version
 * @author @darianrosebrook
 */

// Static list of supported versions (from prismarine-viewer + our extensions)
const supportedVersions = [
  '1.8.8', '1.9.4', '1.10.2', '1.11.2', '1.12.2', '1.13.2', '1.14.4',
  '1.15.2', '1.16.1', '1.16.4', '1.17.1', '1.18.1', '1.19', '1.20.1',
  '1.21.1', '1.21.4',
  // Extended versions supported by our custom asset pipeline
  '1.21.5', '1.21.6', '1.21.7', '1.21.8', '1.21.9'
]

// Dynamically registered versions from the asset pipeline
const dynamicVersions = []

/**
 * Register a version dynamically (called by asset pipeline when assets are generated).
 *
 * @param {string} version - The Minecraft version to register
 */
function registerDynamicVersion (version) {
  if (!supportedVersions.includes(version) && !dynamicVersions.includes(version)) {
    dynamicVersions.push(version)
    console.log(`[version] Registered dynamic version: ${version}`)
  }
}

/**
 * Parse version string into comparable parts.
 *
 * @param {string} version - Version string like "1.21.9"
 * @returns {number[]} Array of version parts [1, 21, 9]
 */
function parseVersion (version) {
  return version.split('.').map(p => parseInt(p, 10) || 0)
}

/**
 * Get the major.minor version for fallback matching.
 *
 * @param {string} version - Full version string
 * @returns {string} Major.minor version (e.g., "1.21")
 */
function toMajor (version) {
  const parts = version.split('.')
  return parts.slice(0, 2).join('.')
}

/**
 * Find the closest supported version within the same major version.
 *
 * @param {string} major - Major.minor version (e.g., "1.21")
 * @param {string} targetVersion - The target version to match
 * @returns {string|null} Closest supported version, or null if none found
 */
function findClosestInMajor (major, targetVersion) {
  const allVersions = [...supportedVersions, ...dynamicVersions]
  const sameFamily = allVersions.filter(v => v.startsWith(major + '.') || v === major)

  if (sameFamily.length === 0) return null

  // Sort by patch version descending, pick the highest that's <= target
  const targetParts = parseVersion(targetVersion)
  const sorted = sameFamily.sort((a, b) => {
    const pa = parseVersion(a)
    const pb = parseVersion(b)
    // Compare patch versions (third part)
    return (pb[2] || 0) - (pa[2] || 0)
  })

  // Find the highest version that's <= target
  for (const v of sorted) {
    const vParts = parseVersion(v)
    if ((vParts[2] || 0) <= (targetParts[2] || 0)) {
      return v
    }
  }

  // If no version <= target, return the lowest in family
  return sorted[sorted.length - 1]
}

/**
 * Get the best matching version for rendering.
 *
 * This is the main entry point used by prismarine-viewer.
 *
 * @param {string} version - The requested Minecraft version
 * @returns {string|null} The version to use, or null if unsupported
 */
function getVersion (version) {
  // Check static list first
  if (supportedVersions.includes(version)) {
    return version
  }

  // Check dynamic registrations
  if (dynamicVersions.includes(version)) {
    return version
  }

  // Try major version fallback (e.g., 1.21.10 → 1.21.9)
  const major = toMajor(version)
  const fallback = findClosestInMajor(major, version)

  if (fallback) {
    console.warn(`[version] ${version} not directly supported, using fallback: ${fallback}`)
    return fallback
  }

  // No fallback available
  console.error(`[version] ${version} is not supported and no fallback found`)
  return null
}

/**
 * Get detailed status for a version.
 *
 * @param {string} version - The Minecraft version to check
 * @returns {Object} Version status object
 */
function getVersionStatus (version) {
  const isStatic = supportedVersions.includes(version)
  const isDynamic = dynamicVersions.includes(version)
  const fallback = !isStatic && !isDynamic ? getVersion(version) : null

  return {
    version,
    supported: isStatic || isDynamic,
    static: isStatic,
    dynamic: isDynamic,
    fallback,
    allSupported: [...supportedVersions, ...dynamicVersions]
  }
}

/**
 * Get all supported versions.
 *
 * @returns {string[]} Array of all supported versions
 */
function getAllVersions () {
  return [...supportedVersions, ...dynamicVersions]
}

module.exports = {
  getVersion,
  supportedVersions,
  dynamicVersions,
  registerDynamicVersion,
  getVersionStatus,
  getAllVersions
}
