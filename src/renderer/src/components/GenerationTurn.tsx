import { Loader2 } from 'lucide-react'
import type { Generation } from '@shared/types'
import { modelLabel, relativeTime } from '../lib/format'
import { MediaTile } from './MediaTile'

interface GenerationTurnProps {
  generation: Generation
  onOpenLightbox: (src: string) => void
}

export function GenerationTurn({
  generation,
  onOpenLightbox
}: GenerationTurnProps): React.JSX.Element {
  const progress =
    typeof generation.params.progress === 'number' ? generation.params.progress : null
  const busyLabel =
    generation.status === 'pending'
      ? 'Queued…'
      : generation.type === 'video'
        ? progress !== null
          ? `Generating… ${Math.round(progress)}%`
          : 'Generating video…'
        : 'Generating…'

  return (
    <div className="border-b border-border pb-6 last:border-0">
      <h2 className="mb-1.5 text-[15px] leading-snug font-medium">{generation.prompt}</h2>
      <div className="mb-4 flex items-center gap-2.5 text-xs text-muted-foreground">
        <span>{modelLabel(generation.model)}</span>
        <span>·</span>
        <span>{relativeTime(generation.createdAt)}</span>
      </div>

      {(generation.status === 'pending' || generation.status === 'running') && (
        <div className="flex items-center gap-2.5 py-6 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          <span>{busyLabel}</span>
        </div>
      )}

      {generation.status === 'error' && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3.5 py-3 text-sm text-destructive">
          {generation.error ?? 'Generation failed.'}
        </div>
      )}

      {generation.status === 'completed' && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
          {generation.assets.map((asset) => (
            <MediaTile
              key={asset.fileName}
              generationId={generation.id}
              asset={asset}
              alt={generation.prompt}
              onOpenLightbox={onOpenLightbox}
            />
          ))}
        </div>
      )}
    </div>
  )
}
