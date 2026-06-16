import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
  modelKind,
  type GenerationType
} from '@shared/types'
import { modelsForKind, speedCostLabel } from '../lib/modelSelector'
import { cn } from '../lib/utils'

interface ModelSelectorProps {
  model: string
  onModelChange: (id: string) => void
}

export function ModelSelector({ model, onModelChange }: ModelSelectorProps): React.JSX.Element {
  const kind = modelKind(model)

  function pickKind(next: GenerationType): void {
    if (next === kind) return
    onModelChange(next === 'video' ? DEFAULT_VIDEO_MODEL : DEFAULT_IMAGE_MODEL)
  }

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm">
        {(['image', 'video'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => pickKind(k)}
            className={cn(
              'rounded-md px-3 py-1.5 font-medium capitalize transition-colors',
              k === kind ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {k}
          </button>
        ))}
      </div>
      <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
        {modelsForKind(kind).map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onModelChange(m.id)}
            className={cn(
              'flex flex-col gap-1.5 rounded-lg border px-3 py-2.5 text-left transition-colors',
              m.id === model
                ? 'border-ring bg-accent'
                : 'border-border hover:border-ring/50 hover:bg-accent/40'
            )}
          >
            <span className="text-sm font-medium">{m.label}</span>
            <div className="flex flex-wrap gap-1">
              {m.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
            <span className="text-[11px] text-muted-foreground">{speedCostLabel(m)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
