/**
 * mineflayer.js - Enhanced Prismarine Viewer Server Integration
 *
 * This is a patched version of prismarine-viewer's lib/mineflayer.js that:
 * 1. Emits equipment data with entity updates
 * 2. Emits world time for day/night cycle
 * 3. Better entity tracking for animation support
 *
 * This file is copied to node_modules/prismarine-viewer/lib/mineflayer.js
 * by scripts/rebuild-prismarine-viewer.cjs during postinstall.
 *
 * @module prismarine-viewer/lib/mineflayer
 * @author @darianrosebrook
 */

const EventEmitter = require('events')

module.exports = (bot, { viewDistance = 6, firstPerson = false, port = 3000, prefix = '' }) => {
  const { WorldView } = require('../viewer')
  const express = require('express')

  const app = express()
  const http = require('http').createServer(app)

  const io = require('socket.io')(http, { path: prefix + '/socket.io' })

  const { setupRoutes } = require('./common')
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
    socket.emit('version', bot.version)
    sockets.push(socket)

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

      // Include equipment if present and changed
      if (entity.equipment && hasEquipmentChanged(entity.id, entity.equipment)) {
        entityData.equipment = serializeEquipment(entity.equipment)
      }

      socket.emit('entity', entityData)
    }

    // Intercept entity events from worldView to add equipment
    const originalEmit = worldView.emitter.emit.bind(worldView.emitter)
    worldView.emitter.emit = function (event, data) {
      if (event === 'entity' && data && !data.delete) {
        // Find the full entity from bot.entities
        const fullEntity = bot.entities[data.id]
        if (fullEntity && fullEntity.equipment) {
          // Check if equipment changed and add it
          if (hasEquipmentChanged(data.id, fullEntity.equipment)) {
            data.equipment = serializeEquipment(fullEntity.equipment)
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
