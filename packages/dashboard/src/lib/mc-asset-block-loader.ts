/**
 * MC Asset Block Loader — Uses Minecraft asset pipeline (blockStates + atlas)
 *
 * Fetches blockStates and texture atlas from /api/mc-assets (same source as
 * the Prismarine viewer). Builds Three.js BufferGeometry from model elements
 * so the building designer matches the viewer's block shapes and textures.
 *
 * @author @darianrosebrook
 */

import * as THREE from 'three';

const S = (n: number) => n / 16;

// Default plains biome grass color (#91BD59) normalized to 0–1 RGB.
// Used for faces with tintindex=0 (grass_block top, side overlay, vegetation).
const GRASS_TINT: [number, number, number] = [0x91 / 255, 0xBD / 255, 0x59 / 255];

/** Resolved blockStates model element (from asset pipeline) */
interface ResolvedElement {
  from: [number, number, number];
  to: [number, number, number];
  rotation?: {
    origin: [number, number, number];
    axis: 'x' | 'y' | 'z';
    angle: number;
  };
  faces: Record<
    string,
    { texture: { u: number; v: number; su: number; sv: number }; uv?: number[]; tintindex?: number }
  >;
}

/** Resolved model from blockStates */
interface ResolvedModel {
  elements: ResolvedElement[];
  ao?: boolean;
}

/** BlockStates JSON structure (subset we need) */
export interface BlockStatesData {
  [blockName: string]: {
    variants?: {
      [key: string]:
        | { model: ResolvedModel; x?: number; y?: number }
        | Array<{ model: ResolvedModel; x?: number; y?: number }>;
    };
    multipart?: Array<{ when?: unknown; apply: { model: ResolvedModel } }>;
  };
}

const FACE_CORNERS: Record<
  string,
  { dir: [number, number, number]; corners: number[][] }
> = {
  up: {
    dir: [0, 1, 0],
    corners: [
      [0, 1, 1, 0, 1],
      [1, 1, 1, 1, 1],
      [0, 1, 0, 0, 0],
      [1, 1, 0, 1, 0],
    ],
  },
  down: {
    dir: [0, -1, 0],
    corners: [
      [1, 0, 1, 0, 1],
      [0, 0, 1, 1, 1],
      [1, 0, 0, 0, 0],
      [0, 0, 0, 1, 0],
    ],
  },
  east: {
    dir: [1, 0, 0],
    corners: [
      [1, 1, 1, 0, 0],
      [1, 0, 1, 0, 1],
      [1, 1, 0, 1, 0],
      [1, 0, 0, 1, 1],
    ],
  },
  west: {
    dir: [-1, 0, 0],
    corners: [
      [0, 1, 0, 0, 0],
      [0, 0, 0, 0, 1],
      [0, 1, 1, 1, 0],
      [0, 0, 1, 1, 1],
    ],
  },
  north: {
    dir: [0, 0, -1],
    corners: [
      [1, 0, 0, 0, 1],
      [0, 0, 0, 1, 1],
      [1, 1, 0, 0, 0],
      [0, 1, 0, 1, 0],
    ],
  },
  south: {
    dir: [0, 0, 1],
    corners: [
      [0, 0, 1, 0, 1],
      [1, 0, 1, 1, 1],
      [0, 1, 1, 0, 0],
      [1, 1, 1, 1, 0],
    ],
  },
};

function matmul3(
  matrix: number[][] | null,
  vector: number[]
): number[] {
  if (!matrix) return vector;
  return [
    matrix[0][0] * vector[0] + matrix[0][1] * vector[1] + matrix[0][2] * vector[2],
    matrix[1][0] * vector[0] + matrix[1][1] * vector[1] + matrix[1][2] * vector[2],
    matrix[2][0] * vector[0] + matrix[2][1] * vector[1] + matrix[2][2] * vector[2],
  ];
}

function buildRotationMatrix(axis: 'x' | 'y' | 'z', degree: number): number[][] {
  const radians = (degree / 180) * Math.PI;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const axis0 = { x: 0, y: 1, z: 2 }[axis];
  const axis1 = (axis0 + 1) % 3;
  const axis2 = (axis0 + 2) % 3;

  const matrix: number[][] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  matrix[axis0][axis0] = 1;
  matrix[axis1][axis1] = cos;
  matrix[axis1][axis2] = -sin;
  matrix[axis2][axis1] = sin;
  matrix[axis2][axis2] = cos;
  return matrix;
}

/** Block state for variant lookup (subset of properties). */
export interface BlockStateForVariant {
  half?: string;
  facing?: string;
  type?: string;
  open?: boolean;
  shape?: string;
}

/** Parse variant key "half=bottom,facing=north" to object. */
function parseVariantKey(key: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of key.split(',')) {
    const [k, v] = part.split('=');
    if (k && v) out[k.trim()] = v.trim();
  }
  return out;
}

