import type {
  AppNotification,
  Attachment as AttachmentDto,
  BoardDetail,
  BoardEvent,
  BoardSummary,
  DashboardDetail,
  DashboardSummary,
  Item as ItemDto,
  ItemStatus,
  ItemUpdate,
  OrgNode,
  Priority,
  PriorityOption,
  SearchHit,
  SearchResults,
  StatusCounts,
  StatusOption,
  SubItem as SubItemDto,
  User as UserDto,
} from '../types'
import {
  addDays,
  dayDiff,
  db,
  save,
  toBase64,
  todayDateOnly,
  type Attachment,
  type Board,
  type Dashboard,
  type Item,
  type SubItem,
  type Update,
  type User,
} from './db'

/*
  A line-for-line port of server/TaskManager.Api/Services to TypeScript, so the public demo runs with
  no server at all. Each section names the C# file it mirrors; when the two disagree, the C# is the
  reference and this file is the bug.

  The one rule worth reading first is the same as on the server: everything starts from
  `visibleUserIds`. A hidden board and a missing board both come back as 404.
*/

export class HttpError extends Error {
  readonly status: number
  readonly title: string
  readonly detail: string | undefined

  constructor(status: number, title: string, detail?: string) {
    super(detail ?? title)
    this.status = status
    this.title = title
    this.detail = detail
  }
}

/** C#'s ArgumentException: the controllers turn it into a 400. */
class BadRequest extends Error {}
/** C#'s KeyNotFoundException: the status/priority controllers turn it into a 404. */
class NotFound extends Error {}

const SESSION_PREFIX = 'demo.'
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

function newId(prefix: string, length = 8): string {
  const hex = crypto.getRandomValues(new Uint8Array(8)).reduce((s, b) => s + b.toString(16).padStart(2, '0'), '')
  return `${prefix}-${hex.slice(0, length)}`
}

const contains = (value: string | null | undefined, q: string) =>
  value != null && value.toLowerCase().includes(q.toLowerCase())

// ---- Auth (Auth/DemoAuth.cs) ------------------------------------------------

/**
 * The server keeps a token-to-user map in memory. Here the token simply names the user, so a refresh
 * - which keeps the session in sessionStorage but would lose an in-memory map - stays signed in.
 */
export function resolveToken(token: string | null): User | null {
  if (!token?.startsWith(SESSION_PREFIX)) return null
  return db.users.find((u) => u.id === token.slice(SESSION_PREFIX.length)) ?? null
}

function login(body: { username?: string; password?: string }) {
  const username = body.username?.trim() ?? ''
  if (!username || !body.password) throw new HttpError(401, 'Invalid credentials', 'Username or password is incorrect.')
  const user = db.users.find((u) => u.username.toLowerCase() === username.toLowerCase())
  if (!user || user.password !== body.password)
    throw new HttpError(401, 'Invalid credentials', 'Username or password is incorrect.')
  return { token: SESSION_PREFIX + user.id, user: userDto(user) }
}

// ---- Visibility (Services/VisibilityService.cs) ------------------------------

export function visibleUserIds(viewerId: string): Set<string> {
  const visible = new Set<string>()
  if (!db.users.some((u) => u.id === viewerId)) return visible

  const childrenByManager = new Map<string, string[]>()
  for (const u of db.users) {
    if (u.managerId === null) continue
    childrenByManager.set(u.managerId, [...(childrenByManager.get(u.managerId) ?? []), u.id])
  }

  // Breadth-first; the visited set makes an accidental cycle harmless.
  const queue = [viewerId]
  visible.add(viewerId)
  while (queue.length > 0) {
    const current = queue.shift()!
    for (const reportId of childrenByManager.get(current) ?? []) {
      if (!visible.has(reportId)) {
        visible.add(reportId)
        queue.push(reportId)
      }
    }
  }
  return visible
}

export function canSee(viewerId: string, ownerUserId: string): boolean {
  return visibleUserIds(viewerId).has(ownerUserId)
}

// ---- Repository-shaped helpers (Repositories/InMemory) -----------------------

const byOrder = <T extends { order: number }>(a: T, b: T) => a.order - b.order
const groupsOf = (boardId: string) => db.groups.filter((g) => g.boardId === boardId).sort(byOrder)
const itemsOf = (groupId: string) => db.items.filter((i) => i.groupId === groupId).sort(byOrder)
const itemsOfGroups = (groupIds: Iterable<string>) => {
  const set = new Set(groupIds)
  return db.items.filter((i) => set.has(i.groupId)).sort(byOrder)
}
const itemsOfBoard = (boardId: string) => itemsOfGroups(groupsOf(boardId).map((g) => g.id))
const userName = (id: string) => db.users.find((u) => u.id === id)?.fullName ?? id
const workspaceName = (id: string) => db.workspaces.find((w) => w.id === id)?.name ?? id

// ---- Statuses (Services/StatusService.cs) -----------------------------------

