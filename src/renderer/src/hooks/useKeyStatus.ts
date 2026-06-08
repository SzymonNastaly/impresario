import { useCallback, useEffect, useState } from 'react'
import type { KeyStatus } from '@shared/types'

/** Tracks BYOK key status from the main process. */
export function useKeyStatus(): { status: KeyStatus | null; refresh: () => Promise<void> } {
  const [status, setStatus] = useState<KeyStatus | null>(null)

  const refresh = useCallback(async () => {
    setStatus(await window.api.settings.getKeyStatus())
  }, [])

  useEffect(() => {
    // Initial load from the main process (external system) on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
  }, [refresh])

  return { status, refresh }
}
