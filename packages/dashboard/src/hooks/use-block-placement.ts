/**
 * useBlockPlacement Hook
 *
 * Minecraft-style controls:
 *   Left-click          → place block (on floor or adjacent to clicked face)
 *   Shift + left-click  → erase targeted block
 *   Middle-click         → pick block (switch to targeted block type)
 *   Right-drag           → orbit camera  (handled by OrbitControls)
 *   Shift + right-drag   → pan camera    (handled by OrbitControls)
 *
 * The hook only fires on left-click (button 0) and middle-click (button 1).
 * Right-click is reserved entirely for OrbitControls.
 */

import { useCallback } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import type { Vec3 } from '@/types/building';
import { useBuildingStore } from '@/stores/building-store';

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
  const removeBlock = useBuildingStore((s) => s.removeBlock);
  const selectedBlockType = useBuildingStore((s) => s.selectedBlockType);
  const setSelectedBlockType = useBuildingStore((s) => s.setSelectedBlockType);
  const getBlockAt = useBuildingStore((s) => s.getBlockAt);
  const buildMode = useBuildingStore((s) => s.buildMode);

  /** Handle clicks on existing blocks. */
  const handleBlockClick = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      if (!e.face) return;

      const native = e.nativeEvent ?? (e as any).sourceEvent;
      const button = native?.button ?? e.button ?? 0;
      const normal = e.face.normal;

      // Middle-click → pick block
      if (button === 1) {
        const pos = targetedBlockPosition(e.point, normal);
        const blockType = getBlockAt(pos);
        if (blockType) setSelectedBlockType(blockType);
        return;
      }

      // Only respond to left-click (button 0)
      if (button !== 0) return;

      // Shift + left-click → erase, or erase mode active
      const isShift = native?.shiftKey ?? false;
      if (isShift || buildMode === 'erase') {
        const pos = targetedBlockPosition(e.point, normal);
        removeBlock(pos);
      } else {
        const pos = placementPosition(e.point, normal);
        placeBlock(pos, selectedBlockType);
      }
    },
    [selectedBlockType, buildMode, placeBlock, removeBlock, setSelectedBlockType, getBlockAt]
  );

  /** Handle clicks on the ground plane (y = 0). */
  const handleFloorClick = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();

      const native = e.nativeEvent ?? (e as any).sourceEvent;
      const button = native?.button ?? e.button ?? 0;

      // Only left-click places on floor
      if (button !== 0) return;

      // Shift + click on floor does nothing (nothing to erase)
      const isShift = native?.shiftKey ?? false;
      if (isShift || buildMode === 'erase') return;

      const pos = snapToGrid({ x: e.point.x, y: 0, z: e.point.z });
      if (pos.x < 0 || pos.z < 0) return;
      placeBlock(pos, selectedBlockType);
    },
    [selectedBlockType, buildMode, placeBlock]
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
        const pos = snapToGrid({ x: e.point.x, y: 0, z: e.point.z });
        if (pos.x < 0 || pos.z < 0) return null;
        return pos;
      }

      if (!e.face) return null;
      return placementPosition(e.point, e.face.normal);
    },
    [buildMode]
  );

  return { handleBlockClick, handleFloorClick, getGhostPosition };
}
