import { useEffect, useMemo, useRef, useState } from 'react'
import { Upload, X } from 'lucide-react'
import { acceptsReferenceFiles } from '../lib/modelSelector'
import { cn } from '../lib/utils'
import { Button } from './ui/button'

interface ReferenceFilesProps {
  model: string
  files: File[]
  onAdd: (files: File[]) => void
  onRemove: (index: number) => void
}

export function ReferenceFiles({
  model,
  files,
  onAdd,
  onRemove
}: ReferenceFilesProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  // Object URLs for thumbnails; revoke on change/unmount to avoid leaks.
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files])
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews])

  if (!acceptsReferenceFiles(model)) {
    return (
      <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-[13px] text-muted-foreground">
        This model doesn’t accept reference files.
      </div>
    )
  }

  function handleFiles(list: FileList | null): void {
    if (!list || list.length === 0) return
    onAdd(Array.from(list))
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          handleFiles(e.dataTransfer.files)
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-dashed px-3 py-6 text-center text-[13px] transition-colors',
          dragging ? 'border-ring bg-accent/40' : 'border-border text-muted-foreground'
        )}
      >
        <Upload className="size-5" />
        <span>Drag &amp; drop or click to add reference files</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files)
          e.target.value = ''
        }}
      />
      {files.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {files.map((file, i) => (
            <div
              key={`${file.name}-${i}`}
              className="group relative overflow-hidden rounded-md border border-border bg-muted"
            >
              {previews[i] && (
                <img
                  src={previews[i]}
                  alt={file.name}
                  className="block aspect-square w-full object-cover"
                />
              )}
              <Button
                variant="secondary"
                size="icon-xs"
                title="Remove"
                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100"
                onClick={() => onRemove(i)}
              >
                <X />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