const STATUS_BUILT_INS: { kind: ItemStatus; id: string; name: string; color: string }[] = [
  { kind: 'Todo', id: 'todo', name: 'לביצוע', color: '#6b7280' },
  { kind: 'InProgress', id: 'in-progress', name: 'בתהליך', color: '#d68f00' },
  { kind: 'Done', id: 'done', name: 'הושלם', color: '#2a7048' },
  { kind: 'Stuck', id: 'stuck', name: 'תקוע', color: '#b53325' },
]

const PRIORITY_BUILT_INS: { kind: Priority; id: string; name: string; color: string }[] = [
  { kind: 'Critical', id: 'critical', name: 'קריטית', color: '#b53325' },
  { kind: 'High', id: 'high', name: 'גבוהה', color: '#1e2a44' },
  { kind: 'Medium', id: 'medium', name: 'בינונית', color: '#4a5568' },
  { kind: 'Low', id: 'low', name: 'נמוכה', color: '#646b7a' },
]

const MAX_CUSTOM_PER_BOARD = 12

function statusesFor(boardId: string): StatusOption[] {
  return [
    ...STATUS_BUILT_INS.map((b) => ({ id: b.id, name: b.name, color: b.color, kind: b.kind, isBuiltIn: true })),
    ...db.statuses
      .filter((s) => s.boardId === boardId)
      .sort(byOrder)
      .map((s) => ({ id: s.id, name: s.name, color: s.color, kind: s.kind, isBuiltIn: false })),
  ]
}

function prioritiesFor(boardId: string): PriorityOption[] {
  return [
    ...PRIORITY_BUILT_INS.map((b) => ({ id: b.id, name: b.name, color: b.color, kind: b.kind, isBuiltIn: true })),
    ...db.priorities
      .filter((p) => p.boardId === boardId)
      .sort(byOrder)
      .map((p) => ({ id: p.id, name: p.name, color: p.color, kind: p.kind, isBuiltIn: false })),
  ]
}

function applyStatus(item: Item, boardId: string, statusId: string) {
  const option = statusesFor(boardId).find((s) => s.id === statusId)
  if (!option) throw new BadRequest(`Unknown status '${statusId}' for board '${boardId}'.`)
  item.status = option.kind
  item.statusId = option.isBuiltIn ? null : option.id
}

function applyPriority(item: Item, boardId: string, priorityId: string) {
  const option = prioritiesFor(boardId).find((p) => p.id === priorityId)
  if (!option) throw new BadRequest(`Unknown priority '${priorityId}' for board '${boardId}'.`)
  item.priority = option.kind
  item.priorityId = option.isBuiltIn ? null : option.id
}

function normalizeLabelName(raw: string | undefined, what: string): string {
  const name = (raw ?? '').trim()
  if (name.length === 0) throw new BadRequest(`A ${what} needs a name.`)
  if (name.length > 24) throw new BadRequest(`A ${what} name may be at most 24 characters.`)
  return name
}

