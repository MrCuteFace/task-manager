import { useEffect, useRef, useState, type FormEvent } from 'react'
import { CaretDown, CaretLeft, PaperPlaneTilt, X } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import { useAddUpdate, useUpdateItem, useUpdateSubItem } from '../../api/hooks'
import type { BoardDetail, Item, PriorityOption, StatusOption } from '../../api/types'
import { Avatar } from '../../components/ui/Avatar'
import { Button } from '../../components/ui/Button'
import { useSession } from '../../context/session'
import { AssigneeCell, DateCell, PriorityCell } from '../boards/cells'
import { TitleCell } from '../boards/cells/TitleCell'
import { StatusPicker } from '../boards/StatusMark'
import { NewStatusDialog } from '../boards/NewStatusDialog'
import { NewPriorityDialog } from '../boards/NewPriorityDialog'
import { priorityPatch } from '../boards/status'
import { useUserMap } from '../users/useUserMap'
import { MentionTextarea } from './MentionTextarea'
import { AttachmentsSection } from './AttachmentsSection'
import { UpdatesThread } from './UpdatesThread'

interface ItemPanelProps {
  board: BoardDetail
  item: Item
  onClose: () => void
}

/** The item's own sheet, opened beside the board. Escape closes it. */
export function ItemPanel({ board, item, onClose }: ItemPanelProps) {
  const updateItem = useUpdateItem(board.id)
  const updateSubItem = useUpdateSubItem(board.id)
  const addUpdate = useAddUpdate(board.id)
  const [addingStatus, setAddingStatus] = useState(false)
  const [addingPriority, setAddingPriority] = useState(false)
  const [editingStatus, setEditingStatus] = useState<StatusOption | null>(null)
  const [editingPriority, setEditingPriority] = useState<PriorityOption | null>(null)
  const { nameOf, map: userMap, users } = useUserMap()
  const currentUser = useSession((s) => s.user)
  const panelRef = useRef<HTMLElement>(null)
  const [notes, setNotes] = useState(item.notes ?? '')
  const [updateText, setUpdateText] = useState('')

  useEffect(() => setNotes(item.notes ?? ''), [item.id, item.notes])

  /*
    Which updates appeared while this panel was open. The ids present on the first render of an item
    are the conversation as found; anything that shows up afterwards - your own comment, or one pushed
    over the live stream from another tab - is an arrival, and is written onto the sheet rather than
    simply being there. `seen` is a ref, not state, so recording an arrival never causes a render of
    its own, and the set is rebuilt from scratch whenever the panel moves to another item.
  */
  const seenUpdateIds = useRef<Set<string> | null>(null)
  const [arrivedIds, setArrivedIds] = useState<ReadonlySet<string>>(new Set())
  const [updatesOpen, setUpdatesOpen] = useState(true)

  useEffect(() => {
    seenUpdateIds.current = null
    setArrivedIds(new Set())
    setUpdatesOpen(true)
  }, [item.id])

  useEffect(() => {
    const ids = item.updates.map((u) => u.id)
    if (seenUpdateIds.current === null) {
      seenUpdateIds.current = new Set(ids)
      return
    }
    const fresh = ids.filter((id) => !seenUpdateIds.current!.has(id))
    if (fresh.length === 0) return
    for (const id of fresh) seenUpdateIds.current.add(id)
    setArrivedIds((current) => new Set([...current, ...fresh]))
    // A comment that lands while the conversation is folded away would otherwise arrive invisibly,
    // which is the one thing a live feed must not do.
    setUpdatesOpen(true)
  }, [item.updates])

  useEffect(() => {
    panelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const patch = (fields: Parameters<typeof updateItem.mutate>[0]['patch']) =>
    updateItem.mutate({ itemId: item.id, patch: fields })

  const group = board.groups.find((g) => g.id === item.groupId)

  const submitUpdate = async (e?: FormEvent) => {
    e?.preventDefault()
    const text = updateText.trim()
    if (!text) return
    await addUpdate.mutateAsync({ itemId: item.id, request: { text } })
    setUpdateText('')
  }

  return (
    <aside
      ref={panelRef}
      tabIndex={-1}
      role="dialog"
      aria-label={`פריט: ${item.title}`}
      className="panel-enter sheet flex h-full flex-col overflow-hidden outline-none"
    >
      <header className="flex items-start gap-2 border-b border-rule px-4 pt-4 pb-3">
        <div className="min-w-0 flex-1">
          <nav aria-label="מיקום הפריט" className="flex items-center gap-1 text-xs text-ink-2">
            <Link to={`/boards/${board.id}`} className="truncate hover:underline">
              {board.name}
            </Link>
            {group && (
              <>
                <CaretLeft size={11} aria-hidden className="shrink-0 text-pencil" />
                <span className="truncate">{group.name}</span>
              </>
            )}
          </nav>
          <div className="mt-1 text-base font-semibold [&_button]:text-base [&_button]:font-semibold">
            <TitleCell title={item.title} onOpen={() => undefined} onRename={(title) => patch({ title })} />
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="סגירת הפריט"
          className="pressable rounded-sm p-1.5 text-ink-2 hover:bg-paper-2 hover:text-ink"
        >
          <X size={18} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto">
        <dl className="ruled px-4 text-sm">
          <Field label="סטטוס">
            <StatusPicker
              status={item.status}
              statusId={item.statusId}
              options={board.statuses}
              onChange={(next) => patch(next)}
              itemLabel={item.title}
              onAddStatus={() => setAddingStatus(true)}
              onEditStatus={setEditingStatus}
            />
          </Field>
          <Field label="אחראים">
            <AssigneeCell assigneeIds={item.assigneeIds} onChange={(assigneeIds) => patch({ assigneeIds })} itemLabel={item.title} />
          </Field>
          <Field label="תאריך יעד">
            <DateCell
              dueDate={item.dueDate}
              status={item.status}
              onChange={(dueDate) => patch(dueDate ? { dueDate } : { clearDueDate: true })}
              itemLabel={item.title}
            />
          </Field>
          <Field label="עדיפות">
            <PriorityCell
              priority={item.priority}
              priorityId={item.priorityId}
              options={board.priorities}
              onChange={(next) => patch(priorityPatch(next))}
              itemLabel={item.title}
              onAddPriority={() => setAddingPriority(true)}
              onEditPriority={setEditingPriority}
            />
          </Field>
          <Field label="קבוצה">
            <select
              value={item.groupId}
              onChange={(e) => patch({ groupId: e.target.value })}
              aria-label="קבוצה"
              className="h-8 rounded-sm border border-transparent bg-transparent px-1 text-sm text-ink hover:border-rule focus:border-accent"
            >
              {board.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </Field>
        </dl>

        <section className="px-4 pt-4">
          <label htmlFor="item-notes" className="text-xs font-semibold text-ink-2">
            הערות
          </label>
          <textarea
            id="item-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => {
              if (notes !== (item.notes ?? '')) patch({ notes })
            }}
            rows={3}
            placeholder="הערות לפריט"
            className="mt-1 w-full resize-y rounded-sm border border-rule bg-paper px-2 py-1.5 text-sm text-ink placeholder:text-pencil focus:border-accent"
          />
        </section>

        <AttachmentsSection boardId={board.id} itemId={item.id} attachments={item.attachments} />

        {item.subItems.length > 0 && (
          <section className="px-4 pt-4">
            <h3 className="text-xs font-semibold text-ink-2">תת-פריטים</h3>
            <ul className="ruled mt-1">
              {item.subItems.map((sub) => (
                <li key={sub.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                  <span className="min-w-0 truncate">
                    {sub.title}
                    {sub.assigneeIds.length > 0 && (
                      <span className="ms-2 text-xs text-pencil">{sub.assigneeIds.map(nameOf).join(', ')}</span>
                    )}
                  </span>
                  {/* Subitems stay on the four built-ins: a custom status is a board-level idea. */}
                  <StatusPicker
                    status={sub.status}
                    onChange={(next) =>
                      next.status && updateSubItem.mutate({ subItemId: sub.id, patch: { status: next.status } })
                    }
                    itemLabel={sub.title}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="px-4 pt-5 pb-4">
          {/*
            The whole conversation folds away. On a busy item it is the tallest thing in the panel, and
            the fields above it are what someone opening the item usually came for. Writing a new update
            is unaffected: the composer lives in the panel's footer, outside this section.
          */}
          <h3>
            <button
              type="button"
              onClick={() => setUpdatesOpen((open) => !open)}
              aria-expanded={updatesOpen}
              disabled={item.updates.length === 0}
              className="pressable -mx-1 flex items-center gap-1.5 rounded-sm px-1 py-0.5 text-xs font-semibold text-ink-2 hover:bg-paper-2 hover:text-ink disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-ink-2"
            >
              {item.updates.length > 0 &&
                (updatesOpen ? <CaretDown size={12} weight="bold" aria-hidden /> : <CaretLeft size={12} weight="bold" aria-hidden />)}
              עדכונים
              {item.updates.length > 0 && <span className="font-normal text-pencil">{item.updates.length}</span>}
            </button>
          </h3>
          {item.updates.length === 0 ? (
            <p className="mt-2 text-sm text-pencil">אין עדכונים עדיין. כתבו את הראשון.</p>
          ) : !updatesOpen ? null : (
            <UpdatesThread
              updates={item.updates}
              users={users}
              userMap={userMap}
              arrivedIds={arrivedIds}
              isPosting={addUpdate.isPending}
              onReply={async (text, parentUpdateId) => {
                await addUpdate.mutateAsync({ itemId: item.id, request: { text, parentUpdateId } })
              }}
            />
          )}
        </section>
      </div>

      <form onSubmit={submitUpdate} className="flex items-end gap-2 border-t border-rule bg-paper-2/60 px-4 py-3">
        <Avatar name={currentUser?.fullName ?? ''} src={currentUser?.avatarUrl} size={26} />
        <MentionTextarea
          value={updateText}
          onChange={setUpdateText}
          users={users}
          onSubmit={() => void submitUpdate()}
          rows={1}
          placeholder="כתיבת עדכון, @ לתיוג"
          aria-label="עדכון חדש"
          className="min-h-9 flex-1 resize-none rounded-sm border border-rule bg-paper px-2 py-1.5 text-sm text-ink placeholder:text-pencil focus:border-accent"
        />
        <Button type="submit" variant="primary" size="sm" disabled={!updateText.trim() || addUpdate.isPending} aria-label="שליחת העדכון">
          <PaperPlaneTilt size={14} aria-hidden />
        </Button>
      </form>
      {addingStatus && (
        <NewStatusDialog
          boardId={board.id}
          existing={board.statuses}
          onClose={() => setAddingStatus(false)}
          onCreated={(status) => patch({ statusId: status.id })}
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
      {addingPriority && (
        <NewPriorityDialog
          boardId={board.id}
          existing={board.priorities}
          onClose={() => setAddingPriority(false)}
          onCreated={(priority) => patch({ priorityId: priority.id })}
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
    </aside>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-11 items-center gap-3 py-1">
      <dt className="w-20 shrink-0 text-xs font-semibold text-ink-2">{label}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  )
}
