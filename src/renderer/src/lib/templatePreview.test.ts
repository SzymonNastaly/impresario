import { describe, expect, test } from 'vitest'
import { DEFAULT_IMAGE_MODEL, type Template } from '@shared/types'
import { templatePreview } from './templatePreview'

function makeTemplate(model: string, prompt: string): Template {
  return {
    id: 't1',
    name: 'My template',
    kind: 'single-prompt',
    config: { prompt, model, params: {} },
    createdAt: 1,
    updatedAt: 1
  }
}

describe('templatePreview', () => {
  test('resolves a known model id to its friendly label', () => {
    const row = templatePreview(makeTemplate(DEFAULT_IMAGE_MODEL, 'hi'))
    expect(row.name).toBe('My template')
    expect(row.model).toBe('FLUX.2 Flash')
    expect(row.promptPreview).toBe('hi')
  })

  test('falls back to the raw model id when unknown', () => {
    expect(templatePreview(makeTemplate('custom/model', 'hi')).model).toBe('custom/model')
  })

  test('truncates a long prompt with an ellipsis', () => {
    const long = 'x'.repeat(80)
    const row = templatePreview(makeTemplate(DEFAULT_IMAGE_MODEL, long))
    expect(row.promptPreview.endsWith('…')).toBe(true)
    expect(row.promptPreview.length).toBeLessThanOrEqual(61)
  })
})
