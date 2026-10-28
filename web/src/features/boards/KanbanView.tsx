import { useState, type DragEvent } from 'react'
import { useUpdateItem } from '../../api/hooks'
import type { BoardDetail, Item, StatusOption } from '../../api/types'
import { AvatarStack, type Person } from '../../components/ui/Avatar'
import { useUserMap } from '../users/useUserMap'
import { StatusMark } from './StatusMark'
import { formatDate, isOverdue } from './status'
import { opensFromRow } from './rowClick'

/**
 * Which column an item belongs in. A built-in column holds items with that meaning and no custom
 * status; a custom column holds exactly the items pointing at it. Without the `statusId` check an
 * item on "ממתין לראיון" would also appear under בתהליך, since it carries that meaning too.
 */
function belongsTo(item: Item, option: StatusOption): boolean {
  return option.isBuiltIn ? !item.statusId && item.status === option.kind : item.statusId === option.id
}

interface KanbanViewProps {
  board: BoardDetail
  openItemId: string | null
  onOpenItem: (id: string) => void
}

/** Four pinned sheets side by side, one per status; a row dragged to another sheet changes its status. */
export function KanbanView({ board, openItemId, onOpenItem }: KanbanViewProps) {
  const updateItem = useUpdateItem(board.id)
  const { personOf } = useUserMap()
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)

  const groupById = new Map(board.groups.map((g) => [g.id, g]))
  const items = board.groups.flatMap((g) => g.items)
  // One column per status the board offers, so a board's own statuses get their own sheet.
  const columns = board.statuses

  const onDrop = (option: StatusOption) => (e: DragEvent) => {
    e.preventDefault()
    const itemId = e.dataTransfer.getData('text/item-id') || dragging
    setOver(null)
    setDragging(null)
    if (!itemId) return
    const item = items.find((i) => i.id === itemId)
    if (!item || belongsTo(item, option)) return
    updateItem.mutate({
      itemId,
      patch: option.isBuiltIn ? { status: option.kind } : { statusId: option.id },
    })
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {columns.map((option) => {
        const status = option.kind
        const column = items.filter((i) => belongsTo(i, option))
        return (
          <section
            key={option.id}
            aria-label={`עמודת ${option.name}`}
            onDragOver={(e) => {
              e.preventDefault()
              if (over !== option.id) setOver(option.id)
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null)
            }}
            onDrop={onDrop(option)}
            className={`sheet sheet-margin sheet-margin-narrow flex min-h-80 flex-col pt-3 pe-3 pb-0 ps-10 transition-[outline-color] ${
              over === option.id ? 'outline outline-2 outline-accent' : 'outline outline-2 outline-transparent'
            }`}
          >
            <header className="flex items-center justify-between border-b border-rule-strong pb-2">
              <StatusMark status={status} option={option} />
              <span className="text-xs text-pencil">{column.length}</span>
            </header>
            <ul className="ruled ruled-tail flex-1 pb-10">
              {column.map((item) => (
                <li key={item.id} className="bg-paper">
                  <KanbanRow
                    item={item}
                    groupName={groupById.get(item.groupId)?.name ?? ''}
                    groupColor={groupById.get(item.groupId)?.color ?? 'transparent'}
                    assignees={item.assigneeIds.map(personOf)}
                    selected={openItemId === item.id}
                    dragging={dragging === item.id}
                    onOpen={() => onOpenItem(item.id)}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/item-id', item.id)
                      e.dataTransfer.effectAllowed = 'move'
                      setDragging(item.id)
                    }}
                    onDragEnd={() => {
                      setDragging(null)
                      setOver(null)
                    }}
                  />
                </li>
              ))}
              {column.length === 0 && (
                <li className="bg-paper py-2.5 text-xs text-pencil">אין פריטים. גררו לכאן שורה כדי לשנות את הסטטוס.</li>
              )}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

interface KanbanRowProps {
  item: Item
  groupName: string
  groupColor: string
  assignees: Person[]
  selected: boolean
  dragging: boolean
  onOpen: () => void
  onDragStart: (e: DragEvent<HTMLDivElement>) => void
  onDragEnd: () => void
}

/**
 * A ruled line on the status sheet, not a card - so it answers the pointer the way a table row does
 * (the line tints, the title takes the accent) and never lifts off the sheet. No grip: the whole row
 * is the drag target and `cursor-grab` already says so, and a 14px one cost the title a whole line in
 * a column this narrow. Clicking anywhere on the line opens the item, as on a table row.
 */
function KanbanRow({ item, groupName, groupColor, assignees, selected, dragging, onOpen, onDragStart, onDragEnd }: KanbanRowProps) {
  const overdue = isOverdue(item.dueDate, item.status)
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={(e) => opensFromRow(e) && onOpen()}
      className={`group/line pressable -me-1 cursor-grab rounded-sm px-1 py-2 active:cursor-grabbing ${
        selected ? 'bg-accent-soft/60' : 'hover:bg-paper-2'
      } ${dragging ? 'opacity-50' : ''}`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="block w-full rounded-sm text-start text-sm leading-5 text-ink transition-colors duration-150 group-hover/line:text-accent"
      >
        {item.title}
      </button>
      <div className="mt-1 flex items-center justify-between gap-2 text-xs">
        <span className="flex min-w-0 items-center gap-1.5 text-pencil">
          <span className="h-3 w-px shrink-0" style={{ background: groupColor }} aria-hidden />
          <span className="truncate">{groupName}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {item.dueDate && (
            <span className={overdue ? 'font-semibold text-stuck' : item.status === 'Done' ? 'text-pencil' : 'text-ink-2'}>
              {formatDate(item.dueDate)}
            </span>
          )}
          {assignees.length > 0 && <AvatarStack people={assignees} max={2} />}
        </span>
      </div>
    </div>
  )
}
