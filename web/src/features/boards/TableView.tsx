import { Fragment, useState, type DragEvent, type KeyboardEvent } from 'react'
import { ArrowDown, ArrowUp, CaretDown, CaretLeft, ChatCircleText, DotsSixVertical, Paperclip } from '@phosphor-icons/react'
import { useCreateGroup, useCreateItem, useUpdateItem, useUpdateSubItem } from '../../api/hooks'
import type { BoardDetail, Group, Item, PriorityOption, StatusOption } from '../../api/types'
import { AssigneeCell, DateCell, PriorityCell } from './cells'
import { TitleCell } from './cells/TitleCell'
import { AddItemRow } from './AddItemRow'
import { AddGroupRow } from './AddGroupRow'
import { StatusPicker } from './StatusMark'
import { NewStatusDialog } from './NewStatusDialog'
import { NewPriorityDialog } from './NewPriorityDialog'
import { SORT_LABEL, nextSort, sortItems, type SortKey, type SortSpec } from './sorting'
import { priorityPatch } from './status'
import { useUserMap } from '../users/useUserMap'
import { useMediaQuery } from '../../components/ui/useMediaQuery'
import { opensFromRow } from './rowClick'

interface TableViewProps {
  board: BoardDetail
  openItemId: string | null
  onOpenItem: (id: string) => void
  firstAddInputId: string
  /** Hides the priority column, e.g. while the item panel narrows the sheet. */
  compact?: boolean
  /** Column sort; null keeps the manual order the user arranged. */
  sort: SortSpec | null
  onSortChange: (sort: SortSpec | null) => void
}

interface DropTarget {
  groupId: string
  index: number
}

const DRAG_TYPE = 'text/roster-item-id'

