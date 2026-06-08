// Pure, dependency-free helpers for the template file format. No Electron,
// fs, or db imports here so they can run in any process (and be unit-tested
// later). The on-disk format is a self-describing, versioned envelope.
import type { Template, TemplateCreate, TemplateConfig, TemplateKind } from './types'

export interface TemplateFile {
  schemaVersion: 1
  kind: TemplateKind
  name: string
  config: TemplateConfig
}

const KNOWN_KINDS: readonly TemplateKind[] = ['single-prompt']

/** Strip id/timestamps; produce the on-disk representation. */
export function serializeTemplate(t: Template): TemplateFile {
  return { schemaVersion: 1, kind: t.kind, name: t.name, config: t.config }
}

/**
 * Validate untrusted JSON into a TemplateCreate. Throws a descriptive Error
 * on anything malformed. Never returns an id — import always creates fresh.
 */
export function parseTemplateFile(raw: unknown): TemplateCreate {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Invalid template file: expected a JSON object.')
  }
  const obj = raw as Record<string, unknown>
  if (obj.schemaVersion !== 1) {
    throw new Error('Unsupported template file version.')
  }
  const kind = obj.kind
  if (typeof kind !== 'string' || !KNOWN_KINDS.includes(kind as TemplateKind)) {
    throw new Error(`Unsupported template kind: ${String(kind)}.`)
  }
  const name =
    typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim() : 'Imported template'
  // Only 'single-prompt' exists today, so config parsing isn't yet keyed on
  // kind. When a second kind is added, branch here on `kind`.
  const config = parseConfig(obj.config)
  return { name, kind: kind as TemplateKind, config }
}

function parseConfig(raw: unknown): TemplateConfig {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Invalid template file: missing config.')
  }
  const c = raw as Record<string, unknown>
  if (typeof c.prompt !== 'string' || !c.prompt.trim()) {
    throw new Error('Invalid template file: prompt is required.')
  }
  if (typeof c.model !== 'string' || !c.model.trim()) {
    throw new Error('Invalid template file: model is required.')
  }
  const rawParams =
    typeof c.params === 'object' && c.params !== null ? (c.params as Record<string, unknown>) : {}
  return {
    prompt: c.prompt,
    model: c.model,
    params: {
      ...(typeof rawParams.numberOfImages === 'number'
        ? { numberOfImages: rawParams.numberOfImages }
        : {}),
      ...(typeof rawParams.size === 'string' ? { size: rawParams.size } : {})
    }
  }
}
