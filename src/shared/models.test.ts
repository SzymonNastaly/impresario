import { describe, expect, test } from 'vitest'
import { DEFAULT_IMAGE_MODEL, DEFAULT_IMAGE_MODELS, DEFAULT_VIDEO_MODELS } from './types'

describe('curated model overlay', () => {
  test('image and video models carry metadata', () => {
    for (const m of [...DEFAULT_IMAGE_MODELS, ...DEFAULT_VIDEO_MODELS]) {
      expect(m.label.length).toBeGreaterThan(0)
      expect(Array.isArray(m.tags)).toBe(true)
      expect(['fast', 'medium', 'slow']).toContain(m.speed)
      expect([1, 2, 3]).toContain(m.cost)
      expect(typeof m.acceptsReferenceFiles).toBe('boolean')
    }
  })

  test('DEFAULT_IMAGE_MODEL is the first curated image model', () => {
    expect(DEFAULT_IMAGE_MODEL).toBe(DEFAULT_IMAGE_MODELS[0].id)
  })
})
