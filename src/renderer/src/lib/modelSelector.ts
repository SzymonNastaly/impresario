import { ALL_MODELS, modelInfo, type GenerationType, type ModelInfo } from '@shared/types'

const SPEED_LABEL: Record<ModelInfo['speed'], string> = {
  fast: 'Fast',
  medium: 'Medium',
  slow: 'Slow'
}

/** Models of a given kind, in registry order. */
export function modelsForKind(kind: GenerationType): ModelInfo[] {
  return ALL_MODELS.filter((m) => m.kind === kind)
}

/** Human hint like "Fast · $$" from a model's speed + cost. */
export function speedCostLabel(info: ModelInfo): string {
  return `${SPEED_LABEL[info.speed]} · ${'$'.repeat(info.cost)}`
}

/** Whether a model id accepts reference-file inputs (gates the UI). */
export function acceptsReferenceFiles(model: string): boolean {
  return modelInfo(model)?.acceptsReferenceFiles ?? false
}
