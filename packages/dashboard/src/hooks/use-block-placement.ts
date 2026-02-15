/**
 * useBlockPlacement Hook
 *
 * Minecraft-style controls:
 *   Left-click          → place block (on floor or adjacent to clicked face)
 *   Left-drag           → place line of blocks along drag axis (x, y, or z)
 *   Shift + left-click  → select targeted block (highlight; no erase)
 *   Erase mode          → left-click erases (use toolbar to switch mode)
 *   Middle-click        → pick block (switch to targeted block type)
 *   Right-drag          → orbit camera  (handled by OrbitControls)
 *   Shift + right-drag  → pan camera   (handled by OrbitControls)
 *
 * The hook only fires on left-click (button 0) and middle-click (button 1).
 * Right-click is reserved entirely for OrbitControls.
 */

import { useCallback, useRef, useState } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import type { Vec3 } from '@/types/building';
import { useBuildingStore } from '@/stores/building-store';
import { deriveBlockState } from '@/lib/block-state-deriver';

/** Generate positions along a line from start to end (axis-aligned). */
function lineBetween(start: Vec3, end: Vec3): Vec3[] {
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  const dz = Math.abs(end.z - start.z);
  const axis = dx >= dy && dx >= dz ? 'x' : dy >= dz ? 'y' : 'z';
  const a = axis === 'x' ? start.x : axis === 'y' ? start.y : start.z;
  const b = axis === 'x' ? end.x : axis === 'y' ? end.y : end.z;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const out: Vec3[] = [];
  for (let i = lo; i <= hi; i++) {
    out.push({
      x: axis === 'x' ? i : start.x,
      y: axis === 'y' ? i : start.y,
      z: axis === 'z' ? i : start.z,
    });
  }
  return out;
}

/** Snap a world-space intersection to a discrete grid cell. */
function snapToGrid(point: { x: number; y: number; z: number }): Vec3 {
  return {
    x: Math.floor(point.x),
    y: Math.floor(point.y),
    z: Math.floor(point.z),
  };
}

/**
 * Given an intersection point and the face normal, compute the grid cell
 * where a new block should be placed (adjacent to the clicked face).
 */
function placementPosition(
  point: { x: number; y: number; z: number },
  normal: { x: number; y: number; z: number }
): Vec3 {
  return snapToGrid({
    x: point.x + normal.x * 0.5,
    y: point.y + normal.y * 0.5,
    z: point.z + normal.z * 0.5,
  });
}

/**
 * Given an intersection point and the face normal, compute the grid cell
 * of the block that was actually clicked (for erasing / picking).
 */
function targetedBlockPosition(
  point: { x: number; y: number; z: number },
  normal: { x: number; y: number; z: number }
): Vec3 {
  return snapToGrid({
    x: point.x - normal.x * 0.5,
    y: point.y - normal.y * 0.5,
    z: point.z - normal.z * 0.5,
  });
}

