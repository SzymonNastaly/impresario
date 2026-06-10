import { createCollection, type Collection } from '@tanstack/react-db'

// Generic "reactive mirror" over an IPC-backed store. SQLite in the main
// process is the source of truth; this loads via `getAll` and re-syncs
// whenever the main process broadcasts a change via `onChanged`.
interface SyncedCollectionOptions<T> {
  id: string
  getKey: (item: T) => string
  getAll: () => Promise<T[]>
  onChanged: (cb: () => void) => () => void
  getUpdatedAt: (item: T) => number
}

export function createSyncedCollection<T extends object>(
  opts: SyncedCollectionOptions<T>
): Collection<T, string> {
  return createCollection<T, string>({
    id: opts.id,
    getKey: opts.getKey,
    sync: {
      sync: ({ begin, write, commit, markReady }) => {
        // Last-known snapshot, used to diff fetched state into sync messages.
        const snapshot = new Map<string, T>()

        const apply = (items: T[]): void => {
          const nextIds = new Set(items.map((i) => opts.getKey(i)))
          begin()
          for (const item of items) {
            const key = opts.getKey(item)
            const prev = snapshot.get(key)
            if (!prev) {
              write({ type: 'insert', value: item })
            } else if (opts.getUpdatedAt(prev) !== opts.getUpdatedAt(item)) {
              write({ type: 'update', value: item })
            }
          }
          for (const [key, prev] of snapshot) {
            if (!nextIds.has(key)) write({ type: 'delete', value: prev })
          }
          commit()
          snapshot.clear()
          for (const item of items) snapshot.set(opts.getKey(item), item)
        }

        // Coalesce overlapping refreshes: only the most recent fetch applies.
        let seq = 0
        const refresh = async (): Promise<void> => {
          const mySeq = ++seq
          const items = await opts.getAll()
          if (mySeq === seq) apply(items)
        }

        // Subscribe before the initial fetch so no change is missed.
        const unsubscribe = opts.onChanged(() => {
          void refresh()
        })

        refresh().finally(() => markReady())

        return () => unsubscribe()
      }
    }
  })
}
