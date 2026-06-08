import { existsSync, readFileSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { app, safeStorage } from 'electron'
import type { KeyStatus } from '@shared/types'

// The fal API key is stored encrypted at rest using the OS keychain
// (Keychain on macOS, DPAPI on Windows, libsecret on Linux) via safeStorage.
// The decrypted key never leaves the main process.

function keyFilePath(): string {
  return join(app.getPath('userData'), 'fal.key')
}

export function getKeyStatus(): KeyStatus {
  return {
    hasKey: existsSync(keyFilePath()),
    encryptionAvailable: safeStorage.isEncryptionAvailable()
  }
}

export function setApiKey(key: string): void {
  const trimmed = key.trim()
  if (!trimmed) {
    clearApiKey()
    return
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS encryption (safeStorage) is not available on this system.')
  }
  const encrypted = safeStorage.encryptString(trimmed)
  writeFileSync(keyFilePath(), encrypted)
}

export function clearApiKey(): void {
  const path = keyFilePath()
  if (existsSync(path)) rmSync(path)
}

/** Returns the decrypted key, or null if none is stored. Main process only. */
export function getApiKey(): string | null {
  const path = keyFilePath()
  if (!existsSync(path)) return null
  if (!safeStorage.isEncryptionAvailable()) return null
  try {
    return safeStorage.decryptString(readFileSync(path))
  } catch {
    return null
  }
}
