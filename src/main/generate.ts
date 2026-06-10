import { generateImage, generateVideo, getVideoJobStatus } from '@tanstack/ai'
import { falImage, falVideo } from '@tanstack/ai-fal'
import type { GenerateImageRequest, GenerateVideoRequest } from '@shared/types'

export interface RawImage {
  bytes: Buffer
  contentType: string
}

export interface RawVideo {
  bytes: Buffer
  contentType: string
}

function contentTypeFromUrl(url: string): string {
  const lower = url.split('?')[0].toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  return 'image/png'
}

/**
 * Calls fal.ai through TanStack AI and returns the raw image bytes.
 * Provider URLs can expire, so images are downloaded here immediately.
 * Runs in the main process; the API key never leaves it.
 */
export async function generateImages(
  apiKey: string,
  req: Required<Pick<GenerateImageRequest, 'model' | 'prompt'>> & GenerateImageRequest
): Promise<RawImage[]> {
  const adapter = falImage(req.model, { apiKey })

  const result = await generateImage({
    adapter,
    prompt: req.prompt,
    numberOfImages: req.numberOfImages ?? 1,
    ...(req.size ? { size: req.size } : {})
  })

  const images: RawImage[] = []
  for (const img of result.images) {
    if (img.b64Json) {
      images.push({ bytes: Buffer.from(img.b64Json, 'base64'), contentType: 'image/png' })
    } else if (img.url) {
      const res = await fetch(img.url)
      if (!res.ok) throw new Error(`Failed to download image (${res.status})`)
      const buf = Buffer.from(await res.arrayBuffer())
      const contentType = res.headers.get('content-type') ?? contentTypeFromUrl(img.url)
      images.push({ bytes: buf, contentType })
    }
  }

  if (images.length === 0) {
    throw new Error('The model returned no images.')
  }
  return images
}

const VIDEO_POLL_INTERVAL_MS = 2500

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Drives fal's asynchronous video job: create → poll status → download bytes.
 * `onJob(jobId)` fires once the job id is known (so it can be persisted for
 * resume-on-restart); `onProgress(progress)` fires as polling advances.
 */
export async function generateVideoAsset(
  apiKey: string,
  req: Required<Pick<GenerateVideoRequest, 'model' | 'prompt'>> & GenerateVideoRequest,
  hooks: { onJob?: (jobId: string) => void; onProgress?: (progress: number) => void } = {}
): Promise<RawVideo> {
  const adapter = falVideo(req.model, { apiKey })

  const { jobId } = await generateVideo({
    adapter,
    prompt: req.prompt,
    ...(req.size ? { size: req.size } : {}),
    ...(req.duration ? { duration: req.duration } : {})
  })
  hooks.onJob?.(jobId)

  const url = await pollVideoJob(adapter, jobId, hooks.onProgress)
  return downloadVideo(url)
}

/** Resume polling an already-created job (used after an app restart). */
export async function resumeVideoAsset(
  apiKey: string,
  model: string,
  jobId: string,
  onProgress?: (progress: number) => void
): Promise<RawVideo> {
  const adapter = falVideo(model, { apiKey })
  const url = await pollVideoJob(adapter, jobId, onProgress)
  return downloadVideo(url)
}

async function pollVideoJob(
  adapter: ReturnType<typeof falVideo>,
  jobId: string,
  onProgress?: (progress: number) => void
): Promise<string> {
  for (;;) {
    const status = await getVideoJobStatus({ adapter, jobId })
    if (typeof status.progress === 'number') onProgress?.(status.progress)
    if (status.status === 'completed') {
      const { url } = await adapter.getVideoUrl(jobId)
      if (!url) throw new Error('The model reported completion but returned no video URL.')
      return url
    }
    if (status.status === 'failed') {
      throw new Error(status.error ?? 'Video generation failed.')
    }
    await delay(VIDEO_POLL_INTERVAL_MS)
  }
}

async function downloadVideo(url: string): Promise<RawVideo> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to download video (${res.status})`)
  const bytes = Buffer.from(await res.arrayBuffer())
  const contentType = res.headers.get('content-type') ?? 'video/mp4'
  return { bytes, contentType }
}
