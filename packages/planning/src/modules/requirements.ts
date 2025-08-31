import { InventoryItem, countItems, itemMatches } from './inventory-helpers';

export type TaskRequirement =
  | { kind: 'collect'; patterns: string[]; quantity: number }
  | { kind: 'mine'; patterns: string[]; quantity: number }
  | { kind: 'craft'; outputPattern: string; quantity: number; proxyPatterns?: string[] };

export function parseRequiredQuantityFromTitle(title: string | undefined, fallback: number): number {
  if (!title) return fallback;
  const m = String(title).match(/(\d{1,3})/);
  return m ? Math.max(1, parseInt(m[1], 10)) : fallback;
}

export function resolveRequirement(task: any): TaskRequirement | null {
  const ttl = (task.title || '').toLowerCase();
  if (task.type === 'crafting' && /pickaxe/.test(ttl)) {
    return {
      kind: 'craft',
      outputPattern: 'wooden_pickaxe',
      quantity: 1,
      proxyPatterns: ['oak_log', '_log', ' log', 'plank', 'stick'],
    };
  }
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
  if (/\bwood\b/.test(ttl)) {
    const qty = parseRequiredQuantityFromTitle(task.title, 8);
    return {
      kind: 'collect',
      patterns: ['oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'acacia_log', 'dark_oak_log'],
      quantity: qty,
    };
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

