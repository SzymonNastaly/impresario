import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs'
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
  'image/gif': 'gif'
}

function extFor(contentType: string): string {
  return EXT_BY_CONTENT_TYPE[contentType.toLowerCase()] ?? 'bin'
}

/** Persist one image to disk and return its metadata (incl. media:// url). */
export function saveImageAsset(
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
