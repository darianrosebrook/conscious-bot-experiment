import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    clearMocks: true,
    restoreMocks: true,
    include: ['src/**/*.{test,spec}.ts'],
    exclude: ['node_modules', 'dist'],
  },
  resolve: {
    alias: {
      '@conscious-bot/core': path.resolve(__dirname, '../core/dist'),
      '@conscious-bot/world': path.resolve(__dirname, '../world/dist'),
    },
  },
});
