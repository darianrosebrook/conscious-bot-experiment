/**
 * useAtlasMaterial — loads the texture atlas and creates a shared material
 *
 * Prefers the Minecraft asset pipeline (same source as Prismarine viewer):
 *   /api/mc-assets/textures/{version}.png
 *   /api/mc-assets/blocksStates/{version}.json
 * Falls back to legacy block_textures + vite-plugin-texture-atlas when
 * mc-assets is unavailable (e.g. minecraft-interface not running).
 *
 * Pass mcVersion (e.g. from viewer-status executionStatus.bot.server.version)
 * to use the same textures as the Live tab viewer; otherwise uses DEFAULT_MC_VERSION.
 */

import { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { AtlasIndex } from '@/types/atlas';
import {
  preloadBlockStates,
  getAtlasTextureUrl,
  getAtlasIndexUrl,
  DEFAULT_MC_VERSION,
  type BlockStatesData,
} from '@/lib/mc-asset-block-loader';

/** Per-version cache so Building tab can match viewer version when available */
const cacheByVersion = new Map<
  string,
  {
    material: THREE.MeshLambertMaterial;
    atlasIndex: AtlasIndex;
    blockStates: BlockStatesData | null;
    source: 'mc-assets' | 'legacy';
    version: string;
  }
>();
const loadPromisesByVersion = new Map<string, Promise<void>>();

function getCacheKey(version: string): string {
  const forceLegacy = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('atlas') === 'legacy';
  return forceLegacy ? `${version}:legacy` : version;
}

/** Load atlas and blockStates from Minecraft asset pipeline (same as viewer) */
async function loadMcAssets(version: string): Promise<{
  material: THREE.MeshLambertMaterial;
  atlasIndex: AtlasIndex;
  blockStates: BlockStatesData;
  source: 'mc-assets';
  version: string;
} | null> {
  try {
    const [atlasRes, blockStates] = await Promise.all([
      fetch(getAtlasTextureUrl(version)),
      preloadBlockStates(version),
    ]);
    if (!atlasRes.ok) {
      console.warn(
        `[useAtlasMaterial] mc-assets texture unavailable (HTTP ${atlasRes.status}) for ${version}, using legacy atlas. Start minecraft-interface to use same textures as Live viewer.`
      );
      return null;
    }

    const blob = await atlasRes.blob();
    const objectUrl = URL.createObjectURL(blob);

    const texture = await new Promise<THREE.Texture>((resolve, reject) => {
      const loader = new THREE.TextureLoader();
      loader.load(
        objectUrl,
        (tex) => {
          URL.revokeObjectURL(objectUrl);
          // Pipeline atlas is built with canvas coords (v=0 at image top). Three.js default
          // has v=0 at bottom. Set flipY=true so pipeline UVs match without per-face flip.
          tex.flipY = true;
          tex.magFilter = THREE.NearestFilter;
          tex.minFilter = THREE.NearestFilter;
          tex.colorSpace = THREE.SRGBColorSpace;
          resolve(tex);
        },
        undefined,
        reject
      );
    });

    const material = new THREE.MeshLambertMaterial({
      map: texture,
      vertexColors: true,
    });

    // AtlasIndex for legacy fallback compat; mc-assets uses blockStates for UVs
    // When atlas-index is available, populate textures so applyAtlasUVs fallback works
    // (e.g. vegetation blocks that use applyAtlasUVs when buildBlockGeometryFromAssets returns null)
    const atlasIndex: AtlasIndex = {
      size: 1 / 16,
      gridSize: 16,
      tileSize: 16,
      atlasPixelSize: 4096,
      textureNames: [],
      textures: {},
    };

    const atlasIndexRes = await fetch(getAtlasIndexUrl(version));
    if (atlasIndexRes.ok) {
      const textureMap = (await atlasIndexRes.json()) as Record<string, { u: number; v: number; su: number; sv: number; col: number; row: number }>;
      atlasIndex.textures = textureMap;
      atlasIndex.textureNames = Object.keys(textureMap);
      console.info('[useAtlasMaterial] atlas-index 200, keys:', Object.keys(textureMap).length);
    } else {
      console.warn(
        '[useAtlasMaterial] atlas-index',
        atlasIndexRes.status,
        getAtlasIndexUrl(version),
        '- run `pnpm mc:assets extract ' + version + '` in minecraft-interface to generate'
      );
    }

    return { material, atlasIndex, blockStates, source: 'mc-assets', version };
  } catch (err) {
    console.warn('[useAtlasMaterial] mc-assets load failed:', err);
    return null;
  }
}

async function loadLegacyAtlas(version: string): Promise<{
  material: THREE.MeshLambertMaterial;
  atlasIndex: AtlasIndex;
  blockStates: null;
  source: 'legacy';
  version: string;
}> {
  const res = await fetch('/atlas/blocks-atlas-index.json');
  const index: AtlasIndex = await res.json();

  const { atlasPixelSize, tileSize, textureNames, textures } = index;

  const canvas = document.createElement('canvas');
  canvas.width = atlasPixelSize;
  canvas.height = atlasPixelSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get 2d context for atlas canvas');

  const loadImage = (name: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => {
        const placeholder = document.createElement('canvas');
        placeholder.width = tileSize;
        placeholder.height = tileSize;
        const pCtx = placeholder.getContext('2d');
        if (!pCtx)
          return reject(
            new Error(`Failed to get 2d context for placeholder ${name}`)
          );
        pCtx.fillStyle = '#ff00ff';
        pCtx.fillRect(0, 0, tileSize, tileSize);
        const pImg = new Image();
        pImg.src = placeholder.toDataURL();
        pImg.onload = () => resolve(pImg);
        pImg.onerror = () =>
          reject(new Error(`Failed to load placeholder for ${name}`));
      };
      img.src = `/block_textures/${name}.png`;
    });

  const images = await Promise.all(textureNames.map(loadImage));

  textureNames.forEach((name: string, i: number) => {
    const entry = textures[name];
    if (!entry) return;
    ctx.drawImage(
      images[i],
      entry.col * tileSize,
      entry.row * tileSize,
      tileSize,
      tileSize
    );
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = false;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  const material = new THREE.MeshLambertMaterial({
    map: texture,
    vertexColors: true,
  });

  return { material, atlasIndex: index, blockStates: null, source: 'legacy', version };
}

async function loadAtlas(version: string): Promise<{
  material: THREE.MeshLambertMaterial;
  atlasIndex: AtlasIndex;
  blockStates: BlockStatesData | null;
  source: 'mc-assets' | 'legacy';
  version: string;
}> {
  const forceLegacy = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('atlas') === 'legacy';
  if (!forceLegacy) {
    const mc = await loadMcAssets(version);
    if (mc) {
      return mc;
    }
  }
  return loadLegacyAtlas(version);
}

export function useAtlasMaterial(mcVersion?: string | null): {
  material: THREE.MeshLambertMaterial | null;
  atlasIndex: AtlasIndex | null;
  blockStates: BlockStatesData | null;
  isReady: boolean;
  atlasSource: 'mc-assets' | 'legacy' | null;
  /** Resolved version used for loading (for diagnostic overlay) */
  version: string;
} {
  const version = mcVersion ?? DEFAULT_MC_VERSION;
  const cacheKey = getCacheKey(version);
  const cached = cacheByVersion.get(cacheKey);
  const [ready, setReady] = useState(!!cached);
  const [source, setSource] = useState<'mc-assets' | 'legacy' | null>(
    cached?.source ?? null
  );
  const mountedRef = useRef(true);
  const versionRef = useRef(version);
  versionRef.current = version;

  useEffect(() => {
    mountedRef.current = true;

    if (cached) {
      setReady(true);
      setSource(cached.source);
      return;
    }

    const loadVersion = version;
    const loadCacheKey = getCacheKey(loadVersion);
    let loadPromise = loadPromisesByVersion.get(loadCacheKey);
    if (!loadPromise) {
      loadPromise = loadAtlas(loadVersion).then((entry) => {
        cacheByVersion.set(loadCacheKey, entry);
      });
      loadPromisesByVersion.set(loadCacheKey, loadPromise);
    }

    loadPromise
      .then(() => {
        if (!mountedRef.current || versionRef.current !== loadVersion) return;
        const entry = cacheByVersion.get(loadCacheKey);
        if (entry) {
          setReady(true);
          setSource(entry.source);
        }
      })
      .catch((err) => {
        console.error('[useAtlasMaterial] Failed to load atlas:', err);
      });

    return () => {
      mountedRef.current = false;
    };
  }, [version, cacheKey]);

  const entry = cacheByVersion.get(cacheKey);
  return {
    material: entry?.material ?? null,
    atlasIndex: entry?.atlasIndex ?? null,
    blockStates: entry?.blockStates ?? null,
    isReady: ready,
    atlasSource: source,
    version: entry?.version ?? version,
  };
}
