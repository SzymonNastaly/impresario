import { modelInfo, type Template } from '@shared/types'

export interface TemplateRow {
  name: string
  model: string
  promptPreview: string
}

const PROMPT_PREVIEW_MAX = 60

/** A template formatted for the selector: name + friendly model + prompt preview. */
export function templatePreview(tpl: Template): TemplateRow {
  const model = modelInfo(tpl.config.model)?.label ?? tpl.config.model
  const prompt = tpl.config.prompt.trim()
  const promptPreview =
    prompt.length > PROMPT_PREVIEW_MAX
      ? `${prompt.slice(0, PROMPT_PREVIEW_MAX).trimEnd()}…`
      : prompt
  return { name: tpl.name, model, promptPreview }
}
