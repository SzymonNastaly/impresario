import type {
  Conversation,
  ConversationCreate,
  Generation,
  GenerateImageRequest,
  GenerateVideoRequest,
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
    /** The remembered default save folder, or null if unset. */
    getSaveDir(): Promise<string | null>
    /** Prompt for a folder and remember it; returns the chosen (or current) dir. */
    setSaveDir(): Promise<string | null>
    /** Favorite model family ids. */
    getFavorites(): Promise<string[]>
    /** Persist the favorite family ids; returns the saved list. */
    setFavorites(ids: string[]): Promise<string[]>
  }
  generations: {
    getAll(): Promise<Generation[]>
    /** Subscribe to store changes. Returns an unsubscribe function. */
    onChanged(callback: () => void): () => void
  }
  generateImage(req: GenerateImageRequest): Promise<{ id: string; conversationId: string }>
  generateVideo(req: GenerateVideoRequest): Promise<{ id: string; conversationId: string }>
  conversations: {
    getAll(): Promise<Conversation[]>
    create(input?: ConversationCreate): Promise<Conversation>
    rename(id: string, title: string): Promise<Conversation>
    delete(id: string): Promise<void>
    /** Subscribe to store changes. Returns an unsubscribe function. */
    onChanged(callback: () => void): () => void
  }
  media: {
    /** Save to the remembered folder (prompts for one the first time). */
    save(generationId: string, fileName: string): Promise<{ canceled: boolean; path?: string }>
    /** Always opens a Save-As dialog. */
    saveAs(generationId: string, fileName: string): Promise<{ canceled: boolean; path?: string }>
    reveal(generationId: string, fileName: string): Promise<void>
    /** macOS native share sheet; no-op on other platforms. */
    share(generationId: string, fileName: string): Promise<void>
  }
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
