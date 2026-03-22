import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  shell,
  ipcMain,
  dialog,
} from 'electron'
import { execFile, spawn } from 'child_process'
import * as path from 'path'
import * as http from 'http'
import * as fs from 'fs'

// ─── Constants ───────────────────────────────────────────────────────────────

const COMPOSE_FILE = '/opt/project-nomad/compose.yml'
const ADMIN_URL = 'http://localhost:8080'
const HEALTH_URL = `${ADMIN_URL}/api/health`
const MAX_WAIT_MS = 180_000 // 3 minutes

// ─── State ───────────────────────────────────────────────────────────────────

let win: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false
let serverState: 'stopped' | 'starting' | 'running' | 'error' = 'stopped'

// ─── Single instance lock ─────────────────────────────────────────────────────

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
  process.exit(0)
}
app.on('second-instance', () => {
  win?.show()
  win?.focus()
})

// ─── Window ──────────────────────────────────────────────────────────────────

function createWindow(): void {
  win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 940,
    minHeight: 600,
    title: 'Project N.O.M.A.D.',
    backgroundColor: '#0f172a',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.loadFile(path.join(__dirname, 'loading.html'))
  win.once('ready-to-show', () => win?.show())

  // Minimize to tray on close instead of quitting
  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      win?.hide()
    }
  })

  // Open external links in the system browser, not in the Electron window
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

// ─── System Tray ─────────────────────────────────────────────────────────────

function getTrayIcon(): Electron.NativeImage {
  const iconPath = path.join(__dirname, '..', 'assets', 'tray-icon.png')
  if (fs.existsSync(iconPath)) {
    return nativeImage.createFromPath(iconPath)
  }
  // Fallback: 1×1 transparent PNG so Electron doesn't throw
  return nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
  )
}

function createTray(): void {
  tray = new Tray(getTrayIcon())
  tray.setToolTip('Project N.O.M.A.D.')
  rebuildTrayMenu()
  tray.on('double-click', () => {
    win?.show()
    win?.focus()
  })
}

function rebuildTrayMenu(): void {
  const isRunning = serverState === 'running'
  const menu = Menu.buildFromTemplate([
    {
      label: 'Show NOMAD',
      click: () => {
        win?.show()
        win?.focus()
      },
    },
    {
      label: 'Open in Browser',
      enabled: isRunning,
      click: () => shell.openExternal(ADMIN_URL),
    },
    { type: 'separator' },
    {
      label: serverState === 'starting' ? 'Starting…' : 'Restart Server',
      enabled: serverState !== 'starting',
      click: () => restartServer(),
    },
    {
      label: 'Stop Server',
      enabled: isRunning,
      click: () => stopServerAndNotify(),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => quit(),
    },
  ])
  tray?.setContextMenu(menu)
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────

ipcMain.on('retry-launch', () => {
  launch()
})

// ─── Status messaging ────────────────────────────────────────────────────────

function sendStatus(
  message: string,
  progress: number,
  type: 'info' | 'error' | 'success' = 'info'
): void {
  win?.webContents.send('startup:status', { message, progress, type })
}

// ─── Docker helpers ───────────────────────────────────────────────────────────

function checkDockerRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('docker', ['info'], { timeout: 10_000 }, (err) => resolve(!err))
  })
}

function nomadIsInstalled(): boolean {
  return fs.existsSync(COMPOSE_FILE)
}

function runCompose(...args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      'docker',
      ['compose', '-p', 'project-nomad', '-f', COMPOSE_FILE, ...args],
      { stdio: 'pipe' }
    )
    const stderr: string[] = []
    proc.stderr?.on('data', (d: Buffer) => stderr.push(d.toString()))
    proc.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(stderr.join('').trim() || `docker compose exited with code ${code}`))
      }
    })
    proc.on('error', reject)
  })
}

function checkHealth(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(HEALTH_URL, { timeout: 5_000 }, (res) => {
      resolve(res.statusCode === 200)
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => {
      req.destroy()
      resolve(false)
    })
  })
}

async function waitForHealth(): Promise<void> {
  const deadline = Date.now() + MAX_WAIT_MS
  const milestones = [
    { after: 0,       message: 'Starting services…',          progress: 8  },
    { after: 10_000,  message: 'Waiting for database…',       progress: 25 },
    { after: 30_000,  message: 'Initializing AI services…',   progress: 50 },
    { after: 60_000,  message: 'Almost ready…',               progress: 72 },
    { after: 90_000,  message: 'Taking longer than usual…',   progress: 85 },
    { after: 120_000, message: 'Still waiting…',              progress: 92 },
  ]

  const started = Date.now()
  let mIdx = 0

  while (Date.now() < deadline) {
    const elapsed = Date.now() - started
    while (mIdx < milestones.length - 1 && elapsed >= milestones[mIdx + 1].after) mIdx++
    const m = milestones[mIdx]
    sendStatus(m.message, m.progress)

    if (await checkHealth()) return

    await new Promise<void>((r) => setTimeout(r, 2_000))
  }

  throw new Error('Server did not become healthy within the timeout period')
}

// ─── Server lifecycle ─────────────────────────────────────────────────────────

async function restartServer(): Promise<void> {
  // Reload loading screen before starting
  win?.loadFile(path.join(__dirname, 'loading.html'))
  await new Promise<void>((r) => setTimeout(r, 300))
  await launch()
}

async function stopServerAndNotify(): Promise<void> {
  serverState = 'stopped'
  rebuildTrayMenu()
  try {
    await runCompose('stop')
  } catch {
    // best-effort
  }
}

// ─── Main launch sequence ─────────────────────────────────────────────────────

async function launch(): Promise<void> {
  serverState = 'starting'
  rebuildTrayMenu()

  sendStatus('Checking Docker…', 2)

  const dockerOk = await checkDockerRunning()
  if (!dockerOk) {
    serverState = 'error'
    rebuildTrayMenu()
    sendStatus(
      'Docker is not running. Please start Docker and try again.',
      0,
      'error'
    )
    return
  }

  if (!nomadIsInstalled()) {
    serverState = 'error'
    rebuildTrayMenu()
    sendStatus(
      'NOMAD is not installed. Run install/install_nomad.sh to set it up.',
      0,
      'error'
    )
    return
  }

  sendStatus('Starting NOMAD containers…', 10)

  try {
    await runCompose('up', '-d')
  } catch (err) {
    serverState = 'error'
    rebuildTrayMenu()
    sendStatus(
      `Failed to start containers: ${err instanceof Error ? err.message : String(err)}`,
      0,
      'error'
    )
    return
  }

  try {
    await waitForHealth()
  } catch {
    serverState = 'error'
    rebuildTrayMenu()
    sendStatus(
      'Server did not start in time. Check logs via Settings → Support.',
      0,
      'error'
    )
    return
  }

  serverState = 'running'
  rebuildTrayMenu()
  sendStatus('Ready!', 100, 'success')

  // Brief pause so the user sees the "Ready!" message
  await new Promise<void>((r) => setTimeout(r, 400))
  win?.loadURL(ADMIN_URL)
}

// ─── Quit ─────────────────────────────────────────────────────────────────────

function quit(): void {
  isQuitting = true
  tray?.destroy()
  app.quit()
}

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow()
  createTray()
  launch()
})

// Keep running in system tray when all windows are hidden
app.on('window-all-closed', () => {
  // intentionally empty — do not quit
})

// macOS: re-show window on Dock click
app.on('activate', () => {
  if (win) {
    win.show()
  } else {
    createWindow()
  }
})

app.on('before-quit', () => {
  isQuitting = true
})
