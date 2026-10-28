import type { User } from '../../api/types'

/** Users whose full name or any name part starts with the typed text (Hebrew has no case). */
export function matchMentionQuery(users: User[], query: string, limit = 6): User[] {
  const q = query.trim()
  const matches = users.filter((u) => {
    if (!q) return true
    if (u.fullName.startsWith(q)) return true
    return u.fullName.split(/\s+/).some((part) => part.startsWith(q))
  })
  return matches.slice(0, limit)
}

/**
 * Finds an "@" mention being typed: the "@" closest before the caret with no line break
 * between it and the caret. Returns the query text after "@" and its start offset.
 */
export function findActiveMention(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret)
  const at = before.lastIndexOf('@')
  if (at < 0) return null
  if (at > 0 && !/\s/.test(before[at - 1])) return null
  const query = before.slice(at + 1)
  if (/\n/.test(query)) return null
  // A mention query is at most a first name and a last name.
  if (query.split(' ').length > 3) return null
  return { start: at, query }
}

export type MentionSegment = { kind: 'text'; text: string } | { kind: 'mention'; text: string; user: User }

/** Splits an update into plain text and recognized "@Full Name" mentions. Longest names match first. */
export function splitMentions(text: string, users: User[]): MentionSegment[] {
  if (users.length === 0 || !text.includes('@')) return [{ kind: 'text', text }]
  const names = [...users].sort((a, b) => b.fullName.length - a.fullName.length)
  const pattern = new RegExp(`@(${names.map((u) => escapeRegExp(u.fullName)).join('|')})`, 'g')
  const segments: MentionSegment[] = []
  let last = 0
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > last) segments.push({ kind: 'text', text: text.slice(last, index) })
    const user = names.find((u) => u.fullName === match[1])
    if (user) segments.push({ kind: 'mention', text: match[0], user })
    else segments.push({ kind: 'text', text: match[0] })
    last = index + match[0].length
  }
  if (last < text.length) segments.push({ kind: 'text', text: text.slice(last) })
  return segments
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
