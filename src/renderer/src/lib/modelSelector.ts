import type { ModelInfo } from '@shared/types'
import { acceptsReferenceFiles } from '@shared/catalog'

const SPEED_LABEL: Record<ModelInfo['speed'], string> = {
  fast: 'Fast',
  medium: 'Medium',
  slow: 'Slow'
}

/** Human hint like "Fast · $$" from a curated model's speed + cost. */
export function speedCostLabel(info: ModelInfo): string {
  return `${SPEED_LABEL[info.speed]} · ${'$'.repeat(info.cost)}`
}

/** Re-exported so renderer components have one import site for ref gating. */
export { acceptsReferenceFiles }
