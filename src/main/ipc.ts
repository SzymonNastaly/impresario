import { readFileSync, writeFileSync } from 'fs'
import { randomUUID } from 'crypto'
import { ipcMain, BrowserWindow, dialog } from 'electron'
import {
  IPC,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
  type Attachment,
  type Conversation,
  type ConversationCreate,
  type Generation,
  type GenerateImageRequest,
  type GenerateVideoRequest,
  type ReferenceFileInput,
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
import { generateImages, generateVideoAsset, resumeVideoAsset, type RawVideo } from './generate'

function broadcastGenerationsChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.generationsChanged)
  }
}

function broadcastConversationsChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.conversationsChanged)
  }
}

/** Create a conversation row, broadcast, and return it. */
function createConversation(input: ConversationCreate = {}): Conversation {
  const now = Date.now()
  const conv: Conversation = {
    id: randomUUID(),
    title: input.title?.trim() || 'New chat',
    createdAt: now,
    updatedAt: now
  }
  db.insertConversation(conv)
  broadcastConversationsChanged()
  return conv
}

/** Resolve the conversation a new turn belongs to, creating one if needed. */
function resolveConversationId(prompt: string, conversationId?: string): string {
  if (conversationId && db.getConversation(conversationId)) return conversationId
  return createConversation({ title: prompt.slice(0, 80) }).id
}

/** Persist reference-file inputs under the generation and return their metadata. */
function saveReferenceFiles(generationId: string, files?: ReferenceFileInput[]): Attachment[] {
  return (files ?? []).map((f, i) =>
    storage.saveInputAsset(generationId, i, Buffer.from(f.bytes), f.contentType)
  )
}

/** Bump a conversation's updatedAt so the sidebar reflects last activity. */
function touchConversation(id: string): void {
  db.updateConversation(id, {})
  broadcastConversationsChanged()
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

function startImageGeneration(req: GenerateImageRequest): { id: string; conversationId: string } {
  const prompt = req.prompt?.trim()
  if (!prompt) throw new Error('Prompt is required.')

  const conversationId = resolveConversationId(prompt, req.conversationId)
  const id = randomUUID()
  const attachments = saveReferenceFiles(id, req.referenceFiles)
  const now = Date.now()
  const gen: Generation = {
    id,
    conversationId,
    type: 'image',
    prompt,
    model: req.model || DEFAULT_IMAGE_MODEL,
    status: 'pending',
    params: {
      numberOfImages: req.numberOfImages ?? 1,
      ...(req.size ? { size: req.size } : {})
    },
    assets: [],
    attachments,
    error: null,
    createdAt: now,
    updatedAt: now
  }

  db.insertGeneration(gen)
  touchConversation(conversationId)
  broadcastGenerationsChanged()

  // Fire-and-forget: the renderer tracks progress via the change broadcast.
  void runGeneration(gen, { ...req, prompt })

  return { id: gen.id, conversationId }
}

/**
 * Shared tail of a video job: mark running, await the produced bytes, persist
 * the asset and mark completed — or mark errored on any failure. `run` is the
 * provider call that yields the finished video (it may be a fresh job or a
 * resumed one).
 */
async function finalizeVideoJob(gen: Generation, run: () => Promise<RawVideo>): Promise<void> {
  try {
    db.updateGeneration(gen.id, { status: 'running' })
    broadcastGenerationsChanged()

    const video = await run()
    const asset = storage.saveAsset(gen.id, 0, video.bytes, video.contentType)
    db.updateGeneration(gen.id, { status: 'completed', assets: [asset] })
    broadcastGenerationsChanged()
  } catch (err) {
    db.updateGeneration(gen.id, { status: 'error', error: errorMessage(err) })
    broadcastGenerationsChanged()
  }
}

/** Persist a video-job param update (jobId/progress) and broadcast it. */
function updateVideoParams(gen: Generation, patch: Record<string, unknown>): void {
  gen.params = { ...gen.params, ...patch }
  db.updateGeneration(gen.id, { params: gen.params })
  broadcastGenerationsChanged()
}

/** Background worker for a freshly created video job. */
function runVideoGeneration(gen: Generation, req: GenerateVideoRequest): void {
  void finalizeVideoJob(gen, async () => {
    const apiKey = keychain.getApiKey()
    if (!apiKey) throw new Error('No fal API key set. Add your key in Settings.')
    return generateVideoAsset(
      apiKey,
      { prompt: req.prompt, model: gen.model, size: req.size, duration: req.duration },
      {
        onJob: (jobId) => updateVideoParams(gen, { jobId }),
        onProgress: (progress) => updateVideoParams(gen, { progress })
      }
    )
  })
}

/** Background worker that re-attaches to an already-created job after restart. */
function resumeOne(gen: Generation, apiKey: string, jobId: string): void {
  void finalizeVideoJob(gen, () =>
    resumeVideoAsset(apiKey, gen.model, jobId, (progress) => updateVideoParams(gen, { progress }))
  )
}

function startVideoGeneration(req: GenerateVideoRequest): { id: string; conversationId: string } {
  const prompt = req.prompt?.trim()
  if (!prompt) throw new Error('Prompt is required.')

  const conversationId = resolveConversationId(prompt, req.conversationId)
  const id = randomUUID()
  const attachments = saveReferenceFiles(id, req.referenceFiles)
  const now = Date.now()
  const gen: Generation = {
    id,
    conversationId,
    type: 'video',
    prompt,
    model: req.model || DEFAULT_VIDEO_MODEL,
    status: 'pending',
    params: {
      ...(req.size ? { size: req.size } : {}),
      ...(req.duration ? { duration: req.duration } : {})
    },
    assets: [],
    attachments,
    error: null,
    createdAt: now,
    updatedAt: now
  }

  db.insertGeneration(gen)
  touchConversation(conversationId)
  runVideoGeneration(gen, { ...req, prompt })
  return { id: gen.id, conversationId }
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
    resumeOne(gen, apiKey, jobId)
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

  // conversations
  ipcMain.handle(IPC.conversationsGetAll, () => db.getAllConversations())
  ipcMain.handle(IPC.conversationsCreate, (_e, input: ConversationCreate) =>
    createConversation(input)
  )
  ipcMain.handle(IPC.conversationsRename, (_e, id: string, title: string) => {
    const trimmed = title.trim()
    if (!trimmed) throw new Error('Conversation title is required.')
    const conv = db.updateConversation(id, { title: trimmed })
    if (!conv) throw new Error('Conversation not found.')
    broadcastConversationsChanged()
    return conv
  })
  ipcMain.handle(IPC.conversationsDelete, (_e, id: string) => {
    const generationIds = db.deleteConversation(id)
    for (const gid of generationIds) storage.deleteGenerationMedia(gid)
    broadcastConversationsChanged()
    broadcastGenerationsChanged()
  })

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
