import { useMemo } from 'react'
import { useVisibleUsers } from '../../api/hooks'
import type { User } from '../../api/types'

/** Visible users by id, for assignee names and pickers. */
export function useUserMap() {
  const users = useVisibleUsers()
  const map = useMemo(() => new Map<string, User>((users.data ?? []).map((u) => [u.id, u])), [users.data])
  const nameOf = (id: string) => map.get(id)?.fullName ?? id
  const personOf = (id: string) => ({ name: nameOf(id), avatarUrl: map.get(id)?.avatarUrl ?? null })
  return { map, nameOf, personOf, users: users.data ?? [], isPending: users.isPending }
}
