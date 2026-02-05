// eslint-disable-next-line no-unused-vars
const webpack = require('webpack')
const path = require('path')

// Minify the index.js by removing unused minecraft data. Since the worker only needs to do meshing,
// we can remove all the other data unrelated to meshing.
const blockedIndexFiles = ['blocksB2J', 'blocksJ2B', 'blockMappings', 'steve', 'recipes']
const allowedWorkerFiles = ['blocks', 'blockCollisionShapes', 'tints', 'blockStates',
  'biomes', 'features', 'version', 'legacy', 'versions', 'version', 'protocolVersions']
const threePath = path.dirname(require.resolve('three/package.json'))

const indexConfig = {
  entry: './lib/index.js',
  mode: 'production',
  output: {
    path: path.resolve(__dirname, './public'),
    filename: './index.js'
  },
  resolve: {
    symlinks: false,
    fallback: {
      zlib: false,
      assert: require.resolve('assert/')
    },
    alias: {
      three: threePath
    }
  },
  plugins: [
    // fix "process is not defined" error:
    new webpack.ProvidePlugin({
      process: 'process/browser'
    }),
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer']
    }),
    new webpack.NormalModuleReplacementPlugin(
      // eslint-disable-next-line
      /viewer[\/|\\]lib[\/|\\]utils/,
      './utils.web.js'
    )
  ],
  externals: [
    function (req, cb) {
      if (req.context.includes('minecraft-data') && req.request.endsWith('.json')) {
        const fileName = req.request.split('/').pop().replace('.json', '')
        if (blockedIndexFiles.includes(fileName)) {
          cb(null, [])
          return
        }
      }
      cb()
    }
  ]
}

const workerConfig = {
  entry: './viewer/lib/worker.js',
  mode: 'production',
  output: {
    path: path.join(__dirname, '/public'),
    filename: './worker.js'
  },
  resolve: {
    symlinks: false,
    fallback: {
      zlib: false,
      assert: require.resolve('assert/')
    },
    alias: {
      three: threePath
    }
  },
  plugins: [
    // fix "process is not defined" error:
    new webpack.ProvidePlugin({
      process: 'process/browser'
    }),
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer']
    })
  ],
  externals: [
    function (req, cb) {
      if (req.context.includes('minecraft-data') && req.request.endsWith('.json')) {
        const fileName = req.request.split('/').pop().replace('.json', '')
        if (!allowedWorkerFiles.includes(fileName)) {
          cb(null, [])
          return
        }
      }
      cb()
    }
  ]
}

module.exports = [indexConfig, workerConfig]
