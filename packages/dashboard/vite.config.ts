import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import textureAtlasPlugin from './vite-plugin-texture-atlas';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), textureAtlasPlugin()],
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    target: 'esnext',
    outDir: 'build',
  },
  server: {
    port: 3000,
    open: true,
    // Proxy API requests to backend services during development
    // Service ports: memory=3001, planning=3002, cognition=3003, world=3004, minecraft=3005
    proxy: {
      // =====================================================================
      // Memory service (port 3001)
      // =====================================================================
      // Health check — must come before /api/database to avoid being rewritten to /enhanced/health
      '/api/database/health': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: () => '/health',
      },
      '/api/database': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/database/, '/enhanced'),
      },
      // Embeddings visualization endpoint - maps /api/embeddings/viz to /enhanced/embeddings-3d
      '/api/embeddings/viz': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: () => '/enhanced/embeddings-3d',
      },
      '/api/embeddings': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/embeddings/, '/enhanced'),
      },
      '/api/memories': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/memories/, '/memories'),
      },
      '/api/memory-updates': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) =>
          path.replace(/^\/api\/memory-updates/, '/memory-updates'),
      },

      // =====================================================================
      // Planning service (port 3002)
      // =====================================================================
      '/api/tasks': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/tasks/, '/tasks'),
      },
      '/api/task-updates': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        rewrite: (path) =>
          path.replace(/^\/api\/task-updates/, '/task-updates'),
      },
      '/api/goals': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/goals/, '/goals'),
      },
      '/api/planner': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/planner/, '/planner'),
      },
      '/api/valuation-updates': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        rewrite: () => '/valuation-updates',
      },

      // =====================================================================
      // Cognition service (port 3003)
      // =====================================================================
      // Cognitive stream - maps /api/ws/cognitive-stream/* to /api/cognitive-stream/*
      '/api/ws/cognitive-stream': {
        target: 'http://localhost:3003',
        changeOrigin: true,
        rewrite: (path) =>
          path.replace(/^\/api\/ws\/cognitive-stream/, '/api/cognitive-stream'),
      },
      '/api/stream': {
        target: 'http://localhost:3003',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/stream/, '/stream'),
      },
      '/api/intero': {
        target: 'http://localhost:3003',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api/, ''),
      },
      // Events and notes served by memory service (same source as memory-updates SSE)
      '/api/events': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/events/, '/events'),
      },
      '/api/notes': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/notes/, '/notes'),
      },

      // =====================================================================
      // World service (port 3004)
      // =====================================================================
      '/api/world': {
        target: 'http://localhost:3004',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/world/, '/state'),
      },

      // =====================================================================
      // Minecraft interface service (port 3005)
      // =====================================================================
      // Bot state SSE stream - used by dashboard as fallback when WebSocket is unavailable
      '/api/ws/bot-state': {
        target: 'http://localhost:3005',
        changeOrigin: true,
        rewrite: () => '/state-stream',
      },
      '/api/bot/state': {
        target: 'http://localhost:3005',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/bot\/state/, '/state'),
      },
      '/api/bot/health': {
        target: 'http://localhost:3005',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/bot\/health/, '/health'),
      },
      '/api/bot': {
        target: 'http://localhost:3005',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/bot/, ''),
      },
      '/api/viewer/status': {
        target: 'http://localhost:3005',
        changeOrigin: true,
        rewrite: (path) =>
          path.replace(/^\/api\/viewer\/status/, '/viewer-status'),
      },
      '/api/viewer/start': {
        target: 'http://localhost:3005',
        changeOrigin: true,
        rewrite: (path) =>
          path.replace(/^\/api\/viewer\/start/, '/start-viewer'),
      },
      '/api/viewer/stop': {
        target: 'http://localhost:3005',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/viewer\/stop/, '/stop-viewer'),
      },
      '/api/inventory': {
        target: 'http://localhost:3005',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/inventory/, '/inventory'),
      },
      // Minecraft asset pipeline — textures, blockStates (shared with viewer)
      '/api/mc-assets': {
        target: 'http://localhost:3005',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/mc-assets/, '/mc-assets'),
      },

      // =====================================================================
      // Evaluation service (port 3006 - if separate, otherwise part of another)
      // =====================================================================
      '/api/evaluation': {
        target: 'http://localhost:3005',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/evaluation/, '/evaluation'),
      },

      // =====================================================================
      // Building solve with prerequisites (planning service → Sterling)
      // =====================================================================
      '/api/building-solve': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/building-solve/, '/sterling/building/solve-with-prerequisites'),
      },

      // =====================================================================
      // Sterling reasoning service (port 8766 — WebSocket)
      // =====================================================================
      '/api/sterling': {
        target: 'ws://localhost:8766',
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/api\/sterling/, ''),
      },
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        // Enable modern Sass API
        api: 'modern-compiler',
      },
    },
  },
});
