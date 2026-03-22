import { contextBridge, ipcRenderer } from 'electron'

export interface StatusPayload {
  message: string
  progress: number
  type: 'info' | 'error' | 'success'
}

// Expose a minimal, typed API to the loading screen renderer.
// This runs in every page the BrowserWindow loads — the NOMAD web app
// simply ignores `window.nomadElectron` if it's not needed.
contextBridge.exposeInMainWorld('nomadElectron', {
  onStatus: (cb: (payload: StatusPayload) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: StatusPayload) => cb(data)
    ipcRenderer.on('startup:status', handler)
    // Return a cleanup function so the renderer can remove the listener
    return () => ipcRenderer.removeListener('startup:status', handler)
  },
  retryLaunch: () => {
    ipcRenderer.send('retry-launch')
  },
})
