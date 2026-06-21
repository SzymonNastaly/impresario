import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { defaultFavoriteFamilyIds } from '@shared/catalog'

// A tiny JSON settings store for non-secret app preferences. Secrets (the fal
// API key) live in the OS keychain instead — see keychain.ts.

interface Settings {
  saveDir?: string
  favorites?: string[]
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

/** Stored favorites if initialized, otherwise the seed list. Pure (testable). */
export function seededFavorites(stored: string[] | undefined, seeds: string[]): string[] {
  return stored ?? seeds
}

/** Favorite family ids; seeds (and persists) the curated defaults on first read. */
export function getFavorites(): string[] {
  const current = read()
  if (current.favorites === undefined) {
    const seeded = defaultFavoriteFamilyIds()
    write({ ...current, favorites: seeded })
    return seeded
  }
  return current.favorites
}

export function setFavorites(ids: string[]): void {
  write({ ...read(), favorites: ids })
}
