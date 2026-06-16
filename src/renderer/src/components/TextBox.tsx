import type { GenerationType } from '@shared/types'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'

interface TextBoxProps {
  kind: GenerationType
  prompt: string
  canSubmit: boolean
  onPromptChange: (value: string) => void
  onSubmit: () => void
  textareaRef?: React.Ref<HTMLTextAreaElement>
}

export function TextBox({
  kind,
  prompt,
  canSubmit,
  onPromptChange,
  onSubmit,
  textareaRef
}: TextBoxProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-input/30 p-2.5 pl-3.5 transition-colors focus-within:border-ring">
      <Textarea
        ref={textareaRef}
        rows={2}
        placeholder={
          kind === 'video' ? 'Describe a video to generate…' : 'Describe an image to generate…'
        }
        className="max-h-44 min-h-0 border-0 bg-transparent p-0 shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            onSubmit()
          }
        }}
      />
      <div className="flex justify-end">
        <Button size="sm" disabled={!canSubmit} onClick={onSubmit}>
          Generate
        </Button>
      </div>
    </div>
  )
}
