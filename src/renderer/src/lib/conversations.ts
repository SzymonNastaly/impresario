import type { Collection } from '@tanstack/react-db'
import type { Conversation } from '@shared/types'
import { createSyncedCollection } from './syncedCollection'

// Reactive mirror of the main-process conversations store. Mutations go
// through `window.api`, not through collection mutation handlers.
export const conversationsCollection: Collection<Conversation, string> = createSyncedCollection<Conversation>({
  id: 'conversations',
  getKey: (conv) => conv.id,
  getAll: () => window.api.conversations.getAll(),
  onChanged: (cb) => window.api.conversations.onChanged(cb),
  getUpdatedAt: (conv) => conv.updatedAt
})
