import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ChartBar, Kanban, Lightning, List, SignOut, TreeStructure, X } from '@phosphor-icons/react'
import { useBoards, useDashboards, useLogout } from '../api/hooks'
import { useLiveEvents } from '../api/useLiveEvents'
import type { BoardSummary } from '../api/types'
import { useSession } from '../context/session'
import { Avatar } from './ui/Avatar'
import { BlockSkeleton } from './ui/Skeleton'
import { ThemeToggle } from './ui/ThemeToggle'
import { SearchBox } from './ui/SearchBox'
import { NotificationBell } from './ui/NotificationBell'
import { SphereMark } from './brand/Logo'

function groupByWorkspace(boards: BoardSummary[]) {
  const groups = new Map<string, { name: string; boards: BoardSummary[] }>()
  for (const b of boards) {
    const g = groups.get(b.workspaceId) ?? { name: b.workspaceName, boards: [] }
    g.boards.push(b)
    groups.set(b.workspaceId, g)
  }
  return [...groups.values()]
}

/**
 * A rail item. On hover or when active, a 2px accent bar grows from the item's inline-start edge
 * (the right, in RTL) and the icon takes the accent - the pointer gets a target that answers before
 * the click. The bar is a pseudo-element, so it costs no markup and animates on transform alone.
 */
const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  [
    // No transition-* here: `.pressable` carries it, including the tab's translate and shadow.
    'pressable group relative flex items-center gap-2 rounded-sm px-2.5 py-1.5 text-sm',
    'before:absolute before:inset-y-1 before:start-0 before:w-[2px] before:rounded-full',
    'before:bg-accent before:transition-transform before:duration-150 motion-reduce:before:transition-none',
    // The tab pulls out of the rail toward the sheet, lifted onto paper. The rail is always on the
    // right, so "toward the sheet" is a physical left; a logical utility would not help here.
    // `shadow-(--shadow-popover)`, as every popover does: plain `shadow-popover` inlines the light
    // value and the dark theme's override of the token never reaches it.
    'hover:shadow-(--shadow-popover) motion-safe:hover:-translate-x-1.5',
    isActive
      ? 'bg-accent-soft font-semibold text-ink before:scale-y-100'
      : 'text-ink-2 before:scale-y-0 hover:bg-paper hover:text-ink hover:before:scale-y-100',
  ].join(' ')

/** The icon inside a rail item: pencil at rest, accent once the item is hovered or active. */
const navIconClass = (isActive: boolean) =>
  `shrink-0 transition-colors duration-150 ${isActive ? 'text-accent' : 'text-pencil group-hover:text-accent'}`

