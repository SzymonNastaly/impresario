import { useMemo, useRef, useState } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import { PanelLeft, Plus, Settings } from 'lucide-react'
import {
  DEFAULT_IMAGE_MODEL,
  type GenerateImageRequest,
  type GenerateVideoRequest,
  type ReferenceFileInput,
  type Template
} from '@shared/types'
import { modelKind } from '@shared/catalog'
import { generationsCollection } from './lib/generations'
import { conversationsCollection } from './lib/conversations'
import { templatesCollection } from './lib/templates'
import { conversationTurns } from './lib/turns'
import { acceptsReferenceFiles } from './lib/modelSelector'
import { Sidebar } from './components/Sidebar'
import { ModelSelector } from './components/ModelSelector'
import { ReferenceFiles } from './components/ReferenceFiles'
import { TemplateSelector } from './components/TemplateSelector'
import { TextBox } from './components/TextBox'
import { OutputFeed } from './components/OutputFeed'
import { SettingsModal } from './components/SettingsModal'
import { TemplateEditorModal } from './components/TemplateEditorModal'
import { Button } from './components/ui/button'
import { useKeyStatus } from './hooks/useKeyStatus'

/** Read each File into a structured-clone-safe payload for the IPC bridge. */
async function toReferenceInputs(files: File[]): Promise<ReferenceFileInput[]> {
  return Promise.all(
    files.map(async (f) => ({
      bytes: await f.arrayBuffer(),
      contentType: f.type || 'application/octet-stream'
    }))
  )
}

function App(): React.JSX.Element {
  const { data: genData } = useLiveQuery((q) => q.from({ gen: generationsCollection }))
  const generations = useMemo(() => [...(genData ?? [])], [genData])

  const { data: convData } = useLiveQuery((q) => q.from({ conv: conversationsCollection }))
  const conversations = useMemo(
    () => [...(convData ?? [])].sort((a, b) => b.updatedAt - a.updatedAt),
    [convData]
  )

  const { data: templateData } = useLiveQuery((q) => q.from({ tpl: templatesCollection }))
  const templates = useMemo(
    () => [...(templateData ?? [])].sort((a, b) => b.createdAt - a.createdAt),
    [templateData]
  )

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState<string>(DEFAULT_IMAGE_MODEL)
  const [params, setParams] = useState<{ numberOfImages?: number; size?: string }>({})
  const [referenceFiles, setReferenceFiles] = useState<File[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { status, refresh } = useKeyStatus()
  const hasKey = status?.hasKey ?? false
  const kind = modelKind(model)
  const turns = useMemo(
    () => conversationTurns(generations, activeConversationId),
    [generations, activeConversationId]
  )

  function newChat(): void {
    setActiveConversationId(null)
    setPrompt('')
    setParams({})
    setReferenceFiles([])
    setSidebarOpen(false)
    textareaRef.current?.focus()
  }

  function changeModel(id: string): void {
    setModel(id)
    if (!acceptsReferenceFiles(id)) setReferenceFiles([])
  }

  function applyTemplate(tpl: Template): void {
    setPrompt(tpl.config.prompt)
    setModel(tpl.config.model)
    setParams(tpl.config.params)
    if (!acceptsReferenceFiles(tpl.config.model)) setReferenceFiles([])
  }

  async function submit(): Promise<void> {
    if (!hasKey) {
      setSettingsOpen(true)
      return
    }
    const text = prompt.trim()
    if (!text) return

    const referenceInputs = acceptsReferenceFiles(model)
      ? await toReferenceInputs(referenceFiles)
      : []
    setPrompt('')
    setReferenceFiles([])

    const base = {
      prompt: text,
      model,
      conversationId: activeConversationId ?? undefined,
      ...(referenceInputs.length ? { referenceFiles: referenceInputs } : {})
    }
    const { conversationId } =
      kind === 'video'
        ? await window.api.generateVideo(base as GenerateVideoRequest)
        : await window.api.generateImage({ ...base, ...params } as GenerateImageRequest)
    setActiveConversationId(conversationId)
  }

  async function handleDeleteConversation(id: string): Promise<void> {
    await window.api.conversations.delete(id)
    if (activeConversationId === id) setActiveConversationId(null)
  }

  function handleRenameConversation(id: string, title: string): void {
    void window.api.conversations.rename(id, title)
  }

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <Button variant="ghost" size="sm" onClick={() => setSidebarOpen((v) => !v)}>
          <PanelLeft />
          Chats
        </Button>
        <Button variant="ghost" size="sm" onClick={newChat}>
          <Plus />
          New chat
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings />
          Settings
        </Button>
      </div>

      {status && !hasKey && (
        <div className="flex items-center justify-between gap-3 border-b border-border bg-secondary px-7 py-2.5 text-sm text-secondary-foreground">
          <span>Add your fal.ai API key to start generating.</span>
          <Button size="sm" onClick={() => setSettingsOpen(true)}>
            Add key
          </Button>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-[320px_1fr] gap-px bg-border">
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto bg-background p-4">
          <ModelSelector model={model} onModelChange={changeModel} />
          <ReferenceFiles
            model={model}
            files={referenceFiles}
            onAdd={(added) => setReferenceFiles((prev) => [...prev, ...added])}
            onRemove={(i) => setReferenceFiles((prev) => prev.filter((_, idx) => idx !== i))}
          />
        </div>

        <div className="flex min-h-0 flex-col gap-3 bg-background p-4">
          <TemplateSelector
            templates={templates}
            onApply={applyTemplate}
            onManage={() => setTemplatesOpen(true)}
          />
          <TextBox
            kind={kind}
            prompt={prompt}
            canSubmit={prompt.trim().length > 0}
            onPromptChange={setPrompt}
            onSubmit={() => void submit()}
            textareaRef={textareaRef}
          />
          <OutputFeed turns={turns} />
        </div>
      </div>

      {sidebarOpen && (
        <>
          <div
            className="absolute inset-0 z-10 bg-black/30"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 z-20">
            <Sidebar
              conversations={conversations}
              activeId={activeConversationId}
              onSelect={(id) => {
                setActiveConversationId(id)
                setSidebarOpen(false)
              }}
              onDelete={(id) => void handleDeleteConversation(id)}
              onRename={handleRenameConversation}
            />
          </div>
        </>
      )}

      <SettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        status={status}
        onChanged={refresh}
      />
      <TemplateEditorModal
        open={templatesOpen}
        onOpenChange={setTemplatesOpen}
        templates={templates}
      />
    </div>
  )
}

export default App
