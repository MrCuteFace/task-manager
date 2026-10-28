import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Kanban, Plus, Table } from '@phosphor-icons/react'
import { ApiError } from '../api/client'
import { useBoard } from '../api/hooks'
import { Avatar } from '../components/ui/Avatar'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { PageLoading } from '../components/brand/Logo'
import { KanbanView } from '../features/boards/KanbanView'
import { TableView } from '../features/boards/TableView'
import { ItemPanel } from '../features/items/ItemPanel'
import { parseSort, serializeSort } from '../features/boards/sorting'
import { turnPage } from '../features/boards/pageTurn'

type View = 'table' | 'kanban'
const FIRST_ADD_INPUT_ID = 'add-item-first-group'

export function BoardPage() {
  const { boardId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const board = useBoard(boardId)
  const sheetRef = useRef<HTMLDivElement>(null)

  const urlView: View = params.get('view') === 'kanban' ? 'kanban' : 'table'
  // The page turn snapshots the sheet on both sides of the switch, so the new view has to render
  // synchronously. The router runs navigations as a transition, so the turned-to view is held here
  // until the URL catches up.
  const [turnedTo, setTurnedTo] = useState<View | null>(null)
  const view = turnedTo ?? urlView
  useEffect(() => {
    if (turnedTo === urlView) setTurnedTo(null)
  }, [turnedTo, urlView])
  const openItemId = params.get('item')

  const setParam = useCallback(
    (key: string, value: string | null) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (value === null) next.delete(key)
          else next.set(key, value)
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )

  const closeItem = useCallback(() => setParam('item', null), [setParam])

  // Turning to the kanban is a page forward in the notebook, back to the table a page back.
  const switchView = useCallback(
    (next: View) => {
      if (next === view) return
      turnPage(sheetRef.current, next === 'kanban' ? 'forward' : 'back', () => flushSync(() => setTurnedTo(next)))
      setParam('view', next === 'kanban' ? 'kanban' : null)
    },
    [view, setParam],
  )

  if (board.isPending) return <PageLoading />

  if (board.isError) {
    const notFound = board.error instanceof ApiError && board.error.status === 404
    return (
      <EmptyState
        tone="error"
        title={notFound ? 'הלוח לא נמצא' : 'לא ניתן לטעון את הלוח'}
        description={
          notFound
            ? 'הלוח אינו קיים או שאינו בתחום האחריות שלכם. רואים רק לוחות שלכם ושל מי שכפוף לכם.'
            : 'בדקו שהשרת פועל ונסו שוב.'
        }
        action={<Button onClick={() => navigate('/')}>לרשימת הלוחות</Button>}
      />
    )
  }

  const data = board.data
  const allItems = data.groups.flatMap((g) => g.items)
  const openItem = openItemId ? allItems.find((i) => i.id === openItemId) : undefined
  const total = allItems.length
  const done = allItems.filter((i) => i.status === 'Done').length

  return (
    <div className="flex items-start gap-4">
      <div className="min-w-0 flex-1">
        <div className="sheet sheet-margin px-3 pt-5 pb-6 ps-11 md:px-6 md:ps-16" ref={sheetRef}>
          <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div className="min-w-0">
              <h1 className="stamp text-3xl leading-none">{data.name}</h1>
              {data.description && <p className="mt-2 max-w-[60ch] text-sm text-ink-2">{data.description}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2">
                <span className="inline-flex items-center gap-1.5">
                  <Avatar name={data.ownerName} size={20} />
                  {data.ownerName}
                </span>
                <span>
                  {done} מתוך {total} הושלמו
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div role="tablist" aria-label="תצוגה" className="inline-flex rounded-sm border border-rule-strong p-0.5">
                <ViewTab active={view === 'table'} onClick={() => switchView('table')} icon={<Table size={15} aria-hidden />} label="טבלה" />
                <ViewTab active={view === 'kanban'} onClick={() => switchView('kanban')} icon={<Kanban size={15} aria-hidden />} label="קנבן" />
              </div>
              {view === 'table' && (
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Plus size={14} weight="bold" aria-hidden />}
                  onClick={() => document.getElementById(FIRST_ADD_INPUT_ID)?.focus()}
                >
                  פריט חדש
                </Button>
              )}
            </div>
          </header>

          <div className="mt-4">
            {view === 'table' ? (
              <TableView
                board={data}
                openItemId={openItemId}
                onOpenItem={(id) => setParam('item', id)}
                firstAddInputId={FIRST_ADD_INPUT_ID}
                compact={Boolean(openItem)}
                sort={parseSort(params.get('sort'))}
                onSortChange={(next) => setParam('sort', serializeSort(next))}
              />
            ) : (
              <KanbanView board={data} openItemId={openItemId} onOpenItem={(id) => setParam('item', id)} />
            )}
          </div>
        </div>
      </div>

      {openItem && (
        <div className="fixed inset-0 z-30 flex justify-start bg-ink/25 p-0 lg:sticky lg:top-7 lg:z-auto lg:block lg:h-[calc(100dvh-3.5rem)] lg:w-[400px] lg:shrink-0 lg:bg-transparent">
          <button type="button" aria-label="סגירת הפריט" className="absolute inset-0 lg:hidden" onClick={closeItem} />
          <div className="relative h-full w-full max-w-[440px] lg:max-w-none">
            <ItemPanel board={data} item={openItem} onClose={closeItem} />
          </div>
        </div>
      )}
    </div>
  )
}

function ViewTab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`pressable inline-flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-[0.8125rem] font-semibold ${
        active ? 'bg-accent-soft text-ink' : 'text-ink-2 hover:text-ink'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}
