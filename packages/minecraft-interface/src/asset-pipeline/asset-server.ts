/**
 * Asset Server Middleware - Express middleware for serving generated assets.
 *
 * This middleware serves generated texture atlases and blockstates JSON files,
 * with optional fallback to prismarine-viewer's bundled assets.
 *
 * @module asset-pipeline/asset-server
 */

import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';
import type { Request, Response, NextFunction, Router } from 'express';
import { Router as ExpressRouter } from 'express';
import { AssetPipeline } from './pipeline.js';
import type { AssetServerOptions } from './types.js';

const require = createRequire(import.meta.url);

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
  } = options;

  const pipeline = new AssetPipeline(options.pipeline);
  const router = ExpressRouter();

  // Track in-progress generations to avoid duplicates
  const generatingVersions = new Set<string>();

  /**
   * Find prismarine-viewer's public directory for fallback.
   */
  function findPvPublicDir(): string | null {
    try {
      const pvPackagePath = require.resolve('prismarine-viewer/package.json');
      return path.join(path.dirname(pvPackagePath), 'public');
    } catch {
      return null;
    }
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

      // Fallback to prismarine-viewer's bundled assets
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

      // Fallback to prismarine-viewer's bundled assets
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
   * Serves entity textures (PNG), preserving directory structure.
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
      const paths = pipeline.getOutputPaths(version);
      const generatedPath = path.join(paths.rawAssetsPath, 'entity', relativePath);
      const simpleName = relativePath.includes('/') ? null : path.basename(relativePath, '.png');
      const altRelativePath = simpleName ? path.join(simpleName, `${simpleName}.png`) : null;
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

      if (fallbackToBundled && pvPublicDir) {
        const bundledPath = path.join(pvPublicDir, 'textures', version, 'entity', relativePath);
        if (fs.existsSync(bundledPath)) {
          res.setHeader('Content-Type', 'image/png');
          res.setHeader('Cache-Control', 'public, max-age=86400');
          res.setHeader('X-Asset-Source', 'bundled');
          return fs.createReadStream(bundledPath).pipe(res);
        }
        if (altRelativePath) {
          const altBundledPath = path.join(pvPublicDir, 'textures', version, 'entity', altRelativePath);
          if (fs.existsSync(altBundledPath)) {
            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Cache-Control', 'public, max-age=86400');
            res.setHeader('X-Asset-Source', 'bundled');
            return fs.createReadStream(altBundledPath).pipe(res);
          }
        }
        for (const candidate of playerSkinCandidates) {
          const candidateBundled = path.join(pvPublicDir, 'textures', version, 'entity', candidate);
          if (fs.existsSync(candidateBundled)) {
            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Cache-Control', 'public, max-age=86400');
            res.setHeader('X-Asset-Source', 'bundled');
            return fs.createReadStream(candidateBundled).pipe(res);
          }
        }
      }

      if (autoGenerate && !generatingVersions.has(version)) {
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

      // Try to load version support info from patched prismarine-viewer
      let versionSupport: Record<string, unknown> | null = null;
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { getVersionStatus, getAllVersions } = require('prismarine-viewer/viewer/lib/version');
        versionSupport = {
          supportedVersions: getAllVersions(),
        };
      } catch {
        // Version module not available (prismarine-viewer not rebuilt yet)
        versionSupport = null;
      }

      // Build version status for each cached version
      const versionStatuses = cached.map((c) => {
        const paths = pipeline.getOutputPaths(c.version);
        const hasTextures = fs.existsSync(paths.texturePath);
        const hasBlockStates = fs.existsSync(paths.blockStatesPath);

        // Check viewer support if available
        let viewerSupported = true;
        let viewerFallback: string | null = null;
        if (versionSupport) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { getVersionStatus } = require('prismarine-viewer/viewer/lib/version');
            const status = getVersionStatus(c.version);
            viewerSupported = status.supported;
            viewerFallback = status.fallback;
          } catch {
            // Ignore
          }
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
