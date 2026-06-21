import { endpointInfo, modelKind, variantsForOutput } from '@shared/catalog'
import { cn } from '../lib/utils'

interface VariantSelectorProps {
  model: string
  onModelChange: (id: string) => void
}

/** Task-variant picker for the selected family (e.g. Text→Video vs Image→Video). */
export function VariantSelector({ model, onModelChange }: VariantSelectorProps): React.JSX.Element | null {
  const info = endpointInfo(model)
  if (!info) return null
  const kind = modelKind(model)
  const variants = variantsForOutput(info.family, kind)
  if (variants.length <= 1) return null

  return (
    <div className="flex flex-wrap gap-1.5">
      {variants.map((v) => (
        <button
          key={v.endpointId}
          type="button"
          onClick={() => onModelChange(v.endpointId)}
          className={cn(
            'rounded-full border px-3 py-1 text-xs transition-colors',
            v.endpointId === model
              ? 'border-ring bg-accent text-foreground'
              : 'border-border text-muted-foreground hover:border-ring/50'
          )}
        >
          {v.subLabel}
        </button>
      ))}
    </div>
  )
}
