import { InventoryItem, countItems, itemMatches } from './inventory-helpers';

export type TaskRequirement =
  | { kind: 'collect'; patterns: string[]; quantity: number }
  | { kind: 'mine'; patterns: string[]; quantity: number }
  | { kind: 'craft'; outputPattern: string; quantity: number; proxyPatterns?: string[] }
  | { kind: 'tool_progression'; targetTool: string; toolType: string; targetTier: string; quantity: number }
  | { kind: 'build'; structure: string; quantity: number };

export function parseRequiredQuantityFromTitle(title: string | undefined, fallback: number): number {
  if (!title) return fallback;
  const m = String(title).match(/(\d{1,3})/);
  return m ? Math.max(1, parseInt(m[1], 10)) : fallback;
}

/**
 * Returns true if two requirements represent the same goal (same kind and same
 * target items/structure), so we can deduplicate tasks that would execute the
 * same steps (e.g. multiple "collect oak_log" tasks from different parent intents).
 */
export function requirementsEquivalent(
  a: TaskRequirement | null | undefined,
  b: TaskRequirement | null | undefined
): boolean {
  if (!a || !b || a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'collect':
    case 'mine': {
      if (b.kind !== 'collect' && b.kind !== 'mine') return false;
      const aPat = [...a.patterns].sort().join(',');
      const bPat = [...b.patterns].sort().join(',');
      return aPat === bPat;
    }
    case 'craft': {
      if (b.kind !== 'craft') return false;
      return a.outputPattern === b.outputPattern;
    }
    case 'build': {
      if (b.kind !== 'build') return false;
      return a.structure === b.structure;
    }
    case 'tool_progression': {
      if (b.kind !== 'tool_progression') return false;
      return a.targetTool === b.targetTool;
    }
    default:
      return false;
  }
}

