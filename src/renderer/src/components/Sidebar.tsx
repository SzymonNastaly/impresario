import { useState } from 'react'
import { Pencil, X } from 'lucide-react'
import type { Conversation } from '@shared/types'
import { relativeTime } from '../lib/format'
import { cn } from '../lib/utils'
import { Button } from './ui/button'
import { Input } from './ui/input'

interface SidebarProps {
  conversations: Conversation[]
  activeId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onRename: (id: string, title: string) => void
}

export function Sidebar({
  conversations,
  activeId,
  onSelect,
  onDelete,
  onRename
}: SidebarProps): React.JSX.Element {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  function startRename(conv: Conversation): void {
    setEditingId(conv.id)
    setDraft(conv.title)
  }

  function commitRename(): void {
    if (editingId && draft.trim()) onRename(editingId, draft.trim())
    setEditingId(null)
  }

  return (
    <aside className="flex h-full min-h-0 w-[264px] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-xl">
      <div className="flex items-center px-4 pt-4 pb-3">
        <span className="font-heading font-semibold tracking-tight">Chats</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {conversations.length === 0 ? (
          <div className="px-4 py-6 text-[13px] leading-relaxed text-muted-foreground">
            No conversations yet. Start a new chat to begin.
          </div>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              className={cn(
                'group relative mb-0.5 flex w-full cursor-pointer flex-col gap-1 rounded-md border border-transparent px-2.5 py-2 text-left transition-colors',
                conv.id === activeId
                  ? 'border-sidebar-border bg-sidebar-accent'
                  : 'hover:bg-sidebar-accent/60'
              )}
              onClick={() => onSelect(conv.id)}
              role="button"
              tabIndex={0}
            >
              {editingId === conv.id ? (
                <Input
                  autoFocus
                  value={draft}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename()
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  onBlur={commitRename}
                  className="h-6 text-[13px]"
                />
              ) : (
                <>
                  <div className="truncate pr-12 text-[13px]">{conv.title}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {relativeTime(conv.updatedAt)}
                  </div>
                  <div className="absolute top-1.5 right-1.5 flex gap-0.5 opacity-0 group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      title="Rename"
                      onClick={(e) => {
                        e.stopPropagation()
                        startRename(conv)
                      }}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      title="Delete"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDelete(conv.id)
                      }}
                    >
                      <X />
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </aside>
  )
}
