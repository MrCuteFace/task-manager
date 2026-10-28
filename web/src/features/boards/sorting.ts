import type { Item, ItemStatus, Priority } from '../../api/types'

export type SortKey = 'title' | 'status' | 'assignee' | 'dueDate' | 'priority'
export type SortDirection = 'asc' | 'desc'
export interface SortSpec {
  key: SortKey
  direction: SortDirection
}

export const SORT_LABEL: Record<SortKey, string> = {
  title: 'פריט',
  status: 'סטטוס',
  assignee: 'אחראי',
  dueDate: 'תאריך יעד',
  priority: 'עדיפות',
}

const STATUS_RANK: Record<ItemStatus, number> = { Todo: 0, InProgress: 1, Stuck: 2, Done: 3 }
const PRIORITY_RANK: Record<Priority, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 }

/** "status" or "-status" in the URL. */
export function parseSort(value: string | null): SortSpec | null {
  if (!value) return null
  const desc = value.startsWith('-')
  const key = (desc ? value.slice(1) : value) as SortKey
  if (!(key in SORT_LABEL)) return null
  return { key, direction: desc ? 'desc' : 'asc' }
}

export function serializeSort(sort: SortSpec | null): string | null {
  if (!sort) return null
  return sort.direction === 'desc' ? `-${sort.key}` : sort.key
}

/** Click cycle on a header: none -> ascending -> descending -> back to the manual order. */
export function nextSort(current: SortSpec | null, key: SortKey): SortSpec | null {
  if (!current || current.key !== key) return { key, direction: 'asc' }
  if (current.direction === 'asc') return { key, direction: 'desc' }
  return null
}

/** Sorts a group's items; empty values always sink to the end regardless of direction. */
export function sortItems(items: Item[], sort: SortSpec | null, nameOf: (id: string) => string): Item[] {
  if (!sort) return items
  const dir = sort.direction === 'asc' ? 1 : -1
  const collator = new Intl.Collator('he')
  const compare = (a: Item, b: Item): number => {
    switch (sort.key) {
      case 'title':
        return collator.compare(a.title, b.title) * dir
      case 'status':
        return (STATUS_RANK[a.status] - STATUS_RANK[b.status]) * dir
      case 'assignee': {
        const an = a.assigneeIds[0] ? nameOf(a.assigneeIds[0]) : ''
        const bn = b.assigneeIds[0] ? nameOf(b.assigneeIds[0]) : ''
        if (!an && !bn) return 0
        if (!an) return 1
        if (!bn) return -1
        return collator.compare(an, bn) * dir
      }
      case 'dueDate': {
        if (!a.dueDate && !b.dueDate) return 0
        if (!a.dueDate) return 1
        if (!b.dueDate) return -1
        return a.dueDate.localeCompare(b.dueDate) * dir
      }
      case 'priority': {
        if (!a.priority && !b.priority) return 0
        if (!a.priority) return 1
        if (!b.priority) return -1
        return (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]) * dir
      }
    }
  }
  return [...items].sort((a, b) => compare(a, b) || a.order - b.order)
}
