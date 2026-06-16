// Types shared across the main, preload, and renderer processes.
// Keep this file dependency-free so every process can import it cheaply.

export type GenerationType = 'image' | 'video' // future: 'speech'

export type GenerationStatus = 'pending' | 'running' | 'completed' | 'error'

export interface GenerationAsset {
  /** Filename within the generation's media folder (e.g. "0.png"). */
  fileName: string
  /** Custom-protocol URL the renderer can use directly in <img src>. */
  url: string
  contentType: string
}

/** A reference-file input attached to a generation (Spec B captures these). */
export interface Attachment {
  /** Filename within the generation's input/ folder (e.g. "0.png"). */
  fileName: string
  /** Custom-protocol URL the renderer can render directly. */
  url: string
  contentType: string
}

/** A reference-file input captured in the renderer and sent with a request. */
export interface ReferenceFileInput {
  /** Raw bytes (structured-clone-safe across the IPC bridge). */
  bytes: ArrayBuffer
  contentType: string
}

export interface Generation {
  id: string
  /** Parent conversation (turn ordering is by createdAt). */
  conversationId: string
  type: GenerationType
  prompt: string
  model: string
  status: GenerationStatus
  /** Provider/request parameters (size, numberOfImages, seed, ...). */
  params: Record<string, unknown>
  assets: GenerationAsset[]
  /** Reference-file inputs (not sent to fal yet). */
  attachments: Attachment[]
  error: string | null
  createdAt: number
  updatedAt: number
}

export interface GenerateImageRequest {
  prompt: string
  /** Append the turn to this conversation; a new one is created if omitted. */
  conversationId?: string
  /** fal model id, e.g. "fal-ai/flux/dev". */
  model?: string
  numberOfImages?: number
  /** Size hint passed to the adapter, e.g. "1024x1024". */
  size?: string
  /** Reference-file inputs; persisted onto the generation, not sent to fal. */
  referenceFiles?: ReferenceFileInput[]
}

