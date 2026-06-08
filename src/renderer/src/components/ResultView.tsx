import { Loader2 } from 'lucide-react'
import type { Generation } from '@shared/types'
import { modelLabel, relativeTime } from '../lib/format'

interface ResultViewProps {
  generation: Generation | null
}

export function ResultView({ generation }: ResultViewProps): React.JSX.Element {
  if (!generation) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto p-7">
        <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
          <h2 className="font-heading text-lg font-semibold text-foreground">Impresario Studio</h2>
          <p>Describe an image and press Generate to begin.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-7">
      <h1 className="mb-1.5 text-[17px] leading-snug font-medium">{generation.prompt}</h1>
      <div className="mb-5 flex items-center gap-2.5 text-xs text-muted-foreground">
        <span>{modelLabel(generation.model)}</span>
        <span>·</span>
        <span>{relativeTime(generation.createdAt)}</span>
      </div>

      {(generation.status === 'pending' || generation.status === 'running') && (
        <div className="flex items-center gap-2.5 py-8 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          <span>{generation.status === 'pending' ? 'Queued…' : 'Generating…'}</span>
        </div>
      )}

      {generation.status === 'error' && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3.5 py-3 text-sm text-destructive">
          {generation.error ?? 'Generation failed.'}
        </div>
      )}

      {generation.status === 'completed' && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
          {generation.assets.map((asset) => (
            <img
              key={asset.fileName}
              className="block w-full rounded-lg border border-border bg-muted"
              src={asset.url}
              alt={generation.prompt}
            />
          ))}
        </div>
      )}
    </div>
  )
}
