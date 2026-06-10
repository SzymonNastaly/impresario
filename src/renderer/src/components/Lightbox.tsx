import { Dialog, DialogContent, DialogTitle } from './ui/dialog'

interface LightboxProps {
  src: string | null
  alt: string
  onClose: () => void
}

/** Full-size image inspection modal. Renders nothing when `src` is null. */
export function Lightbox({ src, alt, onClose }: LightboxProps): React.JSX.Element | null {
  if (!src) return null
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[92vw] border-0 bg-transparent p-0 shadow-none sm:max-w-[92vw]">
        <DialogTitle className="sr-only">{alt || 'Image preview'}</DialogTitle>
        <img
          src={src}
          alt={alt}
          className="mx-auto max-h-[88vh] w-auto max-w-full rounded-lg object-contain"
        />
      </DialogContent>
    </Dialog>
  )
}
