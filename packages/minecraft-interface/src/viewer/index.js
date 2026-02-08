/**
 * Barrel export for the internalized viewer module.
 *
 * Server-side code imports from here; the client entry point
 * (client/index.js) is built separately by Vite.
 *
 * @module viewer
 */

export { Viewer } from './renderer/viewer.js'
export { WorldView } from './renderer/worldView.js'
export { WorldRenderer } from './renderer/worldrenderer.js'
export { default as Entity } from './entities/Entity.js'
export { Entities } from './entities/entities.js'
export { makeTextureAtlas } from './meshing/atlas.js'
export { prepareBlocksStates } from './meshing/modelsBuilder.js'
export { default as mineflayer } from './server/mineflayer.js'
