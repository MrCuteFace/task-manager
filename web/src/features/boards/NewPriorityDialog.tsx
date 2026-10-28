import { useCreatePriority, useDeletePriority, useUpdatePriority } from '../../api/hooks'
import { PRIORITIES, type Priority, type PriorityOption } from '../../api/types'
import { NewLabelDialog, type KindChoice } from './NewLabelDialog'
import { PriorityMark } from './cells/PriorityCell'
import { PRIORITY_LABEL } from './status'

/**
 * Which level the new priority ranks as. Sorting reads the level, never the name, so a board can
 * call its top level "חוסם שחרור" and the priority column still orders it above everything else.
 */
const KIND_HINT: Record<Priority, string> = {
  Critical: 'הגבוהה ביותר — ראשונה במיון',
  High: 'גבוהה',
  Medium: 'רגילה',
  Low: 'נמוכה — אחרונה במיון',
}

// Highest first, the order the picker shows.
const KINDS: KindChoice<Priority>[] = [...PRIORITIES]
  .reverse()
  .map((value) => ({ value, label: PRIORITY_LABEL[value], hint: KIND_HINT[value] }))

/** Adds a priority to the board, or with `editing` renames, recolors or removes one of its own. */
export function NewPriorityDialog({
  boardId,
  existing,
  editing,
  onClose,
  onCreated,
}: {
  boardId: string
  existing: PriorityOption[]
  editing?: PriorityOption
  onClose: () => void
  /** Called with the new priority so the caller can move the item straight onto it. */
  onCreated?: (priority: PriorityOption) => void
}) {
  const create = useCreatePriority(boardId)
  const update = useUpdatePriority(boardId)
  const remove = useDeletePriority(boardId)

  return (
    <NewLabelDialog<Priority>
      title={editing ? 'עריכת עדיפות' : 'עדיפות חדשה'}
      subtitle={editing ? 'השינוי יחול על כל הפריטים בעדיפות הזו.' : 'העדיפות תתווסף ללוח הזה בלבד.'}
      kinds={KINDS}
      defaultKind="High"
      kindLabel="דרגה"
      kindHelp="קובעת את מקומה במיון עמודת העדיפות. המיון נגזר מהדרגה, לא מהשם."
      existingNames={existing.filter((p) => p.id !== editing?.id).map((p) => p.name)}
      placeholder="חוסם שחרור"
      initial={editing}
      onClose={onClose}
      onCreate={async (input) => {
        if (editing) {
          await update.mutateAsync({ priorityId: editing.id, ...input })
          return
        }
        const created = await create.mutateAsync(input)
        onCreated?.(created)
      }}
      onDelete={editing ? () => remove.mutateAsync(editing.id) : undefined}
      deleteHint={
        editing ? `פריטים בעדיפות הזו יחזרו לעדיפות "${PRIORITY_LABEL[editing.kind]}". לחצו שוב כדי למחוק.` : undefined
      }
      renderPreview={({ name, color, kind }) => (
        <PriorityMark priority={kind} option={{ id: 'preview', name, color, kind, isBuiltIn: false }} />
      )}
    />
  )
}
