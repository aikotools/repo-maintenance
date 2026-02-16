/**
 * RepoHub Backend Server
 *
 * Hono HTTP server with tRPC for the repo maintenance tool.
 * Runs on Node.js, port 3100.
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { existsSync } from 'fs'
import { readFile } from 'fs/promises'
import { homedir } from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { BulkService } from './services/bulk-service'
import { CascadeService } from './services/cascade-service'
import { ConfigService } from './services/config-service'
import { GitService } from './services/git-service'
import { PackageService } from './services/package-service'
import { PullAllService } from './services/pull-all-service'
import { RepoScanner } from './services/repo-scanner'
import type { AppContext } from './trpc/context'
import { loadCachedData } from './trpc/procedures/project'
import { appRouter } from './trpc/router'

// Config home is always ~/.repoMaintenance
const configHome = path.join(homedir(), '.repoMaintenance')

// Legacy locations for migration
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const packageRoot = path.resolve(__dirname, '../../..')
const legacyLocations = [
  path.join(packageRoot, '.repoMaintenance'),
  path.join(homedir(), '.repohub', '.repoMaintenance'),
]

// Initialize config service and run init (migration + global.json)
const configService = new ConfigService(configHome, legacyLocations)
await configService.init()

const config = await configService.getProjectConfig()
const rootFolder = config.rootFolder || ''

if (rootFolder) {
  console.log(`[RepoHub] Root folder: ${rootFolder}`)
  console.log(`[RepoHub] Active project: ${configService.getActiveProjectSlug()}`)
} else {
  console.log('[RepoHub] No root folder configured. Set it in Settings.')
}

const scanner = new RepoScanner(rootFolder, config.npmOrganizations)
const gitService = new GitService(config.parallelTasks)
const cascadeService = new CascadeService(configService, config.parallelTasks)
const bulkService = new BulkService(config.parallelTasks)
const pullAllService = new PullAllService(config.parallelTasks, configService)
const packageService = new PackageService(rootFolder, config.npmOrganizations)

// Create shared app context (mutable, updated on refresh)
const appContext: AppContext = {
  configService,
  scanner,
  gitService,
  repos: [],
  domains: [],
  dependencyResolver: null,
  cascadeService,
  bulkService,
  pullAllService,
  packageService,
}

// Load cached data on startup
await loadCachedData(appContext)
if (appContext.repos.length > 0) {
  console.log(`[RepoHub] Loaded ${appContext.repos.length} cached repos`)
} else {
  console.log('[RepoHub] No cache found. Click "Refresh" in the UI to scan repos.')
}

// Initialize Hono app
const app = new Hono()

app.use('*', cors({ origin: '*' }))

// Health check
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'repo-maintenance',
    repos: appContext.repos.length,
  })
})

// tRPC handler
app.all('/trpc/*', async (c) => {
  return fetchRequestHandler({
    endpoint: '/trpc',
    req: c.req.raw,
    router: appRouter,
    createContext: () => appContext,
  })
})

// Serve static files from dist/client in production
const clientDir = path.join(packageRoot, 'dist/client')
if (existsSync(clientDir)) {
  app.use('/*', serveStatic({ root: clientDir }))

  // SPA fallback: serve index.html for non-API routes
  app.get('*', async (c) => {
    const indexPath = path.join(clientDir, 'index.html')
    const html = await readFile(indexPath, 'utf-8')
    return c.html(html)
  })
  console.log('[RepoHub] Serving static files from dist/client')
}

// 404
app.notFound((c) => c.json({ error: 'Not Found' }, 404))

// Error handler
app.onError((err, c) => {
  console.error('[RepoHub] Error:', err.message)
  return c.json({ error: err.message }, 500)
})

const preferredPort = Number(process.env.PORT) || 3100

async function findAvailablePort(start: number): Promise<number> {
  const { createServer } = await import('net')
  let port = start
  while (port < start + 20) {
    const available = await new Promise<boolean>((resolve) => {
      const server = createServer()
      server.once('error', () => resolve(false))
      server.once('listening', () => server.close(() => resolve(true)))
      server.listen(port)
    })
    if (available) return port
    port++
  }
  throw new Error(`No available port found between ${start} and ${port}`)
}

const port = await findAvailablePort(preferredPort)

serve({
  fetch: app.fetch,
  port,
})

if (port !== preferredPort) {
  console.log(`[RepoHub] Port ${preferredPort} in use, using ${port} instead`)
}
console.log(`[RepoHub] Server running on http://localhost:${port}`)
