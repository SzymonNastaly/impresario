import { describe, expect, test } from 'vitest'
import { DEFAULT_IMAGE_MODEL, type ModelInfo } from '@shared/types'
import { acceptsReferenceFiles, speedCostLabel } from './modelSelector'

describe('modelSelector', () => {
  test('speedCostLabel formats speed + cost dollars', () => {
    const info: ModelInfo = {
      id: 'x',
      label: 'X',
      kind: 'image',
      tags: [],
      speed: 'fast',
      cost: 2,
      acceptsReferenceFiles: false
    }
    expect(speedCostLabel(info)).toBe('Fast · $$')
    expect(speedCostLabel({ ...info, speed: 'slow', cost: 3 })).toBe('Slow · $$$')
  })

  test('acceptsReferenceFiles reads the catalog, false for unknown ids', () => {
    expect(acceptsReferenceFiles(DEFAULT_IMAGE_MODEL)).toBe(false)
    expect(acceptsReferenceFiles('nope/unknown')).toBe(false)
  })
})
