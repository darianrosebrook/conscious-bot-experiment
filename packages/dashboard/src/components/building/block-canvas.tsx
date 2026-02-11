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
import type { Vec3 } from '@/types/building';
import { useBuildingStore } from '@/stores/building-store';
import { useBlockPlacement } from '@/hooks/use-block-placement';
import { useAtlasMaterial } from '@/hooks/use-atlas-material';
import { createBlockGeometry } from '@/lib/block-geometry-builder';
import { bakeBlockAO } from '@/lib/ambient-occlusion';
import type { AtlasIndex } from '@/types/atlas';
import s from './block-canvas.module.scss';

// ─── Individual Block mesh (atlas-based) ─────────────────────────────────────

function BlockMesh({
  position,
  blockType,
  onClick,
  atlasIndex,
  material,
  blockIndex,
}: {
  position: Vec3;
  blockType: string;
  onClick: (_e: ThreeEvent<PointerEvent>) => void;
  atlasIndex: AtlasIndex;
  material: THREE.MeshLambertMaterial;
  blockIndex: Set<string>;
}) {
  const geometry = useMemo(() => {
    const geo = createBlockGeometry(blockType, atlasIndex).clone();
    // Apply per-block AO to the cloned geometry's vertex colors
    const aoColors = bakeBlockAO(position, blockIndex);
    geo.setAttribute('color', new THREE.BufferAttribute(aoColors, 3));
    return geo;
  }, [blockType, atlasIndex, position, blockIndex]);

  return (
    <mesh
      position={[position.x + 0.5, position.y + 0.5, position.z + 0.5]}
      geometry={geometry}
      material={material}
      onPointerDown={onClick}
    />
  );
}

// ─── Instanced blocks (atlas-based, same blockType) ──────────────────────────

