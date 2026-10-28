// Mirrors backend/TaskManager.Api/Models/Dtos/Dtos.cs. Keep the two in sync.

export type ItemStatus = 'Todo' | 'InProgress' | 'Done' | 'Stuck'
export type Priority = 'Low' | 'Medium' | 'High' | 'Critical'

export const ITEM_STATUSES: readonly ItemStatus[] = ['Todo', 'InProgress', 'Done', 'Stuck']

/**
 * One status a board offers. `isBuiltIn` marks the four the whole product shares — those are drawn
 * with the hand-drawn marks in index.css and cannot be renamed or removed. `kind` is the meaning a
 * custom status borrows, so overdue, notifications and the charts keep working whatever it is called.
 */
export interface StatusOption {
  id: string
  name: string
  color: string
  kind: ItemStatus
  isBuiltIn: boolean
}

export interface CreateStatusRequest {
  name: string
  color: string
  kind?: ItemStatus
}

export interface UpdateStatusRequest {
  name?: string
  color?: string
  kind?: ItemStatus
}

/**
 * One priority a board offers. `isBuiltIn` marks the four levels the whole product shares — those
 * are drawn with ink weight and an icon. `kind` is the level a custom priority ranks as, and is what
 * sorting reads, so a board can name a level anything without disturbing the column's order.
 */
export interface PriorityOption {
  id: string
  name: string
  color: string
  kind: Priority
  isBuiltIn: boolean
}

export interface CreatePriorityRequest {
  name: string
  color: string
  kind?: Priority
}

export interface UpdatePriorityRequest {
  name?: string
  color?: string
  kind?: Priority
}

export const PRIORITIES: readonly Priority[] = ['Low', 'Medium', 'High', 'Critical']

/** ISO date without time, e.g. "2026-09-30". */
export type DateOnly = string
/** ISO 8601 timestamp. */
export type DateTimeString = string

// ---- Auth / users ---------------------------------------------------------

export interface LoginRequest {
  username: string
  password: string
}

export interface LoginResponse {
  token: string
  user: User
}

export interface User {
  id: string
  fullName: string
  title: string
  managerId: string | null
  username: string
  avatarUrl: string | null
  email: string | null
}

/**
 * Partial profile update for the current user. `clearAvatar` removes the photo and `clearEmail`
 * removes the address; each wins over the matching value field.
 */
export interface UpdateProfileRequest {
  fullName?: string
  title?: string
  avatarUrl?: string
  clearAvatar?: boolean
  email?: string
  clearEmail?: boolean
}

export interface ChangePasswordRequest {
  currentPassword: string
  newPassword: string
}

/** One hit from the top-bar search. `boardId` is set for items, for navigation. */
export interface SearchHit {
  kind: 'board' | 'item' | 'person'
  id: string
  title: string
  subtitle: string | null
  boardId: string | null
  avatarUrl: string | null
}

export interface SearchResults {
  boards: SearchHit[]
  items: SearchHit[]
  people: SearchHit[]
}

export type NotificationKind = 'overdue' | 'stuck' | 'due-soon' | 'mention'

/** Derived on every request from the items the viewer can see; nothing is stored server-side. */
export interface AppNotification {
  id: string
  kind: NotificationKind
  title: string
  detail: string
  itemId: string | null
  boardId: string | null
  at: string
}

export interface OrgNode {
  id: string
  fullName: string
  title: string
  managerId: string | null
  avatarUrl: string | null
  visible: boolean
  isCurrentUser: boolean
  children: OrgNode[]
}

// ---- Boards ---------------------------------------------------------------

export interface StatusCounts {
  todo: number
  inProgress: number
  done: number
  stuck: number
  total: number
}

export interface BoardSummary {
  id: string
  name: string
  description: string | null
  workspaceId: string
  workspaceName: string
  ownerUserId: string
  ownerName: string
  counts: StatusCounts
  overdueCount: number
}

