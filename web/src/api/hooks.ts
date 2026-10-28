import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import { useSession } from '../context/session'
import type {
  AppNotification,
  BoardDetail,
  Attachment,
  BoardSummary,
  CreateGroupRequest,
  CreateItemRequest,
  ChangePasswordRequest,
  CreatePriorityRequest,
  CreateStatusRequest,
  CreateUpdateRequest,
  DashboardDetail,
  DashboardSummary,
  Group,
  Item,
  ItemUpdate,
  LoginRequest,
  LoginResponse,
  OrgNode,
  PriorityOption,
  SearchResults,
  StatusOption,
  SubItem,
  UpdateItemRequest,
  UpdatePriorityRequest,
  UpdateProfileRequest,
  UpdateStatusRequest,
  UpdateSubItemRequest,
  User,
} from './types'

export const queryKeys = {
  me: ['me'] as const,
  users: ['users'] as const,
  orgTree: ['org-tree'] as const,
  boards: ['boards'] as const,
  board: (id: string) => ['boards', id] as const,
  dashboards: ['dashboards'] as const,
  dashboard: (id: string) => ['dashboards', id] as const,
  search: (q: string) => ['search', q] as const,
  notifications: ['notifications'] as const,
}

// ---- Auth / users ---------------------------------------------------------

export function useLogin() {
  return useMutation({
    mutationFn: (request: LoginRequest) =>
      api<LoginResponse>('/api/auth/login', { method: 'POST', body: request, anonymous: true }),
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api<void>('/api/auth/logout', { method: 'POST' }),
    onSettled: () => queryClient.clear(),
  })
}

export function useMe() {
  return useQuery({ queryKey: queryKeys.me, queryFn: () => api<User>('/api/users/me') })
}

/** Edits the current user's profile and refreshes the session copy of the user. */
export function useUpdateProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (request: UpdateProfileRequest) => api<User>('/api/users/me', { method: 'PATCH', body: request }),
    onSuccess: (user) => {
      const session = useSession.getState()
      if (session.token) session.login(session.token, user)
      void queryClient.invalidateQueries({ queryKey: queryKeys.me })
      void queryClient.invalidateQueries({ queryKey: queryKeys.users })
      void queryClient.invalidateQueries({ queryKey: queryKeys.orgTree })
      void queryClient.invalidateQueries({ queryKey: queryKeys.boards })
    },
  })
}

export function useVisibleUsers() {
  return useQuery({ queryKey: queryKeys.users, queryFn: () => api<User[]>('/api/users') })
}

export function useOrgTree() {
  return useQuery({ queryKey: queryKeys.orgTree, queryFn: () => api<OrgNode>('/api/org-tree') })
}

// ---- Boards ---------------------------------------------------------------

/** Changes the password. Returns 204, so there is nothing to cache or invalidate. */
export function useChangePassword() {
  return useMutation({
    mutationFn: (request: ChangePasswordRequest) =>
      api<void>('/api/users/me/password', { method: 'POST', body: request }),
  })
}

/**
 * Top-bar search. Disabled below two characters, which is also where the server returns empty, and
 * kept for a short while so re-opening the panel with the same text is instant.
 */
export function useSearch(query: string) {
  const q = query.trim()
  return useQuery({
    queryKey: queryKeys.search(q),
    queryFn: () => api<SearchResults>(`/api/search?q=${encodeURIComponent(q)}`),
    enabled: q.length >= 2,
    staleTime: 15_000,
  })
}

/** The bell. Derived server-side on every call, so it is refetched rather than cached for long. */
export function useNotifications() {
  return useQuery({
    queryKey: queryKeys.notifications,
    queryFn: () => api<AppNotification[]>('/api/notifications'),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  })
}

// ---- Board statuses -------------------------------------------------------

/**
 * A board's own statuses. Every mutation invalidates that board, because the status list lives on
 * the board payload and items may have been moved off a deleted status server-side.
 */
export function useCreateStatus(boardId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (request: CreateStatusRequest) =>
      api<StatusOption>(`/api/boards/${boardId}/statuses`, { method: 'POST', body: request }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.board(boardId) }),
  })
}

export function useUpdateStatus(boardId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ statusId, ...request }: UpdateStatusRequest & { statusId: string }) =>
      api<StatusOption>(`/api/boards/${boardId}/statuses/${statusId}`, { method: 'PATCH', body: request }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.board(boardId) }),
  })
}

export function useDeleteStatus(boardId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (statusId: string) =>
      api<void>(`/api/boards/${boardId}/statuses/${statusId}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.board(boardId) }),
  })
}

// ---- Board priorities -----------------------------------------------------

/** A board's own priorities. Same invalidation rule as statuses: the list lives on the board payload. */
export function useCreatePriority(boardId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (request: CreatePriorityRequest) =>
      api<PriorityOption>(`/api/boards/${boardId}/priorities`, { method: 'POST', body: request }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.board(boardId) }),
  })
}

export function useUpdatePriority(boardId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ priorityId, ...request }: UpdatePriorityRequest & { priorityId: string }) =>
      api<PriorityOption>(`/api/boards/${boardId}/priorities/${priorityId}`, { method: 'PATCH', body: request }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.board(boardId) }),
  })
}

export function useDeletePriority(boardId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (priorityId: string) =>
      api<void>(`/api/boards/${boardId}/priorities/${priorityId}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.board(boardId) }),
  })
}

