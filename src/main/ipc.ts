import { readFileSync, writeFileSync } from 'fs'
import { randomUUID } from 'crypto'
import { ipcMain, BrowserWindow, dialog } from 'electron'
import {
  IPC,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
  type Generation,
  type GenerateImageRequest,
  type GenerateVideoRequest,
  type Template,
  type TemplateCreate,
  type TemplateUpdate
} from '@shared/types'
import { serializeTemplate, parseTemplateFile } from '@shared/templates'
import * as db from './db'
import * as keychain from './keychain'
import * as storage from './storage'
import * as settings from './settings'
import * as media from './media'
import { generateImages, generateVideoAsset, resumeVideoAsset } from './generate'

function broadcastGenerationsChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.generationsChanged)
  }
}

function broadcastTemplatesChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.templatesChanged)
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
    broadcastGenerationsChanged()

    const images = await generateImages(apiKey, {
      prompt: req.prompt,
      model: gen.model,
      numberOfImages: req.numberOfImages,
      size: req.size
    })

    const assets = images.map((img, i) => storage.saveAsset(gen.id, i, img.bytes, img.contentType))

    db.updateGeneration(gen.id, { status: 'completed', assets })
    broadcastGenerationsChanged()
  } catch (err) {
    db.updateGeneration(gen.id, { status: 'error', error: errorMessage(err) })
    broadcastGenerationsChanged()
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
  broadcastGenerationsChanged()

  // Fire-and-forget: the renderer tracks progress via the change broadcast.
  void runGeneration(gen, { ...req, prompt })

  return { id: gen.id }
}

/** Background worker for the asynchronous video job lifecycle. */
async function runVideoGeneration(gen: Generation, req: GenerateVideoRequest): Promise<void> {
  try {
    const apiKey = keychain.getApiKey()
    if (!apiKey) throw new Error('No fal API key set. Add your key in Settings.')

    db.updateGeneration(gen.id, { status: 'running' })
    broadcastGenerationsChanged()

    const video = await generateVideoAsset(
      apiKey,
      { prompt: req.prompt, model: gen.model, size: req.size, duration: req.duration },
      {
        onJob: (jobId) => {
          db.updateGeneration(gen.id, { params: { ...gen.params, jobId } })
          gen.params = { ...gen.params, jobId }
          broadcastGenerationsChanged()
        },
        onProgress: (progress) => {
          db.updateGeneration(gen.id, { params: { ...gen.params, progress } })
          gen.params = { ...gen.params, progress }
          broadcastGenerationsChanged()
        }
      }
    )

    const asset = storage.saveAsset(gen.id, 0, video.bytes, video.contentType)
    db.updateGeneration(gen.id, { status: 'completed', assets: [asset] })
    broadcastGenerationsChanged()
  } catch (err) {
    db.updateGeneration(gen.id, { status: 'error', error: errorMessage(err) })
    broadcastGenerationsChanged()
  }
}

function startVideoGeneration(req: GenerateVideoRequest): { id: string } {
  const prompt = req.prompt?.trim()
  if (!prompt) throw new Error('Prompt is required.')

  const now = Date.now()
  const gen: Generation = {
    id: randomUUID(),
    type: 'video',
    prompt,
    model: req.model || DEFAULT_VIDEO_MODEL,
    status: 'pending',
    params: {
      ...(req.size ? { size: req.size } : {}),
      ...(req.duration ? { duration: req.duration } : {})
    },
    assets: [],
    error: null,
    createdAt: now,
    updatedAt: now
  }

  db.insertGeneration(gen)
  broadcastGenerationsChanged()
  void runVideoGeneration(gen, { ...req, prompt })
  return { id: gen.id }
}

/**
 * Re-attach polling to video jobs left mid-flight by an app restart. A job
 * with a stored jobId resumes; one without is marked errored (unrecoverable).
 */
export function resumeRunningVideos(): void {
  const apiKey = keychain.getApiKey()
  for (const gen of db.getAllGenerations()) {
    if (gen.type !== 'video') continue
    if (gen.status !== 'pending' && gen.status !== 'running') continue
    const jobId = typeof gen.params.jobId === 'string' ? gen.params.jobId : null
    if (!apiKey || !jobId) {
      db.updateGeneration(gen.id, {
        status: 'error',
        error: 'Interrupted before completion. Please generate again.'
      })
      broadcastGenerationsChanged()
      continue
    }
    void resumeOne(gen, apiKey, jobId)
  }
}

