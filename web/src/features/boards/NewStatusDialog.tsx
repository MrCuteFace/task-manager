import { useCreateStatus, useDeleteStatus, useUpdateStatus } from '../../api/hooks'
import { ITEM_STATUSES, type ItemStatus, type StatusOption } from '../../api/types'
import { NewLabelDialog, type KindChoice } from './NewLabelDialog'
import { StatusMark } from './StatusMark'
import { STATUS_LABEL } from './status'

/**
 * What the new status *means*. This is the part that is easy to skip and expensive to get wrong:
 * overdue skips anything meaning "done", the bell alerts on "blocked", and the charts order by
 * progress. A custom status borrows one of the four meanings so all of that keeps working.
 */
const KIND_HINT: Record<ItemStatus, string> = {
  Todo: 'עדיין לא התחילו',
  InProgress: 'בעבודה',
  Done: 'נחשב גמור — לא יסומן כאיחור',
  Stuck: 'חסום — יופיע בהתראות',
}

const KINDS: KindChoice<ItemStatus>[] = ITEM_STATUSES.map((value) => ({
  value,
  label: STATUS_LABEL[value],
  hint: KIND_HINT[value],
}))

/** Adds a status to the board, or with `editing` renames, recolors or removes one of its own. */
export function NewStatusDialog({
  boardId,
  existing,
  editing,
  onClose,
  onCreated,
}: {
  boardId: string
  existing: StatusOption[]
  editing?: StatusOption
  onClose: () => void
  /** Called with the new status so the caller can move the item straight onto it. */
  onCreated?: (status: StatusOption) => void
}) {
  const create = useCreateStatus(boardId)
  const update = useUpdateStatus(boardId)
  const remove = useDeleteStatus(boardId)

  return (
    <NewLabelDialog<ItemStatus>
      title={editing ? 'עריכת סטטוס' : 'סטטוס חדש'}
      subtitle={editing ? 'השינוי יחול על כל הפריטים בסטטוס הזה.' : 'הסטטוס יתווסף ללוח הזה בלבד.'}
      kinds={KINDS}
      defaultKind="InProgress"
      kindLabel="משמעות"
      kindHelp="קובע איך המערכת מתייחסת לסטטוס: איחורים, התראות והתרשימים נגזרים מהמשמעות, לא מהשם."
      existingNames={existing.filter((s) => s.id !== editing?.id).map((s) => s.name)}
      placeholder="ממתין לראיון"
      initial={editing}
      onClose={onClose}
      onCreate={async (input) => {
        if (editing) {
          await update.mutateAsync({ statusId: editing.id, ...input })
          return
        }
        const created = await create.mutateAsync(input)
        onCreated?.(created)
      }}
      onDelete={editing ? () => remove.mutateAsync(editing.id) : undefined}
      deleteHint={
        editing ? `פריטים בסטטוס הזה יחזרו לסטטוס "${STATUS_LABEL[editing.kind]}". לחצו שוב כדי למחוק.` : undefined
      }
      renderPreview={({ name, color, kind }) => (
        <StatusMark status={kind} option={{ id: 'preview', name, color, kind, isBuiltIn: false }} />
      )}
    />
  )
}
