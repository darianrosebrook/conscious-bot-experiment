/**
 * BlockCanvas — 3D block builder using React Three Fiber
 *
 * Renders a grid floor, placed blocks, and a ghost-block preview.
 * Uses an atlas-based rendering system: all block textures are packed
 * into a single texture atlas, with per-face UV mapping (grass top vs
 * side, log bark vs rings, etc.) and baked ambient occlusion.
 *
 * Handles click-to-place/erase via the useBlockPlacement hook.
 */

import { useRef, useState, useMemo, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import type { Vec3, BlockState } from '@/types/building';
import { blockStateToVariantKey } from '@/lib/block-state-deriver';
import { useBuildingStore } from '@/stores/building-store';
import { useBlockPlacement } from '@/hooks/use-block-placement';
import { useAtlasMaterial } from '@/hooks/use-atlas-material';
import { createBlockGeometry } from '@/lib/block-geometry-builder';
import { bakeBlockAO } from '@/lib/ambient-occlusion';
import type { AtlasIndex } from '@/types/atlas';
import { canBuildFromAssets, type BlockStatesData, type BlockStateForVariant } from '@/lib/mc-asset-block-loader';
import { generatePlatformTerrain } from '@/lib/platform-terrain';
import s from './block-canvas.module.scss';

const posKey = (p: { x: number; y: number; z: number }) => `${p.x},${p.y},${p.z}`;

// ─── Individual Block mesh (atlas-based) ─────────────────────────────────────

/** Convert BlockState to BlockStateForVariant for geometry lookup. */
function toVariantState(s?: BlockState | null): BlockStateForVariant | null {
  if (!s || Object.keys(s).length === 0) return null;
  const out: BlockStateForVariant = {};
  if (s.half) out.half = s.half;
  if (s.facing) out.facing = s.facing;
  if (s.type) out.type = s.type;
  if (s.open !== undefined) out.open = s.open;
  if (s.shape) out.shape = s.shape;
  return out;
}

function BlockMesh({
  position,
  blockType,
  blockState,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  atlasIndex,
  blockStates,
  material,
  blockIndex,
  isSelected,
}: {
  position: Vec3;
  blockType: string;
  blockState?: BlockState | null;
  onPointerDown: (_e: ThreeEvent<PointerEvent>) => void;
  onPointerMove: (_e: ThreeEvent<PointerEvent>) => void;
  onPointerUp: (_e: ThreeEvent<PointerEvent>) => void;
  atlasIndex: AtlasIndex;
  blockStates: BlockStatesData | null;
  material: THREE.MeshLambertMaterial;
  blockIndex: Set<string>;
  isSelected?: boolean;
}) {
  const variantState = toVariantState(blockState);
  const geometry = useMemo(() => {
    const geo = createBlockGeometry(blockType, atlasIndex, blockStates, variantState).clone();
    // Apply per-block AO to the cloned geometry's vertex colors
    const aoColors = bakeBlockAO(position, blockIndex);
    geo.setAttribute('color', new THREE.BufferAttribute(aoColors, 3));
    return geo;
  }, [blockType, atlasIndex, blockStates, variantState, position, blockIndex]);

  const mat = useMemo(() => {
    if (!isSelected) return material;
    const m = material.clone();
    m.emissive = new THREE.Color(0.2, 0.4, 0.6);
    m.emissiveIntensity = 0.3;
    return m;
  }, [material, isSelected]);

  return (
    <mesh
      position={[position.x + 0.5, position.y + 0.5, position.z + 0.5]}
      geometry={geometry}
      material={mat}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    />
  );
}

// ─── Instanced blocks (atlas-based, same blockType) ──────────────────────────

function InstancedBlocks({
  blockType,
  blockState,
  positions,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  atlasIndex,
  blockStates,
  material,
}: {
  blockType: string;
  blockState?: BlockState | null;
  positions: Vec3[];
  onPointerDown: (_e: ThreeEvent<PointerEvent>) => void;
  onPointerMove: (_e: ThreeEvent<PointerEvent>) => void;
  onPointerUp: (_e: ThreeEvent<PointerEvent>) => void;
  atlasIndex: AtlasIndex;
  blockStates: BlockStatesData | null;
  material: THREE.MeshLambertMaterial;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const variantState = toVariantState(blockState);
  const geometry = useMemo(
    () => createBlockGeometry(blockType, atlasIndex, blockStates, variantState),
    [blockType, atlasIndex, blockStates, variantState],
  );

  useMemo(() => {
    if (!meshRef.current) return;
    const dummy = new THREE.Object3D();
    positions.forEach((pos, i) => {
      dummy.position.set(pos.x + 0.5, pos.y + 0.5, pos.z + 0.5);
      dummy.updateMatrix();
      meshRef.current?.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [positions]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, positions.length]}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    />
  );
}

// ─── Selected block highlight (wireframe) ─────────────────────────────────────

function SelectedBlockHighlight({ position }: { position: Vec3 }) {
  const edgesGeometry = useMemo(() => {
    const box = new THREE.BoxGeometry(1.02, 1.02, 1.02);
    return new THREE.EdgesGeometry(box);
  }, []);
  return (
    <lineSegments
      position={[position.x + 0.5, position.y + 0.5, position.z + 0.5]}
      geometry={edgesGeometry}
    >
      <lineBasicMaterial color="#4a9eff" />
    </lineSegments>
  );
}

// ─── Ghost block preview ─────────────────────────────────────────────────────

function GhostBlock({
  position,
  blockType,
  atlasIndex,
  blockStates,
  material,
}: {
  position: Vec3;
  blockType: string;
  atlasIndex: AtlasIndex;
  blockStates: BlockStatesData | null;
  material: THREE.MeshLambertMaterial;
}) {
  const ghostMaterial = useMemo(() => {
    const mat = material.clone();
    mat.transparent = true;
    mat.opacity = 0.4;
    return mat;
  }, [material]);

  const geometry = useMemo(
    () => createBlockGeometry(blockType, atlasIndex, blockStates),
    [blockType, atlasIndex, blockStates],
  );

  return (
    <mesh
      position={[position.x + 0.5, position.y + 0.5, position.z + 0.5]}
      geometry={geometry}
      material={ghostMaterial}
    />
  );
}

// ─── Animated block (pop-in for playback) ────────────────────────────────────

function AnimatedBlock({
  position,
  blockType,
  blockState,
  atlasIndex,
  blockStates,
  material,
  blockIndex,
  isLatest,
}: {
  position: Vec3;
  blockType: string;
  blockState?: BlockState | null;
  atlasIndex: AtlasIndex;
  blockStates: BlockStatesData | null;
  material: THREE.MeshLambertMaterial;
  blockIndex: Set<string>;
  isLatest: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const startTime = useRef(performance.now());
  const animDuration = 150; // ms
  const variantState = toVariantState(blockState);

  const geometry = useMemo(() => {
    const geo = createBlockGeometry(blockType, atlasIndex, blockStates, variantState).clone();
    const aoColors = bakeBlockAO(position, blockIndex);
    geo.setAttribute('color', new THREE.BufferAttribute(aoColors, 3));
    return geo;
  }, [blockType, atlasIndex, blockStates, variantState, position, blockIndex]);

  useFrame(() => {
    if (!meshRef.current || !isLatest) return;
    const elapsed = performance.now() - startTime.current;
    const t = Math.min(elapsed / animDuration, 1);
    // easeOutBack: overshoots slightly then settles
    const c1 = 1.70158;
    const c3 = c1 + 1;
    const scale = 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    meshRef.current.scale.setScalar(Math.max(0.1, scale));
  });

  return (
    <mesh
      ref={meshRef}
      position={[position.x + 0.5, position.y + 0.5, position.z + 0.5]}
      geometry={geometry}
      material={material}
      scale={isLatest ? 0.1 : 1}
    />
  );
}

// ─── Platform terrain (stone + grass_block + vegetation) ──────────────────────

function PlatformTerrain({
  terrainBlocks,
  fullBlockIndex,
  handleBlockPointerDown,
  handleBlockPointerMove,
  handlePointerUp,
  atlasIndex,
  blockStates,
  material,
}: {
  terrainBlocks: Array<{ position: Vec3; blockType: string; blockState?: BlockState }>;
  fullBlockIndex: Set<string>;
  handleBlockPointerDown: (_e: ThreeEvent<PointerEvent>) => void;
  handleBlockPointerMove: (_e: ThreeEvent<PointerEvent>) => void;
  handlePointerUp: (_e: ThreeEvent<PointerEvent>) => void;
  atlasIndex: AtlasIndex;
  blockStates: BlockStatesData | null;
  material: THREE.MeshLambertMaterial;
}) {
  return (
    <>
      {terrainBlocks.map((t) => (
        <BlockMesh
          key={`terrain-${t.blockType}-${t.position.x},${t.position.y},${t.position.z}`}
          position={t.position}
          blockType={t.blockType}
          blockState={t.blockState}
          onPointerDown={handleBlockPointerDown}
          onPointerMove={handleBlockPointerMove}
          onPointerUp={handlePointerUp}
          atlasIndex={atlasIndex}
          blockStates={blockStates}
          material={material}
          blockIndex={fullBlockIndex}
        />
      ))}
    </>
  );
}

// ─── Scene content ───────────────────────────────────────────────────────────

interface SceneAtlasProps {
  material: THREE.MeshLambertMaterial | null;
  atlasIndex: AtlasIndex | null;
  blockStates: BlockStatesData | null;
  isReady: boolean;
}

function SceneContent({
  material,
  atlasIndex,
  blockStates,
  isReady,
}: SceneAtlasProps) {
  const blocks = useBuildingStore((s) => s.blocks);
  const blockIndex = useBuildingStore((s) => s.blockIndex);
  const gridSize = useBuildingStore((s) => s.gridSize);
  const buildMode = useBuildingStore((s) => s.buildMode);
  const selectedBlockType = useBuildingStore((s) => s.selectedBlockType);
  const playbackMode = useBuildingStore((s) => s.playbackMode);
  const currentBlockIndex = useBuildingStore((s) => s.currentBlockIndex);
  const playbackBlocks = useBuildingStore((s) => s.playbackBlocks);

  const {
    handleBlockPointerDown,
    handleFloorPointerDown,
    handlePointerMove,
    handlePointerUp,
    getGhostPosition,
    dragLine,
  } = useBlockPlacement();
  const selectedBlockPosition = useBuildingStore((s) => s.selectedBlockPosition);

  const [ghostPos, setGhostPos] = useState<Vec3 | null>(null);

  const handleFloorPointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      handlePointerMove(e);
      if (dragLine.length === 0) setGhostPos(getGhostPosition(e, true));
    },
    [getGhostPosition, handlePointerMove, dragLine.length],
  );

  const handleBlockPointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      handlePointerMove(e);
      if (dragLine.length === 0) setGhostPos(getGhostPosition(e, false));
    },
    [getGhostPosition, handlePointerMove, dragLine.length],
  );

  const handlePointerLeave = useCallback(() => setGhostPos(null), []);

  // Determine which blocks to render based on playback state
  const visibleBlocks = useMemo(() => {
    if (playbackMode !== 'off' && playbackBlocks.length > 0) {
      return playbackBlocks.slice(0, currentBlockIndex);
    }
    return blocks;
  }, [playbackMode, playbackBlocks, currentBlockIndex, blocks]);

  // Build a temporary blockIndex for visible blocks (for AO during playback)
  const visibleBlockIndex = useMemo(() => {
    if (playbackMode === 'off') return blockIndex;
    const idx = new Set<string>();
    for (const b of visibleBlocks) {
      idx.add(posKey(b.position));
    }
    return idx;
  }, [playbackMode, visibleBlocks, blockIndex]);

  // Platform terrain: procedural stone + grass_block + vegetation
  const terrainBlocks = useMemo(
    () => generatePlatformTerrain(gridSize),
    [gridSize.x, gridSize.z],
  );
  const filteredTerrain = useMemo(
    () => terrainBlocks.filter((t) => !visibleBlockIndex.has(posKey(t.position))),
    [terrainBlocks, visibleBlockIndex],
  );
  const fullBlockIndex = useMemo(() => {
    const idx = new Set(visibleBlockIndex);
    for (const t of filteredTerrain) idx.add(posKey(t.position));
    return idx;
  }, [visibleBlockIndex, filteredTerrain]);

  // Group blocks by (blockType, blockState) for instancing — same geometry per group
  const blocksByType = useMemo(() => {
    const map = new Map<
      string,
      { blockType: string; blockState?: BlockState; positions: Vec3[] }
    >();
    for (const b of visibleBlocks) {
      const stateKey = b.blockState ? blockStateToVariantKey(b.blockState) : '';
      const groupKey = stateKey ? `${b.blockType}|${stateKey}` : b.blockType;
      const existing = map.get(groupKey);
      if (existing) {
        existing.positions.push(b.position);
      } else {
        map.set(groupKey, {
          blockType: b.blockType,
          blockState: b.blockState,
          positions: [b.position],
        });
      }
    }
    return map;
  }, [visibleBlocks]);

  const USE_INSTANCING_THRESHOLD = 100;

  // The latest block during playback (for pop-in animation)
  const latestPlaybackBlock = useMemo(() => {
    if (playbackMode === 'off' || currentBlockIndex <= 0) return null;
    return playbackBlocks[currentBlockIndex - 1] ?? null;
  }, [playbackMode, currentBlockIndex, playbackBlocks]);

  if (!isReady || !material || !atlasIndex) {
    return (
      <>
        <ambientLight intensity={0.9} />
        <Grid
          args={[gridSize.x, gridSize.z]}
          position={[gridSize.x / 2, 1.02, gridSize.z / 2]}
          cellSize={1}
          cellThickness={0.5}
          cellColor="#1a3a5c"
          sectionSize={4}
          sectionThickness={1}
          sectionColor="#2a5a9a"
          fadeDistance={50}
          infiniteGrid={false}
        />
      </>
    );
  }

  return (
    <>
      {/* Lighting (matches viewer quality) */}
      <ambientLight intensity={1.5} />
      <directionalLight position={[1, 2, 0.5]} intensity={1.0} />
      <directionalLight position={[-1, 1, -0.5]} intensity={0.4} />

      {/* Grid overlay (raised above platform surface) */}
      <Grid
        args={[gridSize.x, gridSize.z]}
        position={[gridSize.x / 2, 1.02, gridSize.z / 2]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#1a3a5c"
        sectionSize={4}
        sectionThickness={1}
        sectionColor="#2a5a9a"
        fadeDistance={50}
        infiniteGrid={false}
      />

      {/* Invisible click plane for floor (top of platform at y=1) */}
      <mesh
        position={[gridSize.x / 2, 1, gridSize.z / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={handleFloorPointerDown}
        onPointerMove={handleFloorPointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        visible={false}
      >
        <planeGeometry args={[gridSize.x, gridSize.z]} />
        <meshBasicMaterial />
      </mesh>

      {/* Platform terrain (stone, grass_block, vegetation) */}
      <PlatformTerrain
        terrainBlocks={filteredTerrain}
        fullBlockIndex={fullBlockIndex}
        handleBlockPointerDown={handleBlockPointerDown}
        handleBlockPointerMove={handleBlockPointerMove}
        handlePointerUp={handlePointerUp}
        atlasIndex={atlasIndex}
        blockStates={blockStates}
        material={material}
      />

      {/* Placed blocks */}
      {playbackMode !== 'off' && latestPlaybackBlock ? (
        // During playback: render all blocks with animated latest
        <>
          {visibleBlocks.map((b, i) => {
            const isLatest =
              i === currentBlockIndex - 1 &&
              b.position.x === latestPlaybackBlock.position.x &&
              b.position.y === latestPlaybackBlock.position.y &&
              b.position.z === latestPlaybackBlock.position.z;

            return (
              <AnimatedBlock
                key={`pb-${b.position.x},${b.position.y},${b.position.z}`}
                position={b.position}
                blockType={b.blockType}
                blockState={b.blockState}
                atlasIndex={atlasIndex}
                blockStates={blockStates}
                material={material}
                blockIndex={fullBlockIndex}
                isLatest={isLatest}
              />
            );
          })}
        </>
      ) : (
        // Normal mode: group by (type, blockState), use instancing for large groups
        Array.from(blocksByType.values()).map(({ blockType, blockState, positions }) => {
          const groupKey =
            blockState ? `${blockType}|${blockStateToVariantKey(blockState)}` : blockType;
          return positions.length > USE_INSTANCING_THRESHOLD ? (
            <InstancedBlocks
              key={groupKey}
              blockType={blockType}
              blockState={blockState}
              positions={positions}
              onPointerDown={handleBlockPointerDown}
              onPointerMove={handleBlockPointerMove}
              onPointerUp={handlePointerUp}
              atlasIndex={atlasIndex}
              blockStates={blockStates}
              material={material}
            />
          ) : (
            positions.map((pos) => (
              <BlockMesh
                key={`${groupKey}-${pos.x},${pos.y},${pos.z}`}
                position={pos}
                blockType={blockType}
                blockState={blockState}
                onPointerDown={handleBlockPointerDown}
                onPointerMove={handleBlockPointerMove}
                onPointerUp={handlePointerUp}
                atlasIndex={atlasIndex}
                blockStates={blockStates}
                material={material}
                blockIndex={fullBlockIndex}
                isSelected={
                  selectedBlockPosition !== null &&
                  selectedBlockPosition.x === pos.x &&
                  selectedBlockPosition.y === pos.y &&
                  selectedBlockPosition.z === pos.z
                }
              />
            ))
          );
        })
      )}

      {/* Ghost block(s) — single hover or drag line */}
      {buildMode === 'place' && playbackMode === 'off' && (
        <>
          {dragLine.length > 0 &&
            dragLine.map((pos, i) => (
              <GhostBlock
                key={`ghost-${pos.x},${pos.y},${pos.z}-${i}`}
                position={pos}
                blockType={selectedBlockType}
                atlasIndex={atlasIndex}
                blockStates={blockStates}
                material={material}
              />
            ))}
          {dragLine.length === 0 && ghostPos && (
            <GhostBlock
              position={ghostPos}
              blockType={selectedBlockType}
              atlasIndex={atlasIndex}
              blockStates={blockStates}
              material={material}
            />
          )}
        </>
      )}

      {/* Selected block highlight (shift+click) */}
      {selectedBlockPosition && playbackMode === 'off' && (
        <SelectedBlockHighlight position={selectedBlockPosition} />
      )}

      {/* Camera — right-drag orbits, shift+right-drag pans.
          Left-click is reserved for block placement. */}
      <OrbitControls
        makeDefault
        target={[gridSize.x / 2, 2, gridSize.z / 2]}
        minDistance={3}
        maxDistance={40}
        maxPolarAngle={Math.PI / 2 - 0.05}
        mouseButtons={{
          LEFT: -1 as any,                           // disable — used for blocks
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.ROTATE,
        }}
        enablePan
      />
    </>
  );
}

// ─── Public Component ────────────────────────────────────────────────────────

export interface BlockCanvasProps {
  /** MC version from viewer-status so Building tab uses same textures as Live viewer */
  mcVersion?: string | null;
}

export function BlockCanvas({ mcVersion }: BlockCanvasProps = {}) {
  const blockCount = useBuildingStore((s) => s.blocks.length);
  const playbackMode = useBuildingStore((s) => s.playbackMode);
  const currentBlockIndex = useBuildingStore((s) => s.currentBlockIndex);
  const playbackBlocks = useBuildingStore((s) => s.playbackBlocks);

  const {
    material,
    atlasIndex,
    blockStates,
    isReady,
    atlasSource,
    version,
  } = useAtlasMaterial(mcVersion);

  const showDiagnostic =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('diagnostic') === '1';
  const atlasKeyCount = atlasIndex?.textures ? Object.keys(atlasIndex.textures).length : 0;
  const blockStatesKeyCount = blockStates ? Object.keys(blockStates).length : 0;
  const grassBlockSource =
    isReady && blockStates
      ? canBuildFromAssets('grass_block', blockStates)
        ? 'model'
        : 'applyAtlasUVs'
      : '-';

  const displayCount =
    playbackMode !== 'off'
      ? `${currentBlockIndex} / ${playbackBlocks.length} blocks`
      : `${blockCount} blocks`;

  return (
    <div className={s.canvasContainer} onContextMenu={(e) => e.preventDefault()}>
      <Canvas
        camera={{ position: [12, 10, 12], fov: 50, near: 0.1, far: 200 }}
        gl={{ antialias: true }}
        onCreated={({ gl }) => {
          gl.setClearColor('#09090b');
        }}
      >
        <SceneContent
          material={material}
          atlasIndex={atlasIndex}
          blockStates={blockStates}
          isReady={isReady}
        />
      </Canvas>
      <div className={s.blockCount}>{displayCount}</div>
      {atlasSource === 'legacy' && (
        <div className={s.atlasHint}>
          Start minecraft-interface to use the same textures as the Live viewer.
        </div>
      )}
      {showDiagnostic && isReady && (
        <div className={s.diagnosticOverlay} data-testid="building-diagnostic-overlay">
          <div>path: {atlasSource ?? '-'}</div>
          <div>version: {version}</div>
          <div>atlas-index keys: {atlasKeyCount}</div>
          <div>blockStates keys: {blockStatesKeyCount}</div>
          <div>grass_block: {grassBlockSource}</div>
        </div>
      )}
    </div>
  );
}