/** Check if our block state matches a variant key (all our props must match). */
function variantMatches(state: BlockStateForVariant, variantKey: string): boolean {
  const variantProps = parseVariantKey(variantKey);
  if (state.half !== undefined && variantProps.half !== state.half) return false;
  if (state.facing !== undefined && variantProps.facing !== state.facing) return false;
  if (state.type !== undefined && variantProps.type !== state.type) return false;
  if (state.open !== undefined && variantProps.open !== String(state.open)) return false;
  if (state.shape !== undefined && variantProps.shape !== state.shape) return false;
  return true;
}

function getModelForBlock(
  blockStates: BlockStatesData,
  blockType: string,
  blockState?: BlockStateForVariant | null,
): ResolvedModel | null {
  const name = blockType.replace(/^minecraft:/, '');
  const state = blockStates[name] ?? blockStates[`minecraft:${name}`];
  if (!state) return null;

  if (state.variants) {
    const keys = Object.keys(state.variants);

    if (blockState && Object.keys(blockState).length > 0) {
      const exactKey = keys.find((k) => k === blockStateToVariantKey(blockState));
      if (exactKey) {
        const variant = state.variants[exactKey];
        if (Array.isArray(variant)) return variant[0]?.model ?? null;
        return variant?.model ?? null;
      }
      const matchKey = keys.find((k) => variantMatches(blockState, k));
      if (matchKey) {
        const variant = state.variants[matchKey];
        if (Array.isArray(variant)) return variant[0]?.model ?? null;
        return variant?.model ?? null;
      }
    }

    const firstKey = keys[0];
    const variant = state.variants[firstKey];
    if (Array.isArray(variant)) return variant[0]?.model ?? null;
    return variant?.model ?? null;
  }
  const firstPart = state.multipart?.[0];
  if (firstPart?.apply) {
    const apply = firstPart.apply as
      | { model: ResolvedModel }
      | Array<{ model: ResolvedModel }>;
    const model = Array.isArray(apply) ? apply[0]?.model : apply.model;
    return model ?? null;
  }
  return null;
}

/** Build variant key string for blockStates lookup (alphabetical by key, matches Minecraft). */
function blockStateToVariantKey(state: BlockStateForVariant): string {
  const parts: string[] = [];
  if (state.facing) parts.push(`facing=${state.facing}`);
  if (state.half) parts.push(`half=${state.half}`);
  if (state.open !== undefined) parts.push(`open=${state.open}`);
  if (state.shape) parts.push(`shape=${state.shape}`);
  if (state.type) parts.push(`type=${state.type}`);
  return parts.join(',');
}