export interface BoardDetail {
  id: string
  name: string
  description: string | null
  workspaceId: string
  workspaceName: string
  ownerUserId: string
  ownerName: string
  groups: Group[]
  /** Built-ins first, then this board's own statuses. */
  statuses: StatusOption[]
  /** Built-in levels first, then this board's own priorities. */
  priorities: PriorityOption[]
}

export interface Group {
  id: string
  name: string
  color: string
  order: number
  items: Item[]
}

export interface Item {
  id: string
  groupId: string
  boardId: string
  title: string
  status: ItemStatus
  /** The custom status this item is on, or null when it is on a built-in. */
  statusId: string | null
  assigneeIds: string[]
  dueDate: DateOnly | null
  priority: Priority | null
  /** The custom priority this item is on, or null for a built-in level or none. */
  priorityId: string | null
  notes: string | null
  order: number
  subItems: SubItem[]
  updates: ItemUpdate[]
  attachments: Attachment[]
}

export interface Attachment {
  id: string
  itemId: string
  fileName: string
  contentType: string
  size: number
  uploadedByUserId: string
  uploadedByName: string
  uploadedAt: DateTimeString
}

export interface SubItem {
  id: string
  itemId: string
  title: string
  // Subitems stay on the four built-in statuses; custom statuses are a board-level idea.
  status: ItemStatus
  assigneeIds: string[]
  dueDate: DateOnly | null
  order: number
}

export interface ItemUpdate {
  id: string
  itemId: string
  authorUserId: string
  authorName: string
  text: string
  createdAt: DateTimeString
  /** The update this one answers, or null when it opens a thread. A reply may itself be answered. */
  parentUpdateId: string | null
  /** Who wrote the answered update; null on a thread opener. */
  parentAuthorName: string | null
}

/** A new group at the end of a board. Color defaults to the server palette. */
export interface CreateGroupRequest {
  name: string
  color?: string
}

export interface CreateItemRequest {
  groupId: string
  title: string
  status?: ItemStatus
  assigneeIds?: string[]
  dueDate?: DateOnly
  priority?: Priority
}

/** Partial update: only provided fields are applied. `clearDueDate` removes the date. */
export interface UpdateItemRequest {
  title?: string
  status?: ItemStatus
  /** Moves the item onto a status by id, built-in or custom. Wins over status. */
  statusId?: string
  assigneeIds?: string[]
  dueDate?: DateOnly
  clearDueDate?: boolean
  priority?: Priority
  /** Moves the item onto a priority by id, built-in or custom. Wins over priority. */
  priorityId?: string
  clearPriority?: boolean
  notes?: string
  groupId?: string
  order?: number
}

export interface UpdateSubItemRequest {
  title?: string
  status?: ItemStatus
  assigneeIds?: string[]
}

export interface CreateUpdateRequest {
  text: string
  /** Set to answer an existing update on the same item. */
  parentUpdateId?: string | null
}

/** One live event from `GET /api/events`, already filtered by the org tree on the server. */
export interface BoardEvent {
  type: 'update.created'
  boardId: string
  itemId: string
  update: ItemUpdate | null
}

// ---- Dashboards -----------------------------------------------------------

export interface DashboardSummary {
  id: string
  name: string
  description: string | null
  ownerUserId: string
  boardCount: number
}

export interface AssigneeLoad {
  userId: string
  fullName: string
  counts: StatusCounts
}

export interface OverdueItem {
  itemId: string
  title: string
  boardId: string
  boardName: string
  status: ItemStatus
  dueDate: DateOnly
  daysOverdue: number
  assigneeIds: string[]
}

export interface DashboardDetail {
  id: string
  name: string
  description: string | null
  ownerUserId: string
  totals: StatusCounts
  overdueCount: number
  dueThisWeekCount: number
  boards: BoardSummary[]
  byAssignee: AssigneeLoad[]
  overdueItems: OverdueItem[]
}

// ---- Errors ---------------------------------------------------------------

/** RFC 9457 problem details as returned by ASP.NET Core. */
export interface ProblemDetails {
  type?: string
  title?: string
  status?: number
  detail?: string
}
