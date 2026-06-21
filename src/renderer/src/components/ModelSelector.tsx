import { useState } from 'react'
import { Search, Star } from 'lucide-react'
import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
  type GenerationType
} from '@shared/types'
import {
  endpointInfo,
  familiesForOutput,
  resolveVariant,
  searchFamilies,
  type Family
} from '@shared/catalog'
import { modelKind } from '@shared/catalog'
import { speedCostLabel } from '../lib/modelSelector'
import { cn } from '../lib/utils'

interface ModelSelectorProps {
  model: string
  onModelChange: (id: string) => void
  favorites: string[]
  onToggleFavorite: (familyId: string) => void
}

export function ModelSelector({
  model,
  onModelChange,
  favorites,
  onToggleFavorite
}: ModelSelectorProps): React.JSX.Element {
  const kind = modelKind(model)
  const [query, setQuery] = useState('')
  const selectedFamilyId = endpointInfo(model)?.family.id

  function pickKind(next: GenerationType): void {
    if (next === kind) return
    onModelChange(next === 'video' ? DEFAULT_VIDEO_MODEL : DEFAULT_IMAGE_MODEL)
  }

  function pickFamily(family: Family): void {
    const variant = resolveVariant(family, kind, false)
    if (variant) onModelChange(variant.endpointId)
  }

  const favoriteSet = new Set(favorites)
  const results =
    query.trim() === ''
      ? familiesForOutput(kind).filter((f) => favoriteSet.has(f.id))
      : searchFamilies(kind, query)

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

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${kind} models…`}
          className="w-full rounded-lg border border-border bg-background py-2 pl-8 pr-3 text-sm outline-none focus:border-ring"
        />
      </div>

      {query.trim() === '' && (
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Favorites
        </span>
      )}

      <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
        {results.length === 0 && (
          <span className="px-1 py-2 text-xs text-muted-foreground">
            {query.trim() === '' ? 'No favorites yet — search to add some.' : 'No models match.'}
          </span>
        )}
        {results.map((family) => {
          const defaultVariant = resolveVariant(family, kind, false)
          const overlay = defaultVariant?.overlay
          const isSelected = family.id === selectedFamilyId
          const isFavorite = favoriteSet.has(family.id)
          return (
            <div
              key={family.id}
              className={cn(
                'flex items-start gap-2 rounded-lg border px-3 py-2.5 transition-colors',
                isSelected
                  ? 'border-ring bg-accent'
                  : 'border-border hover:border-ring/50 hover:bg-accent/40'
              )}
            >
              <button
                type="button"
                onClick={() => pickFamily(family)}
                className="flex flex-1 flex-col gap-1.5 text-left"
              >
                <span className="text-sm font-medium">{family.label}</span>
                {overlay ? (
                  <>
                    <div className="flex flex-wrap gap-1">
                      {overlay.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    <span className="text-[11px] text-muted-foreground">{speedCostLabel(overlay)}</span>
                  </>
                ) : (
                  <span className="line-clamp-2 text-[11px] text-muted-foreground">
                    {family.owner}
                    {defaultVariant ? ` · ${defaultVariant.subLabel}` : ''}
                  </span>
                )}
              </button>
              <button
                type="button"
                aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                onClick={() => onToggleFavorite(family.id)}
                className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground"
              >
                <Star className={cn('size-4', isFavorite && 'fill-current text-foreground')} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