function buildGeometryFromModel(model: ResolvedModel): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  for (const element of model.elements) {
    const minx = element.from[0];
    const miny = element.from[1];
    const minz = element.from[2];
    const maxx = element.to[0];
    const maxy = element.to[1];
    const maxz = element.to[2];

    let localMatrix: number[][] | null = null;
    let localShift: number[] | null = null;

    if (element.rotation) {
      localMatrix = buildRotationMatrix(
        element.rotation.axis,
        element.rotation.angle
      );
      const origin = element.rotation.origin;
      const rotatedOrigin = matmul3(localMatrix, origin);
      localShift = [
        origin[0] - rotatedOrigin[0],
        origin[1] - rotatedOrigin[1],
        origin[2] - rotatedOrigin[2],
      ];
    }

    // Half-texel inset (same as block-geometry-builder applyAtlasUVs) to avoid sampling
    // at tile boundaries (e.g. grass_block_top vs adjacent gravel with NearestFilter).
    const ATLAS_PIXEL_SIZE = 4096;
    const halfTexelNorm = 0.5 / ATLAS_PIXEL_SIZE;

    // V convention: mc-assets texture is loaded with flipY=false so GPU v=0 maps to the
    // image top, matching the pipeline's canvas convention (v=0 at top). No per-face V flip.
    for (const faceName of Object.keys(element.faces)) {
      const face = element.faces[faceName];
      const tint = face.tintindex === 0 ? GRASS_TINT : null;
      const { dir, corners } = FACE_CORNERS[faceName];

      const u = face.texture.u + halfTexelNorm;
      const v = face.texture.v + halfTexelNorm;
      const su = face.texture.su - 2 * halfTexelNorm;
      const sv = face.texture.sv - 2 * halfTexelNorm;

      const ndx = Math.floor(positions.length / 3);

      for (const pos of corners) {
        let vertex = [
          pos[0] ? maxx : minx,
          pos[1] ? maxy : miny,
          pos[2] ? maxz : minz,
        ];

        vertex = localMatrix
          ? [
              vertex[0] * localMatrix[0][0] + vertex[1] * localMatrix[0][1] + vertex[2] * localMatrix[0][2],
              vertex[0] * localMatrix[1][0] + vertex[1] * localMatrix[1][1] + vertex[2] * localMatrix[1][2],
              vertex[0] * localMatrix[2][0] + vertex[1] * localMatrix[2][1] + vertex[2] * localMatrix[2][2],
            ]
          : vertex;
        if (localShift) {
          vertex = [
            vertex[0] + localShift[0],
            vertex[1] + localShift[1],
            vertex[2] + localShift[2],
          ];
        }

        // Convert 16ths to 0-1 block space, then center at 0 (mesh position adds 0.5)
        positions.push(S(vertex[0]) - 0.5, S(vertex[1]) - 0.5, S(vertex[2]) - 0.5);
        normals.push(...dir);

        const baseu = pos[3];
        const basev = pos[4];
        uvs.push(baseu * su + u, basev * sv + v);
        colors.push(tint ? tint[0] : 1, tint ? tint[1] : 1, tint ? tint[2] : 1);
      }

      indices.push(ndx, ndx + 1, ndx + 2, ndx + 2, ndx + 1, ndx + 3);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

  const indicesTyped = new Uint32Array(indices);
  geo.setIndex(new THREE.BufferAttribute(indicesTyped, 1));

  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  return geo;
}

/** Default MC version when assets unavailable (viewer fallback) */
export const DEFAULT_MC_VERSION = '1.21.4';

const blockStatesCache = new Map<string, BlockStatesData>();
const loadPromises = new Map<string, Promise<BlockStatesData>>();

function loadBlockStates(version: string): Promise<BlockStatesData> {
  const cached = blockStatesCache.get(version);
  if (cached) return Promise.resolve(cached);

  let promise = loadPromises.get(version);
  if (!promise) {
    promise = fetch(`/api/mc-assets/blocksStates/${version}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`BlockStates ${version}: ${r.status}`);
        return r.json();
      })
      .then((data: BlockStatesData) => {
        blockStatesCache.set(version, data);
        return data;
      })
      .catch((err) => {
        loadPromises.delete(version);
        throw err;
      });
    loadPromises.set(version, promise);
  }
  return promise;
}

const geometryCache = new Map<string, THREE.BufferGeometry>();

/** Cache key for geometry (blockType + optional blockState). */
function geometryCacheKey(blockType: string, blockState?: BlockStateForVariant | null): string {
  if (!blockState || Object.keys(blockState).length === 0) return blockType;
  return `${blockType}|${blockStateToVariantKey(blockState)}`;
}

/**
 * Build BufferGeometry for a block type from blockStates.
 * When blockState is provided (slabs, trapdoors, torches, etc.), selects the matching variant.
 * Returns null if block not found or blockStates unavailable.
 */
export function buildBlockGeometryFromAssets(
  blockType: string,
  blockStates: BlockStatesData,
  blockState?: BlockStateForVariant | null,
): THREE.BufferGeometry | null {
  const cacheKey = geometryCacheKey(blockType, blockState);
  const cached = geometryCache.get(cacheKey);
  if (cached) return cached.clone();

  const model = getModelForBlock(blockStates, blockType, blockState);
  if (blockType === 'grass_block' || blockType === 'minecraft:grass_block') {
    const state = blockStates['grass_block'] ?? blockStates['minecraft:grass_block'];
    console.info('[mc-asset-block-loader] grass_block: model=', model ? 'resolved' : 'null', state ? `state keys=${Object.keys(state).join(',')}` : 'no state', model && typeof model === 'object' && model.elements ? `elements=${model.elements.length}` : '');
  }
  if (!model || typeof model === 'string' || !model.elements?.length) return null;

  const geo = buildGeometryFromModel(model);
  geometryCache.set(cacheKey, geo);
  return geo.clone();
}

/**
 * Load blockStates and build geometry for a block type.
 * Uses /api/mc-assets (proxied to minecraft-interface).
 */
export async function loadBlockGeometry(
  blockType: string,
  version: string = DEFAULT_MC_VERSION
): Promise<THREE.BufferGeometry | null> {
  try {
    const blockStates = await loadBlockStates(version);
    return buildBlockGeometryFromAssets(blockType, blockStates);
  } catch {
    return null;
  }
}

/**
 * Preload blockStates for a version. Call early to avoid delay on first block.
 */
export function preloadBlockStates(version: string = DEFAULT_MC_VERSION): Promise<BlockStatesData> {
  return loadBlockStates(version);
}

/**
 * Get texture atlas URL for materials picker and block rendering.
 */
export function getAtlasTextureUrl(version: string = DEFAULT_MC_VERSION): string {
  return `/api/mc-assets/textures/${version}.png`;
}

/**
 * Get atlas index URL (texture name -> UV mapping) for Build tab fallback.
 * When available, populates atlasIndex.textures so applyAtlasUVs uses correct UVs.
 */
export function getAtlasIndexUrl(version: string = DEFAULT_MC_VERSION): string {
  return `/api/mc-assets/atlas-index/${version}.json`;
}

/**
 * Returns true if geometry for this block type can be built from blockStates (model path).
 * Used by diagnostic overlay to show grass_block geometry source (model vs applyAtlasUVs).
 */
export function canBuildFromAssets(
  blockType: string,
  blockStates: BlockStatesData | null,
): boolean {
  if (!blockStates) return false;
  const model = getModelForBlock(blockStates, blockType, null);
  return !!(
    model &&
    typeof model === 'object' &&
    Array.isArray(model.elements) &&
    model.elements.length > 0
  );
}

/** Clear caches (e.g. on hot reload) */
export function clearMcAssetCaches(): void {
  blockStatesCache.clear();
  loadPromises.clear();
  for (const g of geometryCache.values()) g.dispose();
  geometryCache.clear();
}
