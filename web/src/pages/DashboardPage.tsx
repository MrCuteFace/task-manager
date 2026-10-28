import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { useDashboard } from '../api/hooks'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { PageLoading } from '../components/brand/Logo'
import { StatusBar } from '../features/dashboard/StatusBar'
import { StackedBars, StatusLegend } from '../features/dashboard/StackedBars'
import { StatusMark } from '../features/boards/StatusMark'
import { formatDate } from '../features/boards/status'
import { useUserMap } from '../features/users/useUserMap'

/** The coordinator's summary sheet: totals, one bar per sheet, load per person, and what is late. */
export function DashboardPage() {
  const { dashboardId = '' } = useParams()
  const navigate = useNavigate()
  const dashboard = useDashboard(dashboardId)
  const { nameOf } = useUserMap()

  if (dashboard.isPending) return <PageLoading />

  if (dashboard.isError) {
    const notFound = dashboard.error instanceof ApiError && dashboard.error.status === 404
    return (
      <EmptyState
        tone="error"
        title={notFound ? 'הדשבורד לא נמצא' : 'לא ניתן לטעון את הדשבורד'}
        description={notFound ? 'הדשבורד אינו בתחום האחריות שלכם.' : 'בדקו שהשרת פועל ונסו שוב.'}
        action={<Button onClick={() => navigate('/')}>לרשימת הלוחות</Button>}
      />
    )
  }

  const d = dashboard.data
  const open = d.totals.total - d.totals.done
  const donePercent = d.totals.total === 0 ? 0 : Math.round((d.totals.done / d.totals.total) * 100)

  return (
    <div className="mx-auto max-w-5xl">
      <div className="sheet sheet-margin px-3 pt-5 pb-6 ps-11 md:px-6 md:ps-16">
        <header>
          <h1 className="stamp text-3xl leading-none">{d.name}</h1>
          {d.description && <p className="mt-2 max-w-[60ch] text-sm text-ink-2">{d.description}</p>}
        </header>

        <section className="mt-6" aria-label="סיכום">
          <p className="stamp text-xl leading-tight">
            {open} פריטים פתוחים מתוך {d.totals.total}, {donePercent}% הושלמו
          </p>
          <div className="mt-4">
            <StatusBar counts={d.totals} height={10} />
            <div className="mt-2">
              <StatusLegend counts={d.totals} />
            </div>
          </div>
          <dl className="ruled mt-5 grid border-b border-rule sm:grid-cols-2 sm:gap-x-10 sm:[&>*:nth-child(2)]:border-t-0">
            <SummaryRow label="באיחור" value={d.overdueCount} emphasize={d.overdueCount > 0} />
            <SummaryRow label="לסיום השבוע" value={d.dueThisWeekCount} />
            <SummaryRow label="לוחות" value={d.boards.length} />
            <SummaryRow label="אנשים עם פריטים" value={d.byAssignee.length} />
          </dl>
        </section>

        <section className="mt-8">
          <h2 className="stamp text-lg leading-none">לפי לוח</h2>
          <div className="mt-4">
            <StackedBars
              ariaLabel="פריטים לפי לוח וסטטוס"
              rows={d.boards.map((b) => ({
                id: b.id,
                label: b.name,
                sublabel: b.ownerName,
                counts: b.counts,
                href: `/boards/${b.id}`,
              }))}
            />
          </div>
        </section>

        <section className="mt-8">
          <h2 className="stamp text-lg leading-none">עומס לפי אחראי</h2>
          {d.byAssignee.length === 0 ? (
            <p className="mt-3 text-sm text-pencil">אין פריטים משויכים.</p>
          ) : (
            <div className="mt-4">
              <StackedBars
                ariaLabel="פריטים לפי אחראי וסטטוס"
                rows={d.byAssignee.map((a) => ({ id: a.userId, label: a.fullName, counts: a.counts }))}
              />
            </div>
          )}
        </section>

        <section className="mt-8">
          <h2 className="stamp text-lg leading-none">באיחור</h2>
          {d.overdueItems.length === 0 ? (
            <p className="mt-3 text-sm text-pencil">אין פריטים באיחור. כל הכבוד.</p>
          ) : (
            <ol className="ruled mt-2">
              {d.overdueItems.map((o) => (
                <li key={o.itemId} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 py-2 text-sm md:grid-cols-[minmax(0,1fr)_140px_120px_100px]">
                  <div className="min-w-0">
                    <Link to={`/boards/${o.boardId}?item=${o.itemId}`} className="block truncate text-ink hover:underline">
                      {o.title}
                    </Link>
                    <span className="block truncate text-xs text-pencil">{o.boardName}</span>
                  </div>
                  <span className="hidden truncate text-xs text-ink-2 md:block">{o.assigneeIds.map(nameOf).join(', ') || 'ללא אחראי'}</span>
                  <span className="hidden md:block">
                    <StatusMark status={o.status} />
                  </span>
                  <span className="text-end text-xs">
                    <span className="block font-semibold text-stuck">
                      {o.daysOverdue === 1 ? 'יום אחד' : `${o.daysOverdue} ימים`}
                    </span>
                    <span className="text-pencil">{formatDate(o.dueDate)}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  )
}

function SummaryRow({ label, value, emphasize = false }: { label: string; value: number; emphasize?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
      <dt className="text-ink-2">{label}</dt>
      <dd className={emphasize ? 'font-semibold text-stuck' : 'font-semibold text-ink'}>{value}</dd>
    </div>
  )
}