/** The roster sheet: groups as stamped sections, items as ruled rows. Rows can be dragged to a new place or sorted by a column. */
export function TableView({ board, openItemId, onOpenItem, firstAddInputId, compact = false, sort, onSortChange }: TableViewProps) {
  const priorityCol = compact ? 'hidden' : 'hidden md:table-cell'
  const isWide = useMediaQuery('(min-width: 768px)')
  // Cells that span the row must match the number of rendered columns, or the table grows phantom columns.
  const columnCount = isWide ? (compact ? 4 : 5) : 3
  const updateItem = useUpdateItem(board.id)
  const createItem = useCreateItem(board.id)
  const createGroup = useCreateGroup(board.id)
  const updateSubItem = useUpdateSubItem(board.id)
  const { nameOf } = useUserMap()
  const reorderEnabled = sort === null
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [expandedSubs, setExpandedSubs] = useState<Set<string>>(new Set())
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  // The item whose picker opened the "new status" form; it moves onto the status once created.
  const [addStatusFor, setAddStatusFor] = useState<string | null>(null)
  const [addPriorityFor, setAddPriorityFor] = useState<string | null>(null)
  const [editingStatus, setEditingStatus] = useState<StatusOption | null>(null)
  const [editingPriority, setEditingPriority] = useState<PriorityOption | null>(null)

  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  }

  const patch = (itemId: string, fields: Parameters<typeof updateItem.mutate>[0]['patch']) =>
    updateItem.mutate({ itemId, patch: fields })

  /** Moves an item to slot `index` of `groupId` (a slot counts the item's own current row). */
  const moveItem = (item: Item, groupId: string, index: number) => {
    const sourceGroup = board.groups.find((g) => g.id === item.groupId)
    const currentIndex = sourceGroup ? sourceGroup.items.findIndex((i) => i.id === item.id) : -1
    if (groupId === item.groupId && (index === currentIndex || index === currentIndex + 1)) return
    const order = groupId === item.groupId && index > currentIndex ? index - 1 : index
    patch(item.id, groupId === item.groupId ? { order } : { groupId, order })
  }

  // ---- drag and drop ----------------------------------------------------------

  const onRowDragOver = (e: DragEvent<HTMLTableRowElement>, group: Group, rowIndex: number) => {
    if (!draggingId) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = e.currentTarget.getBoundingClientRect()
    const after = e.clientY > rect.top + rect.height / 2
    const index = after ? rowIndex + 1 : rowIndex
    if (dropTarget?.groupId !== group.id || dropTarget.index !== index) setDropTarget({ groupId: group.id, index })
  }

  const onGroupEndDragOver = (e: DragEvent<HTMLElement>, group: Group) => {
    if (!draggingId) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const index = group.items.length
    if (dropTarget?.groupId !== group.id || dropTarget.index !== index) setDropTarget({ groupId: group.id, index })
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    const itemId = e.dataTransfer.getData(DRAG_TYPE) || draggingId
    const target = dropTarget
    setDraggingId(null)
    setDropTarget(null)
    if (!itemId || !target) return
    const item = board.groups.flatMap((g) => g.items).find((i) => i.id === itemId)
    if (item) moveItem(item, target.groupId, target.index)
  }

  const endDrag = () => {
    setDraggingId(null)
    setDropTarget(null)
  }

  /** Keyboard alternative on the handle: arrows move one row; Alt+arrows jump to the next or previous group. */
  const onHandleKeyDown = (e: KeyboardEvent<HTMLButtonElement>, item: Item, group: Group, rowIndex: number) => {
    if (!reorderEnabled) return
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    e.preventDefault()
    const up = e.key === 'ArrowUp'
    if (e.altKey) {
      const gi = board.groups.findIndex((g) => g.id === group.id)
      const target = board.groups[up ? gi - 1 : gi + 1]
      if (!target) return
      moveItem(item, target.id, up ? target.items.length : 0)
      return
    }
    const to = up ? rowIndex - 1 : rowIndex + 2
    if (to < 0 || to > group.items.length) return
    moveItem(item, group.id, to)
  }

  const dropClass = (groupId: string, rowIndex: number) =>
    dropTarget && dropTarget.groupId === groupId && dropTarget.index === rowIndex ? 'drop-before' : ''

  let rowCounter = 0

  return (
    <div className="overflow-x-auto" onDragEnd={endDrag}>
      <table className="w-full table-fixed border-collapse text-sm md:min-w-[640px]">
        <thead>
          <tr className="text-xs text-pencil">
            <SortableHeader sortKey="title" sort={sort} onSortChange={onSortChange} className="px-2 pb-2 md:px-3" />
            <SortableHeader sortKey="status" sort={sort} onSortChange={onSortChange} className="w-[92px] px-2 pb-2 md:w-[132px]" />
            <SortableHeader sortKey="assignee" sort={sort} onSortChange={onSortChange} className="hidden px-2 pb-2 md:table-cell md:w-[140px]" />
            <SortableHeader sortKey="dueDate" sort={sort} onSortChange={onSortChange} className="w-[84px] px-2 pb-2 md:w-[118px]" />
            <SortableHeader sortKey="priority" sort={sort} onSortChange={onSortChange} className={`${priorityCol} px-2 pb-2 md:w-[100px]`} />
          </tr>
        </thead>
        {board.groups.map((group, groupIndex) => (
          <GroupSection
            key={group.id}
            group={group}
            items={sortItems(group.items, sort, nameOf)}
            columnCount={columnCount}
            isCollapsed={collapsed.has(group.id)}
            onToggle={() => setCollapsed((s) => toggle(s, group.id))}
            onHeaderDragOver={(e) => onGroupEndDragOver(e, group)}
            onHeaderDrop={onDrop}
            renderItem={(item, rowIndex) => {
              const animationIndex = rowCounter++
              return (
                <Fragment key={item.id}>
                  <tr
                    className={`group/row row-enter cursor-pointer align-middle transition-colors ${
                      openItemId === item.id ? 'bg-accent-soft/60' : 'hover:bg-paper-2/70'
                    } ${draggingId === item.id ? 'row-dragging' : ''} ${dropClass(group.id, rowIndex)}`}
                    style={{ ['--i' as string]: animationIndex }}
                    draggable={draggingId === item.id}
                    onDragStart={(e) => {
                      e.dataTransfer.setData(DRAG_TYPE, item.id)
                      e.dataTransfer.effectAllowed = 'move'
                    }}
                    onDragOver={(e) => onRowDragOver(e, group, rowIndex)}
                    onDrop={onDrop}
                    onClick={(e) => opensFromRow(e) && onOpenItem(item.id)}
                  >
                    <td className="px-2 py-1 md:px-3">
                      <div className="flex items-center gap-1 md:gap-1.5">
                        <button
                          type="button"
                          aria-label={`שינוי מיקום: ${item.title}. גררו, או השתמשו בחצים למעלה ולמטה; עם Alt כדי לעבור קבוצה`}
                          title={reorderEnabled ? 'גרירה לשינוי הסדר' : 'שינוי סדר ידני זמין רק כשאין מיון לפי עמודה'}
                          disabled={!reorderEnabled}
                          className={`pressable -ms-1 shrink-0 touch-none rounded-sm p-0.5 text-pencil opacity-0 hover:bg-paper-2 hover:text-ink focus-visible:opacity-100 ${
                            reorderEnabled ? 'cursor-grab active:cursor-grabbing group-hover/row:opacity-100' : 'cursor-not-allowed'
                          }`}
                          onPointerDown={() => reorderEnabled && setDraggingId(item.id)}
                          onPointerUp={() => {
                            if (!dropTarget) setDraggingId(null)
                          }}
                          onKeyDown={(e) => onHandleKeyDown(e, item, group, rowIndex)}
                        >
                          <DotsSixVertical size={14} weight="bold" aria-hidden />
                        </button>
                        {item.subItems.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => setExpandedSubs((s) => toggle(s, item.id))}
                            aria-expanded={expandedSubs.has(item.id)}
                            aria-label={`${item.subItems.length} תת-פריטים`}
                            className="pressable shrink-0 rounded-sm p-0.5 text-pencil hover:bg-paper-2 hover:text-ink"
                          >
                            {expandedSubs.has(item.id) ? <CaretDown size={14} /> : <CaretLeft size={14} />}
                          </button>
                        ) : (
                          <span className="w-4 shrink-0 md:w-5" aria-hidden />
                        )}
                        <div className="min-w-0 flex-1">
                          <TitleCell
                            title={item.title}
                            onOpen={() => onOpenItem(item.id)}
                            onRename={(title) => patch(item.id, { title })}
                          />
                        </div>
                        {item.attachments.length > 0 && (
                          <span
                            className="hidden shrink-0 items-center gap-0.5 text-xs text-pencil md:inline-flex"
                            title={`${item.attachments.length} קבצים`}
                          >
                            <Paperclip size={14} aria-hidden />
                            {item.attachments.length}
                          </span>
                        )}
                        {item.updates.length > 0 && (
                          <span
                            className="hidden shrink-0 items-center gap-0.5 text-xs text-pencil md:inline-flex"
                            title={`${item.updates.length} עדכונים`}
                          >
                            <ChatCircleText size={14} aria-hidden />
                            {item.updates.length}
                          </span>
                        )}
                        {/* Surfaces on row hover, as in MondayTry; the title opens the item too, so this is a shortcut. */}
                        <button
                          type="button"
                          onClick={() => onOpenItem(item.id)}
                          aria-label={`פתיחת ${item.title}`}
                          className="pressable hidden shrink-0 rounded-sm px-1.5 py-0.5 text-xs font-medium text-accent opacity-0 hover:bg-accent-soft focus-visible:opacity-100 group-hover/row:opacity-100 md:inline-flex"
                        >
                          פתיחה
                        </button>
                      </div>
                    </td>
                    <td className="px-2 py-1">
                      <StatusPicker
                        status={item.status}
                        statusId={item.statusId}
                        options={board.statuses}
                        onChange={(next) => patch(item.id, next)}
                        itemLabel={item.title}
                        onAddStatus={() => setAddStatusFor(item.id)}
                        onEditStatus={setEditingStatus}
                      />
                    </td>
                    <td className="hidden px-2 py-1 md:table-cell">
                      <AssigneeCell
                        assigneeIds={item.assigneeIds}
                        onChange={(assigneeIds) => patch(item.id, { assigneeIds })}
                        itemLabel={item.title}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <DateCell
                        dueDate={item.dueDate}
                        status={item.status}
                        onChange={(dueDate) => patch(item.id, dueDate ? { dueDate } : { clearDueDate: true })}
                        itemLabel={item.title}
                      />
                    </td>
                    <td className={`${priorityCol} px-2 py-1`}>
                      <PriorityCell
                        priority={item.priority}
                        priorityId={item.priorityId}
                        options={board.priorities}
                        onChange={(next) => patch(item.id, priorityPatch(next))}
                        itemLabel={item.title}
                        onAddPriority={() => setAddPriorityFor(item.id)}
                        onEditPriority={setEditingPriority}
                      />
                    </td>
                  </tr>
                  {expandedSubs.has(item.id) &&
                    item.subItems.map((sub) => (
                      <tr key={sub.id} className="bg-paper-2/50 text-[0.8125rem]">
                        <td className="px-2 py-0.5 ps-8 md:px-3 md:ps-12">
                          <span className="text-ink-2">{sub.title}</span>
                        </td>
                        <td className="px-2 py-0.5">
                          {/* Subitems stay on the four built-ins: a custom status is a board-level idea. */}
                          <StatusPicker
                            status={sub.status}
                            onChange={(next) =>
                              next.status && updateSubItem.mutate({ subItemId: sub.id, patch: { status: next.status } })
                            }
                            itemLabel={sub.title}
                          />
                        </td>
                        <td className="hidden px-2 py-0.5 text-xs text-ink-2 md:table-cell">
                          {sub.assigneeIds.map(nameOf).join(', ')}
                        </td>
                        <td className="px-2 py-0.5">
                          <DateCell dueDate={sub.dueDate} status={sub.status} onChange={() => undefined} itemLabel={sub.title} disabled />
                        </td>
                        <td className={priorityCol} />
                      </tr>
                    ))}
                </Fragment>
              )
            }}
            footer={
              <tr
                className={dropTarget?.groupId === group.id && dropTarget.index === group.items.length ? 'drop-before' : ''}
                onDragOver={(e) => onGroupEndDragOver(e, group)}
                onDrop={onDrop}
              >
                <td colSpan={columnCount} className="px-2 py-0.5 ps-6 md:px-3 md:ps-8">
                  <AddItemRow
                    groupName={group.name}
                    inputId={groupIndex === 0 ? firstAddInputId : undefined}
                    onAdd={(title) => createItem.mutateAsync({ groupId: group.id, title })}
                  />
                </td>
              </tr>
            }
          />
        ))}
      </table>
      <AddGroupRow onAdd={(name) => createGroup.mutateAsync({ name })} />
      <div className="ruled-tail mt-2 h-40 border-t border-rule" aria-hidden />
      {addStatusFor && (
        <NewStatusDialog
          boardId={board.id}
          existing={board.statuses}
          onClose={() => setAddStatusFor(null)}
          onCreated={(status) => patch(addStatusFor, { statusId: status.id })}
        />
      )}
      {editingStatus && (
        <NewStatusDialog
          boardId={board.id}
          existing={board.statuses}
          editing={editingStatus}
          onClose={() => setEditingStatus(null)}
        />
      )}
      {addPriorityFor && (
        <NewPriorityDialog
          boardId={board.id}
          existing={board.priorities}
          onClose={() => setAddPriorityFor(null)}
          onCreated={(priority) => patch(addPriorityFor, { priorityId: priority.id })}
        />
      )}
      {editingPriority && (
        <NewPriorityDialog
          boardId={board.id}
          existing={board.priorities}
          editing={editingPriority}
          onClose={() => setEditingPriority(null)}
        />
      )}
    </div>
  )
}

