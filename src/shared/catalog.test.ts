import { describe, expect, test } from 'vitest'
import type { CatalogModel } from './falCatalogTransform'
import type { ModelInfo } from './types'
import {
  buildFamilies,
  endpointInfoFrom,
  resolveVariant,
  searchFamiliesIn,
  variantsForOutput
} from './catalog'

const MODELS: CatalogModel[] = [
  {
    id: 'fal-ai/wan/v2.7/text-to-video',
    label: 'Wan Text to Video',
    outputKind: 'video',
    category: 'text-to-video',
    modelFamily: 'Wan 2.7',
    owner: 'fal-ai',
    description: 'wan t2v'
  },
  {
    id: 'fal-ai/wan/v2.7/image-to-video',
    label: 'Wan Image to Video',
    outputKind: 'video',
    category: 'image-to-video',
    modelFamily: 'Wan 2.7',
    owner: 'fal-ai',
    description: 'wan i2v'
  },
  {
    id: 'fal-ai/wan/v2.7/image-to-video/turbo',
    label: 'Wan Turbo',
    outputKind: 'video',
    category: 'image-to-video',
    modelFamily: 'Wan 2.7',
    owner: 'fal-ai',
    description: 'wan i2v turbo'
  },
  {
    id: 'fal-ai/flux-2/flash',
    label: 'FLUX.2 Flash',
    outputKind: 'image',
    category: 'text-to-image',
    modelFamily: '',
    owner: 'fal-ai',
    description: 'fast flux'
  }
]

const OVERLAYS: ModelInfo[] = [
  {
    id: 'fal-ai/flux-2/flash',
    label: 'FLUX.2 Flash',
    kind: 'image',
    tags: ['Fast drafts'],
    speed: 'fast',
    cost: 1,
    acceptsReferenceFiles: false
  }
]

describe('buildFamilies', () => {
  const fams = buildFamilies(MODELS, OVERLAYS)

  test('groups by modelFamily, leaves blank-family endpoints standalone', () => {
    const wan = fams.find((f) => f.id === 'Wan 2.7')
    expect(wan?.variants).toHaveLength(3)
    expect(wan?.outputs.has('video')).toBe(true)
    const flux = fams.find((f) => f.id === 'fal-ai/flux-2/flash')
    expect(flux?.label).toBe('FLUX.2 Flash')
    expect(flux?.variants).toHaveLength(1)
  })

  test('attaches curated overlay by endpoint id', () => {
    const flux = fams.find((f) => f.id === 'fal-ai/flux-2/flash')
    expect(flux?.variants[0].overlay?.tags).toEqual(['Fast drafts'])
    const wan = fams.find((f) => f.id === 'Wan 2.7')
    expect(wan?.variants[0].overlay).toBeUndefined()
  })

  test('disambiguates duplicate sub-labels within a family', () => {
    const wan = fams.find((f) => f.id === 'Wan 2.7')!
    const i2v = wan.variants.filter((v) => v.category === 'image-to-video')
    const labels = i2v.map((v) => v.subLabel).sort()
    expect(labels).toEqual(['Image → Video', 'Image → Video (turbo)'])
  })

  test('guarantees unique sub-labels for same-category variants', () => {
    const fams = buildFamilies(
      [
        {
          id: 'fal-ai/kling/v3/standard/image-to-video',
          label: 'Kling Standard',
          outputKind: 'video',
          category: 'image-to-video',
          modelFamily: 'Kling v3',
          owner: 'fal-ai',
          description: ''
        },
        {
          id: 'fal-ai/kling/v3/pro/image-to-video',
          label: 'Kling Pro',
          outputKind: 'video',
          category: 'image-to-video',
          modelFamily: 'Kling v3',
          owner: 'fal-ai',
          description: ''
        }
      ],
      []
    )
    const kling = fams.find((f) => f.id === 'Kling v3')!
    const labels = kling.variants.map((v) => v.subLabel)
    expect(new Set(labels).size).toBe(labels.length)
    expect(labels.sort()).toEqual([
      'Image → Video (pro/image-to-video)',
      'Image → Video (standard/image-to-video)'
    ])
  })
})

describe('variantsForOutput / resolveVariant', () => {
  const fams = buildFamilies(MODELS, OVERLAYS)
  const wan = fams.find((f) => f.id === 'Wan 2.7')!

  test('variantsForOutput filters by output kind', () => {
    expect(variantsForOutput(wan, 'video')).toHaveLength(3)
    expect(variantsForOutput(wan, 'image')).toHaveLength(0)
  })

  test('resolveVariant picks text-to-video when no reference', () => {
    expect(resolveVariant(wan, 'video', false)?.category).toBe('text-to-video')
  })

  test('resolveVariant prefers image-to-video with a reference', () => {
    expect(resolveVariant(wan, 'video', true)?.category).toBe('image-to-video')
  })

  test('resolveVariant falls back to any variant of the kind', () => {
    const flux = fams.find((f) => f.id === 'fal-ai/flux-2/flash')!
    expect(resolveVariant(flux, 'image', true)?.category).toBe('text-to-image')
    expect(resolveVariant(flux, 'video', false)).toBeUndefined()
  })
})

describe('searchFamiliesIn', () => {
  const fams = buildFamilies(MODELS, OVERLAYS)

  test('matches label/owner/id/description, restricted to output kind', () => {
    expect(searchFamiliesIn(fams, 'video', 'wan').map((f) => f.id)).toEqual(['Wan 2.7'])
    expect(searchFamiliesIn(fams, 'image', 'wan')).toEqual([])
    expect(searchFamiliesIn(fams, 'image', 'flux').map((f) => f.id)).toEqual([
      'fal-ai/flux-2/flash'
    ])
  })
})

describe('endpointInfoFrom', () => {
  const fams = buildFamilies(MODELS, OVERLAYS)

  test('looks up family + variant by endpoint id', () => {
    const info = endpointInfoFrom(fams, 'fal-ai/wan/v2.7/image-to-video')
    expect(info?.family.id).toBe('Wan 2.7')
    expect(info?.variant.outputKind).toBe('video')
    expect(endpointInfoFrom(fams, 'nope/unknown')).toBeUndefined()
  })
})
