/**
 * Electron shell for RepoHub.
 *
 * The app is full-stack: a Node (Hono+tRPC) backend does git/fs work. Electron's
 * main process IS Node, so we just spawn the existing server (bin/repohub.js, run
 * via ELECTRON_RUN_AS_NODE so no separate Node install is needed), read the port
 * it prints, and point a window at it. The whole web app is reused unchanged.
 *
 * ponytail: spawn the existing bin instead of importing the ESM server into this
 * CommonJS main — keeps the loader/extension-resolution dance isolated in one place.
 */

const { app, BrowserWindow } = require('electron')
const { spawn } = require('node:child_process')
const path = require('node:path')

const appRoot = path.join(__dirname, '..')
let server = null

function startServer() {
  const binPath = path.join(appRoot, 'bin', 'repohub.js')
  server = spawn(process.execPath, [binPath], {
    cwd: appRoot,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PORT: '3100' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  return new Promise((resolve) => {
    let resolved = false
    const done = (port) => {
      if (!resolved) {
        resolved = true
        resolve(port)
      }
    }
    server.stdout.on('data', (buf) => {
      const text = buf.toString()
      process.stdout.write(text)
      const m = text.match(/localhost:(\d+)/)
      if (m) done(Number(m[1]))
    })
    server.stderr.on('data', (b) => process.stderr.write(b))
    // Fallback to the default port if the banner never matched
    setTimeout(() => done(3100), 10_000)
  })
}

async function createWindow() {
  const port = await startServer()
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    title: 'RepoHub',
    backgroundColor: '#0a0a0a',
    webPreferences: { contextIsolation: true },
  })
  await win.loadURL(`http://localhost:${port}`)
}

app.whenReady().then(createWindow)

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.on('window-all-closed', () => app.quit())
app.on('quit', () => {
  if (server) server.kill()
})
