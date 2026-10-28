import seed from './seed-data.json'
import q4HiringGoals from './files/q4-hiring-goals.txt?raw'
import interviewTemplate from './files/interview-template.txt?raw'
import onboardingWeekOne from './files/onboarding-week-one.txt?raw'
import type { ItemStatus, Priority } from '../types'

/*
  The browser-side stand-in for the API's in-memory repositories (server/TaskManager.Api/Repositories).
  Same entities, same seed file, same "resets when the process restarts" rule - except the process is
  the browser tab. The store is mirrored to sessionStorage so a refresh keeps your edits for the tab,
  and a new tab starts from the seed, the way a fresh server start would.
*/

export interface User {
  id: string
  fullName: string
  title: string
  managerId: string | null
  username: string
  email: string | null
  avatarUrl: string | null
  password: string
}

export interface Workspace {
  id: string
  name: string
  color: string | null
}

export interface Board {
  id: string
  name: string
  description: string | null
  workspaceId: string
  ownerUserId: string
}

export interface Group {
  id: string
  boardId: string
  name: string
  color: string
  order: number
}

export interface BoardStatus {
  id: string
  boardId: string
  name: string
  color: string
  kind: ItemStatus
  order: number
}

export interface BoardPriority {
  id: string
  boardId: string
  name: string
  color: string
  kind: Priority
  order: number
}

export interface Item {
  id: string
  groupId: string
  title: string
  status: ItemStatus
  statusId: string | null
  assigneeIds: string[]
  dueDate: string | null
  priority: Priority | null
  priorityId: string | null
  notes: string | null
  order: number
}

export interface SubItem {
  id: string
  itemId: string
  title: string
  status: ItemStatus
  assigneeIds: string[]
  dueDate: string | null
  order: number
}

export interface Update {
  id: string
  itemId: string
  authorUserId: string
  text: string
  createdAt: string
  parentUpdateId: string | null
}

export interface Attachment {
  id: string
  itemId: string
  fileName: string
  contentType: string
  uploadedByUserId: string
  uploadedAt: string
  /** The file's bytes, base64-encoded so the whole store survives JSON. */
  data: string
  size: number
}

export interface Dashboard {
  id: string
  name: string
  description: string | null
  ownerUserId: string
  sourceBoardIds: string[]
}

export interface Db {
  users: User[]
  workspaces: Workspace[]
  boards: Board[]
  groups: Group[]
  statuses: BoardStatus[]
  priorities: BoardPriority[]
  items: Item[]
  subItems: SubItem[]
  updates: Update[]
  attachments: Attachment[]
  dashboards: Dashboard[]
}

const STORAGE_KEY = 'tm-demo-db'

const SEED_FILES: Record<string, string> = {
  'q4-hiring-goals.txt': q4HiringGoals,
  'interview-template.txt': interviewTemplate,
  'onboarding-week-one.txt': onboardingWeekOne,
}

/**
 * The seed was written with "today" on this date. Every date in it is moved by the distance between
 * this and the real today, so a visitor a year from now still sees work that is due this week, a
 * little overdue, and so on - not a board where everything expired long ago.
 */
const SEED_TODAY = '2026-09-08'

const DAY_MS = 86_400_000

function dayNumber(dateOnly: string): number {
  const [y, m, d] = dateOnly.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS)
}

function fromDayNumber(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10)
}

export function todayDateOnly(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

export function fromBase64(data: string): Uint8Array {
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function fromSeed(): Db {
  const shift = dayNumber(todayDateOnly()) - dayNumber(SEED_TODAY)
  const shiftDate = (d: string | null | undefined) => (d ? fromDayNumber(dayNumber(d) + shift) : null)
  const shiftTime = (t: string) => new Date(new Date(t).getTime() + shift * DAY_MS).toISOString()

  return {
    users: seed.users.map((u) => ({ ...u, avatarUrl: null })),
    workspaces: seed.workspaces.map((w) => ({ ...w, color: w.color ?? null })),
    boards: seed.boards.map((b) => ({ ...b, description: b.description ?? null })),
    groups: seed.groups.map((g) => ({ ...g })),
    statuses: [],
    priorities: [],
    items: seed.items.map((i) => {
      const raw = i as typeof i & { dueDate?: string; priority?: Priority; notes?: string }
      return {
        id: raw.id,
        groupId: raw.groupId,
        title: raw.title,
        status: raw.status as ItemStatus,
        statusId: null,
        assigneeIds: [...raw.assigneeIds],
        dueDate: shiftDate(raw.dueDate),
        priority: raw.priority ?? null,
        priorityId: null,
        notes: raw.notes ?? null,
        order: raw.order,
      }
    }),
    subItems: seed.subItems.map((s) => {
      const raw = s as typeof s & { dueDate?: string }
      return {
        id: raw.id,
        itemId: raw.itemId,
        title: raw.title,
        status: raw.status as ItemStatus,
        assigneeIds: [...raw.assigneeIds],
        dueDate: shiftDate(raw.dueDate),
        order: raw.order,
      }
    }),
    updates: seed.updates.map((u) => ({
      ...u,
      createdAt: shiftTime(u.createdAt),
      parentUpdateId: (u as { parentUpdateId?: string }).parentUpdateId ?? null,
    })),
    attachments: seed.attachments.flatMap((a) => {
      const text = SEED_FILES[a.file]
      if (text === undefined) return []
      const bytes = new TextEncoder().encode(text)
      return [
        {
          id: a.id,
          itemId: a.itemId,
          fileName: a.fileName,
          contentType: a.contentType,
          uploadedByUserId: a.uploadedByUserId,
          uploadedAt: shiftTime(a.uploadedAt),
          data: toBase64(bytes),
          size: bytes.length,
        },
      ]
    }),
    dashboards: seed.dashboards.map((d) => ({ ...d, sourceBoardIds: [...d.sourceBoardIds] })),
  }
}

function load(): Db {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY)
    if (stored) return JSON.parse(stored) as Db
  } catch {
    // Private mode, blocked storage, or a corrupt entry: start from the seed.
  }
  return fromSeed()
}

export const db: Db = load()

/** Called after every write. A full quota (a large upload) just means the edit lives in memory only. */
export function save(): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(db))
  } catch {
    // Ignored on purpose; see above.
  }
}

/**
 * Puts the demo back to the seed, as a server restart would. Reloads rather than swapping the
 * arrays in place, because the services hold references to them.
 */
export function reset(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing stored, nothing to remove.
  }
  location.reload()
}

export function dayDiff(later: string, earlier: string): number {
  return dayNumber(later) - dayNumber(earlier)
}

export function addDays(dateOnly: string, days: number): string {
  return fromDayNumber(dayNumber(dateOnly) + days)
}
