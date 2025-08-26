/**
 * Simple Arbiter Test
 *
 * Basic test to verify HybridHRMArbiter constructor works
 *
 * @author @darianrosebrook
 */

import { HybridHRMArbiter } from '../../../core/src/hybrid-hrm-arbiter';

describe('Simple Arbiter Test', () => {
  it('should create arbiter instance', () => {
    console.log('🔧 Creating arbiter...');
    
    const arbiter = new HybridHRMArbiter({
      modelPath: '/path/to/model',
      device: 'cpu',
      maxSteps: 100,
      confidenceThreshold: 0.8
    });

    console.log('✅ Arbiter created successfully');
    expect(arbiter).toBeDefined();
    expect((arbiter as any).leafFactory).toBeDefined();
  });
});
