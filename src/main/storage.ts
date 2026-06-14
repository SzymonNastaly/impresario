import {
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  copyFileSync,
  statSync,
  createReadStream
} from 'fs'
import { join, normalize, sep, extname } from 'path'
import { Readable } from 'stream'
import { app, protocol } from 'electron'
import type { GenerationAsset, Attachment } from '@shared/types'

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

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime'
}

function contentTypeFor(filePath: string): string {
  return CONTENT_TYPE_BY_EXT[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
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

/** Persist one reference-file input under the generation's input/ folder. */
export function saveInputAsset(
  generationId: string,
  index: number,
  bytes: Buffer,
  contentType: string
): Attachment {
  const dir = join(generationDir(generationId), 'input')
  mkdirSync(dir, { recursive: true })
  const fileName = `${index}.${extFor(contentType)}`
  writeFileSync(join(dir, fileName), bytes)
  return {
    fileName,
    url: `${MEDIA_SCHEME}://asset/${generationId}/input/${fileName}`,
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
 *
 * Range requests are handled explicitly so that <video> playback (which
 * relies on 206 Partial Content responses to determine duration and seek)
 * works — Chromium's file:// handler does not honor forwarded Range headers.
 */
export function registerMediaProtocol(): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    const { pathname } = new URL(request.url)
    const root = mediaRoot()
    const target = normalize(join(root, decodeURIComponent(pathname)))
    if (target !== root && !target.startsWith(root + sep)) {
      return new Response('Forbidden', { status: 403 })
    }

    let size: number
    try {
      size = statSync(target).size
    } catch {
      return new Response('Not found', { status: 404 })
    }

    const contentType = contentTypeFor(target)
    const rangeHeader = request.headers.get('Range')
    const rangeMatch = rangeHeader ? /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim()) : null

    if (rangeMatch) {
      const start = rangeMatch[1] ? parseInt(rangeMatch[1], 10) : 0
      let end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : size - 1
      if (Number.isNaN(start) || start >= size || start > end) {
        return new Response('Range Not Satisfiable', {
          status: 416,
          headers: { 'Content-Range': `bytes */${size}` }
        })
      }
      end = Math.min(end, size - 1)
      const stream = Readable.toWeb(
        createReadStream(target, { start, end })
      ) as unknown as ReadableStream<Uint8Array>
      return new Response(stream, {
        status: 206,
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(end - start + 1),
          'Content-Range': `bytes ${start}-${end}/${size}`,
          'Accept-Ranges': 'bytes'
        }
      })
    }

    const stream = Readable.toWeb(createReadStream(target)) as unknown as ReadableStream<Uint8Array>
    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(size),
        'Accept-Ranges': 'bytes'
      }
    })
  })
}
