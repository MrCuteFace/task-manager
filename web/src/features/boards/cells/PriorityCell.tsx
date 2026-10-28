import { useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ArrowDown, ArrowFatLinesUp, ArrowUp, Minus, Plus } from '@phosphor-icons/react'
import { Popover } from '../../../components/ui/Popover'
import { PRIORITIES, type Priority, type PriorityOption } from '../../../api/types'
import { PRIORITY_LABEL } from '../status'
import { EditOptionButton } from '../StatusMark'

const ICON: Record<Priority, ReactNode> = {
  Critical: <ArrowFatLinesUp size={14} weight="fill" aria-hidden />,
  High: <ArrowUp size={14} weight="bold" aria-hidden />,
  Medium: <Minus size={14} weight="bold" aria-hidden />,
  Low: <ArrowDown size={14} weight="bold" aria-hidden />,
}

/** The built-in levels are ink weight only — that is the system's rule for priority. */
const CLASS: Record<Priority, string> = {
  Critical: 'font-bold text-ink',
  High: 'font-semibold text-ink',
  Medium: 'text-ink-2',
  Low: 'text-pencil',
}

/**
 * A priority as it reads on the sheet. A built-in level keeps the ink-weight-plus-icon treatment;
 * a board's own priority is inked in its chosen color, which is the one place priority carries
 * color at all. The icon still comes from the level, so the arrow keeps saying "how urgent".
 */
export function PriorityMark({
  priority,
  option,
  className = '',
}: {
  priority: Priority
  option?: PriorityOption
  className?: string
}) {
  const custom = option && !option.isBuiltIn
  return (
    <span
      className={`inline-flex max-w-full min-w-0 items-center gap-1 whitespace-nowrap text-sm ${
        custom ? 'priority-mark-custom' : CLASS[priority]
      } ${className}`}
      style={custom ? ({ '--mark': option.color } as CSSProperties) : undefined}
      // A board's own name can outrun the narrow column; the full name stays one hover away.
      title={custom ? option.name : undefined}
    >
      <span className="shrink-0">{ICON[priority]}</span>
      <span className="truncate">{custom ? option.name : PRIORITY_LABEL[priority]}</span>
    </span>
  )
}

/** The four levels as options, for any caller with no board payload to hand. */
const BUILT_IN_FALLBACK: PriorityOption[] = [...PRIORITIES].reverse().map((kind) => ({
  id: kind.toLowerCase(),
  name: PRIORITY_LABEL[kind],
  color: '#4a5568',
  kind,
  isBuiltIn: true,
}))

interface PriorityCellProps {
  priority: Priority | null
  /** The item's custom priority id, if any. */
  priorityId?: string | null
  /** Everything this board offers. Falls back to the four levels when a board is not to hand. */
  options?: PriorityOption[]
  onChange: (next: { priority?: Priority | null; priorityId?: string }) => void
  /** Accessible context, e.g. the item title. */
  itemLabel: string
  disabled?: boolean
  /** Opens the "new priority" form from inside the picker. Omitted where adding is not offered. */
  onAddPriority?: () => void
  /** Opens one of the board's own priorities for editing. Built-in levels are never editable. */
  onEditPriority?: (priority: PriorityOption) => void
}

/** Click the mark to choose another priority; keyboard reaches it as a button. */
export function PriorityCell({
  priority,
  priorityId,
  options,
  onChange,
  itemLabel,
  disabled,
  onAddPriority,
  onEditPriority,
}: PriorityCellProps) {
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const list = options?.length ? options : BUILT_IN_FALLBACK
  const current = priorityId ? list.find((o) => o.id === priorityId) : undefined
  const label = current && !current.isBuiltIn ? current.name : priority ? PRIORITY_LABEL[priority] : 'ללא'

  const content = priority ? (
    <PriorityMark priority={priority} option={current} />
  ) : (
    <span className="inline-flex items-center gap-1 text-sm text-pencil">ללא</span>
  )

  if (disabled) {
    return <span className="inline-flex items-center rounded-sm px-1 py-0.5">{content}</span>
  }

  return (
    <>
      <button
        ref={anchor}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`עדיפות: ${label}. ${itemLabel}`}
        onClick={() => setOpen((o) => !o)}
        className="pressable flex max-w-full items-center rounded-sm px-1 py-0.5 hover:bg-paper-2 hover:brightness-105"
      >
        {content}
      </button>
      <Popover anchorRef={anchor} open={open} onClose={() => setOpen(false)} label="בחירת עדיפות" width={186}>
        <ul className="flex flex-col gap-0.5" role="listbox" aria-label="עדיפות">
          {list.map((o) => {
            const selected = o.isBuiltIn ? !priorityId && o.kind === priority : o.id === priorityId
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
                    // A built-in is sent as a plain level so the item stops carrying a custom id.
                    onChange(o.isBuiltIn ? { priority: o.kind } : { priorityId: o.id })
                  }}
                >
                  <PriorityMark priority={o.kind} option={o} />
                </button>
                {onEditPriority && !o.isBuiltIn && (
                  <EditOptionButton
                    label={`עריכת העדיפות ${o.name}`}
                    onClick={() => {
                      setOpen(false)
                      onEditPriority(o)
                    }}
                  />
                )}
              </li>
            )
          })}
          <li role="option" aria-selected={priority === null}>
            <button
              type="button"
              className={`pressable flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-sm text-pencil hover:bg-paper-2 ${
                priority === null ? 'bg-accent-soft' : ''
              }`}
              onClick={() => {
                setOpen(false)
                if (priority !== null || priorityId) onChange({ priority: null })
              }}
            >
              ללא עדיפות
            </button>
          </li>
        </ul>
        {onAddPriority && (
          <div className="mt-1 border-t border-rule pt-1">
            <button
              type="button"
              className="pressable flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-sm text-ink-2 hover:bg-paper-2 hover:text-ink"
              onClick={() => {
                setOpen(false)
                onAddPriority()
              }}
            >
              <Plus size={14} aria-hidden />
              עדיפות חדשה
            </button>
          </div>
        )}
      </Popover>
    </>
  )
}
