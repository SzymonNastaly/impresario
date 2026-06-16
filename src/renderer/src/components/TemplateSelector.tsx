import type { Template } from '@shared/types'
import { templatePreview } from '../lib/templatePreview'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue
} from './ui/select'

interface TemplateSelectorProps {
  templates: Template[]
  onApply: (tpl: Template) => void
  onManage: () => void
}

const MANAGE_VALUE = '__manage__'

export function TemplateSelector({
  templates,
  onApply,
  onManage
}: TemplateSelectorProps): React.JSX.Element {
  function onPick(value: string): void {
    if (value === MANAGE_VALUE) {
      onManage()
      return
    }
    const tpl = templates.find((t) => t.id === value)
    if (tpl) onApply(tpl)
  }

  return (
    <Select value="" onValueChange={onPick}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Start from a template…" />
      </SelectTrigger>
      <SelectContent>
        {templates.map((t) => {
          const row = templatePreview(t)
          return (
            <SelectItem key={t.id} value={t.id}>
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{row.name}</span>
                <span className="text-[11px] text-muted-foreground">
                  {row.model}
                  {row.promptPreview ? ` · ${row.promptPreview}` : ''}
                </span>
              </div>
            </SelectItem>
          )
        })}
        {templates.length > 0 && <SelectSeparator />}
        <SelectItem value={MANAGE_VALUE}>Manage templates…</SelectItem>
      </SelectContent>
    </Select>
  )
}
