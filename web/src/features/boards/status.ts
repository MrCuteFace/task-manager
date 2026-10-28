import type { ItemStatus, Priority } from '../../api/types'

/** Hebrew labels for the status vocabulary. Colors are defined once in index.css as tokens. */
export const STATUS_LABEL: Record<ItemStatus, string> = {
  Todo: 'לביצוע',
  InProgress: 'בתהליך',
  Done: 'הושלם',
  Stuck: 'תקוע',
}

export const PRIORITY_LABEL: Record<Priority, string> = {
  Low: 'נמוכה',
  Medium: 'בינונית',
  High: 'גבוהה',
  Critical: 'קריטית',
}

/** Turns a priority picker choice into the item patch: an id, a plain level, or clearing it. */
export function priorityPatch(next: { priority?: Priority | null; priorityId?: string }) {
  if (next.priorityId) return { priorityId: next.priorityId }
  return next.priority ? { priority: next.priority } : { clearPriority: true }
}

const dateFormatter = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'short' })
const fullDateFormatter = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })
const dateTimeFormatter = new Intl.DateTimeFormat('he-IL', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatDate(date: string | null | undefined): string {
  if (!date) return ''
  return dateFormatter.format(parseDateOnly(date))
}

export function formatFullDate(date: string | null | undefined): string {
  if (!date) return ''
  return fullDateFormatter.format(parseDateOnly(date))
}

export function formatDateTime(iso: string): string {
  return dateTimeFormatter.format(new Date(iso))
}

/** Parses "yyyy-MM-dd" as a local date (avoids the UTC shift of `new Date(string)`). */
export function parseDateOnly(date: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function todayDateOnly(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function isOverdue(dueDate: string | null, status: ItemStatus): boolean {
  return Boolean(dueDate) && status !== 'Done' && (dueDate as string) < todayDateOnly()
}