/** Accepts `#rgb` or `#rrggbb` and returns the long lowercase form. */
function normalizeColor(raw: string | undefined): string {
  const color = (raw ?? '').trim().toLowerCase()
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(color)) throw new BadRequest('Color must be a hex value such as #2c4fb5.')
  return color.length === 4 ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}` : color
}

type LabelBody = { name?: string; color?: string; kind?: string }

/**
 * Statuses and priorities are built the same way on the server (PriorityService mirrors
 * StatusService exactly), so one implementation serves both here.
 */
function labelService<K extends string>(
  table: { id: string; boardId: string; name: string; color: string; kind: K; order: number }[],
  options: (boardId: string) => { id: string; name: string }[],
  itemIdField: 'statusId' | 'priorityId',
  itemKindField: 'status' | 'priority',
  defaultKind: K,
  what: string,
  idPrefix: string,
) {
  const itemsOn = (boardId: string, id: string) => itemsOfBoard(boardId).filter((i) => i[itemIdField] === id)
  const ensureFree = (boardId: string, name: string, exceptId: string | null) => {
    if (options(boardId).some((o) => o.id !== exceptId && o.name.toLowerCase() === name.toLowerCase()))
      throw new BadRequest(`This board already has a ${what} called '${name}'.`)
  }
  const find = (boardId: string, id: string) => {
    const row = table.find((r) => r.id === id)
    if (!row || row.boardId !== boardId) throw new NotFound()
    return row
  }

  return {
    create(boardId: string, body: LabelBody) {
      const existing = table.filter((r) => r.boardId === boardId)
      if (existing.length >= MAX_CUSTOM_PER_BOARD)
        throw new BadRequest(`A board may have at most ${MAX_CUSTOM_PER_BOARD} custom ${what}s.`)
      const name = normalizeLabelName(body.name, what)
      ensureFree(boardId, name, null)
      const row = {
        id: newId(idPrefix, 9),
        boardId,
        name,
        color: normalizeColor(body.color),
        kind: (body.kind as K | undefined) ?? defaultKind,
        order: existing.length === 0 ? 0 : Math.max(...existing.map((r) => r.order)) + 1,
      }
      table.push(row)
      return row
    },
    update(boardId: string, id: string, body: LabelBody) {
      const row = find(boardId, id)
      if (body.name != null) {
        const name = normalizeLabelName(body.name, what)
        ensureFree(boardId, name, id)
        row.name = name
      }
      if (body.color != null) row.color = normalizeColor(body.color)
      if (body.kind != null) {
        row.kind = body.kind as K
        // The kind is the meaning, so every item on this label follows it.
        for (const item of itemsOn(boardId, id)) (item[itemKindField] as K) = row.kind
      }
      return row
    },
    remove(boardId: string, id: string) {
      const row = find(boardId, id)
      for (const item of itemsOn(boardId, id)) {
        // Keep the meaning, drop the name.
        item[itemIdField] = null
        ;(item[itemKindField] as K) = row.kind
      }
      table.splice(table.indexOf(row), 1)
    },
  }
}

const statusService = labelService(db.statuses, statusesFor, 'statusId', 'status', 'Todo' as ItemStatus, 'status', 'st')
const priorityService = labelService(db.priorities, prioritiesFor, 'priorityId', 'priority', 'Medium' as Priority, 'priority', 'pr')

// ---- Boards (Services/BoardService.cs) --------------------------------------

function countStatuses(statuses: ItemStatus[]): StatusCounts {
  const c = { todo: 0, inProgress: 0, done: 0, stuck: 0 }
  for (const s of statuses) {
    if (s === 'Todo') c.todo++
    else if (s === 'InProgress') c.inProgress++
    else if (s === 'Done') c.done++
    else if (s === 'Stuck') c.stuck++
  }
  return { ...c, total: c.todo + c.inProgress + c.done + c.stuck }
}

const isOverdue = (item: Item, today: string) => item.dueDate !== null && item.dueDate < today && item.status !== 'Done'

function findVisibleBoard(viewerId: string, boardId: string): Board | null {
  const board = db.boards.find((b) => b.id === boardId)
  return board && canSee(viewerId, board.ownerUserId) ? board : null
}

function findVisibleItem(viewerId: string, itemId: string): { item: Item; board: Board } | null {
  const item = db.items.find((i) => i.id === itemId)
  const group = item && db.groups.find((g) => g.id === item.groupId)
  const board = group && findVisibleBoard(viewerId, group.boardId)
  return item && board ? { item, board } : null
}

function userDto(u: User): UserDto {
  return { id: u.id, fullName: u.fullName, title: u.title, managerId: u.managerId, username: u.username, avatarUrl: u.avatarUrl, email: u.email }
}

function subItemDto(s: SubItem): SubItemDto {
  return { id: s.id, itemId: s.itemId, title: s.title, status: s.status, assigneeIds: [...s.assigneeIds], dueDate: s.dueDate, order: s.order }
}

function updateDto(u: Update): ItemUpdate {
  const parentAuthor = u.parentUpdateId ? db.updates.find((p) => p.id === u.parentUpdateId)?.authorUserId : undefined
  return {
    id: u.id,
    itemId: u.itemId,
    authorUserId: u.authorUserId,
    authorName: userName(u.authorUserId),
    text: u.text,
    createdAt: u.createdAt,
    parentUpdateId: u.parentUpdateId,
    parentAuthorName: parentAuthor ? userName(parentAuthor) : null,
  }
}

function attachmentDto(a: Attachment): AttachmentDto {
  return {
    id: a.id,
    itemId: a.itemId,
    fileName: a.fileName,
    contentType: a.contentType,
    size: a.size,
    uploadedByUserId: a.uploadedByUserId,
    uploadedByName: userName(a.uploadedByUserId),
    uploadedAt: a.uploadedAt,
  }
}

function itemDto(item: Item, boardId: string): ItemDto {
  return {
    ...item,
    boardId,
    assigneeIds: [...item.assigneeIds],
    subItems: db.subItems.filter((s) => s.itemId === item.id).sort(byOrder).map(subItemDto),
    updates: db.updates
      .filter((u) => u.itemId === item.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map(updateDto),
    attachments: db.attachments
      .filter((a) => a.itemId === item.id)
      .sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt))
      .map(attachmentDto),
  }
}

function boardSummary(board: Board): BoardSummary {
  const items = itemsOfBoard(board.id)
  const today = todayDateOnly()
  return {
    id: board.id,
    name: board.name,
    description: board.description,
    workspaceId: board.workspaceId,
    workspaceName: workspaceName(board.workspaceId),
    ownerUserId: board.ownerUserId,
    ownerName: userName(board.ownerUserId),
    counts: countStatuses(items.map((i) => i.status)),
    overdueCount: items.filter((i) => isOverdue(i, today)).length,
  }
}

function visibleBoards(viewerId: string): Board[] {
  const visible = visibleUserIds(viewerId)
  return db.boards.filter((b) => visible.has(b.ownerUserId))
}

function getBoard(viewerId: string, boardId: string): BoardDetail | null {
  const board = findVisibleBoard(viewerId, boardId)
  if (!board) return null
  return {
    ...boardSummaryHeader(board),
    groups: groupsOf(board.id).map((g) => ({
      id: g.id,
      name: g.name,
      color: g.color,
      order: g.order,
      items: itemsOf(g.id).map((i) => itemDto(i, board.id)),
    })),
    statuses: statusesFor(board.id),
    priorities: prioritiesFor(board.id),
  }
}

function boardSummaryHeader(board: Board) {
  return {
    id: board.id,
    name: board.name,
    description: board.description,
    workspaceId: board.workspaceId,
    workspaceName: workspaceName(board.workspaceId),
    ownerUserId: board.ownerUserId,
    ownerName: userName(board.ownerUserId),
  }
}

type CreateItemBody = {
  groupId?: string
  title?: string
  status?: ItemStatus
  statusId?: string
  assigneeIds?: string[]
  dueDate?: string
  priority?: Priority
  priorityId?: string
}

function createItem(viewerId: string, boardId: string, body: CreateItemBody): ItemDto | null {
  const board = findVisibleBoard(viewerId, boardId)
  if (!board) return null

  const group = db.groups.find((g) => g.id === body.groupId)
  if (!group || group.boardId !== board.id)
    throw new BadRequest(`Group '${body.groupId}' does not belong to board '${boardId}'.`)

  const title = (body.title ?? '').trim()
  if (title.length === 0) throw new BadRequest('Title is required.')

  const siblings = itemsOf(group.id)
  const item: Item = {
    id: newId('i'),
    groupId: group.id,
    title,
    status: body.status ?? 'Todo',
    statusId: null,
    assigneeIds: [...new Set(body.assigneeIds ?? [])],
    dueDate: body.dueDate ?? null,
    priority: body.priority ?? null,
    priorityId: null,
    notes: null,
    order: siblings.length === 0 ? 0 : Math.max(...siblings.map((s) => s.order)) + 1,
  }
  // A status id, when given, is the authority: it carries both the meaning and the identity.
  if (body.statusId?.trim()) applyStatus(item, board.id, body.statusId)
  if (body.priorityId?.trim()) applyPriority(item, board.id, body.priorityId)
  db.items.push(item)
  return itemDto(item, board.id)
}

const GROUP_PALETTE = ['#2E7D5B', '#B98900', '#1F4E79', '#7C3AED', '#B4532A', '#2563EB', '#DC2626', '#6B7280']

function createGroup(viewerId: string, boardId: string, body: { name?: string; color?: string }) {
  const board = findVisibleBoard(viewerId, boardId)
  if (!board) return null

  const name = body.name?.trim() ?? ''
  if (name.length === 0) throw new BadRequest('Group name is required.')

  const existing = groupsOf(board.id)
  let color = body.color?.trim()
  if (!color) color = GROUP_PALETTE[existing.length % GROUP_PALETTE.length]
  else if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new BadRequest('Color must be a 6-digit hex value.')

  const group = {
    id: newId('g'),
    boardId: board.id,
    name,
    color,
    order: existing.length === 0 ? 0 : Math.max(...existing.map((g) => g.order)) + 1,
  }
  db.groups.push(group)
  return { id: group.id, name: group.name, color: group.color, order: group.order, items: [] }
}

// ---- Items (Services/ItemService.cs) ----------------------------------------

type UpdateItemBody = {
  title?: string
  status?: ItemStatus
  statusId?: string
  assigneeIds?: string[]
  dueDate?: string
  clearDueDate?: boolean
  priority?: Priority
  priorityId?: string
  clearPriority?: boolean
  notes?: string
  groupId?: string
  order?: number
}

function updateItem(viewerId: string, itemId: string, body: UpdateItemBody): ItemDto | null {
  const found = findVisibleItem(viewerId, itemId)
  if (!found) return null
  const { item, board } = found

  if (body.title != null) {
    const title = body.title.trim()
    if (title.length === 0) throw new BadRequest('Title cannot be empty.')
    item.title = title
  }
  // StatusId wins: it carries the meaning as well as the identity.
  if (body.statusId?.trim()) applyStatus(item, board.id, body.statusId)
  else if (body.status != null) {
    item.status = body.status
    item.statusId = null
  }
  if (body.assigneeIds != null) {
    const unknown = body.assigneeIds.find((a) => !db.users.some((u) => u.id === a))
    if (unknown) throw new BadRequest(`Unknown assignee '${unknown}'.`)
    item.assigneeIds = [...new Set(body.assigneeIds)]
  }
  if (body.clearDueDate === true) item.dueDate = null
  else if (body.dueDate != null) item.dueDate = body.dueDate
  // Clearing wins over both; then a priority id wins over a bare level.
  if (body.clearPriority === true) {
    item.priority = null
    item.priorityId = null
  } else if (body.priorityId?.trim()) applyPriority(item, board.id, body.priorityId)
  else if (body.priority != null) {
    item.priority = body.priority
    item.priorityId = null
  }
  if (body.notes != null) item.notes = body.notes

  let targetGroupId = item.groupId
  if (body.groupId != null && body.groupId !== item.groupId) {
    const target = db.groups.find((g) => g.id === body.groupId)
    if (!target || target.boardId !== board.id) throw new BadRequest(`Group '${body.groupId}' does not belong to this board.`)
    targetGroupId = target.id
  }
  if (targetGroupId !== item.groupId || body.order != null) reorder(item, targetGroupId, body.order ?? null)

  return itemDto(item, board.id)
}

/** Moves the item to `targetGroupId` at `index` (end when null) and renumbers both groups densely from zero. */
function reorder(item: Item, targetGroupId: string, index: number | null) {
  const sourceGroupId = item.groupId
  const source = itemsOf(sourceGroupId).filter((i) => i.id !== item.id)
  const target = sourceGroupId === targetGroupId ? source : itemsOf(targetGroupId)

  const at = Math.max(0, Math.min(index ?? target.length, target.length))
  target.splice(at, 0, item)
  item.groupId = targetGroupId

  target.forEach((it, i) => (it.order = i))
  if (sourceGroupId !== targetGroupId) source.forEach((it, i) => (it.order = i))
}

function updateSubItem(viewerId: string, subItemId: string, body: { title?: string; status?: ItemStatus; assigneeIds?: string[] }) {
  const sub = db.subItems.find((s) => s.id === subItemId)
  if (!sub || !findVisibleItem(viewerId, sub.itemId)) return null

  if (body.title != null) {
    const title = body.title.trim()
    if (title.length === 0) throw new BadRequest('Title cannot be empty.')
    sub.title = title
  }
  if (body.status != null) sub.status = body.status
  if (body.assigneeIds != null) sub.assigneeIds = [...new Set(body.assigneeIds)]
  return subItemDto(sub)
}

function addUpdate(viewerId: string, itemId: string, body: { text?: string; parentUpdateId?: string | null }) {
  const found = findVisibleItem(viewerId, itemId)
  if (!found) return null

  const text = (body.text ?? '').trim()
  if (text.length === 0) throw new BadRequest('Update text is required.')

  // A reply must answer an update on this same item.
  const parentId = body.parentUpdateId?.trim() || null
  if (parentId) {
    const parent = db.updates.find((u) => u.id === parentId)
    if (!parent || parent.itemId !== itemId) throw new BadRequest('The update being replied to does not exist on this item.')
  }

  const update: Update = {
    id: newId('upd'),
    itemId,
    authorUserId: viewerId,
    text,
    createdAt: new Date().toISOString(),
    parentUpdateId: parentId,
  }
  db.updates.push(update)

  const dto = updateDto(update)
  publish(found.board.ownerUserId, { type: 'update.created', boardId: found.board.id, itemId, update: dto })
  return dto
}

async function addAttachment(viewerId: string, itemId: string, formData: FormData) {
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) throw new BadRequest('No file was sent.')
  if (file.size > MAX_ATTACHMENT_BYTES) throw new BadRequest('The file is larger than 10 MB.')
  if (!findVisibleItem(viewerId, itemId)) return null

  const name = file.name.split(/[\\/]/).pop()?.trim() ?? ''
  if (name.length === 0) throw new BadRequest('File name is required.')

  const bytes = new Uint8Array(await file.arrayBuffer())
  const attachment: Attachment = {
    id: newId('att'),
    itemId,
    fileName: name,
    contentType: file.type || 'application/octet-stream',
    uploadedByUserId: viewerId,
    uploadedAt: new Date().toISOString(),
    data: toBase64(bytes),
    size: bytes.length,
  }
  db.attachments.push(attachment)
  return attachmentDto(attachment)
}

export function getAttachment(viewerId: string, attachmentId: string): Attachment | null {
  const attachment = db.attachments.find((a) => a.id === attachmentId)
  return attachment && findVisibleItem(viewerId, attachment.itemId) ? attachment : null
}

// ---- Dashboards (Services/DashboardService.cs) ------------------------------

function visibleSourceBoards(dashboard: Dashboard, viewerId: string): Board[] {
  return dashboard.sourceBoardIds
    .map((id) => db.boards.find((b) => b.id === id))
    .filter((b): b is Board => b !== undefined && canSee(viewerId, b.ownerUserId))
}

function visibleDashboards(viewerId: string): DashboardSummary[] {
  const visible = visibleUserIds(viewerId)
  return db.dashboards
    .filter((d) => visible.has(d.ownerUserId))
    .map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description,
      ownerUserId: d.ownerUserId,
      boardCount: visibleSourceBoards(d, viewerId).length,
    }))
}

function getDashboard(viewerId: string, dashboardId: string): DashboardDetail | null {
  const dashboard = db.dashboards.find((d) => d.id === dashboardId)
  if (!dashboard || !canSee(viewerId, dashboard.ownerUserId)) return null

  const boards = visibleSourceBoards(dashboard, viewerId)
  if (boards.length === 0) return null

  const boardIdByGroupId = new Map(boards.flatMap((b) => groupsOf(b.id).map((g) => [g.id, b.id] as const)))
  const boardNameById = new Map(boards.map((b) => [b.id, b.name]))
  const items = boards.flatMap((b) => itemsOfBoard(b.id))

  const today = todayDateOnly()
  const weekEnd = addDays(today, 6)

  const loads = new Map<string, ItemStatus[]>()
  for (const item of items) for (const a of item.assigneeIds) loads.set(a, [...(loads.get(a) ?? []), item.status])

  return {
    id: dashboard.id,
    name: dashboard.name,
    description: dashboard.description,
    ownerUserId: dashboard.ownerUserId,
    totals: countStatuses(items.map((i) => i.status)),
    overdueCount: items.filter((i) => isOverdue(i, today)).length,
    dueThisWeekCount: items.filter((i) => i.dueDate !== null && i.dueDate >= today && i.dueDate <= weekEnd && i.status !== 'Done').length,
    boards: boards.map(boardSummary),
    byAssignee: [...loads.entries()]
      .map(([userId, statuses]) => ({ userId, fullName: userName(userId), counts: countStatuses(statuses) }))
      .sort((a, b) => b.counts.total - a.counts.total || (a.fullName < b.fullName ? -1 : a.fullName > b.fullName ? 1 : 0)),
    overdueItems: items
      .filter((i) => isOverdue(i, today))
      .map((i) => {
        const boardId = boardIdByGroupId.get(i.groupId)!
        return {
          itemId: i.id,
          title: i.title,
          boardId,
          boardName: boardNameById.get(boardId)!,
          status: i.status,
          dueDate: i.dueDate!,
          daysOverdue: dayDiff(today, i.dueDate!),
          assigneeIds: [...i.assigneeIds],
        }
      })
      .sort((a, b) => b.daysOverdue - a.daysOverdue),
  }
}

// ---- Users (Services/UserService.cs) ----------------------------------------

function orgTree(viewerId: string): OrgNode {
  const visible = visibleUserIds(viewerId)
  const root = db.users.find((u) => u.managerId === null)!
  const visited = new Set<string>()
  const build = (user: User): OrgNode => {
    visited.add(user.id)
    const children = db.users.filter((u) => u.managerId === user.id && !visited.has(u.id)).map(build)
    return {
      id: user.id,
      fullName: user.fullName,
      title: user.title,
      managerId: user.managerId,
      avatarUrl: user.avatarUrl,
      visible: visible.has(user.id),
      isCurrentUser: user.id === viewerId,
      children,
    }
  }
  return build(root)
}

const MAX_AVATAR_BYTES = 400_000
const MIN_PASSWORD_LENGTH = 8

type ProfileBody = { fullName?: string; title?: string; avatarUrl?: string; clearAvatar?: boolean; email?: string; clearEmail?: boolean }

function updateProfile(user: User, body: ProfileBody): UserDto {
  if (body.fullName != null) {
    const name = body.fullName.trim()
    if (name.length < 2) throw new BadRequest('Full name is too short.')
    user.fullName = name
  }
  if (body.title != null) {
    const title = body.title.trim()
    if (title.length === 0) throw new BadRequest('Title cannot be empty.')
    user.title = title
  }
  if (body.clearEmail === true) user.email = null
  else if (body.email != null) {
    const email = body.email.trim()
    if (email.length === 0) throw new BadRequest('Email cannot be blank; clear it instead.')
    if (email.length > 254 || !/^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/.test(email))
      throw new BadRequest('That does not look like an e-mail address.')
    user.email = email
  }
  if (body.clearAvatar === true) user.avatarUrl = null
  else if (body.avatarUrl != null) {
    const url = body.avatarUrl.trim()
    if (!/^data:image\/(png|jpeg|webp);base64,/.test(url)) throw new BadRequest('Avatar must be a PNG, JPEG or WebP data URL.')
    if (url.length > MAX_AVATAR_BYTES) throw new BadRequest('Avatar image is too large (max 400 KB).')
    user.avatarUrl = url
  }
  return userDto(user)
}

function changePassword(user: User, body: { currentPassword?: string; newPassword?: string }) {
  if (user.password !== body.currentPassword)
    // 403, not 401: a 401 would make the client treat the session as expired.
    throw new HttpError(403, 'Wrong password', 'The current password is incorrect.')
  const next = body.newPassword ?? ''
  if (next.length < MIN_PASSWORD_LENGTH)
    throw new HttpError(400, 'Invalid password', `The new password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
  if (next === user.password) throw new HttpError(400, 'Invalid password', 'The new password must differ from the current one.')
  user.password = next
}

