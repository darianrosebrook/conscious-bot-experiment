// P21 Conformance Test Kits — barrel export

export { runP21AConformanceSuite } from './p21a-conformance-suite';
export type { P21AConformanceConfig } from './p21a-conformance-suite';

export { runP21BConformanceSuite } from './p21b-conformance-suite';
export type { P21BConformanceConfig } from './p21b-conformance-suite';

export { makeItem, batch, riskOrd, firstRiskClass } from './helpers';

export { generateP21AManifest, generateP21BManifest } from './proof-manifest';

export { createRunHandle } from './run-handle';
export type { P21RunHandle, InvariantStatus } from './run-handle';

export { P21A_INVARIANT_IDS, P21B_INVARIANT_IDS, CONDITIONAL_INVARIANTS } from './invariant-ids';

export {
  createSurfaceResultsFromHandle,
  patchExecutionResults,
  assertManifestTruthfulness,
  finalizeManifest,
} from './manifest-helpers';

export {
  probeINV01,
  probeINV02,
  probeINV03,
  probeINV04,
  probeINV04b,
  probeINV05,
  probeINV06,
  probeINV07,
  probeINV08,
  probeINV09,
  probeINV10,
  P21A_PROBE_REGISTRY,
} from './p21a-invariant-probes';
export type { ProbeConfig, AdapterFactory, InvariantProbeEntry } from './p21a-invariant-probes';
