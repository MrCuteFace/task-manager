import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Camera, Eye, EyeSlash, Key, Sliders, Trash, User as UserIcon } from '@phosphor-icons/react'
import { ApiError } from '../api/client'
import { useChangePassword, useUpdateProfile } from '../api/hooks'
import { Avatar } from '../components/ui/Avatar'
import { Button } from '../components/ui/Button'
import { useSession } from '../context/session'
import { useTheme, type ThemePreference } from '../context/theme'

const inputClass =
  'block h-10 w-full rounded-sm border border-rule-strong bg-paper px-3 text-base text-ink transition-colors ' +
  'placeholder:text-pencil focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-soft'

type Tab = 'profile' | 'preferences' | 'security'

const TABS: { id: Tab; label: string; icon: typeof UserIcon }[] = [
  { id: 'profile', label: 'פרופיל', icon: UserIcon },
  { id: 'preferences', label: 'העדפות', icon: Sliders },
  { id: 'security', label: 'אבטחה', icon: Key },
]

/** Resizes a chosen image to a 256px square JPEG data URL so the in-memory profile stays small. */
async function toAvatarDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const side = 256
  const canvas = document.createElement('canvas')
  canvas.width = side
  canvas.height = side
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas')
  const scale = Math.max(side / bitmap.width, side / bitmap.height)
  const w = bitmap.width * scale
  const h = bitmap.height * scale
  ctx.drawImage(bitmap, (side - w) / 2, (side - h) / 2, w, h)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.86)
}

