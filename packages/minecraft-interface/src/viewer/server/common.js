import path from 'path'
import compression from 'compression'
import express from 'express'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export function setupRoutes (app, prefix = '') {
  app.use(compression())
  // Serve Vite build output, falling back to public/ for static assets (textures)
  app.use(prefix + '/', express.static(path.join(__dirname, '../dist')))
  app.use(prefix + '/', express.static(path.join(__dirname, '../public')))
}
