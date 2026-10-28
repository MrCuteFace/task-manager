import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { streamEvents } from './client'
import { queryKeys } from './hooks'
import { useSession } from '../context/session'
import type { BoardEvent } from './types'

/** Backoff for a dropped stream: quick enough to feel instant, slow enough not to hammer a down server. */
const RECONNECT_DELAYS_MS = [500, 1_000, 2_000, 5_000, 10_000]

/**
 * One event stream per tab, opened for as long as someone is signed in.
 *
 * What arrives is a fact about data the viewer is already allowed to see - the server filters the
 * fan-out through the same org tree as every read - so the handler's only job is to tell React Query
 * that a board went stale. Refetching rather than patching the cache keeps one source of truth for what
 * a board contains, and a board is small enough in this demo that the round trip is not worth avoiding.
 */
export function useLiveEvents() {
  const queryClient = useQueryClient()
  const token = useSession((s) => s.token)

  useEffect(() => {
    if (!token) return

    const controller = new AbortController()
    let attempt = 0
    let retryTimer: ReturnType<typeof setTimeout> | undefined

    const handle = (event: string, data: string) => {
      if (event !== 'update.created') return
      let payload: BoardEvent
      try {
        payload = JSON.parse(data) as BoardEvent
      } catch {
        return
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.board(payload.boardId) })
      // A comment can mention you, and the bell is derived from the same data.
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications })
    }

    const connect = async () => {
      const openedAt = Date.now()
      try {
        await streamEvents('/api/events', handle, controller.signal)
        // A clean end means the server closed the stream; reconnect as if it had failed.
      } catch {
        // Aborted, offline, or the API restarted. The retry below covers all three.
      }
      if (controller.signal.aborted) return
      // A stream that stayed up is not evidence of a failing server, so it starts the backoff over.
      if (Date.now() - openedAt > 10_000) attempt = 0
      const delay = RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)]
      attempt += 1
      retryTimer = setTimeout(() => void connect(), delay)
    }

    void connect()

    return () => {
      controller.abort()
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [queryClient, token])
}
