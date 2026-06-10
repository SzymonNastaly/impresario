import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

// A tiny JSON settings store for non-secret app preferences. Secrets (the fal
// API key) live in the OS keychain instead — see keychain.ts.

interface Settings {
  saveDir?: string
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

function read(): Settings {
  const path = settingsPath()
  if (!existsSync(path)) return {}
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as Settings
  } catch {
    return {}
  }
}

function write(settings: Settings): void {
  writeFileSync(settingsPath(), JSON.stringify(settings, null, 2))
}

export function getSaveDir(): string | null {
  return read().saveDir ?? null
}

export function setSaveDir(dir: string): void {
  write({ ...read(), saveDir: dir })
}
