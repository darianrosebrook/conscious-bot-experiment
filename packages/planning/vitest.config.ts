import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts'],
    testTimeout: 30000,
    clearMocks: true,
    restoreMocks: true,
  },
  resolve: {
    alias: {
      '@conscious-bot/core': path.resolve(__dirname, '../core/dist'),
      '@conscious-bot/world': path.resolve(__dirname, '../world/dist'),
      '@conscious-bot/memory': path.resolve(__dirname, '../memory/dist'),
    },
  },
});