// ---- Search (Services/SearchService.cs) -------------------------------------

function search(viewerId: string, query: string, perKind = 5): SearchResults {
  const q = query.trim()
  if (q.length < 2) return { boards: [], items: [], people: [] }

  const rank = (value: string) => (value.toLowerCase().startsWith(q.toLowerCase()) ? 0 : 1)
  const byRankThen = (a: string, b: string) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0)

  const visible = visibleUserIds(viewerId)
  const boards = visibleBoards(viewerId)
  const boardById = new Map(boards.map((b) => [b.id, b]))
  const boardIdByGroupId = new Map(boards.flatMap((b) => groupsOf(b.id).map((g) => [g.id, b.id] as const)))

  const boardHits: SearchHit[] = boards
    .filter((b) => contains(b.name, q) || contains(b.description, q))
    .sort((a, b) => byRankThen(a.name, b.name))
    .slice(0, perKind)
    .map((b) => ({ kind: 'board', id: b.id, title: b.name, subtitle: b.description, boardId: b.id, avatarUrl: null }))

  // Items are reached only through boards the viewer can already see.
  const itemHits: SearchHit[] = itemsOfGroups(boardIdByGroupId.keys())
    .filter((i) => contains(i.title, q) || contains(i.notes, q))
    .sort((a, b) => byRankThen(a.title, b.title))
    .slice(0, perKind)
    .map((i) => {
      const boardId = boardIdByGroupId.get(i.groupId)!
      return { kind: 'item', id: i.id, title: i.title, subtitle: boardById.get(boardId)!.name, boardId, avatarUrl: null }
    })

  const peopleHits: SearchHit[] = db.users
    .filter((u) => visible.has(u.id))
    .filter((u) => contains(u.fullName, q) || contains(u.title, q) || contains(u.username, q) || contains(u.email, q))
    .sort((a, b) => byRankThen(a.fullName, b.fullName))
    .slice(0, perKind)
    .map((u) => ({ kind: 'person', id: u.id, title: u.fullName, subtitle: u.title, boardId: null, avatarUrl: u.avatarUrl }))

  return { boards: boardHits, items: itemHits, people: peopleHits }
}

