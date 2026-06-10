import { useState } from 'react'
import { Download, Share2, FolderOpen, Check } from 'lucide-react'
import type { GenerationAsset } from '@shared/types'
import { Button } from './ui/button'

const isMac = navigator.platform.toUpperCase().includes('MAC')

interface MediaTileProps {
  generationId: string
  asset: GenerationAsset
  alt: string
  onOpenLightbox: (src: string) => void
}

export function MediaTile({
  generationId,
  asset,
  alt,
  onOpenLightbox
}: MediaTileProps): React.JSX.Element {
  const [saved, setSaved] = useState(false)
  const isVideo = asset.contentType.startsWith('video/')

  async function save(): Promise<void> {
    const res = await window.api.media.save(generationId, asset.fileName)
    if (!res.canceled) {
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    }
  }

  return (
    <div className="group relative overflow-hidden rounded-lg border border-border bg-muted">
      {isVideo ? (
        <video src={asset.url} controls preload="metadata" className="block w-full" />
      ) : (
        <img
          src={asset.url}
          alt={alt}
          className="block w-full cursor-zoom-in"
          onClick={() => onOpenLightbox(asset.url)}
        />
      )}

      <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <Button
          variant="secondary"
          size="icon-xs"
          title={saved ? 'Saved' : 'Save'}
          onClick={() => void save()}
        >
          {saved ? <Check /> : <Download />}
        </Button>
        {isMac && (
          <Button
            variant="secondary"
            size="icon-xs"
            title="Share"
            onClick={() => void window.api.media.share(generationId, asset.fileName)}
          >
            <Share2 />
          </Button>
        )}
        <Button
          variant="secondary"
          size="icon-xs"
          title="Reveal in Finder"
          onClick={() => void window.api.media.reveal(generationId, asset.fileName)}
        >
          <FolderOpen />
        </Button>
      </div>
    </div>
  )
}
