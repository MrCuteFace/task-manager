import { Suspense, lazy, useState, type CSSProperties, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, Eye, EyeSlash } from '@phosphor-icons/react'
import { ApiError } from '../api/client'
import { useLogin } from '../api/hooks'
import { Button } from '../components/ui/Button'
import { useSession } from '../context/session'
import { SphereMark } from '../components/brand/Logo'
import { ThemeToggle } from '../components/ui/ThemeToggle'

/*
  three.js and GSAP are only ever needed here, and they are most of their own chunk. Loading them
  lazily keeps them out of the bundle every other route pays for; until the chunk arrives the login
  docket sits on plain desk paper, which is the same thing reduced-motion users see.
*/
const ContainerYard = lazy(() =>
  import('../components/brand/ContainerYard').then((m) => ({ default: m.ContainerYard })),
)

/** The fixed demo logins (tech doc §4.1). Listed on screen so evaluators can switch roles. */
const DEMO_USERS = [
  { username: 'amit', name: 'עמית רוזן', title: 'מנכ"ל', scope: 'רואה את כל הארגון' },
  { username: 'yossi', name: 'יוסי לוי', title: 'מנהל משאבי אנוש', scope: 'רואה את משאבי אנוש וצוות הגיוס' },
  { username: 'maya', name: 'מאיה שגיא', title: 'מנהלת צוות גיוס', scope: 'רואה את צוות הגיוס בלבד' },
  { username: 'uri', name: 'אורי ברק', title: 'מנהל שיווק', scope: 'רואה את השיווק בלבד' },
]

/** `.row-enter` reads `--i` to stagger; each line of the docket is written 28ms after the last. */
const line = (i: number) => ({ '--i': i }) as CSSProperties

const inputClass =
  'block h-11 w-full rounded-sm border border-rule-strong bg-paper px-3 text-base text-ink ' +
  'transition-colors placeholder:text-pencil focus:border-accent focus:outline-none ' +
  'focus:ring-2 focus:ring-accent-soft'

