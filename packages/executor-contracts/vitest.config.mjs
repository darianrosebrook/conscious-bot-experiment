import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: [],
    include: ['src/**/*.{test,spec}.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.d.ts',
        '**/*.config.*',
        '**/__tests__/**',
        'src/index.ts',
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
    },
  },
  esbuild: {
    target: 'esnext',
  },
});
