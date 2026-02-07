import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('CI tripwire: no raw observation bypass', () => {
  const botAdapterPath = resolve(__dirname, '../../bot-adapter.ts');

  it('LEGACY_ENTITY_PROCESS is NOT set in the test environment', () => {
    // This tripwire ensures CI never accidentally enables the legacy path.
    // If someone sets this env var in a CI config or .env, this test fails.
    expect(process.env.LEGACY_ENTITY_PROCESS).toBeUndefined();
  });

  it('setupEntityDetection is gated behind LEGACY_ENTITY_PROCESS in an if-else', () => {
    const source = readFileSync(botAdapterPath, 'utf-8');

    // Find the gating block: if (LEGACY_ENTITY_PROCESS) { setupEntityDetection } else { tryStartBeliefBus }
    const setupIdx = source.indexOf('this.setupEntityDetection()');
    expect(setupIdx).toBeGreaterThan(-1);
    const setupContext = source.slice(
      Math.max(0, setupIdx - 300),
      setupIdx + 50
    );
    expect(setupContext).toContain('LEGACY_ENTITY_PROCESS');

    // Verify the else-branch exists and uses the belief system entry point
    const elseIdx = source.indexOf('} else {', setupIdx - 300);
    expect(elseIdx).toBeGreaterThan(-1);
    const elseBranch = source.slice(elseIdx, elseIdx + 200);
    expect(elseBranch).toContain('tryStartBeliefBus');
  });

  it('setupEntityDetection is called exactly once (only in the gated block)', () => {
    const source = readFileSync(botAdapterPath, 'utf-8');

    const calls = source.match(/this\.setupEntityDetection\(\)/g) ?? [];
    expect(calls).toHaveLength(1);

    // And that single call must be gated
    const idx = source.indexOf('this.setupEntityDetection()');
    const context = source.slice(Math.max(0, idx - 300), idx + 50);
    expect(context).toContain('LEGACY_ENTITY_PROCESS');
  });

  it('belief system (setupBeliefIngestion) is the default path', () => {
    const source = readFileSync(botAdapterPath, 'utf-8');

    expect(source).toContain('setupBeliefIngestion');
    expect(source).toContain('setupCognitionEmission');
    expect(source).toContain('buildEnvelope');
    expect(source).toContain('BeliefBus');
  });

  it('cognition server routes saliency_delta envelopes to applySaliencyEnvelope', () => {
    const processRoutesPath = resolve(
      __dirname,
      '../../../../cognition/src/routes/process-routes.ts'
    );
    const source = readFileSync(processRoutesPath, 'utf-8');

    // Verify the routing discriminator exists (lives in process-routes, not server.ts)
    expect(source).toContain("request_version === 'saliency_delta'");
    expect(source).toContain('applySaliencyEnvelope');
  });
});
