import { useEffect, useRef, useState } from 'react'
import type { Generation } from '@shared/types'
import { GenerationTurn } from './GenerationTurn'
import { Lightbox } from './Lightbox'

interface OutputFeedProps {
  turns: Generation[]
}

export function OutputFeed({ turns }: OutputFeedProps): React.JSX.Element {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Scroll to the newest turn whenever one is appended.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [turns.length])

  if (turns.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
        <h2 className="font-heading text-lg font-semibold text-foreground">Impresario Studio</h2>
        <p>Describe an image or video and press Generate.</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto">
      {turns.map((gen) => (
        <GenerationTurn key={gen.id} generation={gen} onOpenLightbox={setLightboxSrc} />
      ))}
      <div ref={bottomRef} />
      <Lightbox src={lightboxSrc} alt="" onClose={() => setLightboxSrc(null)} />
    </div>
  )
}