async function resumeOne(gen: Generation, apiKey: string, jobId: string): Promise<void> {
  try {
    db.updateGeneration(gen.id, { status: 'running' })
    broadcastGenerationsChanged()
    const video = await resumeVideoAsset(apiKey, gen.model, jobId, (progress) => {
      db.updateGeneration(gen.id, { params: { ...gen.params, progress } })
      gen.params = { ...gen.params, progress }
      broadcastGenerationsChanged()
    })
    const asset = storage.saveAsset(gen.id, 0, video.bytes, video.contentType)
    db.updateGeneration(gen.id, { status: 'completed', assets: [asset] })
    broadcastGenerationsChanged()
  } catch (err) {
    db.updateGeneration(gen.id, { status: 'error', error: errorMessage(err) })
    broadcastGenerationsChanged()
  }
}

function createTemplate(input: TemplateCreate): Template {
  const name = input.name?.trim()
  if (!name) throw new Error('Template name is required.')
  const now = Date.now()
  const tpl: Template = {
    id: randomUUID(),
    name,
    kind: input.kind,
    config: input.config,
    createdAt: now,
    updatedAt: now
  }
  db.insertTemplate(tpl)
  broadcastTemplatesChanged()
  return tpl
}

async function exportTemplate(id: string): Promise<{ canceled: boolean; path?: string }> {
  const tpl = db.getTemplate(id)
  if (!tpl) throw new Error('Template not found.')
  const safeName = tpl.name.replace(/[^\w.-]+/g, '_').replace(/^[._]+|[._]+$/g, '') || 'template'
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Export template',
    defaultPath: `${safeName}.json`,
    filters: [{ name: 'Template', extensions: ['json'] }]
  })
  if (canceled || !filePath) return { canceled: true }
  writeFileSync(filePath, JSON.stringify(serializeTemplate(tpl), null, 2))
  return { canceled: false, path: filePath }
}

async function importTemplate(): Promise<Template | null> {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Import template',
    properties: ['openFile'],
    filters: [{ name: 'Template', extensions: ['json'] }]
  })
  if (canceled || filePaths.length === 0) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(filePaths[0], 'utf-8'))
  } catch {
    throw new Error('Invalid template file: not valid JSON.')
  }
  return createTemplate(parseTemplateFile(parsed))
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
    broadcastGenerationsChanged()
  })
  ipcMain.handle(IPC.generateImage, (_e, req: GenerateImageRequest) => startImageGeneration(req))
  ipcMain.handle(IPC.generateVideo, (_e, req: GenerateVideoRequest) => startVideoGeneration(req))

  // media file actions
  ipcMain.handle(IPC.mediaSave, (_e, id: string, file: string) => media.saveToDefault(id, file))
  ipcMain.handle(IPC.mediaSaveAs, (_e, id: string, file: string) => media.saveAs(id, file))
  ipcMain.handle(IPC.mediaReveal, (_e, id: string, file: string) => media.reveal(id, file))
  ipcMain.handle(IPC.mediaShare, (_e, id: string, file: string) => media.share(id, file))

  // settings: save directory
  ipcMain.handle(IPC.settingsGetSaveDir, () => settings.getSaveDir())
  ipcMain.handle(IPC.settingsSetSaveDir, async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Choose default save folder',
      properties: ['openDirectory', 'createDirectory']
    })
    if (canceled || filePaths.length === 0) return settings.getSaveDir()
    settings.setSaveDir(filePaths[0])
    return filePaths[0]
  })

  // templates
  ipcMain.handle(IPC.templatesGetAll, () => db.getAllTemplates())
  ipcMain.handle(IPC.templatesCreate, (_e, input: TemplateCreate) => createTemplate(input))
  ipcMain.handle(IPC.templatesUpdate, (_e, id: string, patch: TemplateUpdate) => {
    if (patch.name !== undefined) {
      patch = { ...patch, name: patch.name.trim() }
      if (!patch.name) throw new Error('Template name is required.')
    }
    const tpl = db.updateTemplate(id, patch)
    if (!tpl) throw new Error('Template not found.')
    broadcastTemplatesChanged()
    return tpl
  })
  ipcMain.handle(IPC.templatesDelete, (_e, id: string) => {
    db.deleteTemplate(id)
    broadcastTemplatesChanged()
  })
  ipcMain.handle(IPC.templatesExport, (_e, id: string) => exportTemplate(id))
  ipcMain.handle(IPC.templatesImport, () => importTemplate())
}
