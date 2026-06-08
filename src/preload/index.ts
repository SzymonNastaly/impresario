import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC } from '@shared/types'
import type { ImpresarioApi } from '@shared/api'

const api: ImpresarioApi = {
  settings: {
    getKeyStatus: () => ipcRenderer.invoke(IPC.settingsGetKeyStatus),
    setKey: (key) => ipcRenderer.invoke(IPC.settingsSetKey, key),
    clearKey: () => ipcRenderer.invoke(IPC.settingsClearKey)
  },
  generations: {
    getAll: () => ipcRenderer.invoke(IPC.generationsGetAll),
    delete: (id) => ipcRenderer.invoke(IPC.generationsDelete, id),
    onChanged: (callback) => {
      const listener = (): void => callback()
      ipcRenderer.on(IPC.generationsChanged, listener)
      return () => ipcRenderer.removeListener(IPC.generationsChanged, listener)
    }
  },
  generateImage: (req) => ipcRenderer.invoke(IPC.generateImage, req)
}

// Expose APIs to the renderer only through the contextBridge.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
