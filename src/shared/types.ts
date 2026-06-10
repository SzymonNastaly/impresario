// Types shared across the main, preload, and renderer processes.
// Keep this file dependency-free so every process can import it cheaply.

export type GenerationType = 'image' // future: 'video' | 'speech'

export type GenerationStatus = 'pending' | 'running' | 'completed' | 'error'

export interface GenerationAsset {
  /** Filename within the generation's media folder (e.g. "0.png"). */
  fileName: string
  /** Custom-protocol URL the renderer can use directly in <img src>. */
  url: string
  contentType: string
}

export interface Generation {
  id: string
  type: GenerationType
  prompt: string
  model: string
  status: GenerationStatus
  /** Provider/request parameters (size, numberOfImages, seed, ...). */
  params: Record<string, unknown>
  assets: GenerationAsset[]
  error: string | null
  createdAt: number
  updatedAt: number
}

export interface GenerateImageRequest {
  prompt: string
  /** fal model id, e.g. "fal-ai/flux/dev". */
  model?: string
  numberOfImages?: number
  /** Size hint passed to the adapter, e.g. "1024x1024". */
  size?: string
}

// ---- Templates ----------------------------------------------------------
// A template is a reusable prompt + model preset. `kind` discriminates the
// payload stored in `config` (a JSON column), leaving room to add future
// kinds (e.g. multi-step) without a schema migration.
export type TemplateKind = 'single-prompt' // future: | 'multi-step'

export interface SinglePromptConfig {
  prompt: string
  model: string
  params: {
    numberOfImages?: number
    size?: string
  }
}

// Discriminated by Template.kind. Becomes a union as kinds are added.
export type TemplateConfig = SinglePromptConfig

export interface Template {
  id: string
  name: string
  kind: TemplateKind
  config: TemplateConfig
  createdAt: number
  updatedAt: number
}

/** Inputs for creating a template; main assigns id/timestamps. */
export interface TemplateCreate {
  name: string
  kind: TemplateKind
  config: TemplateConfig
}

/** Partial update; main bumps updatedAt. */
export interface TemplateUpdate {
  name?: string
  config?: TemplateConfig
}

export interface KeyStatus {
  /** Whether a key is currently stored. */
  hasKey: boolean
  /** Whether the OS-backed safeStorage encryption is available. */
  encryptionAvailable: boolean
}

/** A curated default set of fal models to start with. */
export const DEFAULT_IMAGE_MODELS = [
  { id: 'fal-ai/flux-2/flash', label: 'FLUX.2 Flash' },
  { id: 'fal-ai/nano-banana-2', label: 'Nano Banana 2' },
  { id: 'openai/gpt-image-2', label: 'GPT Image 2' },
  { id: 'fal-ai/recraft/v4/text-to-image', label: 'Recraft V4' }
] as const

export const DEFAULT_IMAGE_MODEL = DEFAULT_IMAGE_MODELS[0].id

/** IPC channel names — single source of truth for both sides of the bridge. */
export const IPC = {
  // settings / BYOK
  settingsGetKeyStatus: 'settings:get-key-status',
  settingsSetKey: 'settings:set-key',
  settingsClearKey: 'settings:clear-key',
  // generations
  generationsGetAll: 'generations:get-all',
  generationsDelete: 'generations:delete',
  generateImage: 'generate:image',
  // main -> renderer broadcast when the store changes
  generationsChanged: 'generations:changed',
  // templates
  templatesGetAll: 'templates:get-all',
  templatesCreate: 'templates:create',
  templatesUpdate: 'templates:update',
  templatesDelete: 'templates:delete',
  templatesExport: 'templates:export',
  templatesImport: 'templates:import',
  templatesChanged: 'templates:changed'
} as const
