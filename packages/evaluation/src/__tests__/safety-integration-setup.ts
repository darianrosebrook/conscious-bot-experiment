/**
 * Safety Integration Setup for Performance Benchmarks
 *
 * Provides standardized safety fixtures for performance benchmarking.
 * This is separate from regular tests to avoid test interference.
 */

class MockFailSafesSystem {
  async declareEmergency(emergency: any): Promise<void> {
    // Stub implementation
  }

  async performHealthCheck(component: string): Promise<any> {
    return { status: 'healthy', component };
  }

  async shutdown(): Promise<void> {
    // Stub implementation
  }
}

export async function createSafetyIntegrationFixture() {
  return {
    failSafesSystem: new MockFailSafesSystem(),
    stop: async () => {
      // Stub implementation
    },
  };
}
