/**
 * useAtlasMaterial — loads the texture atlas and creates a shared material
 *
 * The atlas index JSON is generated at build time by vite-plugin-texture-atlas.
 * At runtime, this hook composites individual 16×16 PNGs into a single atlas
 * texture using an OffscreenCanvas (or regular canvas), then creates one
 * MeshLambertMaterial with vertexColors enabled.
 *
 * This means we go from 107 separate materials/draw calls to 1 shared material.
 */

import { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { AtlasIndex } from '@/types/atlas';

// Singleton state — shared across all components using this hook
let cachedMaterial: THREE.MeshLambertMaterial | null = null;
let cachedIndex: AtlasIndex | null = null;
let loadPromise: Promise<void> | null = null;

async function loadAtlas(): Promise<{ material: THREE.MeshLambertMaterial; atlasIndex: AtlasIndex }> {
  // Fetch the index JSON
  const res = await fetch('/atlas/blocks-atlas-index.json');
  const index: AtlasIndex = await res.json();

  const { atlasPixelSize, tileSize, textureNames, textures } = index;

  // Create a canvas to composite all tiles
  const canvas = document.createElement('canvas');
  canvas.width = atlasPixelSize;
  canvas.height = atlasPixelSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get 2d context for atlas canvas');

  // Load all tile images in parallel
  const loadImage = (name: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => {
        // Missing texture — create a magenta placeholder
        const placeholder = document.createElement('canvas');
        placeholder.width = tileSize;
        placeholder.height = tileSize;
        const pCtx = placeholder.getContext('2d');
        if (!pCtx) return reject(new Error(`Failed to get 2d context for placeholder ${name}`));
        pCtx.fillStyle = '#ff00ff';
        pCtx.fillRect(0, 0, tileSize, tileSize);
        // Return a synthetic image from the placeholder canvas
        const pImg = new Image();
        pImg.src = placeholder.toDataURL();
        pImg.onload = () => resolve(pImg);
        pImg.onerror = () => reject(new Error(`Failed to load placeholder for ${name}`));
      };
      img.src = `/block_textures/${name}.png`;
    });

  const images = await Promise.all(textureNames.map(loadImage));

  // Draw each tile into the atlas at its grid position
  textureNames.forEach((name: string, i: number) => {
    const entry = textures[name];
    if (!entry) return;
    ctx.drawImage(images[i], entry.col * tileSize, entry.row * tileSize, tileSize, tileSize);
  });

  // Create THREE.js texture from the composited canvas.
  // Disable flipY so UV v=0 maps to canvas top (row 0), matching
  // the atlas index which computes v = row / gridSize in canvas space.
  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = false;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  // Create shared material — use MeshLambertMaterial for clearer visibility
  // (MeshStandardMaterial PBR was rendering too dark with atlas textures)
  const material = new THREE.MeshLambertMaterial({
    map: texture,
    vertexColors: true,
  });

  return { material, atlasIndex: index };
}

export function useAtlasMaterial(): {
  material: THREE.MeshLambertMaterial | null;
  atlasIndex: AtlasIndex | null;
  isReady: boolean;
} {
  const [ready, setReady] = useState(cachedMaterial !== null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    if (cachedMaterial && cachedIndex) {
      setReady(true);
      return;
    }

    if (!loadPromise) {
      loadPromise = loadAtlas().then(({ material, atlasIndex }) => {
        cachedMaterial = material;
        cachedIndex = atlasIndex;
      });
    }

    loadPromise.then(() => {
      if (mountedRef.current) setReady(true);
    }).catch((err) => {
      console.error('[useAtlasMaterial] Failed to load atlas:', err);
    });

    return () => {
      mountedRef.current = false;
    };
  }, []);

  return {
    material: cachedMaterial,
    atlasIndex: cachedIndex,
    isReady: ready,
  };
}
