import { useRef, useState } from 'react'
import { UserPlus } from '@phosphor-icons/react'
import { Popover } from '../../../components/ui/Popover'
import { Avatar, AvatarStack } from '../../../components/ui/Avatar'
import { useUserMap } from '../../users/useUserMap'

interface AssigneeCellProps {
  assigneeIds: string[]
  onChange: (assigneeIds: string[]) => void
  /** Accessible context, e.g. the item title. */
  itemLabel: string
  disabled?: boolean
}

/** Click the avatars to choose assignees; keyboard reaches it as a button. */
export function AssigneeCell({ assigneeIds, onChange, itemLabel, disabled }: AssigneeCellProps) {
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const { nameOf, personOf, users } = useUserMap()

  const names = assigneeIds.map(nameOf)
  const people = assigneeIds.map(personOf)
  const label = names.length > 0 ? names.join(', ') : 'ללא אחראי'

  const content = (
    <>
      {names.length > 0 ? (
        <>
          <AvatarStack people={people} max={3} />
          {names.length === 1 && <span className="text-sm text-ink">{names[0].split(/\s+/)[0]}</span>}
        </>
      ) : (
        <>
          <UserPlus size={14} aria-hidden />
          <span className="text-sm text-pencil">ללא אחראי</span>
        </>
      )}
    </>
  )

  if (disabled) {
    return <span className="inline-flex items-center gap-1.5 rounded-sm px-1 py-0.5">{content}</span>
  }

  function toggle(id: string) {
    const next = assigneeIds.includes(id) ? assigneeIds.filter((x) => x !== id) : [...assigneeIds, id]
    const ordered = users.filter((u) => next.includes(u.id)).map((u) => u.id)
    onChange(ordered)
  }

  return (
    <>
      <button
        ref={anchor}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`אחראים: ${label}. ${itemLabel}`}
        onClick={() => setOpen((o) => !o)}
        className="pressable flex items-center gap-1.5 rounded-sm px-1 py-0.5 hover:bg-paper-2"
      >
        {content}
      </button>
      <Popover anchorRef={anchor} open={open} onClose={() => setOpen(false)} label="בחירת אחראים" width={240}>
        <ul className="flex flex-col gap-0.5" aria-label="אחראים">
          {users.map((u) => (
            <li key={u.id}>
              <label className="pressable flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-paper-2">
                <input
                  type="checkbox"
                  className="accent-accent"
                  checked={assigneeIds.includes(u.id)}
                  onChange={() => toggle(u.id)}
                />
                <Avatar name={u.fullName} src={u.avatarUrl} size={22} />
                <span className="flex flex-col">
                  <span className="text-sm">{u.fullName}</span>
                  <span className="text-xs text-ink-2">{u.title}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        {assigneeIds.length > 0 && (
          <div className="mt-1 border-t border-rule pt-1">
            <button
              type="button"
              className="pressable w-full rounded-sm px-2 py-1 text-start text-xs text-ink-2 hover:bg-paper-2"
              onClick={() => onChange([])}
            >
              נקה
            </button>
          </div>
        )}
      </Popover>
    </>
  )
}
