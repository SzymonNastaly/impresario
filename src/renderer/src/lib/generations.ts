import { createCollection } from '@tanstack/react-db'
import type { Generation } from '@shared/types'

// SQLite (in the main process) is the source of truth. This TanStack DB
// collection is a reactive mirror: it loads via IPC and re-syncs whenever the
// main process broadcasts a change. Mutations are performed through
// `window.api` (see actions.ts), not through collection mutation handlers.
export const generationsCollection = createCollection<Generation, string>({
  id: 'generations',
  getKey: (gen) => gen.id,
  sync: {
    sync: ({ begin, write, commit, markReady }) => {
      // Last-known snapshot, used to diff fetched state into sync messages.
      const snapshot = new Map<string, Generation>()

      const apply = (items: Generation[]): void => {
        const nextIds = new Set(items.map((i) => i.id))
        begin()
        for (const item of items) {
          const prev = snapshot.get(item.id)
          if (!prev) {
            write({ type: 'insert', value: item })
          } else if (prev.updatedAt !== item.updatedAt) {
            write({ type: 'update', value: item })
          }
        }
        for (const [id, prev] of snapshot) {
          if (!nextIds.has(id)) write({ type: 'delete', value: prev })
        }
        commit()
        snapshot.clear()
        for (const item of items) snapshot.set(item.id, item)
      }

      // Coalesce overlapping refreshes: only the most recent fetch is applied.
      let seq = 0
      const refresh = async (): Promise<void> => {
        const mySeq = ++seq
        const items = await window.api.generations.getAll()
        if (mySeq === seq) apply(items)
      }

      // Subscribe before the initial fetch so no change is missed.
      const unsubscribe = window.api.generations.onChanged(() => {
        void refresh()
      })

      refresh().finally(() => markReady())

      return () => unsubscribe()
    }
  }
})
