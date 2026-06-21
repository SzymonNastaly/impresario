import { describe, expect, test } from 'vitest'
import { CATEGORY_MODALITY, rawEntryToCatalogModel } from './falCatalogTransform'

describe('CATEGORY_MODALITY', () => {
  test('covers exactly the five in-scope categories', () => {
    expect(Object.keys(CATEGORY_MODALITY).sort()).toEqual(
      [
        'image-to-image',
        'image-to-video',
        'reference-to-video',
        'text-to-image',
        'text-to-video'
      ].sort()
    )
  })

  test('image input categories accept reference files', () => {
    expect(CATEGORY_MODALITY['text-to-image'].acceptsReferenceFiles).toBe(false)
    expect(CATEGORY_MODALITY['image-to-image'].acceptsReferenceFiles).toBe(true)
    expect(CATEGORY_MODALITY['image-to-video'].acceptsReferenceFiles).toBe(true)
  })
})

describe('rawEntryToCatalogModel', () => {
  test('maps an in-scope entry, deriving outputKind and owner', () => {
    const out = rawEntryToCatalogModel({
      id: 'fal-ai/wan/v2.7/image-to-video',
      title: 'Wan',
      category: 'image-to-video',
      shortDescription: 'great video',
      modelFamily: 'Wan 2.7'
    })
    expect(out).toEqual({
      id: 'fal-ai/wan/v2.7/image-to-video',
      label: 'Wan',
      outputKind: 'video',
      category: 'image-to-video',
      modelFamily: 'Wan 2.7',
      owner: 'fal-ai',
      description: 'great video'
    })
  })

  test('falls back to modelId, id label, and empty family/description', () => {
    const out = rawEntryToCatalogModel({
      modelId: 'owner/thing/text-to-image',
      category: 'text-to-image'
    })
    expect(out).toMatchObject({
      id: 'owner/thing/text-to-image',
      label: 'owner/thing/text-to-image',
      outputKind: 'image',
      modelFamily: '',
      owner: 'owner',
      description: ''
    })
  })

  test('returns null for out-of-scope category', () => {
    expect(
      rawEntryToCatalogModel({ id: 'x/y/video-to-video', category: 'video-to-video' })
    ).toBeNull()
  })

  test('returns null for deprecated, removed, or id-less entries', () => {
    expect(
      rawEntryToCatalogModel({ id: 'a/b/text-to-image', category: 'text-to-image', deprecated: true })
    ).toBeNull()
    expect(
      rawEntryToCatalogModel({ id: 'a/b/text-to-image', category: 'text-to-image', removed: true })
    ).toBeNull()
    expect(rawEntryToCatalogModel({ category: 'text-to-image' })).toBeNull()
  })
})
