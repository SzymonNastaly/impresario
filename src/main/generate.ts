import { generateImage } from '@tanstack/ai'
import { falImage } from '@tanstack/ai-fal'
import type { GenerateImageRequest } from '@shared/types'

export interface RawImage {
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
