// Pure, dependency-free helpers shared by the catalog generator script
// (scripts/generate-fal-catalog.ts) and the runtime catalog (catalog.ts).

export type OutputKind = 'image' | 'video'
export type InputKind = 'text' | 'image'

export interface CategoryModality {
  input: InputKind
  output: OutputKind
  /** Whether this category takes a reference-image input. */
  acceptsReferenceFiles: boolean
  /** Human label for the task variant, e.g. "Image → Video". */
  subLabel: string
}

/** The only fal categories Impresario can run/render. */
export const CATEGORY_MODALITY: Record<string, CategoryModality> = {
  'text-to-image': {
    input: 'text',
    output: 'image',
    acceptsReferenceFiles: false,
    subLabel: 'Text → Image'
  },
  'image-to-image': {
    input: 'image',
    output: 'image',
    acceptsReferenceFiles: true,
    subLabel: 'Edit'
  },
  'text-to-video': {
    input: 'text',
    output: 'video',
    acceptsReferenceFiles: false,
    subLabel: 'Text → Video'
  },
  'image-to-video': {
    input: 'image',
    output: 'video',
    acceptsReferenceFiles: true,
    subLabel: 'Image → Video'
  },
  'reference-to-video': {
    input: 'image',
    output: 'video',
    acceptsReferenceFiles: true,
    subLabel: 'Reference → Video'
  }
}

/** Shape of a model entry from `https://fal.ai/api/models` (fields we read). */
export interface RawFalModel {
  id?: string
  modelId?: string
  title?: string
  category?: string
  shortDescription?: string
  modelFamily?: string
  deprecated?: boolean
  removed?: boolean
}

/** One bundled catalog endpoint (a single fal model id). */
export interface CatalogModel {
  id: string
  label: string
  outputKind: OutputKind
  category: string
  modelFamily: string
  owner: string
  description: string
}

/**
 * Normalize one raw fal entry into a CatalogModel, or null when it is
 * out of scope (unknown category), deprecated, removed, or has no id.
 */
export function rawEntryToCatalogModel(raw: RawFalModel): CatalogModel | null {
  const id = raw.id ?? raw.modelId
  if (!id) return null
  if (raw.deprecated === true || raw.removed === true) return null
  const category = raw.category ?? ''
  const modality = CATEGORY_MODALITY[category]
  if (!modality) return null
  return {
    id,
    label: raw.title ?? id,
    outputKind: modality.output,
    category,
    modelFamily: raw.modelFamily ?? '',
    owner: id.split('/')[0] ?? '',
    description: raw.shortDescription ?? ''
  }
}