// ---- Notifications (Services/NotificationService.cs) ------------------------

function notifications(viewer: User, max = 30): AppNotification[] {
  const today = todayDateOnly()
  const boards = visibleBoards(viewer.id)
  const boardById = new Map(boards.map((b) => [b.id, b]))
  const boardIdByGroupId = new Map(boards.flatMap((b) => groupsOf(b.id).map((g) => [g.id, b.id] as const)))
  const items = itemsOfGroups(boardIdByGroupId.keys())

  const boardId = (i: Item) => boardIdByGroupId.get(i.groupId)!
  const boardName = (i: Item) => boardById.get(boardId(i))!.name
  const result: AppNotification[] = []

  for (const item of items.filter((i) => i.assigneeIds.includes(viewer.id))) {
    if (item.status !== 'Done' && item.dueDate) {
      const days = dayDiff(today, item.dueDate)
      if (days > 0) {
        result.push({
          id: `overdue:${item.id}`,
          kind: 'overdue',
          title: item.title,
          detail: days === 1 ? `באיחור יום אחד · ${boardName(item)}` : `באיחור ${days} ימים · ${boardName(item)}`,
          itemId: item.id,
          boardId: boardId(item),
          at: `${item.dueDate}T00:00:00`,
        })
      } else if (days >= -1) {
        result.push({
          id: `due:${item.id}`,
          kind: 'due-soon',
          title: item.title,
          detail: days === 0 ? `להגשה היום · ${boardName(item)}` : `להגשה מחר · ${boardName(item)}`,
          itemId: item.id,
          boardId: boardId(item),
          at: `${item.dueDate}T00:00:00`,
        })
      }
    }
    if (item.status === 'Stuck') {
      result.push({
        id: `stuck:${item.id}`,
        kind: 'stuck',
        title: item.title,
        detail: `מסומן כתקוע · ${boardName(item)}`,
        itemId: item.id,
        boardId: boardId(item),
        at: item.dueDate ? `${item.dueDate}T00:00:00` : new Date().toISOString(),
      })
    }
  }

  // Mentions: an update by somebody else, on a visible item, naming me.
  const mentions = [`@${viewer.username}`, `@${viewer.fullName}`]
  for (const item of items) {
    for (const update of db.updates.filter((u) => u.itemId === item.id)) {
      if (update.authorUserId === viewer.id) continue
      if (!mentions.some((m) => contains(update.text, m))) continue
      result.push({
        id: `mention:${update.id}`,
        kind: 'mention',
        title: item.title,
        detail: `${db.users.find((u) => u.id === update.authorUserId)?.fullName ?? 'מישהו'} תייג אתכם · ${boardName(item)}`,
        itemId: item.id,
        boardId: boardId(item),
        at: update.createdAt,
      })
    }
  }

  const weight = (kind: string) => ({ overdue: 3, stuck: 2, 'due-soon': 1 })[kind] ?? 0
  return result
    .sort((a, b) => weight(b.kind) - weight(a.kind) || new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, max)
}

