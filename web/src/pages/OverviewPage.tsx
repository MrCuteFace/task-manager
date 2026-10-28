import { Link } from 'react-router-dom'
import { ArrowLeft } from '@phosphor-icons/react'
import { useBoards } from '../api/hooks'
import type { BoardSummary } from '../api/types'
import { Avatar } from '../components/ui/Avatar'
import { EmptyState } from '../components/ui/EmptyState'
import { PageLoading } from '../components/brand/Logo'
import { StatusBar } from '../features/dashboard/StatusBar'
import { useSession } from '../context/session'

function groupByWorkspace(boards: BoardSummary[]) {
  const groups = new Map<string, { name: string; boards: BoardSummary[] }>()
  for (const b of boards) {
    const g = groups.get(b.workspaceId) ?? { name: b.workspaceName, boards: [] }
    g.boards.push(b)
    groups.set(b.workspaceId, g)
  }
  return [...groups.values()]
}

/** Every sheet the current user is allowed to see, grouped by workspace. */
export function OverviewPage() {
  const boards = useBoards()
  const user = useSession((s) => s.user)

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="stamp text-3xl leading-none">הלוחות שלי</h1>
        <p className="mt-2 max-w-[60ch] text-sm text-ink-2">
          {user?.fullName}, אלה הלוחות שלכם ושל כל מי שכפוף לכם. לוחות של מנהלים מקבילים או ממונים אינם מופיעים כאן.
        </p>
      </header>

      {boards.isPending && <PageLoading />}

      {boards.isError && (
        <EmptyState tone="error" title="לא ניתן לטעון את הלוחות" description="בדקו שהשרת פועל ונסו שוב." />
      )}

      {boards.data && boards.data.length === 0 && (
        <EmptyState title="אין לוחות בתחום האחריות שלכם" description="לוחות נוצרים בנתוני ההדגמה. התחברו כמשתמש אחר כדי לראות תמונת מצב שונה." />
      )}

      {boards.data && boards.data.length > 0 && (
        <div className="flex flex-col gap-5">
          {groupByWorkspace(boards.data).map((ws) => (
            <section key={ws.name} className="sheet sheet-margin px-3 py-4 ps-11 md:px-4 md:ps-16">
              <h2 className="stamp text-lg leading-none">{ws.name}</h2>
              <ul className="ruled mt-3">
                {ws.boards.map((b) => (
                  <li key={b.id}>
                    {/*
                      The same hover language as a table row: the line tints, the name takes the accent,
                      and the arrow steps the way the eye travels - which in RTL is toward the left.
                    */}
                    <Link
                      to={`/boards/${b.id}`}
                      className="group pressable -mx-2 grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 rounded-sm px-2 py-3 hover:bg-paper-2/70 md:grid-cols-[minmax(0,1fr)_220px_auto]"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-base font-semibold text-ink transition-colors duration-150 group-hover:text-accent">
                            {b.name}
                          </span>
                        </div>
                        {b.description && <p className="mt-0.5 truncate text-sm text-ink-2">{b.description}</p>}
                        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-2">
                          <Avatar name={b.ownerName} size={18} />
                          {b.ownerName}
                        </div>
                      </div>
                      <div className="col-span-2 md:col-span-1">
                        <StatusBar counts={b.counts} />
                        <p className="mt-1 text-xs text-ink-2">
                          {b.counts.done} מתוך {b.counts.total} הושלמו
                          {b.overdueCount > 0 && <span className="ms-2 font-semibold text-stuck">{b.overdueCount} באיחור</span>}
                        </p>
                      </div>
                      <ArrowLeft
                        size={16}
                        className="pressable hidden text-pencil group-hover:text-accent motion-safe:group-hover:-translate-x-0.5 md:block"
                        aria-hidden
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