interface SortableHeaderProps {
  sortKey: SortKey
  sort: SortSpec | null
  onSortChange: (sort: SortSpec | null) => void
  className?: string
}

/** A column header that sorts on click: ascending, then descending, then back to the manual order. */
function SortableHeader({ sortKey, sort, onSortChange, className = '' }: SortableHeaderProps) {
  const active = sort?.key === sortKey
  const direction = active && sort ? sort.direction : null
  const next = nextSort(sort, sortKey)
  const hint = next === null ? 'חזרה לסדר הידני' : next.direction === 'asc' ? 'מיון בסדר עולה' : 'מיון בסדר יורד'
  return (
    <th
      scope="col"
      aria-sort={direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'}
      className={`text-start font-medium ${className}`}
    >
      <button
        type="button"
        onClick={() => onSortChange(next)}
        title={`${SORT_LABEL[sortKey]}: ${hint}`}
        className={`pressable -mx-1 inline-flex items-center gap-1 rounded-sm px-1 py-0.5 text-xs hover:bg-paper-2 hover:text-ink ${
          active ? 'font-semibold text-ink' : 'text-pencil'
        }`}
      >
        {SORT_LABEL[sortKey]}
        {direction === 'asc' && <ArrowUp size={12} weight="bold" aria-hidden />}
        {direction === 'desc' && <ArrowDown size={12} weight="bold" aria-hidden />}
      </button>
    </th>
  )
}

interface GroupSectionProps {
  group: Group
  /** The group's items in display order (sorted or manual). */
  items: Item[]
  columnCount: number
  isCollapsed: boolean
  onToggle: () => void
  renderItem: (item: Item, rowIndex: number) => React.ReactNode
  footer: React.ReactNode
  onHeaderDragOver: (e: DragEvent<HTMLTableSectionElement>) => void
  onHeaderDrop: (e: DragEvent<HTMLTableSectionElement>) => void
}

function GroupSection({ group, items, columnCount, isCollapsed, onToggle, renderItem, footer, onHeaderDragOver, onHeaderDrop }: GroupSectionProps) {
  const doneCount = group.items.filter((i) => i.status === 'Done').length
  return (
    <tbody className="ruled-group" onDragOver={isCollapsed ? onHeaderDragOver : undefined} onDrop={isCollapsed ? onHeaderDrop : undefined}>
      <tr>
        <th colSpan={columnCount} scope="colgroup" className="pt-5 pb-1 text-start">
          <div className="flex items-end gap-3 border-b px-3 pb-1.5" style={{ borderColor: group.color }}>
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={!isCollapsed}
              className="pressable stamp flex items-center gap-1.5 rounded-sm text-base leading-none text-ink"
            >
              {isCollapsed ? <CaretLeft size={14} aria-hidden /> : <CaretDown size={14} aria-hidden />}
              {group.name}
            </button>
            <span className="text-xs font-normal text-pencil">
              {group.items.length} פריטים, {doneCount} הושלמו
            </span>
          </div>
        </th>
      </tr>
      {!isCollapsed && (
        <>
          {group.items.length === 0 && (
            <tr>
              <td colSpan={columnCount} className="px-3 py-2 text-sm text-pencil">
                אין פריטים בקבוצה זו עדיין. הוסיפו את הראשון בשורה שלמטה או גררו לכאן פריט.
              </td>
            </tr>
          )}
          {items.map(renderItem)}
          {footer}
        </>
      )}
    </tbody>
  )
}