export function resolveRequirement(task: any): TaskRequirement | null {
  // Prefer structured requirement candidate from thought extraction
  const candidate = task?.parameters?.requirementCandidate;
  if (candidate && candidate.kind && candidate.outputPattern) {
    if (candidate.kind === 'craft') {
      return {
        kind: 'craft',
        outputPattern: candidate.outputPattern,
        quantity: candidate.quantity || 1,
        proxyPatterns: candidate.proxyPatterns || [],
      };
    }
    if (candidate.kind === 'collect') {
      return {
        kind: 'collect',
        patterns: [candidate.outputPattern],
        quantity: candidate.quantity || 1,
      };
    }
    if (candidate.kind === 'mine') {
      return {
        kind: 'mine',
        patterns: [candidate.outputPattern],
        quantity: candidate.quantity || 1,
      };
    }
    if (candidate.kind === 'build') {
      return {
        kind: 'build',
        structure: candidate.outputPattern,
        quantity: 1,
      };
    }
  }

  // Existing regex-based resolution follows
  const ttl = (task.title || '').toLowerCase();

  // Tool progression — detect tier-specific tool tasks BEFORE generic crafting
  // Matches: "craft stone pickaxe", "get iron pickaxe", "upgrade to diamond pickaxe"
  const tierMatch = ttl.match(/\b(wooden|stone|iron|diamond)\b.*\b(pickaxe|axe|shovel|hoe|sword)\b/);
  if (tierMatch && tierMatch[1] !== 'wooden') {
    // Non-wooden tier tool → tool progression domain
    const tier = tierMatch[1] as string;
    const toolType = tierMatch[2] as string;
    return {
      kind: 'tool_progression',
      targetTool: `${tier}_${toolType}`,
      toolType,
      targetTier: tier,
      quantity: 1,
    };
  }
  // Also detect explicit upgrade/progression intent
  if (/\bupgrade\b.*\b(tool|pickaxe|axe|sword)\b|\btool\s*progression\b/.test(ttl)) {
    return {
      kind: 'tool_progression',
      targetTool: 'iron_pickaxe',
      toolType: 'pickaxe',
      targetTier: 'iron',
      quantity: 1,
    };
  }

  // Crafting intent — route to Sterling crafting solver
  if (task.type === 'crafting' || /\bcraft\b|\bmake\b/.test(ttl)) {
    // Detect specific craftable items from title
    const craftableMatch = ttl.match(
      /\b(wooden[_ ]?pickaxe|wooden[_ ]?axe|wooden[_ ]?shovel|wooden[_ ]?hoe|wooden[_ ]?sword|crafting[_ ]?table|stick|planks?|chest|furnace|torch|boat|bowl|bucket|shield|ladder|fence|door)\b/
    );
    if (craftableMatch) {
      const rawItem = craftableMatch[1].replace(/\s+/g, '_');
      // Normalize common aliases
      const outputPattern =
        rawItem === 'planks' || rawItem === 'plank' ? 'oak_planks' : rawItem;
      return {
        kind: 'craft',
        outputPattern,
        quantity: 1,
        proxyPatterns: ['oak_log', '_log', ' log', 'plank', 'stick'],
      };
    }
    // Fallback for "craft a pickaxe" without tier qualifier → wooden_pickaxe
    if (/pickaxe/.test(ttl)) {
      return {
        kind: 'craft',
        outputPattern: 'wooden_pickaxe',
        quantity: 1,
        proxyPatterns: ['oak_log', '_log', ' log', 'plank', 'stick'],
      };
    }
  }
  // Gathering/mining rules
  if (task.type === 'gathering' || /\bgather\b|\bcollect\b/.test(ttl)) {
    const qty = parseRequiredQuantityFromTitle(task.title, 8);
    return {
      kind: 'collect',
      patterns: ['oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'acacia_log', 'dark_oak_log'],
      quantity: qty,
    };
  }
  if (task.type === 'mining' || /\bmine\b|\biron\b/.test(ttl)) {
    const qty = parseRequiredQuantityFromTitle(task.title, 3);
    return { kind: 'mine', patterns: ['iron_ore'], quantity: qty };
  }
  // Titles that explicitly mention wood but aren't crafting
  if (/\bwood\b/.test(ttl)) {
    const qty = parseRequiredQuantityFromTitle(task.title, 8);
    return {
      kind: 'collect',
      patterns: ['oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'acacia_log', 'dark_oak_log'],
      quantity: qty,
    };
  }
  // Building domain — prefer explicit task type over regex
  if (task.type === 'building') {
    return { kind: 'build', structure: 'basic_shelter_5x5', quantity: 1 };
  }
  // Regex fallback for building
  if (/\bbuild\b.*\bshelter\b|\bhouse\b/.test(ttl)) {
    return { kind: 'build', structure: 'basic_shelter_5x5', quantity: 1 };
  }
  return null;
}

export function computeProgressFromInventory(inv: InventoryItem[], req: TaskRequirement): number {
  if (req.kind === 'collect' || req.kind === 'mine') {
    const have = countItems(inv, req.patterns);
    return Math.max(0, Math.min(1, have / req.quantity));
  }
  if (req.kind === 'craft') {
    const hasOutput = inv.some((it) => itemMatches(it, [req.outputPattern]));
    if (hasOutput) return 1;
    const proxy = req.proxyPatterns || [];
    if (proxy.length) {
      const have = countItems(inv, proxy);
      const estimate = Math.max(0, Math.min(1, have / 3));
      return estimate;
    }
    return 0;
  }
  return 0;
}

export function computeRequirementSnapshot(inv: InventoryItem[], req: TaskRequirement) {
  if (req.kind === 'collect' || req.kind === 'mine') {
    const have = countItems(inv, req.patterns);
    return {
      kind: req.kind,
      quantity: req.quantity,
      have,
      needed: Math.max(0, req.quantity - have),
      patterns: req.patterns,
    };
  }
  if (req.kind === 'craft') {
    const hasOutput = inv.some((it) => itemMatches(it, [req.outputPattern]));
    if (hasOutput) {
      return {
        kind: req.kind,
        quantity: req.quantity,
        have: req.quantity,
        needed: 0,
        outputPattern: req.outputPattern,
        proxyPatterns: req.proxyPatterns,
      };
    }
    const proxy = req.proxyPatterns || [];
    const haveProxy = proxy.length ? countItems(inv, proxy) : 0;
    return {
      kind: req.kind,
      quantity: req.quantity,
      have: Math.min(req.quantity, hasOutput ? req.quantity : 0),
      needed: hasOutput ? 0 : req.quantity,
      outputPattern: req.outputPattern,
      proxyPatterns: req.proxyPatterns,
      proxyHave: haveProxy,
    } as any;
  }
  return { kind: (req as any).kind, quantity: (req as any).quantity } as any;
}

