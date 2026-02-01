/** P21A canonical invariant IDs. Must match P21A_INVARIANT_CATALOG in proof-manifest.ts */
export const P21A_INVARIANT_IDS = [
  'P21A-INV-01',
  'P21A-INV-02',
  'P21A-INV-03',
  'P21A-INV-04',
  'P21A-INV-04b',
  'P21A-INV-05',
  'P21A-INV-06',
  'P21A-INV-07',
  'P21A-INV-08',
  'P21A-INV-09',
  'P21A-INV-10',
] as const;

/** P21B canonical invariant IDs. Must match P21B_INVARIANT_CATALOG in proof-manifest.ts */
export const P21B_INVARIANT_IDS = [
  'P21B-INV-01',
  'P21B-INV-02',
  'P21B-INV-03',
  'P21B-INV-04',
] as const;

/** Conditionally-runnable invariants (require specific modes/extensions) */
export const CONDITIONAL_INVARIANTS = new Set([
  'P21A-INV-04b', // Requires predictive mode
  'P21A-INV-10',  // Requires id_robustness extension
]);