/** The user's own line on the roster, plus the two settings that belong to them alone. */
export function ProfilePage() {
  const [tab, setTab] = useState<Tab>('profile')
  const user = useSession((s) => s.user)
  if (!user) return null

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-5">
        <h1 className="stamp text-3xl leading-none">הגדרות</h1>
        <p className="mt-2 max-w-[62ch] text-sm text-ink-2">
          הפרטים שלכם כפי שהם מופיעים בלוחות ובתרשים הארגוני, ההעדפות של התצוגה, והסיסמה. בהדגמה הכול נשמר
          בזיכרון השרת בלבד ומתאפס בהפעלה מחדש.
        </p>
      </header>

      <div className="grid gap-5 md:grid-cols-[13rem_1fr]">
        {/* The tab rail mirrors the nav rail's hover: an accent bar on the inline-start edge. */}
        <nav aria-label="מדורי ההגדרות" className="md:pt-1">
          <ul className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
            {TABS.map(({ id, label, icon: Icon }) => {
              const isActive = tab === id
              return (
                <li key={id} className="shrink-0 md:shrink">
                  <button
                    type="button"
                    onClick={() => setTab(id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={[
                      'pressable group relative flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-sm',
                      'transition-colors duration-150',
                      'before:absolute before:inset-y-1 before:start-0 before:w-[2px] before:rounded-full',
                      'before:bg-accent before:transition-transform before:duration-150',
                      isActive
                        ? 'bg-accent-soft font-semibold text-ink before:scale-y-100'
                        : 'text-ink-2 before:scale-y-0 hover:bg-paper-2 hover:text-ink hover:before:scale-y-100',
                    ].join(' ')}
                  >
                    <Icon
                      size={16}
                      aria-hidden
                      className={`shrink-0 transition-colors ${isActive ? 'text-accent' : 'text-pencil group-hover:text-accent'}`}
                    />
                    {label}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        <div>
          {tab === 'profile' && <ProfileTab />}
          {tab === 'preferences' && <PreferencesTab />}
          {tab === 'security' && <SecurityTab />}
        </div>
      </div>
    </div>
  )
}

function ProfileTab() {
  const user = useSession((s) => s.user)!
  const update = useUpdateProfile()
  const fileRef = useRef<HTMLInputElement>(null)
  const [fullName, setFullName] = useState(user.fullName)
  const [title, setTitle] = useState(user.title)
  const [email, setEmail] = useState(user.email ?? '')
  const [avatar, setAvatar] = useState<string | null | undefined>(undefined) // undefined = unchanged, null = remove
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const previewSrc = avatar === undefined ? user.avatarUrl : avatar
  const trimmedEmail = email.trim()
  const dirty =
    fullName.trim() !== user.fullName ||
    title.trim() !== user.title ||
    trimmedEmail !== (user.email ?? '') ||
    avatar !== undefined

  const touch = () => setSaved(false)

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('בחרו קובץ תמונה (JPG, PNG או WebP).')
      return
    }
    try {
      setError(null)
      setAvatar(await toAvatarDataUrl(file))
      touch()
    } catch {
      setError('לא הצלחנו לקרוא את התמונה. נסו קובץ אחר.')
    }
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      await update.mutateAsync({
        fullName: fullName.trim() !== user.fullName ? fullName.trim() : undefined,
        title: title.trim() !== user.title ? title.trim() : undefined,
        // An emptied field means "remove it", which is a different request from "set it to ''".
        email: trimmedEmail && trimmedEmail !== (user.email ?? '') ? trimmedEmail : undefined,
        clearEmail: !trimmedEmail && user.email ? true : undefined,
        avatarUrl: avatar ? avatar : undefined,
        clearAvatar: avatar === null ? true : undefined,
      })
      setAvatar(undefined)
      setSaved(true)
    } catch (err) {
      setError(err instanceof ApiError ? (err.detail ?? err.title) : 'השמירה נכשלה. נסו שוב.')
    }
  }

  return (
    <form onSubmit={onSubmit} className="sheet sheet-margin px-4 py-6 ps-11 md:px-8 md:ps-16" noValidate>
      <h2 className="stamp text-lg">הפרופיל שלי</h2>

      <div className="mt-5 flex flex-wrap items-start gap-6">
        <div className="flex flex-col items-center gap-3">
          <Avatar name={fullName || user.fullName} src={previewSrc} size={96} />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => void onFile(e)}
            aria-label="בחירת תמונת פרופיל"
          />
          <div className="flex items-center gap-1.5">
            <Button size="sm" icon={<Camera size={14} aria-hidden />} onClick={() => fileRef.current?.click()}>
              {previewSrc ? 'החלפת תמונה' : 'העלאת תמונה'}
            </Button>
            {previewSrc && (
              <Button
                size="sm"
                variant="ghost"
                icon={<Trash size={14} aria-hidden />}
                aria-label="הסרת התמונה"
                onClick={() => {
                  setAvatar(null)
                  touch()
                }}
              />
            )}
          </div>
        </div>

        <div className="flex min-w-[240px] flex-1 flex-col gap-4">
          <Field id="fullName" label="שם מלא">
            <input
              id="fullName"
              className={inputClass}
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value)
                touch()
              }}
              required
            />
          </Field>
          <Field id="title" label="תפקיד">
            <input
              id="title"
              className={inputClass}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                touch()
              }}
              required
            />
          </Field>
          <Field id="email" label="דואר אלקטרוני" hint="לא חובה. נשאר פנימי להדגמה ואינו נשלח לשום מקום.">
            <input
              id="email"
              type="email"
              className={inputClass}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                touch()
              }}
              dir="ltr"
              style={{ textAlign: 'start' }}
              placeholder="name@example.com"
              autoComplete="email"
            />
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">שם משתמש</span>
            <span className="text-sm text-ink-2" dir="ltr" style={{ textAlign: 'start' }}>
              {user.username}
            </span>
          </div>
        </div>
      </div>

      <Feedback error={error} saved={saved} savedText="הפרופיל נשמר." />

      <div className="mt-6 border-t border-rule pt-4">
        <Button
          type="submit"
          variant="primary"
          disabled={!dirty || update.isPending || fullName.trim().length < 2 || !title.trim()}
        >
          {update.isPending ? 'שומר…' : 'שמירה'}
        </Button>
      </div>
    </form>
  )
}

