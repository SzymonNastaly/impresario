import { basename, extname, join } from 'path'
import { existsSync } from 'fs'
import { dialog, shell, Menu, BrowserWindow } from 'electron'
import * as storage from './storage'
import * as settings from './settings'

export interface SaveResult {
  canceled: boolean
  path?: string
}

/** Save to the remembered folder; prompt for one the first time. */
export async function saveToDefault(generationId: string, fileName: string): Promise<SaveResult> {
  let dir = settings.getSaveDir()
  if (!dir) {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Choose a default folder to save media',
      properties: ['openDirectory', 'createDirectory']
    })
    if (canceled || filePaths.length === 0) return { canceled: true }
    dir = filePaths[0]
    settings.setSaveDir(dir)
  }
  const dest = uniqueDest(dir, fileName)
  storage.copyAssetTo(generationId, fileName, dest)
  return { canceled: false, path: dest }
}

/** Always prompt with a Save-As dialog. */
export async function saveAs(generationId: string, fileName: string): Promise<SaveResult> {
  const ext = extname(fileName).replace('.', '') || 'bin'
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Save media',
    defaultPath: fileName,
    filters: [{ name: 'Media', extensions: [ext] }]
  })
  if (canceled || !filePath) return { canceled: true }
  storage.copyAssetTo(generationId, fileName, filePath)
  return { canceled: false, path: filePath }
}

export function reveal(generationId: string, fileName: string): void {
  const path = storage.assetAbsolutePath(generationId, fileName)
  if (!path) throw new Error('Media file not found.')
  shell.showItemInFolder(path)
}

/** Native macOS share sheet via a one-item shareMenu. No-op off macOS. */
export function share(generationId: string, fileName: string): void {
  if (process.platform !== 'darwin') return
  const path = storage.assetAbsolutePath(generationId, fileName)
  if (!path) throw new Error('Media file not found.')
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  if (!win) return
  const menu = Menu.buildFromTemplate([{ role: 'shareMenu', sharingItem: { filePaths: [path] } }])
  menu.popup({ window: win })
}

/** Append " (n)" before the extension until the path is free. */
function uniqueDest(dir: string, fileName: string): string {
  const ext = extname(fileName)
  const stem = basename(fileName, ext)
  let candidate = join(dir, fileName)
  let n = 1
  while (existsSync(candidate)) {
    candidate = join(dir, `${stem} (${n})${ext}`)
    n += 1
  }
  return candidate
}
