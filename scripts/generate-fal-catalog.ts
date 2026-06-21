// Fetches fal.ai's image/video model catalog and writes a committed JSON file.
// Run manually before a release: `pnpm catalog:generate`. No network happens at
// app build or runtime — the bundled JSON is the single source of truth.

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CATEGORY_MODALITY,
  rawEntryToCatalogModel,
  type CatalogModel,
  type RawFalModel
} from '../src/shared/falCatalogTransform'

const PAGE_SIZE = 100
const API = 'https://fal.ai/api/models'

interface ApiPage {
  items: RawFalModel[]
  page: number
  pages: number
}

async function fetchCategory(category: string): Promise<RawFalModel[]> {
  const all: RawFalModel[] = []
  let page = 1
  for (;;) {
    const url = `${API}?categories=${encodeURIComponent(category)}&page=${page}&size=${PAGE_SIZE}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`fal catalog fetch failed (${res.status}) for ${url}`)
    const body = (await res.json()) as ApiPage
    all.push(...body.items)
    if (page >= body.pages || body.items.length === 0) break
    page += 1
  }
  return all
}

async function main(): Promise<void> {
  const byId = new Map<string, CatalogModel>()
  for (const category of Object.keys(CATEGORY_MODALITY)) {
    const raw = await fetchCategory(category)
    for (const entry of raw) {
      const model = rawEntryToCatalogModel(entry)
      if (model && !byId.has(model.id)) byId.set(model.id, model)
    }
    console.log(`${category}: ${raw.length} raw`)
  }

  const sorted = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id))
  const outPath = join(
    fileURLToPath(new URL('.', import.meta.url)),
    '..',
    'src',
    'shared',
    'falCatalog.generated.json'
  )
  writeFileSync(outPath, JSON.stringify(sorted, null, 2) + '\n')
  console.log(`Wrote ${sorted.length} models to ${outPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
