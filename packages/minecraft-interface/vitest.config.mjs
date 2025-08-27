import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    clearMocks: true,
    restoreMocks: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'src/__tests__/**/*.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'dist-simple', 'dist-demo'],
    setupFiles: ['src/__tests__/setup.ts'],
  },
  resolve: {
    alias: {
      '@conscious-bot/core': path.resolve(__dirname, '../core/dist'),
      '@conscious-bot/planning': path.resolve(__dirname, '../planning/dist'),
    },
  },
});