export function LoginPage() {
  const token = useSession((s) => s.token)
  const setSession = useSession((s) => s.login)
  const navigate = useNavigate()
  const location = useLocation()
  const login = useLogin()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  if (token) return <Navigate to="/" replace />

  const submit = async (u: string, p: string) => {
    setError(null)
    if (!u.trim() || !p) {
      setError('הזינו שם משתמש וסיסמה, או בחרו משתמש הדגמה.')
      return
    }
    try {
      const response = await login.mutateAsync({ username: u.trim(), password: p })
      setSession(response.token, response.user)
      const from = (location.state as { from?: string } | null)?.from
      navigate(from && from !== '/login' ? from : '/', { replace: true })
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 401
          ? 'שם המשתמש או הסיסמה שגויים. נסו שוב או בחרו משתמש הדגמה.'
          : 'השרת אינו זמין כרגע. ודאו שה-API רץ ונסו שוב.',
      )
    }
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    void submit(username, password)
  }

  return (
    <main data-surface="login" className="relative flex min-h-dvh items-center justify-center p-4 sm:p-6">
      <Suspense fallback={null}>
        <ContainerYard className="yard-ground" />
      </Suspense>

      <div className="relative w-full max-w-5xl">
        {/*
          The docket is filled in the order a clerk would fill it: the sheet arrives, then each line
          is written onto it. Reuses the roster's own `.row-enter` stagger rather than a second
          motion system - and keeps GSAP inside the lazy yard chunk instead of the main bundle.
        */}
        <div className="sheet sheet-margin page-enter overflow-hidden">
          {/* Title block: who the document belongs to, and what it is. */}
          <header className="flex flex-wrap items-center justify-between gap-4 border-b border-rule px-6 py-4 ps-12 sm:px-8 sm:ps-16">
            <div className="flex items-center gap-3">
              <SphereMark size={30} />
              <div>
                <p className="stamp text-base leading-tight text-brand-wordmark">קבוצת הדגמה</p>
                <p className="text-xs leading-tight text-pencil">מסוף הדגמה · תפעול מכולות</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <p className="docket-ref" dir="ltr">
                TM / A
              </p>
            </div>
          </header>

          <div className="grid lg:grid-cols-[1.05fr_0.95fr]">
            {/* The form: the one large gesture on the page is the stamped title above it. */}
            <section className="relative px-6 py-7 ps-12 sm:px-8 sm:py-9 sm:ps-16">
              <span className="docket-stamp" aria-hidden>
                הדגמה
              </span>

              <h1 className="row-enter stamp text-4xl leading-none sm:text-[2.75rem]" style={line(0)}>
                סידור עבודה
              </h1>
              <p className="row-enter mt-3 max-w-[44ch] text-sm leading-6 text-ink-2" style={line(1)}>
                כל מנהל רואה את הלוחות שלו ושל כל מי שכפוף לו, ורק אותם. התחברו כדי לראות את הסידור שלכם.
              </p>

              <form onSubmit={onSubmit} className="mt-7 flex flex-col gap-4" noValidate>
                <div className="row-enter flex flex-col gap-1.5" style={line(2)}>
                  <label htmlFor="username" className="text-sm font-semibold">
                    שם משתמש
                  </label>
                  <input
                    id="username"
                    name="username"
                    className={inputClass}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    autoCapitalize="none"
                    dir="ltr"
                    style={{ textAlign: 'start' }}
                    required
                  />
                </div>
                <div className="row-enter flex flex-col gap-1.5" style={line(3)}>
                  <label htmlFor="password" className="text-sm font-semibold">
                    סיסמה
                  </label>
                  {/*
                    The reveal button sits at the right of the field, where a password field's
                    conventional reveal control lives. The input is dir="ltr", so its `pe-11` pads
                    the right; the button lives in the RTL wrapper, so `start-0` is that same right
                    edge. The two must stay on the same side or text runs under the icon.
                  */}
                  <div className="relative">
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      className={`${inputClass} pe-11`}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      dir="ltr"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="pressable absolute start-0 top-0 flex h-11 w-11 items-center justify-center rounded-sm text-pencil transition-colors hover:text-ink"
                      aria-label={showPassword ? 'הסתרת הסיסמה' : 'הצגת הסיסמה'}
                      aria-pressed={showPassword}
                      title={showPassword ? 'הסתרת הסיסמה' : 'הצגת הסיסמה'}
                    >
                      {showPassword ? <EyeSlash size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
                    </button>
                  </div>
                  <p className="text-xs text-pencil">בהדגמה הסיסמה לכל המשתמשים היא demo123</p>
                </div>
                {error && (
                  <p role="alert" className="border-s-2 border-stuck ps-3 text-sm text-stuck">
                    {error}
                  </p>
                )}
                <div className="row-enter pt-1" style={line(4)}>
                  <Button type="submit" variant="primary" disabled={login.isPending}>
                    {login.isPending ? 'מתחבר…' : 'כניסה'}
                    <ArrowLeft size={16} aria-hidden />
                  </Button>
                </div>
              </form>
            </section>

            {/* The roster of who may sign in: ruled lines, the way the sheet rules its rows. */}
            {/*
              Stacked under the form on small screens, this column sits inside the sheet's red margin
              line, so it needs the same inline-start inset the form has. On lg it moves to the other
              column, clear of the margin, and the inset resets.
            */}
            <aside className="border-t border-rule bg-paper-2/45 px-6 py-7 ps-12 sm:px-8 sm:py-9 sm:ps-16 lg:border-t-0 lg:border-s lg:ps-8">
              <h2 className="row-enter stamp text-lg" style={line(2)}>
                משתמשי הדגמה
              </h2>
              <p className="row-enter mt-1 text-sm text-ink-2" style={line(3)}>
                ארבעה מנהלים, ארבע תמונות מצב שונות של אותו ארגון.
              </p>
              <ul className="ruled mt-5">
                {DEMO_USERS.map((u, i) => (
                  <li key={u.username} className="row-enter" style={line(4 + i)}>
                    <button
                      type="button"
                      className="pressable group flex w-full items-center gap-3 rounded-sm px-2 py-3 text-start hover:bg-paper-2"
                      onClick={() => {
                        setUsername(u.username)
                        setPassword('demo123')
                        void submit(u.username, 'demo123')
                      }}
                      disabled={login.isPending}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">
                          {u.name}
                          <span className="ms-2 font-normal text-ink-2">{u.title}</span>
                        </span>
                        <span className="block text-xs text-pencil">{u.scope}</span>
                      </span>
                      <span className="shrink-0 font-mono text-xs text-pencil" dir="ltr">
                        {u.username}
                      </span>
                      <ArrowLeft
                        size={14}
                        aria-hidden
                        className="shrink-0 text-pencil opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                      />
                    </button>
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        </div>
      </div>
    </main>
  )
}
