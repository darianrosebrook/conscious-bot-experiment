/**
 * Leaf Routing — Single source of truth for action-type → leaf-name mapping.
 *
 * Both MinecraftCraftingSolver (Rig A) and MinecraftToolProgressionSolver (Rig B)
 * import from here instead of duplicating the switch/map logic. The conformance
 * test in __tests__/leaf-routing-conformance.test.ts verifies this stays aligned
 * with the minecraft-interface ACTION_TYPE_TO_LEAF dispatch map.
 *
 * @author @darianrosebrook
 */

// ── Workstation constants (shared with minecraft-interface/crafting-leaves) ──

/** Workstation types accepted by place_workstation leaf. */
export const WORKSTATION_TYPES = new Set(['crafting_table', 'furnace', 'blast_furnace']);

/**
 * Parse a place action string. Returns the item if valid, null otherwise.
 * Strict: only accepts exactly "place:<item>" (one colon, non-empty item).
 */
export function parsePlaceAction(action: string | undefined): string | null {
  if (!action) return null;
  const idx = action.indexOf(':');
  if (idx < 0 || action.indexOf(':', idx + 1) >= 0) return null;
  const prefix = action.slice(0, idx);
  const item = action.slice(idx + 1);
  if (prefix !== 'place' || !item) return null;
  return item;
}

// ── Action type → leaf name mapping ─────────────────────────────────────────

/**
 * Core action-type-to-leaf-name mapping for crafting-domain solvers.
 * The `action` parameter is only used for 'place' action types to distinguish
 * workstation placement from generic block placement, and for acq:* prefixed
 * actions (acquisition domain, Rig D).
 *
 * Tool-progression solver extends this with 'upgrade' → 'craft_recipe'.
 */
export function actionTypeToLeaf(actionType: string, action?: string): string {
  // Acquisition domain: acq:* prefix routing (Rig D)
  if (action?.startsWith('acq:')) {
    return actionToAcquisitionLeaf(action);
  }

  switch (actionType) {
    case 'mine': return 'acquire_material';
    case 'craft': return 'craft_recipe';
    case 'smelt': return 'smelt';
    case 'place': {
      const item = parsePlaceAction(action);
      if (item && WORKSTATION_TYPES.has(item)) return 'place_workstation';
      return 'place_block';
    }
    default: return actionType;
  }
}

/**
 * Extended mapping that also handles 'upgrade' actions (tool-progression domain).
 * Upgrade actions produce a tool via crafting, so they map to craft_recipe.
 */
export function actionTypeToLeafExtended(actionType: string, action?: string): string {
  if (actionType === 'upgrade') return 'craft_recipe';
  return actionTypeToLeaf(actionType, action);
}

/**
 * Derive place-step metadata based on parsed action.
 * Returns { workstation: item } for workstation items,
 * { placeItem: item } for non-workstation items, or {} if unparseable.
 */
export function derivePlaceMeta(action: string | undefined): Record<string, string> {
  const item = parsePlaceAction(action);
  if (item && WORKSTATION_TYPES.has(item)) return { workstation: item };
  return item ? { placeItem: item } : {};
}

/**
 * Estimate step duration in ms based on action type.
 */
export function estimateDuration(actionType: string): number {
  switch (actionType) {
    case 'mine': return 5000;
    case 'craft': return 2000;
    case 'smelt': return 15000;
    case 'place': return 1000;
    case 'upgrade': return 2000;
    default: return 3000;
  }
}

// ── Acquisition leaf routing (Rig D) ────────────────────────────────────

/**
 * Map acq:* prefixed actions to leaf names.
 *
 * - acq:trade:* → interact_with_entity
 * - acq:loot:*  → open_container
 * - acq:salvage:* → craft_recipe (reuse existing craft leaf)
 * - Unknown acq:* → 'blocked' (fail-safe)
 */
export function actionToAcquisitionLeaf(action: string): string {
  if (action.startsWith('acq:trade:')) return 'interact_with_entity';
  if (action.startsWith('acq:loot:')) return 'open_container';
  if (action.startsWith('acq:salvage:')) return 'craft_recipe';
  return 'blocked';
}
