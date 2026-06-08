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

export interface KeyStatus {
  /** Whether a key is currently stored. */
  hasKey: boolean
  /** Whether the OS-backed safeStorage encryption is available. */
  encryptionAvailable: boolean
}

/** A curated default set of fal models to start with. */
export const DEFAULT_IMAGE_MODELS = [
  { id: 'fal-ai/flux/dev', label: 'FLUX.1 [dev]' },
  { id: 'fal-ai/flux/schnell', label: 'FLUX.1 [schnell] (fast)' },
  { id: 'fal-ai/flux-pro/v1.1', label: 'FLUX1.1 [pro]' }
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
  generationsChanged: 'generations:changed'
} as const
