import type { Collection } from '@tanstack/react-db'
import type { Generation } from '@shared/types'
import { createSyncedCollection } from './syncedCollection'

// Reactive mirror of the main-process generations store. Mutations go
// through `window.api`, not through collection mutation handlers.
export const generationsCollection: Collection<Generation, string> = createSyncedCollection<Generation>({
  id: 'generations',
  getKey: (gen) => gen.id,
  getAll: () => window.api.generations.getAll(),
  onChanged: (cb) => window.api.generations.onChanged(cb),
  getUpdatedAt: (gen) => gen.updatedAt
})
