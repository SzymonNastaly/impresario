import { useState } from 'react'
import { Download, Pencil, Trash2, Upload } from 'lucide-react'
import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_IMAGE_MODELS,
  type Template,
  type TemplateCreate
} from '@shared/types'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './ui/dialog'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'

interface TemplateEditorModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  templates: Template[]
}

// Form state uses strings for the numeric/optional fields so inputs stay
// controlled; draftToCreate normalizes them on save.
interface Draft {
  id?: string
  name: string
  prompt: string
  model: string
  numberOfImages: string
  size: string
}

function emptyDraft(): Draft {
  return { name: '', prompt: '', model: DEFAULT_IMAGE_MODEL, numberOfImages: '1', size: '' }
}

function draftFromTemplate(t: Template): Draft {
  return {
    id: t.id,
    name: t.name,
    prompt: t.config.prompt,
    model: t.config.model,
    numberOfImages: t.config.params.numberOfImages ? String(t.config.params.numberOfImages) : '',
    size: t.config.params.size ?? ''
  }
}

function draftToCreate(d: Draft): TemplateCreate {
  const count = parseInt(d.numberOfImages, 10)
  return {
    name: d.name.trim(),
    kind: 'single-prompt',
    config: {
      prompt: d.prompt.trim(),
      model: d.model,
      params: {
        ...(Number.isFinite(count) && count > 0 ? { numberOfImages: count } : {}),
        ...(d.size.trim() ? { size: d.size.trim() } : {})
      }
    }
  }
}

export function TemplateEditorModal({
  open,
  onOpenChange,
  templates
}: TemplateEditorModalProps): React.JSX.Element {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)

  const canSave = draft !== null && draft.name.trim().length > 0 && draft.prompt.trim().length > 0

  function reset(): void {
    setDraft(null)
    setError(null)
  }

  async function save(): Promise<void> {
    if (!draft || !canSave) return
    const input = draftToCreate(draft)
    try {
      if (draft.id) {
        await window.api.templates.update(draft.id, { name: input.name, config: input.config })
      } else {
        await window.api.templates.create(input)
      }
      reset()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save template.')
    }
  }

  async function remove(id: string): Promise<void> {
    await window.api.templates.delete(id)
    if (draft?.id === id) reset()
  }

  async function exportOne(id: string): Promise<void> {
    try {
      await window.api.templates.export(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to export template.')
    }
  }

  async function importOne(): Promise<void> {
    try {
      await window.api.templates.import()
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to import template.')
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) reset()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Templates</DialogTitle>
          <DialogDescription>
            Reusable prompt + model presets for starting new generations.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
            {error}
          </div>
        )}

        {draft ? (
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="tpl-name">Name</Label>
              <Input
                id="tpl-name"
                value={draft.name}
                autoFocus
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tpl-prompt">Prompt</Label>
              <Textarea
                id="tpl-prompt"
                rows={3}
                value={draft.prompt}
                onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Model</Label>
              <Select value={draft.model} onValueChange={(v) => setDraft({ ...draft, model: v })}>
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEFAULT_IMAGE_MODELS.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="tpl-count">Images</Label>
                <Input
                  id="tpl-count"
                  type="number"
                  min={1}
                  value={draft.numberOfImages}
                  onChange={(e) => setDraft({ ...draft, numberOfImages: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="tpl-size">Size</Label>
                <Input
                  id="tpl-size"
                  placeholder="1024x1024"
                  value={draft.size}
                  onChange={(e) => setDraft({ ...draft, size: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={reset}>
                Cancel
              </Button>
              <Button disabled={!canSave} onClick={() => void save()}>
                {draft.id ? 'Save' : 'Create'}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="max-h-72 overflow-y-auto rounded-md border border-border">
              {templates.length === 0 ? (
                <div className="px-3.5 py-6 text-sm text-muted-foreground">
                  No templates yet. Create one to get started.
                </div>
              ) : (
                templates.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm">{t.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {t.config.prompt}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        title="Export"
                        onClick={() => void exportOne(t.id)}
                      >
                        <Download />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        title="Edit"
                        onClick={() => setDraft(draftFromTemplate(t))}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        title="Delete"
                        onClick={() => void remove(t.id)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" onClick={() => void importOne()}>
                <Upload /> Import
              </Button>
              <Button size="sm" onClick={() => setDraft(emptyDraft())}>
                New template
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