// ---- Live events (Services/BoardEventBroker.cs) -----------------------------

type Subscriber = { userId: string; onEvent: (e: BoardEvent) => void }
const subscribers = new Set<Subscriber>()

/** Every subscriber is tested against the org tree before an event reaches them, as on the server. */
function publish(boardOwnerUserId: string, e: BoardEvent) {
  for (const s of subscribers) if (canSee(s.userId, boardOwnerUserId)) s.onEvent(e)
}

export function subscribe(userId: string, onEvent: (e: BoardEvent) => void): () => void {
  const s = { userId, onEvent }
  subscribers.add(s)
  return () => subscribers.delete(s)
}

// ---- Routing (Controllers/*.cs) ----------------------------------------------

export interface MockRequest {
  method: string
  path: string
  body: unknown
  formData?: FormData
  token: string | null
}

const notFound = (title: string, detail: string) => new HttpError(404, title, detail)

/** Runs one request. Returns the response body (undefined for 204) or throws HttpError. */
export async function handle(req: MockRequest): Promise<unknown> {
  const url = new URL(req.path, 'http://demo')
  const path = url.pathname
  const body = (req.body ?? {}) as Record<string, never>
  const m = (pattern: RegExp) => path.match(pattern)

  if (req.method === 'POST' && path === '/api/auth/login') return login(body)

  const viewer = resolveToken(req.token)
  if (!viewer) throw new HttpError(401, 'Unauthorized', 'Missing or invalid session token.')
  const me = viewer.id

  try {
    const result = await route()
    if (req.method !== 'GET') save()
    return result
  } catch (e) {
    if (e instanceof BadRequest) throw new HttpError(400, 'Invalid request', e.message)
    if (e instanceof NotFound) throw new HttpError(404, 'Not Found')
    throw e
  }

  async function route(): Promise<unknown> {
    let r: RegExpMatchArray | null
    const key = `${req.method} ${path}`

    if (key === 'POST /api/auth/logout') return undefined
    if (key === 'GET /api/users/me') return userDto(viewer!)
    if (key === 'PATCH /api/users/me') return updateProfile(viewer!, body)
    if (key === 'POST /api/users/me/password') return void changePassword(viewer!, body)
    if (key === 'GET /api/users') {
      const visible = visibleUserIds(me)
      return db.users.filter((u) => visible.has(u.id)).map(userDto)
    }
    if (key === 'GET /api/org-tree') return orgTree(me)
    if (key === 'GET /api/search') return search(me, url.searchParams.get('q') ?? '')
    if (key === 'GET /api/notifications') return notifications(viewer!)
    if (key === 'GET /api/boards') return visibleBoards(me).map(boardSummary)
    if (key === 'GET /api/dashboards') return visibleDashboards(me)

    if ((r = m(/^\/api\/boards\/([^/]+)(\/items)?$/)) && req.method === 'GET') {
      return getBoard(me, r[1]) ?? fail(notFound('Board not found', `No visible board with id '${r[1]}'.`))
    }
    if ((r = m(/^\/api\/boards\/([^/]+)\/items$/)) && req.method === 'POST') {
      return createItem(me, r[1], body) ?? fail(notFound('Board not found', `No visible board with id '${r[1]}'.`))
    }
    if ((r = m(/^\/api\/boards\/([^/]+)\/groups$/)) && req.method === 'POST') {
      return createGroup(me, r[1], body) ?? fail(notFound('Board not found', `No visible board with id '${r[1]}'.`))
    }
    if ((r = m(/^\/api\/boards\/([^/]+)\/(statuses|priorities)(?:\/([^/]+))?$/))) {
      const [, boardId, kind, labelId] = r
      if (!findVisibleBoard(me, boardId)) throw new HttpError(404, 'Not Found')
      const service = kind === 'statuses' ? statusService : priorityService
      const list = kind === 'statuses' ? statusesFor : prioritiesFor
      const toDto = (row: { id: string; name: string; color: string; kind: string }) => ({ ...pick(row), isBuiltIn: false })
      if (req.method === 'GET' && !labelId) return list(boardId)
      if (req.method === 'POST' && !labelId) return toDto(service.create(boardId, body))
      if (req.method === 'PATCH' && labelId) return toDto(service.update(boardId, labelId, body))
      if (req.method === 'DELETE' && labelId) return void service.remove(boardId, labelId)
    }

    if ((r = m(/^\/api\/items\/([^/]+)$/))) {
      const missing = notFound('Item not found', `No visible item with id '${r[1]}'.`)
      if (req.method === 'GET') {
        const found = findVisibleItem(me, r[1])
        return found ? itemDto(found.item, found.board.id) : fail(missing)
      }
      if (req.method === 'PATCH') return updateItem(me, r[1], body) ?? fail(missing)
    }
    if ((r = m(/^\/api\/items\/([^/]+)\/updates$/)) && req.method === 'POST') {
      return addUpdate(me, r[1], body) ?? fail(notFound('Item not found', `No visible item with id '${r[1]}'.`))
    }
    if ((r = m(/^\/api\/items\/([^/]+)\/attachments$/)) && req.method === 'POST') {
      return (
        (await addAttachment(me, r[1], req.formData ?? new FormData())) ??
        fail(notFound('Item not found', `No visible item with id '${r[1]}'.`))
      )
    }
    if ((r = m(/^\/api\/attachments\/([^/]+)$/)) && req.method === 'DELETE') {
      const attachment = getAttachment(me, r[1])
      if (!attachment) throw notFound('Attachment not found', `No visible attachment with id '${r[1]}'.`)
      db.attachments.splice(db.attachments.indexOf(attachment), 1)
      return undefined
    }
    if ((r = m(/^\/api\/subitems\/([^/]+)$/)) && req.method === 'PATCH') {
      return updateSubItem(me, r[1], body) ?? fail(notFound('Subitem not found', `No visible subitem with id '${r[1]}'.`))
    }
    if ((r = m(/^\/api\/dashboards\/([^/]+)$/)) && req.method === 'GET') {
      return getDashboard(me, r[1]) ?? fail(notFound('Dashboard not found', `No visible dashboard with id '${r[1]}'.`))
    }

    throw new HttpError(404, 'Not Found', `${req.method} ${path} is not part of the demo API.`)
  }
}

function fail(error: HttpError): never {
  throw error
}

function pick(row: { id: string; name: string; color: string; kind: string }) {
  return { id: row.id, name: row.name, color: row.color, kind: row.kind }
}
