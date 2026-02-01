/**
 * Saliency Reasoner
 *
 * Processes BeliefStreamEnvelopes from the entity belief system.
 * Applies snapshots and saliency deltas to maintain a cognition-side
 * track view. Generates aggregate awareness thoughts WITHOUT per-entity
 * LLM calls.
 */

// Types re-declared here to avoid cross-package dependency on minecraft-interface.
// These mirror the types from entity-belief/types.ts.

export type ThreatLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';
export type Visibility = 'visible' | 'inferred' | 'lost';
export type SaliencyDeltaType =
  | 'new_threat'
  | 'track_lost'
  | 'reclassified'
  | 'movement_bucket_change';

export interface TrackSummary {
  trackId: string;
  classLabel: string;
  kindEnum: number;
  posBucketX: number;
  posBucketY: number;
  posBucketZ: number;
  distBucket: number;
  visibility: Visibility;
  threatLevel: ThreatLevel;
  confidence: number;
  /** Classification uncertainty: probability mass for "don't know what this is" */
  pUnknown?: number;
  firstSeenTick: number;
  lastSeenTick: number;
}

export interface SaliencyDelta {
  type: SaliencyDeltaType;
  trackId: string;
  classLabel: string;
  threatLevel: ThreatLevel;
  distBucket: number;
  prev?: {
    threatLevel?: ThreatLevel;
    distBucket?: number;
  };
  /** Full track state, included on new_threat so cognition can hydrate without snapshot */
  track?: TrackSummary;
}

export interface Snapshot {
  tickId: number;
  tracks: TrackSummary[];
}

export interface BeliefStreamEnvelope {
  request_version: 'saliency_delta';
  type: 'environmental_awareness';
  /** Stable bot identity (e.g. 'bot-steve'). Does not change across restarts. */
  bot_id: string;
  /** Ephemeral stream identity. Changes on every bot instantiation. */
  stream_id: string;
  seq: number;
  tick_id: number;
  snapshot?: Snapshot;
  saliency_events: SaliencyDelta[];
}

// ── State ───────────────────────────────────────────────────────────

/** Maximum number of superseded stream_ids to retain per bot_id before GC */
const MAX_SUPERSEDED_STREAMS_PER_BOT = 4;

/** Per-bot state: tracks the active stream and its sequence counter */
export interface BotStreamState {
  /** Currently active stream_id for this bot */
  activeStreamId: string;
  /** Last accepted sequence number per stream_id (only active stream matters) */
  lastSeq: number;
  /** Superseded stream_ids — bounded ring buffer, oldest evicted first */
  supersededStreams: string[];
}

export interface SaliencyReasonerState {
  /** Per-bot state keyed by bot_id (explicit, no regex parsing) */
  bots: Record<string, BotStreamState>;
  tracks: Map<string, TrackSummary>;
}

export function createSaliencyReasonerState(): SaliencyReasonerState {
  return {
    bots: {},
    tracks: new Map(),
  };
}

// ── Processing ──────────────────────────────────────────────────────

export interface SaliencyInsight {
  processed: boolean;
  type: 'environmental_awareness';
  thought: {
    text: string;
    source: 'saliency';
    confidence: number;
    categories: string[];
  };
  actions: {
    shouldRespond: boolean;
    response?: string;
    shouldCreateTask: boolean;
    tasks: Array<{ description: string; priority: string; source: string }>;
  };
  fallback: boolean;
  /** Canonical tick from the belief envelope — no Date.now() in deterministic core */
  tickId: number;
  trackCount: number;
  deltaCount: number;
}

const THREAT_PRIORITY: Record<ThreatLevel, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

/**
 * Apply a BeliefStreamEnvelope to the reasoner state and generate
 * an aggregate awareness thought.
 *
 * Determinism contract: identical envelope + state → identical insight.
 * No Date.now() — tick_id from the envelope is the canonical timestamp.
 */
