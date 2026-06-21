import type { Collection } from '@tanstack/react-db'
import type { Template } from '@shared/types'
import { createSyncedCollection } from './syncedCollection'

// Reactive mirror of the main-process templates store.
export const templatesCollection: Collection<Template, string> = createSyncedCollection<Template>({
  id: 'templates',
  getKey: (tpl) => tpl.id,
  getAll: () => window.api.templates.getAll(),
  onChanged: (cb) => window.api.templates.onChanged(cb),
  getUpdatedAt: (tpl) => tpl.updatedAt
})
