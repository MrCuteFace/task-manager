import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Kanban, ListChecks, MagnifyingGlass, X } from '@phosphor-icons/react'
import { useSearch } from '../../api/hooks'
import type { SearchHit } from '../../api/types'
import { Avatar } from './Avatar'

const KIND_LABEL: Record<SearchHit['kind'], string> = {
  board: 'לוחות',
  item: 'משימות',
  person: 'אנשים',
}

/** Debounce so a fast typist sends one request, not one per keystroke. */
function useDebounced(value: string, ms: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return debounced
}

/**
 * The top bar's search across boards, items and people.
 *
 * Results come from the server, which filters them through the org tree — the same rule the boards
 * themselves obey — so this can never surface something the viewer is not allowed to see.
 * Keyboard: `/` or Ctrl/Cmd+K focuses it, arrows move, Enter opens, Escape closes.
 */
export function SearchBox() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const debounced = useDebounced(query, 220)
  const results = useSearch(debounced)

  const hits = useMemo(() => {
    const data = results.data
    if (!data) return []
    return [...data.boards, ...data.items, ...data.people]
  }, [results.data])

  /*
    Clamped during render rather than reset from an effect: when a new result set arrives and is
    shorter than the last, the old index would point past the end for one paint.
  */
  const active = hits.length === 0 ? 0 : Math.min(highlighted, hits.length - 1)
  const setActive = setHighlighted

  // `/` and Ctrl/Cmd+K focus the field, the way every tool with a search bar behaves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable
      if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // A click anywhere else closes the panel.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const go = (hit: SearchHit) => {
    setOpen(false)
    setQuery('')
    if (hit.kind === 'board') navigate(`/boards/${hit.id}`)
    else if (hit.kind === 'item' && hit.boardId) navigate(`/boards/${hit.boardId}?item=${hit.id}`)
    else navigate('/org-chart')
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false)
      inputRef.current?.blur()
      return
    }
    if (!hits.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (i + 1) % hits.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i - 1 + hits.length) % hits.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      go(hits[active])
    }
  }

  const showPanel = open && debounced.trim().length >= 2

  return (
    <div ref={boxRef} className="relative w-full max-w-md">
      <MagnifyingGlass
        size={16}
        aria-hidden
        className="pointer-events-none absolute start-0 top-1/2 ms-3 -translate-y-1/2 text-pencil"
      />
      {/*
        `appearance-none` and the two webkit rules remove the browser's own clear button, which
        otherwise sits on top of ours and gives the field two X's.
      */}
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="חיפוש לוחות, משימות, אנשים…"
        aria-label="חיפוש"
        role="combobox"
        aria-expanded={showPanel}
        aria-controls="search-results"
        className="h-9 w-full appearance-none rounded-sm border border-rule-strong bg-paper ps-9 pe-14 text-sm text-ink transition-colors placeholder:text-pencil focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-soft [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
      />
      {query ? (
        <button
          type="button"
          onClick={() => {
            setQuery('')
            inputRef.current?.focus()
          }}
          aria-label="ניקוי החיפוש"
          className="pressable absolute end-0 top-1/2 me-2 -translate-y-1/2 rounded-sm p-1 text-pencil hover:text-ink"
        >
          <X size={14} />
        </button>
      ) : (
        /*
          `dir` stays off this element: `end-0` is resolved against the element's OWN direction, so
          `dir="ltr"` here would make it `right: 0` and drop the hint on top of the magnifier. The
          Latin text gets its direction from the span inside instead.
        */
        <kbd className="pointer-events-none absolute end-0 top-1/2 me-2 -translate-y-1/2 rounded-sm border border-rule px-1.5 py-0.5 text-[0.65rem] text-pencil">
          <span dir="ltr">Ctrl K</span>
        </kbd>
      )}

      {showPanel && (
        <div
          id="search-results"
          role="listbox"
          className="popover-enter absolute start-0 top-full z-50 mt-1.5 max-h-[70vh] w-full overflow-y-auto rounded-md border border-rule bg-paper shadow-(--shadow-popover)"
        >
          {results.isPending && <p className="px-3 py-3 text-sm text-pencil">מחפש…</p>}
          {results.data && hits.length === 0 && (
            <p className="px-3 py-3 text-sm text-pencil">לא נמצאו תוצאות עבור «{debounced}».</p>
          )}
          {results.data &&
            (['board', 'item', 'person'] as const).map((kind) => {
              const group = hits.filter((h) => h.kind === kind)
              if (!group.length) return null
              return (
                <section key={kind}>
                  <h3 className="stamp px-3 pt-2.5 pb-1 text-[0.7rem] text-pencil">{KIND_LABEL[kind]}</h3>
                  <ul>
                    {group.map((hit) => {
                      const index = hits.indexOf(hit)
                      return (
                        <li key={`${hit.kind}-${hit.id}`}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={index === active}
                            onMouseEnter={() => setActive(index)}
                            onClick={() => go(hit)}
                            className={`flex w-full items-center gap-2.5 px-3 py-2 text-start ${
                              index === active ? 'bg-accent-soft' : 'hover:bg-paper-2'
                            }`}
                          >
                            {hit.kind === 'person' ? (
                              <Avatar name={hit.title} src={hit.avatarUrl} size={22} />
                            ) : hit.kind === 'board' ? (
                              <Kanban size={16} aria-hidden className="shrink-0 text-pencil" />
                            ) : (
                              <ListChecks size={16} aria-hidden className="shrink-0 text-pencil" />
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm">{hit.title}</span>
                              {hit.subtitle && (
                                <span className="block truncate text-xs text-pencil">{hit.subtitle}</span>
                              )}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )
            })}
        </div>
      )}
    </div>
  )
}

