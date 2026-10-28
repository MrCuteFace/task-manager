import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type TextareaHTMLAttributes } from 'react'
import type { User } from '../../api/types'
import { Avatar } from '../../components/ui/Avatar'
import { Popover } from '../../components/ui/Popover'
import { findActiveMention, matchMentionQuery } from './mentions'

interface MentionTextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'onKeyDown'> {
  value: string
  onChange: (value: string) => void
  users: User[]
  /** Called on Enter without Shift when no mention list is open. */
  onSubmit?: () => void
}

/**
 * A textarea where typing "@" opens the list of people whose name starts with what follows.
 * Arrow keys move, Enter or Tab inserts "@Full Name ", Escape closes.
 */
export function MentionTextarea({ value, onChange, users, onSubmit, ...rest }: MentionTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [caret, setCaret] = useState(0)
  const [active, setActive] = useState(0)
  const [dismissedAt, setDismissedAt] = useState<number | null>(null)

  const mention = useMemo(() => findActiveMention(value, caret), [value, caret])
  // A completed name followed by a space is no longer a query.
  const completed = mention !== null && /\s$/.test(mention.query) && users.some((u) => u.fullName === mention.query.trim())
  const open = mention !== null && dismissedAt !== mention.start && !completed
  const options = useMemo(() => (mention ? matchMentionQuery(users, mention.query) : []), [mention, users])

  useEffect(() => setActive(0), [mention?.query])

  const syncCaret = () => setCaret(ref.current?.selectionStart ?? 0)

  const insert = (user: User) => {
    if (!mention) return
    const before = value.slice(0, mention.start)
    const after = value.slice(caret)
    const inserted = `@${user.fullName} `
    const next = `${before}${inserted}${after}`
    onChange(next)
    setDismissedAt(mention.start)
    const position = before.length + inserted.length
    requestAnimationFrame(() => {
      const el = ref.current
      if (!el) return
      el.focus()
      el.setSelectionRange(position, position)
      setCaret(position)
    })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (open && options.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActive((a) => (a + 1) % options.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((a) => (a - 1 + options.length) % options.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        insert(options[active])
        return
      }
    }
    if (open && e.key === 'Escape') {
      e.preventDefault()
      setDismissedAt(mention?.start ?? null)
      return
    }
    if (e.key === 'Enter' && !e.shiftKey && onSubmit) {
      e.preventDefault()
      onSubmit()
    }
  }

  return (
    <>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setCaret(e.target.selectionStart)
          setDismissedAt(null)
        }}
        onKeyDown={onKeyDown}
        onKeyUp={syncCaret}
        onClick={syncCaret}
        onSelect={syncCaret}
        aria-autocomplete="list"
        aria-expanded={open && options.length > 0}
        {...rest}
      />
      <Popover anchorRef={ref} open={open && options.length > 0} onClose={() => setDismissedAt(mention?.start ?? null)} label="תיוג משתמש" width={240}>
        <ul role="listbox" aria-label="אנשים" className="flex flex-col gap-0.5">
          {options.map((u, i) => (
            <li key={u.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insert(u)}
                onMouseEnter={() => setActive(i)}
                className={`pressable flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-start ${i === active ? 'bg-accent-soft' : 'hover:bg-paper-2'}`}
              >
                <Avatar name={u.fullName} src={u.avatarUrl} size={22} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm text-ink">{u.fullName}</span>
                  <span className="truncate text-xs text-ink-2">{u.title}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Popover>
    </>
  )
}
