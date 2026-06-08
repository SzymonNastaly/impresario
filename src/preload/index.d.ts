import type { ElectronAPI } from '@electron-toolkit/preload'
import type { ImpresarioApi } from '@shared/api'

declare global {
  interface Window {
    electron: ElectronAPI
    api: ImpresarioApi
  }
}
