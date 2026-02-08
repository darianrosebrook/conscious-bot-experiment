/**
 * mineflayer.js - Enhanced Prismarine Viewer Server Integration
 *
 * This is a patched version that:
 * 1. Emits equipment data with entity updates
 * 2. Emits world time for day/night cycle
 * 3. Better entity tracking for animation support
 *
 * @module viewer/server/mineflayer
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events'
import { WorldView } from '../renderer/worldView.js'
import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { setupRoutes } from './common.js'
import { createRequire } from 'node:module'

// createRequire() bridges ESM→CJS: when tsx runs server.ts as ESM,
// `require` is not defined. This gives us a CJS-style require that
// can load minecraft-data (a CJS package with lazy getters).
const require = createRequire(import.meta.url)

export default function mineflayerViewer (bot, { viewDistance = 6, firstPerson = false, port = 3000, prefix = '' }) {
  const app = express()
  const http = createServer(app)
  const io = new Server(http, { path: prefix + '/socket.io' })

  setupRoutes(app, prefix)

  const sockets = []
  const primitives = {}

  bot.viewer = new EventEmitter()

  bot.viewer.erase = (id) => {
    delete primitives[id]
    for (const socket of sockets) {
      socket.emit('primitive', { id })
    }
  }

  bot.viewer.drawBoxGrid = (id, start, end, color = 'aqua') => {
    primitives[id] = { type: 'boxgrid', id, start, end, color }
    for (const socket of sockets) {
      socket.emit('primitive', primitives[id])
    }
  }

  bot.viewer.drawLine = (id, points, color = 0xff0000) => {
    primitives[id] = { type: 'line', id, points, color }
    for (const socket of sockets) {
      socket.emit('primitive', primitives[id])
    }
  }

  bot.viewer.drawPoints = (id, points, color = 0xff0000, size = 5) => {
    primitives[id] = { type: 'points', id, points, color, size }
    for (const socket of sockets) {
      socket.emit('primitive', primitives[id])
    }
  }

  // ============================================================================
  // ENHANCED: Player skin & cape lookup
  // ============================================================================

  // Mineflayer v4+ populates bot.players[name].skinData from player_info packets,
  // but only extracts SKIN url — not CAPE url. We intercept player_info ourselves
  // to extract cape URLs from the same base64 textures property.
  const playerCapeData = new Map() // username → { url: string }

  function extractCapeFromProperties (properties) {
    if (!properties) return undefined
    const props = Object.fromEntries(properties.map(e => [e.name, e]))
    if (!props.textures || !props.textures.value) return undefined
    try {
      const decoded = JSON.parse(Buffer.from(props.textures.value, 'base64').toString('utf8'))
      const capeUrl = decoded?.textures?.CAPE?.url
      return capeUrl ? { url: capeUrl } : undefined
    } catch {
      return undefined
    }
  }

  // Listen for player_info packets to extract cape data
  if (bot._client) {
    bot._client.on('player_info', (packet) => {
      // Handle both bitfield (1.19.3+) and legacy formats
      const data = packet.data || []
      for (const item of data) {
        const properties = item?.player?.properties || item?.properties
        const username = item?.player?.name || item?.name
        if (username && properties) {
          const cape = extractCapeFromProperties(properties)
          if (cape) {
            playerCapeData.set(username, cape)
          }
        }
      }
    })
  }

  function getPlayerSkin (username) {
    if (!username) return undefined
    return bot.players[username]?.skinData
  }

  function getPlayerCape (username) {
    if (!username) return undefined
    return playerCapeData.get(username)
  }

  // ============================================================================
  // ENHANCED: Equipment tracking
  // ============================================================================

  // Track entity equipment for change detection
  const entityEquipmentCache = new Map()

  /**
   * Check if entity equipment has changed
   */
  function hasEquipmentChanged (entityId, equipment) {
    if (!equipment) return false

    const cached = entityEquipmentCache.get(entityId)
    if (!cached) {
      entityEquipmentCache.set(entityId, [...equipment])
      return true
    }

    for (let i = 0; i < Math.max(equipment.length, cached.length); i++) {
      const oldItem = cached[i]
      const newItem = equipment[i]

      if (!oldItem && !newItem) continue
      if (!oldItem || !newItem) {
        entityEquipmentCache.set(entityId, [...equipment])
        return true
      }
      if (oldItem.name !== newItem.name || oldItem.count !== newItem.count) {
        entityEquipmentCache.set(entityId, [...equipment])
        return true
      }
    }

    return false
  }

  /**
   * Serialize equipment for socket transmission
   */
  function serializeEquipment (equipment) {
    if (!equipment || !Array.isArray(equipment)) return null

    return equipment.map(item => {
      if (!item) return null
      return {
        name: item.name,
        displayName: item.displayName,
        count: item.count,
        type: item.type
      }
    })
  }

  // ============================================================================
  // Socket Connection Handler
  // ============================================================================

  io.on('connection', (socket) => {
    // ========================================================================
    // Extract minimal minecraft-data subset for worker shim
    // The worker bundle uses a lightweight shim instead of the full minecraft-data
    // package (366MB). We extract only the fields that prismarine-chunk,
    // prismarine-registry, and our meshing code actually need at runtime.
    // ========================================================================
    try {
      const mcDataMod = require('minecraft-data')
      const mcDataForVersion = mcDataMod(bot.version)
      const mcDataTints = mcDataMod('1.16.2') // models.js hardcodes this version for tints

      // Build version→dataVersion lookup table for comparison operators.
      // The shim reconstructs version['>=']('1.21.5') etc. from this map.
      const versionMap = {}
      for (const v of mcDataMod.versions.pc) {
        versionMap[v.minecraftVersion] = v.dataVersion
        if (!versionMap[v.majorVersion]) versionMap[v.majorVersion] = v.dataVersion
      }

      // Extract supportFeature results as a feature map.
      // supportFeature() is a closure over version-specific feature data that
      // gets lost during JSON serialization. The shim reconstructs it.
      const featureNames = [
        'blockStateId', 'blockHashes', 'incrementedChatType',
        'segmentedRegistryCodecData', 'theFlattening', 'dimensionDataIsAvailable',
        'fixedBiomes', 'dimensionIsAString', 'dimensionIsAnInt',
        'itemCount', 'usesNetty', 'chunksHaveLight',
      ]
      const featureMap = {}
      for (const f of featureNames) {
        const v = mcDataForVersion.supportFeature(f)
        if (v) featureMap[f] = v
      }

      socket.emit('mcData', {
        version: bot.version,
        data: {
          // prismarine-registry / prismarine-chunk core data
          biomes: mcDataForVersion.biomes,
          biomesByName: mcDataForVersion.biomesByName,
          blocksArray: mcDataForVersion.blocksArray,
          blocksByName: mcDataForVersion.blocksByName,
          blockCollisionShapes: mcDataForVersion.blockCollisionShapes,
          blockStates: mcDataForVersion.blockStates,
          materials: mcDataForVersion.materials,
          itemsArray: mcDataForVersion.itemsArray,
          version: mcDataForVersion.version,
          // prismarine-block reads these for potion/enchantment-aware digging
          effectsByName: mcDataForVersion.effectsByName,
          enchantmentsByName: mcDataForVersion.enchantmentsByName,
          // Feature map — shim reconstructs supportFeature() from this
          _featureMap: featureMap,
          // models.js needs tints for grass/foliage/water coloring
          tints: mcDataTints.tints,
        },
        // Version→dataVersion lookup for comparison operators
        versionMap,
        tintsVersion: '1.16.2'
      })
      console.log(`[mineflayer] Emitted mcData subset for version ${bot.version} (${Object.keys(featureMap).length} features, ${Object.keys(versionMap).length} version entries)`)
    } catch (e) {
      console.error('[mineflayer] Failed to extract mcData for worker shim:', e.message)
    }

    socket.emit('version', bot.version)

    // Emit bot info for name tag display, skin, and cape
    const botSkin = getPlayerSkin(bot.username)
    const botCape = getPlayerCape(bot.username)
    socket.emit('botInfo', {
      username: bot.username || 'Bot',
      uuid: bot.player?.uuid,
      skinUrl: botSkin?.url,
      skinModel: botSkin?.model,
      capeUrl: botCape?.url
    })

    sockets.push(socket)

    // Position logged at debug level — this fires on every socket connect
    const worldView = new WorldView(bot.world, viewDistance, bot.entity.position, socket)
    worldView.init(bot.entity.position)

    worldView.on('blockClicked', (block, face, button) => {
      bot.viewer.emit('blockClicked', block, face, button)
    })

    for (const id in primitives) {
      socket.emit('primitive', primitives[id])
    }

    // ========================================================================
    // ENHANCED: Emit equipment with entity updates
    // ========================================================================

    /**
     * Enhanced entity update that includes equipment
     */
    function emitEntityWithEquipment (entity) {
      if (!entity || !entity.position) return

      const entityData = {
        id: entity.id,
        name: entity.name,
        pos: entity.position,
        yaw: entity.yaw,
        pitch: entity.pitch,
        width: entity.width,
        height: entity.height,
        username: entity.username
      }

      // Look up skin and cape from extracted player_info properties
      if (entity.username) {
        const skin = getPlayerSkin(entity.username)
        if (skin) {
          entityData.skinUrl = skin.url
          entityData.skinModel = skin.model
        }
        const cape = getPlayerCape(entity.username)
        if (cape) {
          entityData.capeUrl = cape.url
        }
      }

      // Include equipment if present and changed
      if (entity.equipment && hasEquipmentChanged(entity.id, entity.equipment)) {
        entityData.equipment = serializeEquipment(entity.equipment)
      }

      socket.emit('entity', entityData)
    }

    // Intercept entity events from worldView to add equipment and skin data
    const originalEmit = worldView.emitter.emit.bind(worldView.emitter)
    worldView.emitter.emit = function (event, data) {
      if (event === 'entity' && data && !data.delete) {
        // Find the full entity from bot.entities
        const fullEntity = bot.entities[data.id]
        if (fullEntity) {
          // Add equipment if changed
          if (fullEntity.equipment && hasEquipmentChanged(data.id, fullEntity.equipment)) {
            data.equipment = serializeEquipment(fullEntity.equipment)
          }
          // Add skin and cape URLs for player entities
          if (fullEntity.username) {
            if (!data.skinUrl) {
              const skin = getPlayerSkin(fullEntity.username)
              if (skin) {
                data.skinUrl = skin.url
                data.skinModel = skin.model
              }
            }
            if (!data.capeUrl) {
              const cape = getPlayerCape(fullEntity.username)
              if (cape) {
                data.capeUrl = cape.url
              }
            }
          }
        }
      }
      return originalEmit(event, data)
    }

    // ========================================================================
    // ENHANCED: Emit world time for day/night cycle
    // ========================================================================

    let lastTimeEmit = 0
    const TIME_EMIT_INTERVAL = 5000 // Emit time every 5 seconds

    function emitWorldTime () {
      const now = Date.now()
      if (now - lastTimeEmit < TIME_EMIT_INTERVAL) return

      lastTimeEmit = now

      if (bot.time && typeof bot.time.time === 'number') {
        socket.emit('time', { time: bot.time.time })
      }
    }

    // ========================================================================
    // ENHANCED: Weather state tracking
    // ========================================================================

    let currentWeatherState = 'clear'

    function emitWeather (state) {
      if (state === currentWeatherState) return
      currentWeatherState = state

      // Determine if current biome is cold (for snow vs rain)
      // Default to rain; biome detection can be added later
      const isSnowBiome = false // TODO: Check bot.world biome temperature

      socket.emit('weather', {
        state: state,
        isSnowBiome: isSnowBiome
      })

      console.log(`[mineflayer] Weather changed to: ${state}`)
    }

    // Listen for rain state changes
    bot.on('rain', () => {
      emitWeather('rain')
    })

    // Note: mineflayer emits 'rain' for both start and state; we check isRaining
    bot.on('weatherUpdate', () => {
      if (bot.isRaining) {
        if (bot.thunderState > 0) {
          emitWeather('thunder')
        } else {
          emitWeather('rain')
        }
      } else {
        emitWeather('clear')
      }
    })

    // Send initial weather state
    setTimeout(() => {
      if (bot.isRaining) {
        emitWeather(bot.thunderState > 0 ? 'thunder' : 'rain')
      }
    }, 1000)

    // ========================================================================
    // Bot Position & Movement
    // ========================================================================

    function botPosition () {
      const packet = { pos: bot.entity.position, yaw: bot.entity.yaw, addMesh: true }
      if (firstPerson) {
        packet.pitch = bot.entity.pitch
      }
      socket.emit('position', packet)
      worldView.updatePosition(bot.entity.position)

      // Also emit time periodically
      emitWorldTime()
    }

    // ========================================================================
    // ENHANCED: Equipment change listener
    // ========================================================================

    // Listen for equipment changes on entities
    function onEntityEquipment (entity) {
      if (!entity || !entity.equipment) return

      const entityData = {
        id: entity.id,
        equipment: serializeEquipment(entity.equipment)
      }
      socket.emit('entityEquipment', entityData)
    }

    // Subscribe to entity equipment events if available
    if (bot._client) {
      bot._client.on('entity_equipment', (packet) => {
        const entity = bot.entities[packet.entityId]
        if (entity) {
          // Small delay to let mineflayer process the packet first
          setTimeout(() => onEntityEquipment(entity), 50)
        }
      })
    }

    // ========================================================================
    // Event Handlers
    // ========================================================================

    bot.on('move', botPosition)
    worldView.listenToBot(bot)

    // CRITICAL: Emit initial position immediately so the client camera
    // moves to the bot's location. Without this, the camera stays at (0,0,0)
    // until the bot moves for the first time.
    botPosition()

    socket.on('disconnect', () => {
      bot.removeListener('move', botPosition)
      worldView.removeListenersFromBot(bot)
      sockets.splice(sockets.indexOf(socket), 1)

      // Clean up equipment cache for this connection
      // (we could track per-socket, but for now just let it grow)
    })
  })

  // ============================================================================
  // HTTP Server
  // ============================================================================

  http.listen(port, () => {
    console.log(`Prismarine viewer web server running on *:${port}`)
  })

  bot.viewer.close = () => {
    http.close()
    for (const socket of sockets) {
      socket.disconnect()
    }
  }
}
