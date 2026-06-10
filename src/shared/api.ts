import type {
  Generation,
  GenerateImageRequest,
  KeyStatus,
  Template,
  TemplateCreate,
  TemplateUpdate
} from './types'

/**
 * The typed surface exposed on `window.api` by the preload bridge.
 * Both the preload implementation and the renderer consume this contract.
 */
export interface ImpresarioApi {
  settings: {
    getKeyStatus(): Promise<KeyStatus>
    setKey(key: string): Promise<KeyStatus>
    clearKey(): Promise<KeyStatus>
  }
  generations: {
    getAll(): Promise<Generation[]>
    delete(id: string): Promise<void>
    /** Subscribe to store changes. Returns an unsubscribe function. */
    onChanged(callback: () => void): () => void
  }
  generateImage(req: GenerateImageRequest): Promise<{ id: string }>
  templates: {
    getAll(): Promise<Template[]>
    create(input: TemplateCreate): Promise<Template>
    update(id: string, patch: TemplateUpdate): Promise<Template>
    delete(id: string): Promise<void>
    export(id: string): Promise<{ canceled: boolean; path?: string }>
    /** Returns the created template, or null if the dialog was canceled. */
    import(): Promise<Template | null>
    /** Subscribe to store changes. Returns an unsubscribe function. */
    onChanged(callback: () => void): () => void
  }
}
