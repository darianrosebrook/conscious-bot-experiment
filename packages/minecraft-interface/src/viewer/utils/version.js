/**
 * version.js - Enhanced Version Management
 *
 * This is a patched version of prismarine-viewer's version.js that provides:
 * 1. Extended version support (1.21.5-1.21.9+)
 * 2. Dynamic version registration for custom asset pipeline
 * 3. Version fallback logic for unsupported versions
 * 4. Status reporting for version compatibility
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

function registerDynamicVersion (version) {
  if (!supportedVersions.includes(version) && !dynamicVersions.includes(version)) {
    dynamicVersions.push(version)
    console.log(`[version] Registered dynamic version: ${version}`)
  }
}

function parseVersion (version) {
  return version.split('.').map(p => parseInt(p, 10) || 0)
}

function toMajor (version) {
  const parts = version.split('.')
  return parts.slice(0, 2).join('.')
}

function findClosestInMajor (major, targetVersion) {
  const allVersions = [...supportedVersions, ...dynamicVersions]
  const sameFamily = allVersions.filter(v => v.startsWith(major + '.') || v === major)

  if (sameFamily.length === 0) return null

  const targetParts = parseVersion(targetVersion)
  const sorted = sameFamily.sort((a, b) => {
    const pa = parseVersion(a)
    const pb = parseVersion(b)
    return (pb[2] || 0) - (pa[2] || 0)
  })

  for (const v of sorted) {
    const vParts = parseVersion(v)
    if ((vParts[2] || 0) <= (targetParts[2] || 0)) {
      return v
    }
  }

  return sorted[sorted.length - 1]
}

function getVersion (version) {
  if (supportedVersions.includes(version)) {
    return version
  }

  if (dynamicVersions.includes(version)) {
    return version
  }

  const major = toMajor(version)
  const fallback = findClosestInMajor(major, version)

  if (fallback) {
    console.warn(`[version] ${version} not directly supported, using fallback: ${fallback}`)
    return fallback
  }

  console.error(`[version] ${version} is not supported and no fallback found`)
  return null
}

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

function getAllVersions () {
  return [...supportedVersions, ...dynamicVersions]
}

export {
  getVersion,
  supportedVersions,
  dynamicVersions,
  registerDynamicVersion,
  getVersionStatus,
  getAllVersions
}
