import type { Generation, GenerateImageRequest, KeyStatus } from './types'

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
}
