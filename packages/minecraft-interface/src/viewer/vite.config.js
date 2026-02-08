import { defineConfig } from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  // Root is the viewer directory so all source imports resolve correctly
  root: __dirname,
  // Static assets (textures/, blocksStates/) live in public/
  publicDir: path.resolve(__dirname, 'public'),
  build: {
    // Output to a separate directory to avoid overwriting source
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, 'index.html'),
      },
    },
  },
  resolve: {
    alias: [
      // Redirect utils.electron.js → utils.web.js
      { find: '../utils/utils.electron.js', replacement: path.resolve(__dirname, 'utils/utils.web.js') },
    ],
  },
  worker: {
    format: 'es', // Workers use ES modules
    plugins: () => [
      {
        name: 'minecraft-data-shim',
        enforce: 'pre',
        resolveId (source) {
          // Redirect minecraft-data imports inside worker bundles to our
          // lightweight shim (~60 lines) instead of the real package (366MB JSON).
          // This catches both direct imports and transitive require() calls from
          // prismarine-chunk / prismarine-registry.
          if (source === 'minecraft-data') {
            return path.resolve(__dirname, 'meshing/minecraft-data-shim.js')
          }
        }
      },
      {
        name: 'protodef-eval-compat',
        enforce: 'pre',
        transform (code, id) {
          // protodef's Compiler.compile() uses eval() on generated code that
          // references local variables `native` and `PartialReadError` by name.
          // Vite's minifier renames these locals, breaking the eval'd code.
          // Fix: replace the local variable assignments with globalThis assignments
          // so eval'd code can always find them regardless of minification.
          if (id.includes('protodef') && id.endsWith('compiler.js')) {
            let patched = code
            patched = patched.replace(
              'const native = this.native',
              'globalThis.native = this.native; const native = this.native'
            )
            patched = patched.replace(
              "const { PartialReadError } = require('./utils')",
              "globalThis.PartialReadError = require('./utils').PartialReadError; const { PartialReadError } = require('./utils')"
            )
            if (patched !== code) {
              console.log('[protodef-eval-compat] Patched compiler.js for eval() compatibility')
            }
            return patched
          }
        }
      }
    ],
  },
  define: {
    'process.env': '{}',
    'global': 'globalThis',
  },
  optimizeDeps: {
    include: ['three', 'three/webgpu', '@tweenjs/tween.js', 'socket.io-client', 'vec3'],
  },
})
