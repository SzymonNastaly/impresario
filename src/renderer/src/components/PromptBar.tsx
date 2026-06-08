import { useState } from 'react'
import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_IMAGE_MODELS,
  type GenerateImageRequest,
  type Template
} from '@shared/types'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue
} from './ui/select'

interface PromptBarProps {
  hasKey: boolean
  templates: Template[]
  onGenerate: (req: GenerateImageRequest) => Promise<void>
  onNeedKey: () => void
  onManageTemplates: () => void
}

// Sentinel value for the "Manage templates…" action in the picker. Real
// template ids are UUIDs, so this can never collide.
const MANAGE_VALUE = '__manage__'

export function PromptBar({
  hasKey,
  templates,
  onGenerate,
  onNeedKey,
  onManageTemplates
}: PromptBarProps): React.JSX.Element {
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState<string>(DEFAULT_IMAGE_MODEL)
  // Extra generation params carried from an applied template (no PromptBar
  // controls for these yet; they ride into the generate request).
  const [params, setParams] = useState<{ numberOfImages?: number; size?: string }>({})

  const canSubmit = prompt.trim().length > 0

  // The picker is a one-shot action menu: its value is always '' so it shows
  // the "Templates" placeholder and never visually "sticks" on a selection.
  function onPickTemplate(value: string): void {
    if (value === MANAGE_VALUE) {
      onManageTemplates()
      return
    }
    const tpl = templates.find((t) => t.id === value)
    if (!tpl) return
    setPrompt(tpl.config.prompt)
    setModel(tpl.config.model)
    setParams(tpl.config.params ?? {})
  }

  async function submit(): Promise<void> {
    if (!hasKey) {
      onNeedKey()
      return
    }
    if (!canSubmit) return
    const text = prompt.trim()
    setPrompt('')
    await onGenerate({ prompt: text, model, ...params })
  }

  return (
    <div className="border-t border-border bg-background px-7 pt-3.5 pb-5">
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-input/30 p-2.5 pl-3.5 transition-colors focus-within:border-ring">
        <Textarea
          rows={1}
          placeholder="Describe an image to generate…"
          className="max-h-44 min-h-0 border-0 bg-transparent p-0 shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void submit()
            }
          }}
        />
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger size="sm" className="w-auto">
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
            <Select value="" onValueChange={onPickTemplate}>
              <SelectTrigger size="sm" className="w-auto">
                <SelectValue placeholder="Templates" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
                {templates.length > 0 && <SelectSeparator />}
                <SelectItem value={MANAGE_VALUE}>Manage templates…</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" disabled={!canSubmit} onClick={() => void submit()}>
            Generate
          </Button>
        </div>
      </div>
    </div>
  )
}
