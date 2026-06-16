import { describe, expect, test } from 'vitest'
import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_IMAGE_MODELS,
  DEFAULT_VIDEO_MODELS,
  type ModelInfo
} from '@shared/types'
import { acceptsReferenceFiles, modelsForKind, speedCostLabel } from './modelSelector'

describe('modelSelector', () => {
  test('modelsForKind returns only models of that kind', () => {
    expect(modelsForKind('image').map((m) => m.id).sort()).toEqual(
      DEFAULT_IMAGE_MODELS.map((m) => m.id).sort()
    )
    expect(modelsForKind('video').map((m) => m.id).sort()).toEqual(
      DEFAULT_VIDEO_MODELS.map((m) => m.id).sort()
    )
  })

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

  test('acceptsReferenceFiles reads the registry, false for unknown ids', () => {
    expect(acceptsReferenceFiles(DEFAULT_IMAGE_MODEL)).toBe(false)
    expect(acceptsReferenceFiles('nope/unknown')).toBe(false)
  })
})
