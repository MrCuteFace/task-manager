import { useSession } from '../context/session'
import type { BoardEvent, ProblemDetails } from './types'
import { fromBase64 } from './mock/db'
import { HttpError, getAttachment, handle, resolveToken, subscribe } from './mock/server'

/*
  Static demo build. The original client is a thin fetch wrapper over the ASP.NET Core API in
  /server; here the same three functions answer from `./mock`, a TypeScript port of that API's
  services that runs in the tab. Nothing above this file knows the difference: the hooks, the cache
  invalidation and the optimistic updates are exactly the ones the real client uses.
*/

/**
 * Long enough that loading states are real, short enough not to feel slow. Open the demo with `?slow`
 * to stretch every request to a full loader cycle and watch the loading animation.
 */
const LATENCY_MS = new URLSearchParams(location.search).has('slow') ? 3000 : 140

const delay = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    })
  })

export class ApiError extends Error {
  readonly status: number
  readonly title: string
  readonly detail: string | undefined

  constructor(status: number, problem: ProblemDetails | undefined) {
    super(problem?.detail ?? problem?.title ?? `HTTP ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.title = problem?.title ?? `HTTP ${status}`
    this.detail = problem?.detail
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  /** Multipart body; sent as-is with no JSON headers. */
  formData?: FormData
  /** Skip the Authorization header (login). */
  anonymous?: boolean
  signal?: AbortSignal
}

/** Same contract as the fetch wrapper: JSON-shaped results, ApiError on failure, logout on 401. */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, formData, anonymous = false, signal } = options
  await delay(LATENCY_MS, signal)

  try {
    const result = await handle({
      method,
      path,
      // A JSON round trip, as over the wire: the cache must never share objects with the store.
      body: body === undefined ? undefined : JSON.parse(JSON.stringify(body)),
      formData,
      token: anonymous ? null : useSession.getState().token,
    })
    return (result === undefined ? undefined : structuredClone(result)) as T
  } catch (e) {
    if (!(e instanceof HttpError)) throw e
    if (e.status === 401 && !anonymous) useSession.getState().logout()
    throw new ApiError(e.status, { status: e.status, title: e.title, detail: e.detail })
  }
}

/**
 * The server streams board events over SSE; here they come straight from the in-tab broker, already
 * filtered by the org tree. Resolves when `signal` aborts, as a closed stream would.
 */
export async function streamEvents(
  _path: string,
  onMessage: (event: string, data: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const user = resolveToken(useSession.getState().token)
  if (!user) {
    useSession.getState().logout()
    throw new ApiError(401, undefined)
  }
  await new Promise<void>((resolve) => {
    const unsubscribe = subscribe(user.id, (e: BoardEvent) => onMessage(e.type, JSON.stringify(e)))
    signal.addEventListener('abort', () => {
      unsubscribe()
      resolve()
    })
  })
}

/** Hands a stored attachment to the browser as a download. */
export async function downloadFile(path: string, fileName: string): Promise<void> {
  const user = resolveToken(useSession.getState().token)
  if (!user) {
    useSession.getState().logout()
    throw new ApiError(401, undefined)
  }
  const id = path.split('/').pop() ?? ''
  const attachment = getAttachment(user.id, id)
  if (!attachment) throw new ApiError(404, { title: 'Attachment not found' })

  const bytes = fromBase64(attachment.data)
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: attachment.contentType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
