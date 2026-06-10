import { useState } from 'react'
import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_IMAGE_MODELS,
  DEFAULT_VIDEO_MODELS,
  modelKind,
  type GenerateImageRequest,
  type GenerateVideoRequest,
  type Template
} from '@shared/types'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue
} from './ui/select'

interface PromptBarProps {
  hasKey: boolean
  templates: Template[]
  onGenerate: (req: GenerateImageRequest | GenerateVideoRequest) => Promise<void>
  onNeedKey: () => void
  onManageTemplates: () => void
}

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
  const [params, setParams] = useState<{ numberOfImages?: number; size?: string }>({})

  const kind = modelKind(model)
  const canSubmit = prompt.trim().length > 0

  function onPickTemplate(value: string): void {
    if (value === MANAGE_VALUE) {
      onManageTemplates()
      return
    }
    const tpl = templates.find((t) => t.id === value)
    if (!tpl) return
    setPrompt(tpl.config.prompt)
    setModel(tpl.config.model)
    setParams(tpl.config.params)
  }

  async function submit(): Promise<void> {
    if (!hasKey) {
      onNeedKey()
      return
    }
    if (!canSubmit) return
    const text = prompt.trim()
    setPrompt('')
    setParams({})
    if (modelKind(model) === 'video') {
      await onGenerate({ prompt: text, model })
    } else {
      await onGenerate({ prompt: text, model, ...params })
    }
  }

  return (
    <div className="border-t border-border bg-background px-7 pt-3.5 pb-5">
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-input/30 p-2.5 pl-3.5 transition-colors focus-within:border-ring">
        <Textarea
          rows={1}
          placeholder={
            kind === 'video' ? 'Describe a video to generate…' : 'Describe an image to generate…'
          }
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
                <SelectGroup>
                  <SelectLabel>Image</SelectLabel>
                  {DEFAULT_IMAGE_MODELS.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel>Video</SelectLabel>
                  {DEFAULT_VIDEO_MODELS.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
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
