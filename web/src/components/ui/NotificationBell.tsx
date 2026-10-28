import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCircle, Clock, WarningCircle, At } from '@phosphor-icons/react'
import { useNotifications } from '../../api/hooks'
import type { AppNotification, NotificationKind } from '../../api/types'
import { useSession } from '../../context/session'

/**
 * Which notifications this person has already seen.
 *
 * Read state lives in the browser on purpose: the feed is derived fresh from the data on every
 * request, and the demo server reseeds on every restart, so a server-side read-set would be wiped
 * while the notifications it referred to came straight back. Keyed by user so two demo logins in
 * the same browser do not inherit each other's read marks.
 */
function readKey(userId: string) {
  return `tm-demo-notifications-read:${userId}`
}

function loadRead(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(readKey(userId))
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    // Private mode, blocked storage, or corrupt JSON: treat everything as unread rather than crash.
    return new Set()
  }
}

function saveRead(userId: string, ids: Set<string>) {
  try {
    localStorage.setItem(readKey(userId), JSON.stringify([...ids]))
  } catch {
    // Nothing to do; the badge just will not remember across reloads.
  }
}

const KIND_ICON: Record<NotificationKind, typeof Bell> = {
  overdue: WarningCircle,
  stuck: WarningCircle,
  'due-soon': Clock,
  mention: At,
}

/** Attention colors come from the status law: stuck red, in-progress amber for what is due. */
const KIND_TONE: Record<NotificationKind, string> = {
  overdue: 'text-stuck',
  stuck: 'text-stuck',
  'due-soon': 'text-progress-chart',
  mention: 'text-accent',
}

export function NotificationBell() {
  const navigate = useNavigate()
  const user = useSession((s) => s.user)
  const notifications = useNotifications()
  const [open, setOpen] = useState(false)
  // Read once on mount. AppShell keys this component by user id, so signing in as somebody else
  // remounts it with that person's marks rather than inheriting the previous user's.
  const [read, setRead] = useState<Set<string>>(() => (user ? loadRead(user.id) : new Set()))
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const items = notifications.data ?? []
  const unread = items.filter((n) => !read.has(n.id))

  const markAll = () => {
    if (!user) return
    const next = new Set(items.map((n) => n.id))
    setRead(next)
    saveRead(user.id, next)
  }

  const open_ = (n: AppNotification) => {
    if (user) {
      const next = new Set(read).add(n.id)
      setRead(next)
      saveRead(user.id, next)
    }
    setOpen(false)
    if (n.boardId) navigate(n.itemId ? `/boards/${n.boardId}?item=${n.itemId}` : `/boards/${n.boardId}`)
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="pressable relative rounded-sm p-1.5 text-ink-2 transition-colors hover:bg-paper-3 hover:text-ink"
        aria-label={unread.length ? `התראות, ${unread.length} חדשות` : 'התראות'}
        aria-expanded={open}
        title="התראות"
      >
        <Bell size={18} aria-hidden />
        {unread.length > 0 && (
          <span
            aria-hidden
            className="absolute -top-0.5 end-0 me-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-stuck px-1 text-[0.6rem] font-semibold text-paper"
          >
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div className="popover-enter absolute end-0 top-full z-50 mt-1.5 w-80 max-w-[90vw] overflow-hidden rounded-md border border-rule bg-paper shadow-(--shadow-popover)">
          <header className="flex items-center justify-between border-b border-rule px-3 py-2">
            <h2 className="stamp text-sm">התראות</h2>
            {unread.length > 0 && (
              <button type="button" onClick={markAll} className="text-xs text-accent hover:underline">
                סימון הכול כנקרא
              </button>
            )}
          </header>

          <div className="max-h-[60vh] overflow-y-auto">
            {notifications.isPending && <p className="px-3 py-4 text-sm text-pencil">טוען…</p>}
            {notifications.data && items.length === 0 && (
              <p className="flex items-center gap-2 px-3 py-5 text-sm text-pencil">
                <CheckCircle size={16} aria-hidden className="text-done" />
                אין התראות. הכול מעודכן.
              </p>
            )}
            <ul className="ruled">
              {items.map((n) => {
                const Icon = KIND_ICON[n.kind]
                const isRead = read.has(n.id)
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => open_(n)}
                      className={`flex w-full items-start gap-2.5 px-3 py-2.5 text-start hover:bg-paper-2 ${
                        isRead ? '' : 'bg-accent-soft/40'
                      }`}
                    >
                      <Icon size={16} aria-hidden className={`mt-0.5 shrink-0 ${KIND_TONE[n.kind]}`} />
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-sm ${isRead ? 'text-ink-2' : 'font-semibold text-ink'}`}>
                          {n.title}
                        </span>
                        <span className="block truncate text-xs text-pencil">{n.detail}</span>
                      </span>
                      {!isRead && <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
