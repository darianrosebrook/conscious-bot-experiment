/**
 * Asset Server Middleware - Express middleware for serving generated assets.
 *
 * This middleware serves generated texture atlases and blockstates JSON files,
 * with optional fallback to the internalized viewer's bundled assets.
 *
 * @module asset-pipeline/asset-server
 */

import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import type { Request, Response, NextFunction, Router } from 'express';
import { Router as ExpressRouter } from 'express';
import { AssetPipeline } from './pipeline.js';
import type { AssetServerOptions } from './types.js';
import { getVersionStatus, getAllVersions } from '../viewer/utils/version.js';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Creates an Express middleware/router for serving generated Minecraft assets.
 *
 * Routes:
 *   GET /textures/:version.png     - Texture atlas PNG
 *   GET /blocksStates/:version.json - BlockStates JSON
 *   GET /status                     - Server status and cached versions
 *   POST /generate/:version         - Generate assets for a version (if autoGenerate enabled)
 */
export function createAssetServer(options: AssetServerOptions = {}): Router {
  const {
    autoGenerate = false,
    fallbackToBundled = true,
    customSkinPath,
  } = options;

  const pipeline = new AssetPipeline(options.pipeline);
  const router = ExpressRouter();

  // Track in-progress generations to avoid duplicates
  const generatingVersions = new Set<string>();

  // Negative cache: version:path pairs where generation ran but the texture still didn't exist.
  // Prevents re-triggering pipeline.generate() on every request for known-missing assets
  // (e.g. snowball entity textures that live under items/, not entity/).
  const missingAfterGenerate = new Set<string>();

  // Resolve custom skin path (check explicit option, env var, monorepo root, cwd, ~/Downloads)
  const resolvedCustomSkinPath = (() => {
    // Walk up from this file to find monorepo root (has pnpm-workspace.yaml)
    let monorepoRoot: string | null = null;
    let dir = path.dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 10; i++) {
      if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml')) || fs.existsSync(path.join(dir, 'pnpm-lock.yaml'))) {
        monorepoRoot = dir;
        break;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    const candidates = [
      customSkinPath,
      process.env.CUSTOM_SKIN_PATH,
      monorepoRoot ? path.join(monorepoRoot, 'createdSkin.png') : null,
      path.resolve('createdSkin.png'), // cwd
      path.join(process.env.HOME || '', 'Downloads', 'createdSkin.png'),
    ].filter(Boolean) as string[];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        console.log(`[asset-server] Custom skin found: ${candidate}`);
        return candidate;
      }
    }
    console.log('[asset-server] No custom skin found (checked: monorepo root, cwd, ~/Downloads)');
    return null;
  })();

  /**
   * Paths that should be served from the custom skin instead of the JAR original.
   * Covers both the legacy flat "steve.png" path and the modern "player/wide/steve.png".
   */
  const CUSTOM_SKIN_PATHS = new Set([
    'steve.png',
    'player/wide/steve.png',
    'player/slim/steve.png',
  ]);

  /**
   * Entity texture fallbacks for 1.21.x where Mojang switched to biome-variant naming.
   * The viewer's entities.json uses legacy paths (cow/cow, pig/pig, sheep/sheep_fur)
   * but 1.21.9 assets use temperate_*, cold_*, warm_* variants.
   */
  const ENTITY_TEXTURE_FALLBACKS_1_21: Record<string, string> = {
    // Biome-variant animal renames in 1.21.9+
    // Nested paths (cow/cow.png) used by most entities
    'cow/cow.png': 'cow/temperate_cow.png',
    'pig/pig.png': 'pig/temperate_pig.png',
    'sheep/sheep_fur.png': 'sheep/sheep_wool.png',
    'chicken/chicken.png': 'chicken/temperate_chicken.png',
    'wolf/wolf.png': 'wolf/temperate_wolf.png',
    'wolf/wolf_angry.png': 'wolf/temperate_wolf_angry.png',
    'wolf/wolf_tame.png': 'wolf/temperate_wolf_tame.png',
    // Flat paths (chicken.png) — some entities use "textures/entity/chicken" not "textures/entity/chicken/chicken"
    'chicken.png': 'chicken/temperate_chicken.png',
    // Equipment renames in 1.21.9+ — pig saddle moved to equipment folder
    'pig/pig_saddle.png': 'equipment/pig_saddle/saddle.png',
  };

  function tryEntityFallback(
    version: string,
    relativePath: string,
    texturesVersionDir: string,
  ): string | null {
    if (!version.startsWith('1.21')) return null;
    const fallback = ENTITY_TEXTURE_FALLBACKS_1_21[relativePath];
    if (!fallback) return null;
    const fallbackPath = path.join(texturesVersionDir, 'entity', fallback);
    return fs.existsSync(fallbackPath) ? fallbackPath : null;
  }

  /**
   * Find viewer's public directory for fallback.
   * Now points to our internalized src/viewer/public/ instead of node_modules.
   */
  function findPvPublicDir(): string | null {
    const viewerPublicDir = path.resolve(__dirname, '../viewer/public');
    if (fs.existsSync(viewerPublicDir)) {
      return viewerPublicDir;
    }
    return null;
  }

  let pvPublicDir = findPvPublicDir();
  if (pvPublicDir) {
    const sentinelFiles = ['index.html', 'index.js', 'worker.js'];
    const dir = pvPublicDir;
    const hasSentinel = sentinelFiles.some((file) =>
      fs.existsSync(path.join(dir, file))
    );
    if (!hasSentinel) {
      console.warn(
        `[asset-server] Prismarine viewer public dir missing sentinel files (${sentinelFiles.join(', ')}): ${pvPublicDir}`
      );
      pvPublicDir = null;
    } else {
      console.log(`[asset-server] Prismarine viewer public dir: ${pvPublicDir}`);
    }
  } else {
    console.warn('[asset-server] Prismarine viewer public dir not found; bundled fallback disabled');
  }

  /**
   * Serves a texture atlas PNG.
   */
  router.get('/textures/:version.png', async (req: Request, res: Response, next: NextFunction) => {
    const version = req.params.version;

    try {
      // Check generated assets first
      const paths = pipeline.getOutputPaths(version);
      if (fs.existsSync(paths.texturePath)) {
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
        res.setHeader('X-Asset-Source', 'generated');
        return fs.createReadStream(paths.texturePath).pipe(res);
      }

      // Fallback to viewer's bundled assets
      if (fallbackToBundled && pvPublicDir) {
        const bundledPath = path.join(pvPublicDir, 'textures', `${version}.png`);
        if (fs.existsSync(bundledPath)) {
          res.setHeader('Content-Type', 'image/png');
          res.setHeader('Cache-Control', 'public, max-age=86400');
          res.setHeader('X-Asset-Source', 'bundled');
          return fs.createReadStream(bundledPath).pipe(res);
        }
      }

      // Auto-generate if enabled
      if (autoGenerate && !generatingVersions.has(version)) {
        generatingVersions.add(version);
        console.log(`[asset-server] Auto-generating assets for ${version}...`);

        try {
          await pipeline.generate(version, { ensureRawAssets: ['entity'] });
          generatingVersions.delete(version);

          // Now serve the generated asset
          if (fs.existsSync(paths.texturePath)) {
            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Cache-Control', 'public, max-age=86400');
            res.setHeader('X-Asset-Source', 'generated');
            return fs.createReadStream(paths.texturePath).pipe(res);
          }
        } catch (error) {
          generatingVersions.delete(version);
          console.error(`[asset-server] Failed to generate assets for ${version}:`, error);
        }
      }

      // Not found
      res.status(404).json({
        error: 'Texture not found',
        version,
        hint: autoGenerate
          ? 'Asset generation may have failed'
          : 'Run `pnpm mc:assets extract ' + version + '` to generate',
      });
    } catch (error) {
      next(error);
    }
  });

 /**
  * Serves a blockStates JSON file.
  */
  router.get('/blocksStates/:version.json', async (req: Request, res: Response, next: NextFunction) => {
    const version = req.params.version;

    try {
      // Check generated assets first
      const paths = pipeline.getOutputPaths(version);
      if (fs.existsSync(paths.blockStatesPath)) {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('X-Asset-Source', 'generated');
        return fs.createReadStream(paths.blockStatesPath).pipe(res);
      }

      // Fallback to viewer's bundled assets
      if (fallbackToBundled && pvPublicDir) {
        const bundledPath = path.join(pvPublicDir, 'blocksStates', `${version}.json`);
        if (fs.existsSync(bundledPath)) {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'public, max-age=86400');
          res.setHeader('X-Asset-Source', 'bundled');
          return fs.createReadStream(bundledPath).pipe(res);
        }
      }

      // Auto-generate if enabled (and texture request hasn't already triggered it)
      if (autoGenerate && !generatingVersions.has(version)) {
        generatingVersions.add(version);
        console.log(`[asset-server] Auto-generating assets for ${version}...`);

        try {
          await pipeline.generate(version, { ensureRawAssets: ['entity'] });
          generatingVersions.delete(version);

          if (fs.existsSync(paths.blockStatesPath)) {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'public, max-age=86400');
            res.setHeader('X-Asset-Source', 'generated');
            return fs.createReadStream(paths.blockStatesPath).pipe(res);
          }
        } catch (error) {
          generatingVersions.delete(version);
          console.error(`[asset-server] Failed to generate assets for ${version}:`, error);
        }
      }

      // Not found
      res.status(404).json({
        error: 'BlockStates not found',
        version,
        hint: autoGenerate
          ? 'Asset generation may have failed'
          : 'Run `pnpm mc:assets extract ' + version + '` to generate',
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * Bundled version fallback chain for entity textures.
   * entities.json models use Bedrock Edition UV layouts that match these older bundled textures.
   * 1.21.9 JAR textures use Java Edition layouts with different dimensions/UV organization.
   * We prefer bundled textures that match the model data over extracted JAR textures.
   */
  const ENTITY_BUNDLED_FALLBACK_VERSIONS = ['1.20.1', '1.19', '1.18.1', '1.17.1', '1.16.4'];

  /**
   * Try to find an entity texture in bundled viewer assets across multiple versions.
   * Returns the file path if found, null otherwise.
   */
  function tryBundledEntityTexture(relativePath: string): string | null {
    if (!pvPublicDir) return null;
    for (const v of ENTITY_BUNDLED_FALLBACK_VERSIONS) {
      const bundledPath = path.join(pvPublicDir, 'textures', v, 'entity', relativePath);
      if (fs.existsSync(bundledPath)) return bundledPath;
    }
    return null;
  }

  /**
   * Serves entity textures (PNG), preserving directory structure.
   *
   * Resolution order:
   *   1. Custom skin override (for steve.png)
   *   2. Bundled viewer textures (match entities.json Bedrock model UVs)
   *   3. Generated/extracted JAR textures (with biome-variant fallbacks)
   *   4. Auto-generate on demand
   *
   * Example:
   *   GET /entity/1.21.9/player/wide/steve.png
   */
  router.get('/entity/:version/*', async (req: Request, res: Response, next: NextFunction) => {
    const version = req.params.version;
    let relativePath = (req.params[0] || '').replace(/^\/+/, '');
    if (relativePath.startsWith('entity/')) {
      relativePath = relativePath.slice('entity/'.length);
    }

    try {
      // 1. Custom skin override — serve the user's skin for steve.png requests
      if (resolvedCustomSkinPath && CUSTOM_SKIN_PATHS.has(relativePath)) {
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'no-cache'); // Don't cache custom skin so changes take effect
        res.setHeader('X-Asset-Source', 'custom-skin');
        return fs.createReadStream(resolvedCustomSkinPath).pipe(res);
      }

      // Helper: simpleName for flat paths like "steve.png" → "steve"
      const simpleName = relativePath.includes('/') ? null : path.basename(relativePath, '.png');
      const altRelativePath = simpleName ? path.join(simpleName, `${simpleName}.png`) : null;

      // 2. Bundled viewer textures (preferred for entity UV compatibility)
      // entities.json uses Bedrock model definitions whose UV coords match these older textures.
      if (fallbackToBundled && pvPublicDir) {
        // Direct path match across bundled versions
        const bundledMatch = tryBundledEntityTexture(relativePath);
        if (bundledMatch) {
          res.setHeader('Content-Type', 'image/png');
          res.setHeader('Cache-Control', 'public, max-age=86400');
          res.setHeader('X-Asset-Source', 'bundled');
          return fs.createReadStream(bundledMatch).pipe(res);
        }
        // Alt path (e.g., "steve.png" → "steve/steve.png")
        if (altRelativePath) {
          const altBundledMatch = tryBundledEntityTexture(altRelativePath);
          if (altBundledMatch) {
            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Cache-Control', 'public, max-age=86400');
            res.setHeader('X-Asset-Source', 'bundled');
            return fs.createReadStream(altBundledMatch).pipe(res);
          }
        }
        // Player skin candidates (e.g., "steve.png" → "player/wide/steve.png")
        if (simpleName) {
          for (const candidate of [`player/wide/${simpleName}.png`, `player/slim/${simpleName}.png`]) {
            const playerMatch = tryBundledEntityTexture(candidate);
            if (playerMatch) {
              res.setHeader('Content-Type', 'image/png');
              res.setHeader('Cache-Control', 'public, max-age=86400');
              res.setHeader('X-Asset-Source', 'bundled');
              return fs.createReadStream(playerMatch).pipe(res);
            }
          }
        }
      }

      // 3. Generated/extracted JAR textures (for entities not in bundled assets)
      const paths = pipeline.getOutputPaths(version);
      const generatedPath = path.join(paths.rawAssetsPath, 'entity', relativePath);
      const altGeneratedPath = altRelativePath ? path.join(paths.rawAssetsPath, 'entity', altRelativePath) : null;
      const playerSkinCandidates = simpleName
        ? [
            path.join('player', 'wide', `${simpleName}.png`),
            path.join('player', 'slim', `${simpleName}.png`),
          ]
        : [];
      if (fs.existsSync(generatedPath)) {
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('X-Asset-Source', 'generated');
        return fs.createReadStream(generatedPath).pipe(res);
      }
      if (altGeneratedPath && fs.existsSync(altGeneratedPath)) {
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('X-Asset-Source', 'generated');
        return fs.createReadStream(altGeneratedPath).pipe(res);
      }
      for (const candidate of playerSkinCandidates) {
        const candidatePath = path.join(paths.rawAssetsPath, 'entity', candidate);
        if (fs.existsSync(candidatePath)) {
          res.setHeader('Content-Type', 'image/png');
          res.setHeader('Cache-Control', 'public, max-age=86400');
          res.setHeader('X-Asset-Source', 'generated');
          return fs.createReadStream(candidatePath).pipe(res);
        }
      }

      // Check biome-variant fallbacks against generated/extracted assets
      const generatedFallbackPath = tryEntityFallback(version, relativePath, paths.rawAssetsPath);
      if (generatedFallbackPath) {
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('X-Asset-Source', 'generated-fallback');
        return fs.createReadStream(generatedFallbackPath).pipe(res);
      }

      // 4. Auto-generate on demand (skip if we already know this texture doesn't exist after generation)
      const negCacheKey = `${version}:${relativePath}`;
      if (autoGenerate && !generatingVersions.has(version) && !missingAfterGenerate.has(negCacheKey)) {
        generatingVersions.add(version);
        console.log(`[asset-server] Auto-generating assets for ${version} (entity textures)...`);

        try {
          await pipeline.generate(version);
          generatingVersions.delete(version);

          if (fs.existsSync(generatedPath)) {
            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Cache-Control', 'public, max-age=86400');
            res.setHeader('X-Asset-Source', 'generated');
            return fs.createReadStream(generatedPath).pipe(res);
          }
          // Generation succeeded but this specific texture still doesn't exist —
          // cache the miss so we don't re-trigger generation on every request.
          missingAfterGenerate.add(negCacheKey);
        } catch (error) {
          generatingVersions.delete(version);
          console.error(`[asset-server] Failed to generate assets for ${version}:`, error);
        }
      }

      res.status(404).json({
        error: 'Entity texture not found',
        version,
        path: relativePath,
        hint: autoGenerate
          ? 'Asset generation may have failed'
          : 'Run `pnpm mc:assets extract ' + version + '` to generate',
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * Server status endpoint with version validation.
   *
   * Returns detailed status including:
   * - Cached asset versions
   * - Viewer version support status
   * - Warnings for unsupported versions
   */
  router.get('/status', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const cached = await pipeline.listCached();

      const versionSupport = {
        supportedVersions: getAllVersions(),
      };

      // Build version status for each cached version
      const versionStatuses = cached.map((c) => {
        const paths = pipeline.getOutputPaths(c.version);
        const hasTextures = fs.existsSync(paths.texturePath);
        const hasBlockStates = fs.existsSync(paths.blockStatesPath);

        // Check viewer support if available
        let viewerSupported = true;
        let viewerFallback: string | null = null;
        if (versionSupport) {
          const status = getVersionStatus(c.version);
          viewerSupported = status.supported;
          viewerFallback = status.fallback;
        }

        return {
          version: c.version,
          generatedAt: c.generatedAt.toISOString(),
          size: c.size,
          hasTextures,
          hasBlockStates,
          viewerSupported,
          viewerFallback,
        };
      });

      // Generate warnings for versions that may have issues
      const warnings: string[] = [];
      for (const status of versionStatuses) {
        if (!status.viewerSupported && !status.viewerFallback) {
          warnings.push(`Version ${status.version} is not supported by the viewer and has no fallback`);
        }
        if (!status.hasTextures) {
          warnings.push(`Version ${status.version} is missing texture atlas`);
        }
        if (!status.hasBlockStates) {
          warnings.push(`Version ${status.version} is missing blockStates JSON`);
        }
      }

      res.json({
        status: 'ok',
        autoGenerate,
        fallbackToBundled,
        hasBundledFallback: !!pvPublicDir,
        cachedVersions: versionStatuses,
        generatingVersions: Array.from(generatingVersions),
        missingAfterGenerate: Array.from(missingAfterGenerate),
        versionSupport,
        warnings,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * Manual generation endpoint.
   */
  // eslint-disable-next-line no-unused-vars -- Express route handler signature
  router.post('/generate/:version', async (req: Request, res: Response, _next: NextFunction) => {
    const version = req.params.version;
    const force = req.query.force === 'true';

    if (generatingVersions.has(version)) {
      return res.status(409).json({
        error: 'Generation already in progress',
        version,
      });
    }

    generatingVersions.add(version);

    // Clear negative cache for this version so re-generation can serve newly available textures
    for (const key of missingAfterGenerate) {
      if (key.startsWith(`${version}:`)) missingAfterGenerate.delete(key);
    }

    try {
      const result = await pipeline.generate(version, { force });
      generatingVersions.delete(version);

      res.json({
        success: true,
        version: result.version,
        fromCache: result.fromCache,
        atlasInfo: result.atlasInfo,
        generatedAt: result.generatedAt.toISOString(),
      });
    } catch (error) {
      generatingVersions.delete(version);
      res.status(500).json({
        error: 'Generation failed',
        version,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * List available versions endpoint.
   */
  router.get('/versions', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const resolver = pipeline.getVersionResolver();
      const releases = await resolver.listVersions('release');
      const latest = await resolver.getLatestRelease();

      res.json({
        latest,
        releases: releases.slice(0, 20).map((v) => ({
          id: v.id,
          releaseTime: v.releaseTime,
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

/** Express middleware function type */
// eslint-disable-next-line no-unused-vars -- type parameters define middleware signature
type ExpressMiddleware = (req: Request, res: Response, next: NextFunction) => void;

/**
 * Creates middleware that serves assets at a specific route prefix.
 */
export function createAssetMiddleware(
  routePrefix: string = '/mc-assets',
  options: AssetServerOptions = {}
): ExpressMiddleware {
  const router = createAssetServer(options);

  return (req, res, next) => {
    if (req.path.startsWith(routePrefix)) {
      // Strip the prefix and forward to router
      req.url = req.url.substring(routePrefix.length) || '/';
      router(req, res, next);
    } else {
      next();
    }
  };
}