function PreferencesTab() {
  const preference = useTheme((s) => s.preference)
  const setPreference = useTheme((s) => s.setPreference)

  const options: { id: ThemePreference; label: string; detail: string }[] = [
    { id: 'light', label: 'בהיר', detail: 'נייר משובץ, דיו כחול-שחור.' },
    { id: 'dark', label: 'כהה', detail: 'אותו סידור, נקרא תחת מנורת שולחן.' },
    { id: 'system', label: 'לפי המערכת', detail: 'מתחלף יחד עם הגדרת מערכת ההפעלה.' },
  ]

  return (
    <section className="sheet sheet-margin px-4 py-6 ps-11 md:px-8 md:ps-16">
      <h2 className="stamp text-lg">תצוגה</h2>
      <p className="mt-1 text-sm text-ink-2">הבחירה נשמרת בדפדפן הזה בלבד.</p>

      <fieldset className="mt-5">
        <legend className="sr-only">ערכת נושא</legend>
        <ul className="ruled">
          {options.map((option) => (
            <li key={option.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded-sm px-2 py-3 hover:bg-paper-2">
                <input
                  type="radio"
                  name="theme"
                  value={option.id}
                  checked={preference === option.id}
                  onChange={() => setPreference(option.id)}
                  className="size-4 accent-[var(--color-accent)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{option.label}</span>
                  <span className="block text-xs text-pencil">{option.detail}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
    </section>
  )
}

function SecurityTab() {
  const change = useChangePassword()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const mismatch = confirm.length > 0 && next !== confirm
  const canSubmit = current.length > 0 && next.length >= 8 && next === confirm && !change.isPending

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaved(false)
    try {
      await change.mutateAsync({ currentPassword: current, newPassword: next })
      setCurrent('')
      setNext('')
      setConfirm('')
      setSaved(true)
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.status === 403
            ? 'הסיסמה הנוכחית שגויה.'
            : (err.detail ?? err.title)
          : 'שינוי הסיסמה נכשל. נסו שוב.',
      )
    }
  }

  const field = `${inputClass} pe-11`

  return (
    <form onSubmit={onSubmit} className="sheet sheet-margin px-4 py-6 ps-11 md:px-8 md:ps-16" noValidate>
      <h2 className="stamp text-lg">שינוי סיסמה</h2>
      <p className="mt-1 text-sm text-ink-2">
        בהדגמה הסיסמה נשמרת בזיכרון השרת וחוזרת ל-demo123 בהפעלה מחדש.
      </p>

      <div className="mt-5 flex max-w-md flex-col gap-4">
        <Field id="current" label="סיסמה נוכחית">
          <PasswordInput id="current" value={current} onChange={setCurrent} show={show} onToggle={() => setShow((v) => !v)} autoComplete="current-password" className={field} />
        </Field>
        <Field id="next" label="סיסמה חדשה" hint="לפחות 8 תווים, ושונה מהסיסמה הנוכחית.">
          <PasswordInput id="next" value={next} onChange={setNext} show={show} onToggle={() => setShow((v) => !v)} autoComplete="new-password" className={field} />
        </Field>
        <Field id="confirm" label="אימות סיסמה">
          <PasswordInput id="confirm" value={confirm} onChange={setConfirm} show={show} onToggle={() => setShow((v) => !v)} autoComplete="new-password" className={field} />
          {mismatch && <p className="mt-1 text-xs text-stuck">הסיסמאות אינן תואמות.</p>}
        </Field>
      </div>

      <Feedback error={error} saved={saved} savedText="הסיסמה שונתה." />

      <div className="mt-6 border-t border-rule pt-4">
        <Button type="submit" variant="primary" disabled={!canSubmit}>
          {change.isPending ? 'משנה…' : 'שינוי סיסמה'}
        </Button>
      </div>
    </form>
  )
}

// ---- small shared pieces --------------------------------------------------

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-pencil">{hint}</p>}
    </div>
  )
}

/**
 * The reveal button sits at the right of the field. The input is `dir="ltr"`, so its `pe-11` pads
 * the right; the button is in the RTL wrapper, where `start-0` is that same right edge.
 */
function PasswordInput({
  id,
  value,
  onChange,
  show,
  onToggle,
  autoComplete,
  className,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  show: boolean
  onToggle: () => void
  autoComplete: string
  className: string
}) {
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        className={className}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        dir="ltr"
        style={{ textAlign: 'start' }}
        required
      />
      <button
        type="button"
        onClick={onToggle}
        className="pressable absolute start-0 top-0 flex h-10 w-11 items-center justify-center rounded-sm text-pencil transition-colors hover:text-ink"
        aria-label={show ? 'הסתרת הסיסמאות' : 'הצגת הסיסמאות'}
        aria-pressed={show}
      >
        {show ? <EyeSlash size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
      </button>
    </div>
  )
}

function Feedback({ error, saved, savedText }: { error: string | null; saved: boolean; savedText: string }) {
  if (error) {
    return (
      <p role="alert" className="mt-5 border-s-2 border-stuck ps-3 text-sm text-stuck">
        {error}
      </p>
    )
  }
  if (saved) {
    return (
      <p role="status" className="mt-5 text-sm text-done">
        {savedText}
      </p>
    )
  }
  return null
}
