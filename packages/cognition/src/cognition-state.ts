/**
 * Cognition Mutable State Container
 *
 * Replaces closure-scoped mutable variables with an explicit state
 * object. Server.ts creates a single instance and passes specific
 * fields by reference or via accessor functions to router factories.
 */

import type { SocialMemoryManager } from '../../memory/src/social/social-memory-manager';

export interface CognitionMutableState {
  cognitiveThoughts: any[];
  thoughtGenerationInterval: NodeJS.Timeout | null;
  systemReady: boolean;
  readyAt: string | null;
  readySource: string | null;
  spawnPosition: { x: number; y: number; z: number } | null;
  msSinceLastRest: number;
  msSinceLastProgress: number;
  networkRequestCount: number;
  socialMemoryManager: SocialMemoryManager | null;
  ttsEnabled: boolean;
}

export function createInitialState(): CognitionMutableState {
  const readyOnBoot = process.env.SYSTEM_READY_ON_BOOT === '1';
  return {
    cognitiveThoughts: [],
    thoughtGenerationInterval: null,
    systemReady: readyOnBoot,
    readyAt: readyOnBoot ? new Date().toISOString() : null,
    readySource: readyOnBoot ? 'env' : null,
    spawnPosition: null,
    msSinceLastRest: 0,
    msSinceLastProgress: 0,
    networkRequestCount: 0,
    socialMemoryManager: null,
    ttsEnabled: process.env.TTS_ENABLED === '1',
  };
}
