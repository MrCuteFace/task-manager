import { useState, type FormEvent, type ReactNode } from 'react'
import { ApiError } from '../../api/client'
import { Button } from '../../components/ui/Button'

/**
 * A starting palette, not a limit — the field takes any hex. These are picked to stay legible under
 * the `color-mix` a custom mark applies, in both themes.
 */
const LABEL_SWATCHES = [
  '#2c4fb5',
  '#7c3aed',
  '#0f766e',
  '#b45309',
  '#be123c',
  '#4d7c0f',
  '#a16207',
  '#475569',
]

export interface KindChoice<K extends string> {
  value: K
  label: string
  /** Why this kind matters — the part users skip and regret. */
  hint: string
}

export interface LabelInput<K extends string> {
  name: string
  color: string
  kind: K
}

/**
 * The shared label form behind both the status and priority dialogs: a name, a color, and the
 * built-in kind the label borrows its behaviour from. With `initial` it edits an existing label
 * instead of adding one, and `onDelete` adds a two-step remove.
 *
 * The kind is the field that carries all the meaning — sorting, overdue, notifications and the
 * charts read it rather than the name — so it is explained in words on the form rather than left as
 * a bare dropdown, and every caller must supply a hint per option.
 */
export function NewLabelDialog<K extends string>({
  title,
  subtitle,
  kinds,
  defaultKind,
  kindLabel,
  kindHelp,
  existingNames,
  placeholder,
  initial,
  onCreate,
  onDelete,
  deleteHint,
  onClose,
  renderPreview,
}: {
  title: string
  subtitle: string
  kinds: KindChoice<K>[]
  defaultKind: K
  kindLabel: string
  kindHelp: string
  /** Names already on the board, excluding the label being edited. */
  existingNames: string[]
  placeholder: string
  /** The label being edited; omitted when adding. */
  initial?: LabelInput<K>
  onCreate: (input: LabelInput<K>) => Promise<unknown>
  onDelete?: () => Promise<unknown>
  /** What happens to items on the label once it is gone, shown before the second click. */
  deleteHint?: string
  onClose: () => void
  renderPreview: (input: LabelInput<K>) => ReactNode
}) {
  const editing = Boolean(initial)
  const [name, setName] = useState(initial?.name ?? '')
  const [color, setColor] = useState(initial?.color ?? LABEL_SWATCHES[0])
  const [kind, setKind] = useState<K>(initial?.kind ?? defaultKind)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const trimmed = name.trim()
  const duplicate = existingNames.some((n) => n.toLowerCase() === trimmed.toLowerCase())
  const unchanged = editing && trimmed === initial?.name && color === initial.color && kind === initial.kind
  const canSubmit = trimmed.length > 0 && trimmed.length <= 24 && !duplicate && !busy && !unchanged

  const run = async (action: () => Promise<unknown>, failure: string) => {
    setError(null)
    setBusy(true)
    try {
      await action()
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? (err.detail ?? err.title) : failure)
    } finally {
      setBusy(false)
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    void run(() => onCreate({ name: trimmed, color, kind }), editing ? 'השמירה נכשלה. נסו שוב.' : 'היצירה נכשלה. נסו שוב.')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="סגירה" className="absolute inset-0 bg-ink/30" onClick={onClose} />
      <form
        onSubmit={onSubmit}
        className="panel-enter sheet relative w-full max-w-sm p-5"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        noValidate
      >
        <h2 className="stamp text-lg">{title}</h2>
        <p className="mt-1 text-sm text-ink-2">{subtitle}</p>

        <div className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="label-name" className="text-sm font-semibold">
              שם
            </label>
            <input
              id="label-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={24}
              placeholder={placeholder}
              className="block h-10 w-full rounded-sm border border-rule-strong bg-paper px-3 text-base text-ink transition-colors placeholder:text-pencil focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-soft"
              required
            />
            {duplicate && <p className="text-xs text-stuck">השם הזה כבר בשימוש בלוח.</p>}
          </div>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-sm font-semibold">צבע</legend>
            <div className="flex flex-wrap items-center gap-1.5">
              {LABEL_SWATCHES.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  onClick={() => setColor(swatch)}
                  aria-label={`צבע ${swatch}`}
                  aria-pressed={color === swatch}
                  className={`size-7 rounded-sm transition-transform ${
                    color === swatch ? 'ring-2 ring-accent ring-offset-1 ring-offset-paper' : 'hover:scale-110'
                  }`}
                  style={{ background: swatch }}
                />
              ))}
              {/* The native picker is the escape hatch for anything not in the row above. */}
              <label className="pressable flex size-7 cursor-pointer items-center justify-center rounded-sm border border-rule-strong text-xs text-pencil">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="sr-only"
                  aria-label="בחירת צבע אחר"
                />
                +
              </label>
            </div>
          </fieldset>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="label-kind" className="text-sm font-semibold">
              {kindLabel}
            </label>
            <select
              id="label-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as K)}
              className="block h-10 w-full rounded-sm border border-rule-strong bg-paper px-2 text-base text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-soft"
            >
              {kinds.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label} — {k.hint}
                </option>
              ))}
            </select>
            <p className="text-xs text-pencil">{kindHelp}</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">תצוגה מקדימה</span>
            {renderPreview({ name: trimmed || placeholder, color, kind })}
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-4 border-s-2 border-stuck ps-3 text-sm text-stuck">
            {error}
          </p>
        )}

        {confirmDelete && deleteHint && <p className="mt-4 text-sm text-ink-2">{deleteHint}</p>}

        <div className="mt-5 flex items-center gap-2 border-t border-rule pt-4">
          <Button type="submit" variant="primary" disabled={!canSubmit}>
            {busy ? (editing ? 'שומר…' : 'מוסיף…') : editing ? 'שמירה' : 'הוספה'}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            ביטול
          </Button>
          {onDelete && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                confirmDelete ? void run(onDelete, 'המחיקה נכשלה. נסו שוב.') : setConfirmDelete(true)
              }
              className="pressable ms-auto rounded-sm px-2 py-1.5 text-sm text-stuck hover:bg-paper-2 disabled:opacity-60"
            >
              {confirmDelete ? 'למחוק לצמיתות' : 'מחיקה'}
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
