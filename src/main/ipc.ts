import { randomUUID } from 'crypto'
import { ipcMain, BrowserWindow } from 'electron'
import { IPC, DEFAULT_IMAGE_MODEL, type Generation, type GenerateImageRequest } from '@shared/types'
import * as db from './db'
import * as keychain from './keychain'
import * as storage from './storage'
import { generateImages } from './generate'

function broadcastChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.generationsChanged)
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return typeof err === 'string' ? err : 'Unknown error'
}

/** Background worker: drives a generation through its lifecycle. */
async function runGeneration(gen: Generation, req: GenerateImageRequest): Promise<void> {
  try {
    const apiKey = keychain.getApiKey()
    if (!apiKey) throw new Error('No fal API key set. Add your key in Settings.')

    db.updateGeneration(gen.id, { status: 'running' })
    broadcastChanged()

    const images = await generateImages(apiKey, {
      prompt: req.prompt,
      model: gen.model,
      numberOfImages: req.numberOfImages,
      size: req.size
    })

    const assets = images.map((img, i) =>
      storage.saveImageAsset(gen.id, i, img.bytes, img.contentType)
    )

    db.updateGeneration(gen.id, { status: 'completed', assets })
    broadcastChanged()
  } catch (err) {
    db.updateGeneration(gen.id, { status: 'error', error: errorMessage(err) })
    broadcastChanged()
  }
}

function startImageGeneration(req: GenerateImageRequest): { id: string } {
  const prompt = req.prompt?.trim()
  if (!prompt) throw new Error('Prompt is required.')

  const now = Date.now()
  const gen: Generation = {
    id: randomUUID(),
    type: 'image',
    prompt,
    model: req.model || DEFAULT_IMAGE_MODEL,
    status: 'pending',
    params: {
      numberOfImages: req.numberOfImages ?? 1,
      ...(req.size ? { size: req.size } : {})
    },
    assets: [],
    error: null,
    createdAt: now,
    updatedAt: now
  }

  db.insertGeneration(gen)
  broadcastChanged()

  // Fire-and-forget: the renderer tracks progress via the change broadcast.
  void runGeneration(gen, { ...req, prompt })

  return { id: gen.id }
}

export function registerIpcHandlers(): void {
  // settings / BYOK
  ipcMain.handle(IPC.settingsGetKeyStatus, () => keychain.getKeyStatus())
  ipcMain.handle(IPC.settingsSetKey, (_e, key: string) => {
    keychain.setApiKey(key)
    return keychain.getKeyStatus()
  })
  ipcMain.handle(IPC.settingsClearKey, () => {
    keychain.clearApiKey()
    return keychain.getKeyStatus()
  })

  // generations
  ipcMain.handle(IPC.generationsGetAll, () => db.getAllGenerations())
  ipcMain.handle(IPC.generationsDelete, (_e, id: string) => {
    db.deleteGeneration(id)
    storage.deleteGenerationMedia(id)
    broadcastChanged()
  })
  ipcMain.handle(IPC.generateImage, (_e, req: GenerateImageRequest) => startImageGeneration(req))
}
