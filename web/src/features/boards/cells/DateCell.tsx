import { useRef, useState } from 'react'
import { CalendarBlank, WarningCircle } from '@phosphor-icons/react'
import { Popover } from '../../../components/ui/Popover'
import type { ItemStatus } from '../../../api/types'
import { formatDate, formatFullDate, isOverdue, parseDateOnly, todayDateOnly } from '../status'

interface DateCellProps {
  dueDate: string | null
  status: ItemStatus
  onChange: (dueDate: string | null) => void
  /** Accessible context, e.g. the item title. */
  itemLabel: string
  disabled?: boolean
}

/** Click the date to change it; keyboard reaches it as a button. */
export function DateCell({ dueDate, status, onChange, itemLabel, disabled }: DateCellProps) {
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)

  const overdue = isOverdue(dueDate, status)
  const isToday = dueDate === todayDateOnly() && status !== 'Done'
  const ariaDate = dueDate ? formatFullDate(dueDate) : 'ללא'

  let daysOverdue = 0
  if (overdue && dueDate) {
    const diffMs = parseDateOnly(todayDateOnly()).getTime() - parseDateOnly(dueDate).getTime()
    daysOverdue = Math.round(diffMs / 86_400_000)
  }
  const overdueTitle = daysOverdue === 1 ? 'באיחור של יום אחד' : `באיחור של ${daysOverdue} ימים`
  const title = overdue ? overdueTitle : dueDate ? formatFullDate(dueDate) : undefined

  let colorClass = 'text-ink'
  if (!dueDate) colorClass = 'text-pencil'
  else if (overdue) colorClass = 'text-stuck font-semibold'
  else if (status === 'Done') colorClass = 'text-pencil line-through-none'

  const content = (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap text-sm ${colorClass} ${
        isToday && !overdue ? 'rounded-sm border border-ink px-1' : ''
      }`}
    >
      {!dueDate && <CalendarBlank size={14} aria-hidden />}
      {overdue && <WarningCircle size={14} weight="fill" aria-hidden />}
      {dueDate ? formatDate(dueDate) : (<><span className="md:hidden">ללא</span><span className="hidden md:inline">ללא תאריך</span></>)}
    </span>
  )

  if (disabled) {
    return (
      <span title={title} className="inline-flex items-center rounded-sm px-1 py-0.5">
        {content}
      </span>
    )
  }

  return (
    <>
      <button
        ref={anchor}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`תאריך יעד: ${ariaDate}. ${itemLabel}`}
        title={title}
        onClick={() => setOpen((o) => !o)}
        className="pressable flex items-center rounded-sm px-1 py-0.5 hover:bg-paper-2"
      >
        {content}
      </button>
      <Popover anchorRef={anchor} open={open} onClose={() => setOpen(false)} label="תאריך יעד" width={232}>
        <div className="flex flex-col gap-1.5 p-1">
          <input
            type="date"
            dir="ltr"
            value={dueDate ?? ''}
            onChange={(e) => {
              onChange(e.target.value || null)
              setOpen(false)
            }}
            className="h-9 w-full rounded-sm border border-rule-strong bg-paper px-2 text-sm"
          />
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className="pressable rounded-sm px-2 py-1 text-xs text-ink-2 hover:bg-paper-2"
              onClick={() => {
                onChange(todayDateOnly())
                setOpen(false)
              }}
            >
              היום
            </button>
            {dueDate && (
              <button
                type="button"
                className="pressable rounded-sm px-2 py-1 text-xs text-ink-2 hover:bg-paper-2"
                onClick={() => {
                  onChange(null)
                  setOpen(false)
                }}
              >
                נקה
              </button>
            )}
          </div>
        </div>
      </Popover>
    </>
  )
}