export function useBlockPlacement() {
  const placeBlock = useBuildingStore((s) => s.placeBlock);
  const placeBlocks = useBuildingStore((s) => s.placeBlocks);
  const removeBlock = useBuildingStore((s) => s.removeBlock);
  const selectedBlockType = useBuildingStore((s) => s.selectedBlockType);
  const setSelectedBlockType = useBuildingStore((s) => s.setSelectedBlockType);
  const setSelectedBlockPosition = useBuildingStore((s) => s.setSelectedBlockPosition);
  const getBlockAt = useBuildingStore((s) => s.getBlockAt);
  const buildMode = useBuildingStore((s) => s.buildMode);

  const dragStartRef = useRef<Vec3 | null>(null);
  const dragLineRef = useRef<Vec3[]>([]);
  const dragFaceNormalRef = useRef<{ x: number; y: number; z: number } | null>(null);
  const dragIsFloorRef = useRef<boolean>(false);
  const [dragLine, setDragLine] = useState<Vec3[]>([]);

  /** Handle pointer down on blocks — starts drag or immediate action. */
  const handleBlockPointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      if (!e.face) return;

      const native = e.nativeEvent ?? (e as any).sourceEvent;
      const button = native?.button ?? e.button ?? 0;
      const normal = e.face.normal;
      const targetPos = targetedBlockPosition(e.point, normal);

      // Middle-click → pick block
      if (button === 1) {
        const blockType = getBlockAt(targetPos);
        if (blockType) setSelectedBlockType(blockType);
        return;
      }

      if (button !== 0) return;

      const isShift = native?.shiftKey ?? false;

      // Shift + left-click → select block
      if (isShift) {
        setSelectedBlockPosition(targetPos);
        return;
      }

      if (buildMode === 'erase') {
        removeBlock(targetPos);
        return;
      }

      // Place mode: record start for potential drag, capture for move/up
      const pos = placementPosition(e.point, normal);
      dragStartRef.current = pos;
      dragFaceNormalRef.current = { ...normal };
      dragIsFloorRef.current = false;
      setDragLine([pos]);
      try {
        (e.target as any).setPointerCapture?.(e.pointerId);
      } catch {
        // no-op
      }
    },
    [selectedBlockType, buildMode, placeBlock, removeBlock, setSelectedBlockType, setSelectedBlockPosition, getBlockAt]
  );

  /** Handle pointer down on floor. */
  const handleFloorPointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();

      const native = e.nativeEvent ?? (e as any).sourceEvent;
      const button = native?.button ?? e.button ?? 0;

      if (button !== 0) return;

      const isShift = native?.shiftKey ?? false;
      if (isShift) {
        setSelectedBlockPosition(null);
        return;
      }
      if (buildMode === 'erase') return;

      const base = snapToGrid({ x: e.point.x, y: 0, z: e.point.z });
      if (base.x < 0 || base.z < 0) return;
      const pos = { ...base, y: 0 };

      dragStartRef.current = pos;
      dragFaceNormalRef.current = { x: 0, y: 1, z: 0 };
      dragIsFloorRef.current = true;
      setDragLine([pos]);
      try {
        (e.target as any).setPointerCapture?.(e.pointerId);
      } catch {
        // no-op
      }
    },
    [selectedBlockType, buildMode, placeBlock, setSelectedBlockPosition]
  );

  /** Handle pointer move during drag — update ghost line. */
  const handlePointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (dragStartRef.current === null) return;

      const start = dragStartRef.current;
      let current: Vec3;

      if (e.face) {
        current = placementPosition(e.point, e.face.normal);
      } else {
        current = snapToGrid({ x: e.point.x, y: e.point.y, z: e.point.z });
        if (dragIsFloorRef.current) {
          const base = snapToGrid({ x: e.point.x, y: 0, z: e.point.z });
          current = { ...base, y: 0 };
        } else if (current.y < 0) {
          current.y = 0;
        }
      }

      const line = lineBetween(start, current);
      dragLineRef.current = line;
      setDragLine(line);
    },
    [],
  );

  /** Handle pointer up — place single block or line. */
  const handlePointerUp = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      try {
        (e.target as any).releasePointerCapture?.(e.pointerId);
      } catch {
        // no-op
      }

      const start = dragStartRef.current;
      const faceNormal = dragFaceNormalRef.current;
      const isFloor = dragIsFloorRef.current;
      dragStartRef.current = null;
      dragFaceNormalRef.current = null;
      const line = dragLineRef.current;

      if (start === null) return;

      const blockState =
        faceNormal &&
        deriveBlockState(
          selectedBlockType,
          faceNormal,
          line[0] ?? start,
          isFloor,
        );

      const state = blockState ?? undefined;
      if (line.length === 0) {
        placeBlock(start, selectedBlockType, state);
      } else if (line.length === 1) {
        placeBlock(line[0], selectedBlockType, state);
      } else {
        placeBlocks(line, selectedBlockType, state);
      }
      dragLineRef.current = [];
      setDragLine([]);
    },
    [selectedBlockType, placeBlock, placeBlocks]
  );

  /**
   * Compute the ghost-block position from a pointer-move event.
   * Returns null when no valid placement target exists.
   */
  const getGhostPosition = useCallback(
    (
      e: ThreeEvent<PointerEvent>,
      isFloor: boolean
    ): Vec3 | null => {
      if (buildMode === 'erase') return null;

      if (isFloor) {
        const base = snapToGrid({ x: e.point.x, y: 0, z: e.point.z });
        if (base.x < 0 || base.z < 0) return null;
        return { ...base, y: 0 };
      }

      if (!e.face) return null;
      return placementPosition(e.point, e.face.normal);
    },
    [buildMode]
  );

  return {
    handleBlockPointerDown,
    handleFloorPointerDown,
    handlePointerMove,
    handlePointerUp,
    getGhostPosition,
    dragLine,
  };
}
