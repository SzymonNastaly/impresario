import { Settings, X } from 'lucide-react'
import type { Generation } from '@shared/types'
import { relativeTime } from '../lib/format'
import { cn } from '../lib/utils'
import { Button } from './ui/button'

interface SidebarProps {
  generations: Generation[]
  selectedId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onOpenSettings: () => void
}

export function Sidebar({
  generations,
  selectedId,
  onSelect,
  onDelete,
  onOpenSettings
}: SidebarProps): React.JSX.Element {
  return (
    <aside className="flex min-h-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <span className="font-heading font-semibold tracking-tight">Impresario</span>
        <Button variant="ghost" size="icon" title="Settings" onClick={onOpenSettings}>
          <Settings />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {generations.length === 0 ? (
          <div className="px-4 py-6 text-[13px] leading-relaxed text-muted-foreground">
            No generations yet. Type a prompt below to create your first image.
          </div>
        ) : (
          generations.map((gen) => (
            <div
              key={gen.id}
              className={cn(
                'group relative mb-0.5 flex w-full cursor-pointer flex-col gap-1 rounded-md border border-transparent px-2.5 py-2 text-left transition-colors',
                gen.id === selectedId
                  ? 'border-sidebar-border bg-sidebar-accent'
                  : 'hover:bg-sidebar-accent/60'
              )}
              onClick={() => onSelect(gen.id)}
              role="button"
              tabIndex={0}
            >
              <div className="truncate pr-5 text-[13px]">{gen.prompt}</div>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className={cn('size-1.5 shrink-0 rounded-full', statusDot(gen.status))} />
                <span>{statusLabel(gen)}</span>
                <span>·</span>
                <span>{relativeTime(gen.createdAt)}</span>
              </div>
              <Button
                variant="ghost"
                size="icon-xs"
                title="Delete"
                className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(gen.id)
                }}
              >
                <X />
              </Button>
            </div>
          ))
        )}
      </div>
    </aside>
  )
}

function statusDot(status: Generation['status']): string {
  switch (status) {
    case 'pending':
    case 'running':
      return 'bg-amber-500'
    case 'completed':
      return 'bg-emerald-500'
    case 'error':
      return 'bg-destructive'
  }
}

function statusLabel(gen: Generation): string {
  switch (gen.status) {
    case 'pending':
      return 'Queued'
    case 'running':
      return 'Generating'
    case 'completed': {
      const noun = gen.type === 'video' ? 'video' : 'image'
      return `${gen.assets.length} ${noun}${gen.assets.length === 1 ? '' : 's'}`
    }
    case 'error':
      return 'Failed'
  }
}
