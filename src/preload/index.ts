import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC } from '@shared/types'
import type { ImpresarioApi } from '@shared/api'

const api: ImpresarioApi = {
  settings: {
    getKeyStatus: () => ipcRenderer.invoke(IPC.settingsGetKeyStatus),
    setKey: (key) => ipcRenderer.invoke(IPC.settingsSetKey, key),
    clearKey: () => ipcRenderer.invoke(IPC.settingsClearKey),
    getSaveDir: () => ipcRenderer.invoke(IPC.settingsGetSaveDir),
    setSaveDir: () => ipcRenderer.invoke(IPC.settingsSetSaveDir)
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
  conversations: {
    getAll: () => ipcRenderer.invoke(IPC.conversationsGetAll),
    create: (input) => ipcRenderer.invoke(IPC.conversationsCreate, input ?? {}),
    rename: (id, title) => ipcRenderer.invoke(IPC.conversationsRename, id, title),
    delete: (id) => ipcRenderer.invoke(IPC.conversationsDelete, id),
    onChanged: (callback) => {
      const listener = (): void => callback()
      ipcRenderer.on(IPC.conversationsChanged, listener)
      return () => ipcRenderer.removeListener(IPC.conversationsChanged, listener)
    }
  },
  generateImage: (req) => ipcRenderer.invoke(IPC.generateImage, req),
  generateVideo: (req) => ipcRenderer.invoke(IPC.generateVideo, req),
  media: {
    save: (id, file) => ipcRenderer.invoke(IPC.mediaSave, id, file),
    saveAs: (id, file) => ipcRenderer.invoke(IPC.mediaSaveAs, id, file),
    reveal: (id, file) => ipcRenderer.invoke(IPC.mediaReveal, id, file),
    share: (id, file) => ipcRenderer.invoke(IPC.mediaShare, id, file)
  },
  templates: {
    getAll: () => ipcRenderer.invoke(IPC.templatesGetAll),
    create: (input) => ipcRenderer.invoke(IPC.templatesCreate, input),
    update: (id, patch) => ipcRenderer.invoke(IPC.templatesUpdate, id, patch),
    delete: (id) => ipcRenderer.invoke(IPC.templatesDelete, id),
    export: (id) => ipcRenderer.invoke(IPC.templatesExport, id),
    import: () => ipcRenderer.invoke(IPC.templatesImport),
    onChanged: (callback) => {
      const listener = (): void => callback()
      ipcRenderer.on(IPC.templatesChanged, listener)
      return () => ipcRenderer.removeListener(IPC.templatesChanged, listener)
    }
  }
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
