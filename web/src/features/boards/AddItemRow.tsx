import { useState, type KeyboardEvent } from 'react'
import { Plus } from '@phosphor-icons/react'

interface AddItemRowProps {
  groupName: string
  onAdd: (title: string) => Promise<unknown>
  inputId?: string
  className?: string
}

/** The empty ruled line under a group: type a title, press Enter, the row is added. */
export function AddItemRow({ groupName, onAdd, inputId, className = '' }: AddItemRowProps) {
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    const next = title.trim()
    if (!next || busy) return
    setBusy(true)
    setError(null)
    try {
      await onAdd(next)
      setTitle('')
    } catch {
      setError('הפריט לא נוסף. נסו שוב.')
    } finally {
      setBusy(false)
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') void submit()
    if (e.key === 'Escape') setTitle('')
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Plus size={14} className="shrink-0 text-pencil" aria-hidden />
      <input
        id={inputId}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => void submit()}
        disabled={busy}
        placeholder={`הוספת פריט ל${groupName}`}
        aria-label={`הוספת פריט לקבוצה ${groupName}`}
        className="h-8 min-w-0 flex-1 rounded-sm border border-transparent bg-transparent px-1 text-sm text-ink placeholder:text-pencil hover:border-rule focus:border-accent"
      />
      {error && (
        <span role="alert" className="text-xs text-stuck">
          {error}
        </span>
      )}
    </div>
  )
}