/** Right rail of workspaces and sheets, the sheet area beside it. Collapses to a drawer under lg. */
export function AppShell() {
  const user = useSession((s) => s.user)
  const clearSession = useSession((s) => s.logout)
  const navigate = useNavigate()
  const location = useLocation()
  const logout = useLogout()
  const boards = useBoards()
  const dashboards = useDashboards()
  const [drawerOpen, setDrawerOpen] = useState(false)

  // One event stream for the whole signed-in shell, so switching boards never reopens it.
  useLiveEvents()

  useEffect(() => {
    setDrawerOpen(false)
  }, [location.pathname])

  const onLogout = async () => {
    try {
      await logout.mutateAsync()
    } finally {
      clearSession()
      navigate('/login', { replace: true })
    }
  }

  const rail = (
    <nav aria-label="ניווט ראשי" className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 pt-4 pb-3">
        <Link to="/" className="flex items-center gap-2.5 rounded-sm" aria-label="סידור עבודה, קבוצת הדגמה, לדף הראשי">
          <SphereMark size={34} />
          <span className="stamp text-lg leading-none text-ink">
            סידור עבודה
            <span className="mt-0.5 block text-[0.7rem] font-normal tracking-wide text-brand-wordmark" style={{ fontStretch: '100%' }}>
              קבוצת הדגמה
            </span>
          </span>
        </Link>
        <button
          type="button"
          className="pressable rounded-sm p-1 text-ink-2 lg:hidden"
          aria-label="סגירת התפריט"
          onClick={() => setDrawerOpen(false)}
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {boards.isPending && (
          <div className="flex flex-col gap-2 px-2 pt-2">
            <BlockSkeleton className="h-3 w-20" />
            <BlockSkeleton className="h-6 w-full" />
            <BlockSkeleton className="h-6 w-full" />
            <BlockSkeleton className="h-3 w-16" />
            <BlockSkeleton className="h-6 w-full" />
          </div>
        )}
        {boards.data &&
          groupByWorkspace(boards.data).map((ws) => (
            <section key={ws.name} className="mt-3">
              <h2 className="stamp px-2.5 pb-1 text-[0.8rem] text-pencil">{ws.name}</h2>
              <ul className="flex flex-col gap-0.5">
                {ws.boards.map((b) => (
                  <li key={b.id}>
                    <NavLink to={`/boards/${b.id}`} className={navLinkClass}>
                      {({ isActive }) => (
                        <>
                          <Kanban size={16} aria-hidden className={navIconClass(isActive)} />
                          <span className="truncate">{b.name}</span>
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </section>
          ))}

        {dashboards.data && dashboards.data.length > 0 && (
          <section className="mt-4">
            <h2 className="stamp px-2.5 pb-1 text-[0.8rem] text-pencil">דשבורדים</h2>
            <ul className="flex flex-col gap-0.5">
              {dashboards.data.map((d) => (
                <li key={d.id}>
                  <NavLink to={`/dashboards/${d.id}`} className={navLinkClass}>
                    {({ isActive }) => (
                      <>
                        <ChartBar size={16} aria-hidden className={navIconClass(isActive)} />
                        <span className="truncate">{d.name}</span>
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-4">
          <h2 className="stamp px-2.5 pb-1 text-[0.8rem] text-pencil">ארגון</h2>
          <ul className="flex flex-col gap-0.5">
            <li>
              <NavLink to="/org-chart" className={navLinkClass}>
                {({ isActive }) => (
                  <>
                    <TreeStructure size={16} aria-hidden className={navIconClass(isActive)} />
                    תרשים ארגוני
                  </>
                )}
              </NavLink>
            </li>
            <li>
              <span
                className="flex items-center gap-2 px-2.5 py-1.5 text-sm text-pencil"
                title="אוטומציות אינן חלק מההדגמה"
                aria-disabled="true"
              >
                <Lightning size={16} aria-hidden />
                אוטומציות
                <span className="ms-auto rounded-sm border border-rule-strong px-1 text-[0.65rem] leading-4">בקרוב</span>
              </span>
            </li>
          </ul>
        </section>
      </div>

      <div className="border-t border-rule px-3 py-3">
        <div className="flex items-center gap-2.5">
          <NavLink
            to="/profile"
            className={({ isActive }) =>
              `pressable -m-1 flex min-w-0 flex-1 items-center gap-2.5 rounded-sm p-1 ${isActive ? 'bg-accent-soft' : 'hover:bg-paper-3'}`
            }
            title="הפרופיל שלי"
          >
            <Avatar name={user?.fullName ?? ''} src={user?.avatarUrl} size={32} />
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-semibold">{user?.fullName}</span>
              <span className="block truncate text-xs text-ink-2">{user?.title}</span>
            </span>
          </NavLink>
          <button
            type="button"
            onClick={onLogout}
            className="pressable rounded-sm p-1.5 text-ink-2 transition-colors hover:bg-paper-3 hover:text-ink"
            aria-label="התנתקות"
            title="התנתקות"
          >
            <SignOut size={18} />
          </button>
        </div>
      </div>
    </nav>
  )

  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-60 shrink-0 border-e border-rule bg-paper-2 lg:block">
        <div className="sticky top-0 h-dvh">{rail}</div>
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="סגירת התפריט"
            className="absolute inset-0 bg-ink/30"
            onClick={() => setDrawerOpen(false)}
          />
          {/* Opens from the inline-start (the right), the edge the desktop rail occupies. */}
          <div className="drawer-enter absolute inset-y-0 start-0 w-72 max-w-[85vw] bg-paper-2 shadow-(--shadow-popover)">
            {rail}
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/*
          The top bar: search, notifications and the theme switch, at every size. Below lg it also
          carries the menu button and the mark, which used to be a separate mobile-only header.
        */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-rule bg-paper-2 px-3 sm:gap-3">
          <button
            type="button"
            className="pressable rounded-sm p-1.5 text-ink-2 lg:hidden"
            aria-label="פתיחת התפריט"
            onClick={() => setDrawerOpen(true)}
          >
            <List size={20} />
          </button>
          <SphereMark size={22} className="lg:hidden" />

          <SearchBox />

          <div className="ms-auto flex items-center gap-1">
            <NotificationBell key={user?.id} />
            <ThemeToggle />
            <NavLink
              to="/profile"
              className={({ isActive }) =>
                `pressable hidden rounded-sm p-0.5 sm:block ${isActive ? 'ring-2 ring-accent' : ''}`
              }
              title="ההגדרות שלי"
              aria-label="ההגדרות שלי"
            >
              <Avatar name={user?.fullName ?? ''} src={user?.avatarUrl} size={28} />
            </NavLink>
          </div>
        </header>
        {/* Home names itself so the ground behind the sheets can differ there; see `--site-photo`. */}
        <main data-surface={location.pathname === '/' ? 'home' : undefined} className="flex-1 p-3 md:p-5 lg:p-7">
          <div key={location.pathname} className="page-enter">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