export interface GenerateVideoRequest {
  prompt: string
  /** Append the turn to this conversation; a new one is created if omitted. */
  conversationId?: string
  /** fal video model id, e.g. "fal-ai/veo3/fast". */
  model?: string
  /** Aspect ratio or size hint, provider-dependent (e.g. "16:9"). */
  size?: string
  /** Duration in seconds, if the model supports it. */
  duration?: number
  /** Reference-file inputs; persisted onto the generation, not sent to fal. */
  referenceFiles?: ReferenceFileInput[]
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

// ---- Conversations ------------------------------------------------------
// A conversation groups one or more generations (turns), newest by createdAt.
export interface Conversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

/** Inputs for creating a conversation; main assigns id/timestamps. */
export interface ConversationCreate {
  /** Defaults to "New chat" when omitted. */
  title?: string
}

/** Partial update; main bumps updatedAt. */
export interface ConversationUpdate {
  title?: string
}

export interface KeyStatus {
  /** Whether a key is currently stored. */
  hasKey: boolean
  /** Whether the OS-backed safeStorage encryption is available. */
  encryptionAvailable: boolean
}

/** Static, user-facing metadata for a model the app offers. */
export interface ModelInfo {
  id: string
  label: string
  kind: GenerationType
  /** Strength / best-for chips shown in the selector. */
  tags: string[]
  speed: 'fast' | 'medium' | 'slow'
  /** Relative cost: 1 = $, 2 = $$, 3 = $$$. */
  cost: 1 | 2 | 3
  /** Whether the model accepts reference-file inputs (gates the UI in Spec B). */
  acceptsReferenceFiles: boolean
  /** Max output duration in seconds, for video models. */
  maxDurationSec?: number
}

/** A curated default set of fal image models to start with. */
export const DEFAULT_IMAGE_MODELS: ModelInfo[] = [
  {
    id: 'fal-ai/flux-2/flash',
    label: 'FLUX.2 Flash',
    kind: 'image',
    tags: ['Fast drafts', 'Concept art'],
    speed: 'fast',
    cost: 1,
    acceptsReferenceFiles: false
  },
  {
    id: 'fal-ai/nano-banana-2',
    label: 'Nano Banana 2',
    kind: 'image',
    tags: ['Balanced', 'Versatile'],
    speed: 'fast',
    cost: 1,
    acceptsReferenceFiles: false
  },
  {
    id: 'openai/gpt-image-2',
    label: 'GPT Image 2',
    kind: 'image',
    tags: ['Text in images', 'Prompt accuracy'],
    speed: 'medium',
    cost: 3,
    acceptsReferenceFiles: false
  },
  {
    id: 'fal-ai/recraft/v4/text-to-image',
    label: 'Recraft V4',
    kind: 'image',
    tags: ['Logos & vectors', 'Design'],
    speed: 'medium',
    cost: 2,
    acceptsReferenceFiles: false
  }
]

export const DEFAULT_IMAGE_MODEL = DEFAULT_IMAGE_MODELS[0].id

/** A curated default set of fal video models to start with. */
export const DEFAULT_VIDEO_MODELS: ModelInfo[] = [
  {
    id: 'fal-ai/veo3/fast',
    label: 'Veo 3 Fast',
    kind: 'video',
    tags: ['Cinematic', 'With audio'],
    speed: 'medium',
    cost: 3,
    acceptsReferenceFiles: false,
    maxDurationSec: 8
  },
  {
    id: 'fal-ai/kling-video/v2/master/text-to-video',
    label: 'Kling 2 Master',
    kind: 'video',
    tags: ['Smooth motion', 'Detailed'],
    speed: 'slow',
    cost: 3,
    acceptsReferenceFiles: false,
    maxDurationSec: 10
  },
  {
    id: 'fal-ai/minimax/hailuo-02/standard/text-to-video',
    label: 'Hailuo 02',
    kind: 'video',
    tags: ['Expressive', 'Affordable'],
    speed: 'medium',
    cost: 2,
    acceptsReferenceFiles: false,
    maxDurationSec: 6
  },
  {
    id: 'fal-ai/luma-dream-machine',
    label: 'Luma Dream Machine',
    kind: 'video',
    tags: ['Dreamy', 'Fast'],
    speed: 'fast',
    cost: 2,
    acceptsReferenceFiles: false,
    maxDurationSec: 5
  }
]

export const DEFAULT_VIDEO_MODEL = DEFAULT_VIDEO_MODELS[0].id

/** Every model the app offers, both kinds. */
export const ALL_MODELS: ModelInfo[] = [...DEFAULT_IMAGE_MODELS, ...DEFAULT_VIDEO_MODELS]

/** Look up a model's metadata by id. */
export function modelInfo(id: string): ModelInfo | undefined {
  return ALL_MODELS.find((m) => m.id === id)
}

/** Which generation kind a model id belongs to (defaults to image). */
export function modelKind(id: string): GenerationType {
  return modelInfo(id)?.kind ?? 'image'
}

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
  generateVideo: 'generate:video',
  // main -> renderer broadcast when the store changes
  generationsChanged: 'generations:changed',
  // conversations
  conversationsGetAll: 'conversations:get-all',
  conversationsCreate: 'conversations:create',
  conversationsRename: 'conversations:rename',
  conversationsDelete: 'conversations:delete',
  conversationsChanged: 'conversations:changed',
  // media file actions
  mediaSave: 'media:save',
  mediaSaveAs: 'media:save-as',
  mediaReveal: 'media:reveal',
  mediaShare: 'media:share',
  // settings: save directory
  settingsGetSaveDir: 'settings:get-save-dir',
  settingsSetSaveDir: 'settings:set-save-dir',
  // templates
  templatesGetAll: 'templates:get-all',
  templatesCreate: 'templates:create',
  templatesUpdate: 'templates:update',
  templatesDelete: 'templates:delete',
  templatesExport: 'templates:export',
  templatesImport: 'templates:import',
  templatesChanged: 'templates:changed'
} as const