function InstancedBlocks({
  blockType,
  positions,
  onClick,
  atlasIndex,
  material,
}: {
  blockType: string;
  positions: Vec3[];
  onClick: (_e: ThreeEvent<PointerEvent>) => void;
  atlasIndex: AtlasIndex;
  material: THREE.MeshLambertMaterial;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(
    () => createBlockGeometry(blockType, atlasIndex),
    [blockType, atlasIndex],
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
      onPointerDown={onClick}
    />
  );
}

// ─── Ghost block preview ─────────────────────────────────────────────────────

function GhostBlock({
  position,
  blockType,
  atlasIndex,
  material,
}: {
  position: Vec3;
  blockType: string;
  atlasIndex: AtlasIndex;
  material: THREE.MeshLambertMaterial;
}) {
  const ghostMaterial = useMemo(() => {
    const mat = material.clone();
    mat.transparent = true;
    mat.opacity = 0.4;
    return mat;
  }, [material]);

  const geometry = useMemo(
    () => createBlockGeometry(blockType, atlasIndex),
    [blockType, atlasIndex],
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
  atlasIndex,
  material,
  blockIndex,
  isLatest,
}: {
  position: Vec3;
  blockType: string;
  atlasIndex: AtlasIndex;
  material: THREE.MeshLambertMaterial;
  blockIndex: Set<string>;
  isLatest: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const startTime = useRef(performance.now());
  const animDuration = 150; // ms

  const geometry = useMemo(() => {
    const geo = createBlockGeometry(blockType, atlasIndex).clone();
    const aoColors = bakeBlockAO(position, blockIndex);
    geo.setAttribute('color', new THREE.BufferAttribute(aoColors, 3));
    return geo;
  }, [blockType, atlasIndex, position, blockIndex]);

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

// ─── Scene content ───────────────────────────────────────────────────────────

function SceneContent() {
  const blocks = useBuildingStore((s) => s.blocks);
  const blockIndex = useBuildingStore((s) => s.blockIndex);
  const gridSize = useBuildingStore((s) => s.gridSize);
  const buildMode = useBuildingStore((s) => s.buildMode);
  const selectedBlockType = useBuildingStore((s) => s.selectedBlockType);
  const playbackMode = useBuildingStore((s) => s.playbackMode);
  const currentBlockIndex = useBuildingStore((s) => s.currentBlockIndex);
  const playbackBlocks = useBuildingStore((s) => s.playbackBlocks);

  const { handleBlockClick, handleFloorClick, getGhostPosition } =
    useBlockPlacement();
  const { material, atlasIndex, isReady } = useAtlasMaterial();

  const [ghostPos, setGhostPos] = useState<Vec3 | null>(null);

  const handleFloorPointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      setGhostPos(getGhostPosition(e, true));
    },
    [getGhostPosition],
  );

  const handleBlockPointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      setGhostPos(getGhostPosition(e, false));
    },
    [getGhostPosition],
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
      idx.add(`${b.position.x},${b.position.y},${b.position.z}`);
    }
    return idx;
  }, [playbackMode, visibleBlocks, blockIndex]);

  // Group blocks by type for potential instancing
  const blocksByType = useMemo(() => {
    const map = new Map<string, Vec3[]>();
    for (const b of visibleBlocks) {
      const arr = map.get(b.blockType) || [];
      arr.push(b.position);
      map.set(b.blockType, arr);
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
          position={[gridSize.x / 2, 0, gridSize.z / 2]}
          cellSize={1}
          cellThickness={0.5}
          cellColor="#333333"
          sectionSize={4}
          sectionThickness={1}
          sectionColor="#555555"
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

      {/* Grid floor */}
      <Grid
        args={[gridSize.x, gridSize.z]}
        position={[gridSize.x / 2, 0, gridSize.z / 2]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#333333"
        sectionSize={4}
        sectionThickness={1}
        sectionColor="#555555"
        fadeDistance={50}
        infiniteGrid={false}
      />

      {/* Invisible click plane for floor */}
      <mesh
        position={[gridSize.x / 2, -0.001, gridSize.z / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={handleFloorClick}
        onPointerMove={handleFloorPointerMove}
        onPointerLeave={handlePointerLeave}
        visible={false}
      >
        <planeGeometry args={[gridSize.x, gridSize.z]} />
        <meshBasicMaterial />
      </mesh>

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
                atlasIndex={atlasIndex}
                material={material}
                blockIndex={visibleBlockIndex}
                isLatest={isLatest}
              />
            );
          })}
        </>
      ) : (
        // Normal mode: group by type, use instancing for large groups
        Array.from(blocksByType.entries()).map(([type, positions]) =>
          positions.length > USE_INSTANCING_THRESHOLD ? (
            <InstancedBlocks
              key={type}
              blockType={type}
              positions={positions}
              onClick={handleBlockClick}
              atlasIndex={atlasIndex}
              material={material}
            />
          ) : (
            positions.map((pos) => (
              <BlockMesh
                key={`${type}-${pos.x},${pos.y},${pos.z}`}
                position={pos}
                blockType={type}
                onClick={(e) => {
                  handleBlockPointerMove(e);
                  handleBlockClick(e);
                }}
                atlasIndex={atlasIndex}
                material={material}
                blockIndex={visibleBlockIndex}
              />
            ))
          ),
        )
      )}

      {/* Ghost block */}
      {ghostPos && buildMode === 'place' && playbackMode === 'off' && (
        <GhostBlock
          position={ghostPos}
          blockType={selectedBlockType}
          atlasIndex={atlasIndex}
          material={material}
        />
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

export function BlockCanvas() {
  const blockCount = useBuildingStore((s) => s.blocks.length);
  const playbackMode = useBuildingStore((s) => s.playbackMode);
  const currentBlockIndex = useBuildingStore((s) => s.currentBlockIndex);
  const playbackBlocks = useBuildingStore((s) => s.playbackBlocks);

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
        <SceneContent />
      </Canvas>
      <div className={s.blockCount}>{displayCount}</div>
    </div>
  );
}
