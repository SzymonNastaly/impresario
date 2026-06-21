// Runtime model catalog: groups the bundled fal endpoints (falCatalog.generated.json)
// into version-specific families, overlays curated chips onto the known models, and
// resolves the concrete endpoint a generation should run.

import generated from './falCatalog.generated.json'
import {
  CATEGORY_MODALITY,
  type CatalogModel,
  type InputKind,
  type OutputKind
} from './falCatalogTransform'
import {
  DEFAULT_IMAGE_MODELS,
  DEFAULT_VIDEO_MODELS,
  type GenerationType,
  type ModelInfo
} from './types'

export interface Variant {
  endpointId: string
  category: string
  inputKind: InputKind
  outputKind: OutputKind
  subLabel: string
  acceptsReferenceFiles: boolean
  overlay?: ModelInfo
}

export interface Family {
  id: string
  label: string
  owner: string
  outputs: Set<OutputKind>
  variants: Variant[]
}

const CURATED: ModelInfo[] = [...DEFAULT_IMAGE_MODELS, ...DEFAULT_VIDEO_MODELS]

/** Build the family index from catalog models + curated overlays. Pure (testable). */
export function buildFamilies(models: CatalogModel[], overlays: ModelInfo[]): Family[] {
  const overlayById = new Map(overlays.map((o) => [o.id, o]))
  const byFamily = new Map<string, Family>()

  for (const m of models) {
    const modality = CATEGORY_MODALITY[m.category]
    if (!modality) continue
    const familyId = m.modelFamily !== '' ? m.modelFamily : m.id
    const familyLabel = m.modelFamily !== '' ? m.modelFamily : m.label
    let fam = byFamily.get(familyId)
    if (!fam) {
      fam = { id: familyId, label: familyLabel, owner: m.owner, outputs: new Set(), variants: [] }
      byFamily.set(familyId, fam)
    }
    fam.outputs.add(m.outputKind)
    fam.variants.push({
      endpointId: m.id,
      category: m.category,
      inputKind: modality.input,
      outputKind: m.outputKind,
      subLabel: modality.subLabel,
      acceptsReferenceFiles: overlayById.get(m.id)?.acceptsReferenceFiles ?? modality.acceptsReferenceFiles,
      overlay: overlayById.get(m.id)
    })
  }

  for (const fam of byFamily.values()) disambiguateSubLabels(fam)
  return [...byFamily.values()]
}

/**
 * Append an id-tail suffix when two variants in a family share a sub-label.
 * The variant whose endpoint id ends exactly in its category (the canonical
 * one) keeps the plain sub-label; others are suffixed with the extra id
 * segment that distinguishes them (e.g. "turbo").
 */
function disambiguateSubLabels(family: Family): void {
  const counts = new Map<string, number>()
  for (const v of family.variants) counts.set(v.subLabel, (counts.get(v.subLabel) ?? 0) + 1)
  for (const v of family.variants) {
    if ((counts.get(v.subLabel) ?? 0) <= 1) continue
    const tail = v.endpointId.split('/').pop() ?? ''
    if (tail === v.category) continue
    v.subLabel = `${v.subLabel} (${tail})`
  }
}

const ALL_FAMILIES: Family[] = buildFamilies(generated as CatalogModel[], CURATED)
const ENDPOINT_INDEX = new Map<string, { family: Family; variant: Variant }>()
for (const family of ALL_FAMILIES) {
  for (const variant of family.variants) ENDPOINT_INDEX.set(variant.endpointId, { family, variant })
}

export function families(): Family[] {
  return ALL_FAMILIES
}

export function familiesForOutput(kind: GenerationType): Family[] {
  return ALL_FAMILIES.filter((f) => f.outputs.has(kind))
}

export function familyById(id: string): Family | undefined {
  return ALL_FAMILIES.find((f) => f.id === id)
}

export function variantsForOutput(family: Family, kind: GenerationType): Variant[] {
  return family.variants.filter((v) => v.outputKind === kind)
}

/** Search families producing `kind` by label/owner/endpoint id/description. */
export function searchFamiliesIn(source: Family[], kind: GenerationType, query: string): Family[] {
  const q = query.trim().toLowerCase()
  if (q === '') return source.filter((f) => f.outputs.has(kind))
  return source.filter((f) => {
    if (!f.outputs.has(kind)) return false
    if (f.label.toLowerCase().includes(q) || f.owner.toLowerCase().includes(q)) return true
    return f.variants.some(
      (v) =>
        v.endpointId.toLowerCase().includes(q) ||
        (v.overlay?.label ?? '').toLowerCase().includes(q)
    )
  })
}

export function searchFamilies(kind: GenerationType, query: string): Family[] {
  return searchFamiliesIn(ALL_FAMILIES, kind, query)
}

const PREFERRED: Record<string, Record<'ref' | 'noref', string[]>> = {
  image: { noref: ['text-to-image'], ref: ['image-to-image'] },
  video: {
    noref: ['text-to-video'],
    ref: ['image-to-video', 'reference-to-video']
  }
}

export function resolveVariant(
  family: Family,
  kind: GenerationType,
  hasReference: boolean
): Variant | undefined {
  const order = PREFERRED[kind][hasReference ? 'ref' : 'noref']
  for (const category of order) {
    const match = family.variants.find((v) => v.category === category)
    if (match) return match
  }
  return family.variants.find((v) => v.outputKind === kind)
}

export function endpointInfoFrom(
  source: Family[],
  endpointId: string
): { family: Family; variant: Variant } | undefined {
  for (const family of source) {
    const variant = family.variants.find((v) => v.endpointId === endpointId)
    if (variant) return { family, variant }
  }
  return undefined
}

export function endpointInfo(
  endpointId: string
): { family: Family; variant: Variant } | undefined {
  return ENDPOINT_INDEX.get(endpointId)
}

/** Output kind of an endpoint id; defaults to image for unknown ids. */
export function modelKind(endpointId: string): GenerationType {
  return ENDPOINT_INDEX.get(endpointId)?.variant.outputKind ?? 'image'
}

/** Curated overlay metadata for an endpoint id, if any. */
export function modelInfo(endpointId: string): ModelInfo | undefined {
  return ENDPOINT_INDEX.get(endpointId)?.variant.overlay
}

/** Whether an endpoint accepts reference-file inputs; false for unknown ids. */
export function acceptsReferenceFiles(endpointId: string): boolean {
  return ENDPOINT_INDEX.get(endpointId)?.variant.acceptsReferenceFiles ?? false
}

/** Family ids of the curated default models — the initial favorites seed. */
export function defaultFavoriteFamilyIds(): string[] {
  const ids = new Set<string>()
  for (const m of CURATED) {
    const info = ENDPOINT_INDEX.get(m.id)
    ids.add(info ? info.family.id : m.id)
  }
  return [...ids]
}
