import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Check, CircleHalf, PencilSimple, Plus, Square, WarningOctagon } from '@phosphor-icons/react'
import { ITEM_STATUSES, type ItemStatus, type StatusOption } from '../../api/types'
import { Popover } from '../../components/ui/Popover'
import { STATUS_LABEL } from './status'

/** The glyph is part of the mark: an empty box, a half-filled circle, an ink tick, a warning sign. */
const ICON: Record<ItemStatus, ReactNode> = {
  Todo: <Square size={14} weight="regular" aria-hidden />,
  InProgress: <CircleHalf size={14} weight="fill" aria-hidden />,
  Done: <Check size={14} weight="bold" aria-hidden />,
  Stuck: <WarningOctagon size={14} weight="fill" aria-hidden />,
}

/**
 * The four built-ins are drawn by the status law in index.css — a highlighter stroke, an ink tick, a
 * pencil ellipse. Those marks are specific drawings and cannot be generated for an arbitrary color,
 * so a board's own status gets the honest thing instead: the same shape and glyph, inked in the
 * color that was chosen for it. `data-status` is what the CSS keys on, so a custom mark deliberately
 * does not set it.
 */
export function StatusMark({
  status,
  option,
  className = '',
}: {
  status: ItemStatus
  /** The resolved status when the item is on one of the board's own; omitted for a built-in. */
  option?: StatusOption
  className?: string
}) {
  const previous = useRef(status)
  const [fresh, setFresh] = useState(false)

  useEffect(() => {
    if (previous.current !== status) {
      previous.current = status
      setFresh(true)
      const t = window.setTimeout(() => setFresh(false), 400)
      return () => window.clearTimeout(t)
    }
  }, [status])

  const custom = option && !option.isBuiltIn

  return (
    <span
      className={`status-mark ${custom ? 'status-mark-custom' : ''} ${fresh ? 'is-fresh' : ''} ${className}`}
      data-status={custom ? undefined : status}
      style={custom ? ({ '--mark': option.color } as CSSProperties) : undefined}
    >
      {ICON[custom ? option.kind : status]}
      <span>{custom ? option.name : STATUS_LABEL[status]}</span>
    </span>
  )
}

interface StatusPickerProps {
  status: ItemStatus
  /** The item's custom status id, if any. */
  statusId?: string | null
  /** Everything this board offers. Falls back to the four built-ins when a board is not in scope. */
  options?: StatusOption[]
  onChange: (next: { status?: ItemStatus; statusId?: string }) => void
  disabled?: boolean
  /** Accessible context, e.g. the item title. */
  itemLabel: string
  /** Opens the "new status" form from inside the picker. Omitted where adding is not offered. */
  onAddStatus?: () => void
  /** Opens one of the board's own statuses for editing. Built-ins are never editable. */
  onEditStatus?: (status: StatusOption) => void
}

/**
 * The pencil beside a board's own label in a picker. A sibling of the option button, never nested
 * in it; hidden until the row is hovered or focused so the list still reads as a list.
 */
export function EditOptionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="pressable shrink-0 rounded-sm p-1 text-pencil opacity-0 hover:bg-paper-2 hover:text-ink focus-visible:opacity-100 group-hover/opt:opacity-100 [@media(hover:none)]:opacity-100"
    >
      <PencilSimple size={14} aria-hidden />
    </button>
  )
}

/** The four built-ins as options, for any caller that has no board payload to hand. */
const BUILT_IN_FALLBACK: StatusOption[] = ITEM_STATUSES.map((kind) => ({
  id: kind === 'InProgress' ? 'in-progress' : kind.toLowerCase(),
  name: STATUS_LABEL[kind],
  color: '#6b7280',
  kind,
  isBuiltIn: true,
}))

/** Click the mark to choose another; keyboard reaches it as a button. */
export function StatusPicker({
  status,
  statusId,
  options,
  onChange,
  disabled,
  itemLabel,
  onAddStatus,
  onEditStatus,
}: StatusPickerProps) {
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const list = options?.length ? options : BUILT_IN_FALLBACK
  const current = statusId ? list.find((o) => o.id === statusId) : undefined
  const currentLabel = current && !current.isBuiltIn ? current.name : STATUS_LABEL[status]

  return (
    <>
      <button
        ref={anchor}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`סטטוס: ${currentLabel}. ${itemLabel}`}
        onClick={() => setOpen((o) => !o)}
        className="pressable rounded-sm hover:bg-paper-2 hover:brightness-105 disabled:opacity-60"
      >
        <StatusMark status={status} option={current} />
      </button>
      <Popover anchorRef={anchor} open={open} onClose={() => setOpen(false)} label="בחירת סטטוס" width={186}>
        <ul className="flex flex-col gap-0.5" role="listbox" aria-label="סטטוס">
          {list.map((o) => {
            const selected = o.isBuiltIn ? !statusId && o.kind === status : o.id === statusId
            return (
              <li key={o.id} role="option" aria-selected={selected} className="group/opt flex items-center gap-0.5">
                <button
                  type="button"
                  className={`pressable flex min-w-0 flex-1 items-center rounded-sm px-2 py-1.5 hover:bg-paper-2 motion-safe:hover:scale-[1.02] ${
                    selected ? 'bg-accent-soft' : ''
                  }`}
                  onClick={() => {
                    setOpen(false)
                    if (selected) return
                    // A built-in is sent as a plain status so the item stops carrying a custom id.
                    onChange(o.isBuiltIn ? { status: o.kind } : { statusId: o.id })
                  }}
                >
                  <StatusMark status={o.kind} option={o} />
                </button>
                {onEditStatus && !o.isBuiltIn && (
                  <EditOptionButton
                    label={`עריכת הסטטוס ${o.name}`}
                    onClick={() => {
                      setOpen(false)
                      onEditStatus(o)
                    }}
                  />
                )}
              </li>
            )
          })}
        </ul>
        {onAddStatus && (
          <div className="mt-1 border-t border-rule pt-1">
            <button
              type="button"
              className="pressable flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-sm text-ink-2 hover:bg-paper-2 hover:text-ink"
              onClick={() => {
                setOpen(false)
                onAddStatus()
              }}
            >
              <Plus size={14} aria-hidden />
              סטטוס חדש
            </button>
          </div>
        )}
      </Popover>
    </>
  )
}
