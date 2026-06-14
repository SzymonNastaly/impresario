import { describe, expect, test } from 'vitest'
import {
  ALL_MODELS,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_IMAGE_MODELS,
  DEFAULT_VIDEO_MODELS,
  modelInfo,
  modelKind
} from './types'

describe('model registry', () => {
  test('image and video models carry metadata', () => {
    for (const m of [...DEFAULT_IMAGE_MODELS, ...DEFAULT_VIDEO_MODELS]) {
      expect(m.label.length).toBeGreaterThan(0)
      expect(Array.isArray(m.tags)).toBe(true)
      expect(['fast', 'medium', 'slow']).toContain(m.speed)
      expect([1, 2, 3]).toContain(m.cost)
      expect(typeof m.acceptsReferenceFiles).toBe('boolean')
    }
  })

  test('ALL_MODELS unions both kinds', () => {
    expect(ALL_MODELS.length).toBe(DEFAULT_IMAGE_MODELS.length + DEFAULT_VIDEO_MODELS.length)
  })

  test('modelInfo looks up by id', () => {
    expect(modelInfo(DEFAULT_IMAGE_MODEL)?.kind).toBe('image')
    expect(modelInfo('does-not-exist')).toBeUndefined()
  })

  test('modelKind derives from the registry, defaulting to image', () => {
    expect(modelKind(DEFAULT_VIDEO_MODELS[0].id)).toBe('video')
    expect(modelKind(DEFAULT_IMAGE_MODEL)).toBe('image')
    expect(modelKind('unknown/model')).toBe('image')
  })
})
