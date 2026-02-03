import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
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
    proxy: {
      // Memory service
      '/api/database': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/database/, '/enhanced'),
      },
      '/api/embeddings': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/embeddings/, '/enhanced'),
      },
      '/api/memories': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/memories/, ''),
      },
      // Cognition service
      '/api/stream': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/stream/, '/stream'),
      },
      '/api/intrusive': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/intrusive/, '/intrusive'),
      },
      // Minecraft interface service
      '/api/bot': {
        target: 'http://localhost:3003',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/bot/, '/bot'),
      },
      '/api/viewer': {
        target: 'http://localhost:3003',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/viewer/, '/viewer'),
      },
      '/api/inventory': {
        target: 'http://localhost:3003',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/inventory/, '/inventory'),
      },
      '/api/world': {
        target: 'http://localhost:3003',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/world/, '/world'),
      },
      // Planning service
      '/api/tasks': {
        target: 'http://localhost:3004',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/tasks/, '/tasks'),
      },
      '/api/goals': {
        target: 'http://localhost:3004',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/goals/, '/goals'),
      },
      '/api/planner': {
        target: 'http://localhost:3004',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/planner/, '/planner'),
      },
      // Evaluation service
      '/api/evaluation': {
        target: 'http://localhost:3005',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/evaluation/, ''),
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