export function applySaliencyEnvelope(
  envelope: BeliefStreamEnvelope,
  state: SaliencyReasonerState
): SaliencyInsight {
  const botId = envelope.bot_id;
  const streamId = envelope.stream_id;
  const botState = state.bots[botId];

  // Reject messages from superseded streams (bounded list, no unbounded Set)
  if (botState && botState.supersededStreams.includes(streamId)) {
    return {
      processed: false,
      type: 'environmental_awareness',
      thought: {
        text: `Discarded envelope from superseded stream (${streamId}, active: ${botState.activeStreamId})`,
        source: 'saliency',
        confidence: 0,
        categories: ['stale'],
      },
      actions: { shouldRespond: false, shouldCreateTask: false, tasks: [] },
      fallback: true,
      tickId: envelope.tick_id,
      trackCount: state.tracks.size,
      deltaCount: 0,
    };
  }

  // First envelope for this bot_id — initialize
  if (!botState) {
    state.bots[botId] = {
      activeStreamId: streamId,
      lastSeq: -1,
      supersededStreams: [],
    };
  } else if (botState.activeStreamId !== streamId) {
    // New stream_id for same bot_id → stream restart
    // Supersede old stream (bounded ring buffer)
    botState.supersededStreams.push(botState.activeStreamId);
    if (botState.supersededStreams.length > MAX_SUPERSEDED_STREAMS_PER_BOT) {
      botState.supersededStreams.shift(); // evict oldest
    }
    botState.activeStreamId = streamId;
    botState.lastSeq = -1;
    state.tracks.clear();
  }

  const currentBotState = state.bots[botId];

  // Discard out-of-order envelopes
  if (envelope.seq <= currentBotState.lastSeq) {
    return {
      processed: false,
      type: 'environmental_awareness',
      thought: {
        text: `Discarded out-of-order envelope (seq ${envelope.seq}, last ${currentBotState.lastSeq})`,
        source: 'saliency',
        confidence: 0,
        categories: ['stale'],
      },
      actions: { shouldRespond: false, shouldCreateTask: false, tasks: [] },
      fallback: true,
      tickId: envelope.tick_id,
      trackCount: state.tracks.size,
      deltaCount: 0,
    };
  }
  currentBotState.lastSeq = envelope.seq;

  // Apply snapshot BEFORE deltas (full state rebuild)
  if (envelope.snapshot) {
    state.tracks.clear();
    for (const track of envelope.snapshot.tracks) {
      state.tracks.set(track.trackId, { ...track });
    }
  }

  // Apply deltas
  for (const delta of envelope.saliency_events) {
    applyDelta(delta, state.tracks);
  }

  // Generate aggregate thought
  const thought = generateAwarenessThought(state.tracks, envelope.saliency_events);
  const shouldRespond = hasSignificantThreat(state.tracks);

  return {
    processed: true,
    type: 'environmental_awareness',
    thought: {
      text: thought,
      source: 'saliency',
      confidence: 0.85,
      categories: ['environmental', 'saliency'],
    },
    actions: {
      shouldRespond,
      response: shouldRespond ? generateThreatResponse(state.tracks) : undefined,
      shouldCreateTask: false,
      tasks: [],
    },
    fallback: false,
    tickId: envelope.tick_id,
    trackCount: state.tracks.size,
    deltaCount: envelope.saliency_events.length,
  };
}

function applyDelta(delta: SaliencyDelta, tracks: Map<string, TrackSummary>): void {
  const existing = tracks.get(delta.trackId);

  switch (delta.type) {
    case 'new_threat':
      if (!existing) {
        if (delta.track) {
          // Full track state from producer — hydrate completely
          tracks.set(delta.trackId, { ...delta.track });
        } else {
          // Fail-closed: schema violation — do NOT create a garbage fallback track.
          // The track will arrive on the next periodic snapshot (~5s).
          console.warn(
            `[SaliencyReasoner] new_threat delta for ${delta.trackId} missing track payload — skipped (fail-closed)`
          );
        }
      }
      break;

    case 'track_lost':
      if (existing) {
        existing.visibility = 'lost';
      }
      break;

    case 'reclassified':
      if (existing) {
        existing.threatLevel = delta.threatLevel;
      }
      break;

    case 'movement_bucket_change':
      if (existing) {
        existing.distBucket = delta.distBucket;
        existing.threatLevel = delta.threatLevel;
      }
      break;
  }
}

function generateAwarenessThought(
  tracks: Map<string, TrackSummary>,
  recentDeltas: SaliencyDelta[]
): string {
  const visibleTracks = [...tracks.values()].filter(
    (t) => t.visibility !== 'lost'
  );

  if (visibleTracks.length === 0) {
    return 'No significant entities nearby.';
  }

  // Sort by threat (highest first), then distance (closest first), then trackId (deterministic)
  visibleTracks.sort((a, b) => {
    const threatDiff = THREAT_PRIORITY[b.threatLevel] - THREAT_PRIORITY[a.threatLevel];
    if (threatDiff !== 0) return threatDiff;
    const distDiff = a.distBucket - b.distBucket;
    if (distDiff !== 0) return distDiff;
    return a.trackId < b.trackId ? -1 : a.trackId > b.trackId ? 1 : 0;
  });

  const hostiles = visibleTracks.filter(
    (t) => t.threatLevel !== 'none'
  );
  const neutrals = visibleTracks.filter(
    (t) => t.threatLevel === 'none'
  );

  const parts: string[] = ['Awareness:'];

  if (hostiles.length > 0) {
    const descriptions = hostiles.slice(0, 3).map(
      (t) => `${t.classLabel} ~${t.distBucket * 2} blocks (${t.threatLevel})`
    );
    parts.push(`${hostiles.length} hostile${hostiles.length > 1 ? 's' : ''} (${descriptions.join(', ')})`);
  }

  if (neutrals.length > 0) {
    parts.push(`${neutrals.length} neutral nearby`);
  }

  // Mention notable deltas
  const newThreats = recentDeltas.filter((d) => d.type === 'new_threat');
  if (newThreats.length > 0) {
    parts.push(`[new: ${newThreats.map((d) => d.classLabel).join(', ')}]`);
  }

  return parts.join(' ');
}

function hasSignificantThreat(tracks: Map<string, TrackSummary>): boolean {
  for (const track of tracks.values()) {
    if (
      track.visibility !== 'lost' &&
      (track.threatLevel === 'critical' || track.threatLevel === 'high')
    ) {
      return true;
    }
  }
  return false;
}

function generateThreatResponse(tracks: Map<string, TrackSummary>): string {
  const threats = [...tracks.values()]
    .filter(
      (t) =>
        t.visibility !== 'lost' &&
        (t.threatLevel === 'critical' || t.threatLevel === 'high')
    )
    .sort((a, b) => a.distBucket - b.distBucket);

  if (threats.length === 0) return '';

  const closest = threats[0];
  return `I see a ${closest.classLabel} nearby, staying alert.`;
}
