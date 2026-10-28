import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { PencilSimple } from '@phosphor-icons/react'

interface TitleCellProps {
  title: string
  onOpen: () => void
  onRename: (title: string) => void
  subtitle?: string
  disabled?: boolean
}

/** The item's name: click opens the item; the pencil edits it in place. Enter saves, Escape cancels. */
export function TitleCell({ title, onOpen, onRename, subtitle, disabled }: TitleCellProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const commit = () => {
    const next = draft.trim()
    setEditing(false)
    if (next && next !== title) onRename(next)
    else setDraft(title)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commit()
    if (e.key === 'Escape') {
      setDraft(title)
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        aria-label="שם הפריט"
        className="h-8 w-full rounded-sm border border-accent bg-paper px-2 text-sm text-ink"
      />
    )
  }

  return (
    <div className="group flex min-w-0 items-center gap-1">
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 truncate rounded-sm py-1 text-start text-sm text-ink transition-colors duration-150 hover:text-accent"
        title={title}
      >
        {title}
        {subtitle && <span className="ms-2 text-xs text-pencil">{subtitle}</span>}
      </button>
      {!disabled && (
        <button
          type="button"
          onClick={() => {
            setDraft(title)
            setEditing(true)
          }}
          aria-label={`עריכת השם: ${title}`}
          className="pressable shrink-0 rounded-sm p-1 text-pencil opacity-0 hover:bg-paper-2 hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
        >
          <PencilSimple size={14} aria-hidden />
        </button>
      )}
    </div>
  )
}
