import { useState } from 'react'
import { DEFAULT_IMAGE_MODEL, DEFAULT_IMAGE_MODELS, type GenerateImageRequest } from '@shared/types'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'

interface PromptBarProps {
  hasKey: boolean
  onGenerate: (req: GenerateImageRequest) => Promise<void>
  onNeedKey: () => void
}

export function PromptBar({ hasKey, onGenerate, onNeedKey }: PromptBarProps): React.JSX.Element {
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState<string>(DEFAULT_IMAGE_MODEL)

  const canSubmit = prompt.trim().length > 0

  async function submit(): Promise<void> {
    if (!hasKey) {
      onNeedKey()
      return
    }
    if (!canSubmit) return
    const text = prompt.trim()
    setPrompt('')
    await onGenerate({ prompt: text, model })
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
          <Button size="sm" disabled={!canSubmit} onClick={() => void submit()}>
            Generate
          </Button>
        </div>
      </div>
    </div>
  )
}