export function useBoards() {
  return useQuery({ queryKey: queryKeys.boards, queryFn: () => api<BoardSummary[]>('/api/boards') })
}

export function useBoard(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.board(id ?? ''),
    queryFn: () => api<BoardDetail>(`/api/boards/${id}`),
    enabled: Boolean(id),
  })
}

/** Optimistically patches an item inside the cached board, then reconciles with the server. */
export function useUpdateItem(boardId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ itemId, patch }: { itemId: string; patch: UpdateItemRequest }) =>
      api<Item>(`/api/items/${itemId}`, { method: 'PATCH', body: patch }),
    onMutate: async ({ itemId, patch }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.board(boardId) })
      const previous = queryClient.getQueryData<BoardDetail>(queryKeys.board(boardId))
      if (previous) {
        queryClient.setQueryData<BoardDetail>(queryKeys.board(boardId), applyItemPatch(previous, itemId, patch))
      }
      return { previous }
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.board(boardId), context.previous)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.board(boardId) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.boards })
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboards })
    },
  })
}

export function useCreateItem(boardId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (request: CreateItemRequest) =>
      api<Item>(`/api/boards/${boardId}/items`, { method: 'POST', body: request }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.board(boardId) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.boards })
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboards })
    },
  })
}

export function useCreateGroup(boardId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (request: CreateGroupRequest) =>
      api<Group>(`/api/boards/${boardId}/groups`, { method: 'POST', body: request }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.board(boardId) }),
  })
}

export function useUpdateSubItem(boardId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ subItemId, patch }: { subItemId: string; patch: UpdateSubItemRequest }) =>
      api<SubItem>(`/api/subitems/${subItemId}`, { method: 'PATCH', body: patch }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.board(boardId) }),
  })
}

export function useAddUpdate(boardId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ itemId, request }: { itemId: string; request: CreateUpdateRequest }) =>
      api<ItemUpdate>(`/api/items/${itemId}/updates`, { method: 'POST', body: request }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.board(boardId) }),
  })
}

export function useUploadAttachment(boardId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ itemId, file }: { itemId: string; file: File }) => {
      const formData = new FormData()
      formData.append('file', file, file.name)
      return api<Attachment>(`/api/items/${itemId}/attachments`, { method: 'POST', formData })
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.board(boardId) }),
  })
}

export function useDeleteAttachment(boardId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (attachmentId: string) => api<void>(`/api/attachments/${attachmentId}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.board(boardId) }),
  })
}

// ---- Dashboards -----------------------------------------------------------

export function useDashboards() {
  return useQuery({ queryKey: queryKeys.dashboards, queryFn: () => api<DashboardSummary[]>('/api/dashboards') })
}

export function useDashboard(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.dashboard(id ?? ''),
    queryFn: () => api<DashboardDetail>(`/api/dashboards/${id}`),
    enabled: Boolean(id),
  })
}

// ---- helpers --------------------------------------------------------------

function applyItemPatch(board: BoardDetail, itemId: string, patch: UpdateItemRequest): BoardDetail {
  const source = board.groups.flatMap((g) => g.items).find((i) => i.id === itemId)
  if (!source) return board

  // An id wins over a plain value, as it does server-side; a custom label shows its kind at once.
  const status = patch.statusId ? board.statuses.find((s) => s.id === patch.statusId) : undefined
  const priority = patch.priorityId ? board.priorities.find((p) => p.id === patch.priorityId) : undefined

  const updated: Item = {
    ...source,
    title: patch.title ?? source.title,
    status: status ? status.kind : (patch.status ?? source.status),
    statusId: status ? (status.isBuiltIn ? null : status.id) : patch.status ? null : source.statusId,
    assigneeIds: patch.assigneeIds ?? source.assigneeIds,
    dueDate: patch.clearDueDate ? null : (patch.dueDate ?? source.dueDate),
    priority: patch.clearPriority ? null : priority ? priority.kind : (patch.priority ?? source.priority),
    priorityId: patch.clearPriority
      ? null
      : priority
        ? priority.isBuiltIn ? null : priority.id
        : patch.priority ? null : source.priorityId,
    notes: patch.notes ?? source.notes,
    groupId: patch.groupId ?? source.groupId,
    order: patch.order ?? source.order,
  }

  const moving = patch.groupId !== undefined || patch.order !== undefined
  return {
    ...board,
    groups: board.groups.map((group) => {
      const without = group.items.filter((i) => i.id !== itemId)
      if (group.id !== updated.groupId) {
        return without.length === group.items.length ? group : { ...group, items: renumber(without) }
      }
      if (!moving) {
        return { ...group, items: group.items.map((i) => (i.id === itemId ? updated : i)) }
      }
      const at = Math.max(0, Math.min(patch.order ?? without.length, without.length))
      const items = [...without.slice(0, at), updated, ...without.slice(at)]
      return { ...group, items: renumber(items) }
    }),
  }
}

function renumber(items: Item[]): Item[] {
  return items.map((item, index) => (item.order === index ? item : { ...item, order: index }))
}
