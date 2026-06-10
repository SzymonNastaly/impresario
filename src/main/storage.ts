import { mkdirSync, writeFileSync, rmSync, existsSync, copyFileSync } from 'fs'
import { join, normalize, sep } from 'path'
import { pathToFileURL } from 'url'
import { app, net, protocol } from 'electron'
import type { GenerationAsset } from '@shared/types'

// Large media bytes live on disk under userData/media/<generationId>/,
// while only metadata + file references are stored in SQLite. The renderer
// reads them through the privileged "media://" protocol registered below.

export const MEDIA_SCHEME = 'media'

function mediaRoot(): string {
  return join(app.getPath('userData'), 'media')
}

function generationDir(generationId: string): string {
  return join(mediaRoot(), generationId)
}

const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov'
}

function extFor(contentType: string): string {
  return EXT_BY_CONTENT_TYPE[contentType.toLowerCase()] ?? 'bin'
}

/** Persist one media file to disk and return its metadata (incl. media:// url). */
export function saveAsset(
  generationId: string,
  index: number,
  bytes: Buffer,
  contentType: string
): GenerationAsset {
  mkdirSync(generationDir(generationId), { recursive: true })
  const fileName = `${index}.${extFor(contentType)}`
  writeFileSync(join(generationDir(generationId), fileName), bytes)
  return {
    fileName,
    url: `${MEDIA_SCHEME}://asset/${generationId}/${fileName}`,
    contentType
  }
}

export function deleteGenerationMedia(generationId: string): void {
  const dir = generationDir(generationId)
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
}

/**
 * Resolve an asset's absolute path on disk, constrained to the media root
 * (returns null if it would escape the root or does not exist).
 */
export function assetAbsolutePath(generationId: string, fileName: string): string | null {
  const root = mediaRoot()
  const target = normalize(join(generationDir(generationId), fileName))
  if (!target.startsWith(root + sep)) return null
  return existsSync(target) ? target : null
}

/** Copy a stored asset to an arbitrary destination path. */
export function copyAssetTo(generationId: string, fileName: string, destPath: string): void {
  const src = assetAbsolutePath(generationId, fileName)
  if (!src) throw new Error('Media file not found.')
  copyFileSync(src, destPath)
}

/**
 * Serve files from the media directory over "media://asset/<id>/<file>".
 * Call after app is ready. Paths are constrained to the media root to
 * prevent traversal outside of it.
 */
export function registerMediaProtocol(): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    const { pathname } = new URL(request.url)
    const root = mediaRoot()
    const target = normalize(join(root, decodeURIComponent(pathname)))
    if (target !== root && !target.startsWith(root + sep)) {
      return new Response('Forbidden', { status: 403 })
    }
    if (!existsSync(target)) {
      return new Response('Not found', { status: 404 })
    }
    return net.fetch(pathToFileURL(target).toString())
  })
}
