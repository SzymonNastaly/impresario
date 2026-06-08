import { useMemo, useState } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import type { GenerateImageRequest } from '@shared/types'
import { generationsCollection } from './lib/generations'
import { Sidebar } from './components/Sidebar'
import { ResultView } from './components/ResultView'
import { PromptBar } from './components/PromptBar'
import { SettingsModal } from './components/SettingsModal'
import { Button } from './components/ui/button'
import { useKeyStatus } from './hooks/useKeyStatus'

function App(): React.JSX.Element {
  const { data } = useLiveQuery((q) => q.from({ gen: generationsCollection }))
  const generations = useMemo(
    () => [...(data ?? [])].sort((a, b) => b.createdAt - a.createdAt),
    [data]
  )

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { status, refresh } = useKeyStatus()

  // Derived selection: fall back to the newest generation when nothing (or a
  // since-deleted item) is chosen — no effect needed.
  const activeId = generations.some((g) => g.id === selectedId)
    ? selectedId
    : (generations[0]?.id ?? null)
  const selected = generations.find((g) => g.id === activeId) ?? null
  const hasKey = status?.hasKey ?? false

  async function handleGenerate(req: GenerateImageRequest): Promise<void> {
    const { id } = await window.api.generateImage(req)
    setSelectedId(id)
  }

  async function handleDelete(id: string): Promise<void> {
    await window.api.generations.delete(id)
    if (selectedId === id) setSelectedId(null)
  }

  return (
    <div className="grid h-full grid-cols-[264px_1fr]">
      <Sidebar
        generations={generations}
        selectedId={activeId}
        onSelect={setSelectedId}
        onDelete={handleDelete}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className="flex min-h-0 min-w-0 flex-col">
        {status && !hasKey && (
          <div className="flex items-center justify-between gap-3 border-b border-border bg-secondary px-7 py-2.5 text-sm text-secondary-foreground">
            <span>Add your fal.ai API key to start generating.</span>
            <Button size="sm" onClick={() => setSettingsOpen(true)}>
              Add key
            </Button>
          </div>
        )}

        <ResultView generation={selected} />

        <PromptBar
          hasKey={hasKey}
          onGenerate={handleGenerate}
          onNeedKey={() => setSettingsOpen(true)}
        />
      </main>

      <SettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        status={status}
        onChanged={refresh}
      />
    </div>
  )
}

export default App
