import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Plus } from '@phosphor-icons/react'
import { Button } from '../../components/ui/Button'

interface AddGroupRowProps {
  onAdd: (name: string) => Promise<unknown>
}

/** The line under the last group: stamp a new section onto the sheet. */
export function AddGroupRow({ onAdd }: AddGroupRowProps) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const submit = async () => {
    const next = name.trim()
    if (!next || busy) return
    setBusy(true)
    setError(null)
    try {
      await onAdd(next)
      setName('')
      setEditing(false)
    } catch {
      setError('הקבוצה לא נוספה. נסו שוב.')
    } finally {
      setBusy(false)
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') void submit()
    if (e.key === 'Escape') {
      setName('')
      setEditing(false)
    }
  }

  if (!editing) {
    return (
      <div className="mt-5 px-3">
        <Button variant="ghost" size="sm" icon={<Plus size={14} weight="bold" aria-hidden />} onClick={() => setEditing(true)}>
          קבוצה חדשה
        </Button>
      </div>
    )
  }

  return (
    <div className="mt-5 flex flex-wrap items-center gap-2 border-b border-rule-strong px-3 pb-1.5">
      <input
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={busy}
        placeholder="שם הקבוצה, למשל מסיבת ראש השנה"
        aria-label="שם הקבוצה החדשה"
        className="stamp h-8 min-w-[240px] flex-1 rounded-sm border border-accent bg-paper px-2 text-base leading-none text-ink placeholder:font-normal placeholder:text-pencil"
        style={{ fontStretch: name ? '75%' : '100%' }}
      />
      <Button variant="primary" size="sm" onClick={() => void submit()} disabled={busy || !name.trim()}>
        הוספה
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setName('')
          setEditing(false)
        }}
      >
        ביטול
      </Button>
      {error && (
        <span role="alert" className="text-xs text-stuck">
          {error}
        </span>
      )}
    </div>
  )
}
