import { useState } from 'react'
import type { KeyStatus } from '@shared/types'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './ui/dialog'
import { Input } from './ui/input'
import { Label } from './ui/label'

interface SettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  status: KeyStatus | null
  onChanged: () => Promise<void>
}

export function SettingsModal({
  open,
  onOpenChange,
  status,
  onChanged
}: SettingsModalProps): React.JSX.Element {
  const [key, setKey] = useState('')
  const [saving, setSaving] = useState(false)

  async function save(): Promise<void> {
    if (!key.trim()) return
    setSaving(true)
    try {
      await window.api.settings.setKey(key.trim())
      await onChanged()
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  async function clear(): Promise<void> {
    await window.api.settings.clearKey()
    await onChanged()
    setKey('')
  }

  const encryptionUnavailable = status && !status.encryptionAvailable

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>fal.ai API key</DialogTitle>
          <DialogDescription>
            Bring your own key. It is encrypted with your OS keychain and stored only on this
            device. Create one at{' '}
            <a
              className="text-foreground underline underline-offset-4"
              href="https://fal.ai/dashboard/keys"
              target="_blank"
              rel="noreferrer"
            >
              fal.ai/dashboard/keys
            </a>
            .
          </DialogDescription>
        </DialogHeader>

        <div className="text-xs text-muted-foreground">
          {status?.hasKey ? '✓ A key is currently stored.' : 'No key stored yet.'}
        </div>

        {encryptionUnavailable && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3.5 py-3 text-sm text-destructive">
            OS encryption is unavailable, so the key cannot be stored securely.
          </div>
        )}

        <div className="grid gap-2">
          <Label htmlFor="fal-key">API key</Label>
          <Input
            id="fal-key"
            type="password"
            placeholder="fal_…"
            value={key}
            autoFocus
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save()
            }}
          />
        </div>

        <DialogFooter>
          {status?.hasKey && (
            <Button variant="outline" onClick={() => void clear()}>
              Remove key
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={saving || !key.trim()} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
