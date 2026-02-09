/**
 * usePlaybackTimer — Interval-driven playback stepper
 *
 * When playbackMode is 'playing', advances currentBlockIndex by one
 * block per tick at the configured playbackSpeed (blocks per second).
 * Automatically pauses when the end is reached.
 */

import { useEffect } from 'react';
import { useBuildingStore } from '@/stores/building-store';

export function usePlaybackTimer(): void {
  const playbackMode = useBuildingStore((s) => s.playbackMode);
  const playbackSpeed = useBuildingStore((s) => s.playbackSpeed);
  const stepForward = useBuildingStore((s) => s.stepForward);

  useEffect(() => {
    if (playbackMode !== 'playing') return;

    const intervalMs = 1000 / playbackSpeed;
    const id = setInterval(stepForward, intervalMs);

    return () => clearInterval(id);
  }, [playbackMode, playbackSpeed, stepForward]);
}
