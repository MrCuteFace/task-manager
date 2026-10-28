import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowBendUpLeft, CaretDown, CaretLeft, PaperPlaneTilt, X } from '@phosphor-icons/react'
import type { ItemUpdate, User } from '../../api/types'
import { Avatar } from '../../components/ui/Avatar'
import { Button } from '../../components/ui/Button'
import { formatDateTime } from '../boards/status'
import { MentionTextarea } from './MentionTextarea'
import { splitMentions } from './mentions'

interface Thread {
  root: ItemUpdate
  replies: ItemUpdate[]
}

/**
 * Groups a flat list of updates into threads.
 *
 * A reply can answer another reply, so the parent chain is walked up to whichever update opened the
 * thread: the data keeps the true parent (who you answered), the display keeps one level of indent
 * (which conversation you are in). Two levels of indent in a 400px panel is a staircase.
 *
 * Within a thread the replies are ordered **depth first**, not by time: an answer sits directly under
 * the comment it answers, with its own answers beneath it. Plain chronological order sends every new
 * reply to the bottom of the thread, which reads as a pile rather than a conversation and leaves no
 * way to tell what a reply is replying to.
 */
export function buildThreads(updates: ItemUpdate[]): Thread[] {
  const byId = new Map(updates.map((u) => [u.id, u]))
  const threads = new Map<string, Thread>()
  const order: string[] = []

  const rootIdOf = (update: ItemUpdate): string => {
    const seen = new Set<string>([update.id])
    let current = update
    while (current.parentUpdateId) {
      const parent = byId.get(current.parentUpdateId)
      // A parent outside this item's list, or a cycle, ends the walk: the update stands on its own.
      if (!parent || seen.has(parent.id)) return current.id
      seen.add(parent.id)
      current = parent
    }
    return current.id
  }

  // Children keyed by the update they answer, each list already in the order the server sent (by time).
  const childrenOf = new Map<string, ItemUpdate[]>()

  for (const update of updates) {
    if (!update.parentUpdateId) {
      threads.set(update.id, { root: update, replies: [] })
      order.push(update.id)
      continue
    }
    const rootId = rootIdOf(update)
    if (!threads.has(rootId)) {
      // Its root is missing, so it opens a thread of its own rather than disappearing.
      threads.set(update.id, { root: update, replies: [] })
      order.push(update.id)
      continue
    }
    const parentId = byId.has(update.parentUpdateId) ? update.parentUpdateId : rootId
    const siblings = childrenOf.get(parentId)
    if (siblings) siblings.push(update)
    else childrenOf.set(parentId, [update])
  }

  const collect = (parentId: string, into: ItemUpdate[], guard: Set<string>) => {
    for (const child of childrenOf.get(parentId) ?? []) {
      if (guard.has(child.id)) continue
      guard.add(child.id)
      into.push(child)
      collect(child.id, into, guard)
    }
  }

  for (const thread of threads.values()) collect(thread.root.id, thread.replies, new Set())

  return order.map((id) => threads.get(id)!)
}

/** Scrolls an update into view and flashes it, so "which one was that?" is one click away. */
function jumpToUpdate(id: string) {
  const el = document.getElementById(`update-${id}`)
  if (!el) return
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' })
  // Restarting a CSS animation needs the class off, a reflow, then the class on again. Doing it
  // imperatively keeps a purely transient highlight out of the component's state.
  el.classList.remove('update-flash')
  void el.offsetWidth
  el.classList.add('update-flash')
}

interface UpdatesThreadProps {
  updates: ItemUpdate[]
  users: User[]
  userMap: Map<string, User>
  /** Ids that arrived after this panel opened; they animate in and are washed with the accent. */
  arrivedIds: ReadonlySet<string>
  onReply: (text: string, parentUpdateId: string) => Promise<void>
  isPosting: boolean
}

/**
 * A thread this long has stopped being a conversation you read and become one you scroll past, so it
 * arrives folded. Anything shorter is cheaper to show than to ask about.
 */
const FOLD_REPLIES_ABOVE = 3

const repliesLabel = (n: number) => (n === 1 ? 'תגובה אחת' : `${n} תגובות`)

/** The item's conversation: a thread per opening comment, replies under it, @ to tag anyone. */
export function UpdatesThread({ updates, users, userMap, arrivedIds, onReply, isPosting }: UpdatesThreadProps) {
  const threads = buildThreads(updates)
  // The id, not the update: resolving it each render means a composer can never point at an update
  // that a refetch has removed, with no effect needed to tidy up after one.
  const [replyingToId, setReplyingToId] = useState<string | null>(null)
  const byId = new Map(updates.map((u) => [u.id, u]))
  const replyingTo = replyingToId ? byId.get(replyingToId) ?? null : null

  /*
    Which threads are folded. Seeded once, from how the conversation looked when the panel opened: a
    thread that grows past the threshold while you are reading it must not fold itself under your eyes,
    and a thread you deliberately opened must stay open when the next reply lands.
  */
  const [foldedIds, setFoldedIds] = useState<ReadonlySet<string>>(
    () => new Set(threads.filter((t) => t.replies.length > FOLD_REPLIES_ABOVE).map((t) => t.root.id)),
  )

  const toggleFold = (rootId: string) =>
    setFoldedIds((current) => {
      const next = new Set(current)
      if (!next.delete(rootId)) next.add(rootId)
      return next
    })

  return (
    <ol className="mt-2 flex flex-col gap-4">
      {threads.map((thread) => {
        const openHere =
          replyingTo !== null && (replyingTo.id === thread.root.id || thread.replies.some((r) => r.id === replyingTo.id))
        // A reply that just arrived, or a composer aimed into the thread, wins over the fold: both are
        // reasons the thread is the thing you are looking at.
        const folded =
          foldedIds.has(thread.root.id) && !openHere && !thread.replies.some((r) => arrivedIds.has(r.id))

        return (
          <li key={thread.root.id}>
            <Comment
              update={thread.root}
              users={users}
              userMap={userMap}
              arrived={arrivedIds.has(thread.root.id)}
              onReply={() => setReplyingToId(thread.root.id)}
            />

            {thread.replies.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => toggleFold(thread.root.id)}
                  aria-expanded={!folded}
                  className="pressable mt-2 ms-8 inline-flex items-center gap-1 rounded-sm px-1 py-0.5 text-xs text-pencil hover:bg-paper-2 hover:text-accent"
                >
                  {folded ? <CaretLeft size={12} weight="bold" aria-hidden /> : <CaretDown size={12} weight="bold" aria-hidden />}
                  {folded ? repliesLabel(thread.replies.length) : 'הסתרת התגובות'}
                </button>

                {!folded && (
                  // The thread's rail is on the inline-start edge - the right, in RTL - so replies hang
                  // off the conversation the way the eye reads into it.
                  <ol className="mt-2 ms-8 flex flex-col gap-3 border-s border-rule ps-3">
                    {thread.replies.map((reply) => (
                      <li key={reply.id}>
                        <Comment
                          update={reply}
                          users={users}
                          userMap={userMap}
                          arrived={arrivedIds.has(reply.id)}
                          size={22}
                          // Only worth quoting when it answers another reply; under the root it is obvious.
                          answering={
                            reply.parentUpdateId && reply.parentUpdateId !== thread.root.id
                              ? byId.get(reply.parentUpdateId) ?? null
                              : null
                          }
                          onReply={() => setReplyingToId(reply.id)}
                        />
                      </li>
                    ))}
                  </ol>
                )}
              </>
            )}

            {openHere && replyingTo && (
              <ReplyComposer
                to={replyingTo}
                users={users}
                isPosting={isPosting}
                onCancel={() => setReplyingToId(null)}
                onSubmit={async (text) => {
                  await onReply(text, replyingTo.id)
                  setReplyingToId(null)
                }}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}

interface CommentProps {
  update: ItemUpdate
  users: User[]
  userMap: Map<string, User>
  arrived: boolean
  size?: number
  /** The comment this one answers, when that is not the one that opened the thread. */
  answering?: ItemUpdate | null
  onReply: () => void
}

function Comment({ update, users, userMap, arrived, size = 26, answering = null, onReply }: CommentProps) {
  const ref = useRef<HTMLDivElement>(null)

  // A comment that lands below the fold brings itself into view. `block: 'nearest'` is the whole
  // point: one already on screen is left exactly where it is, so an arrival never yanks the panel
  // out from under someone reading further up.
  useEffect(() => {
    if (!arrived) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ref.current?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' })
  }, [arrived])

  return (
    <div id={`update-${update.id}`} ref={ref} className={`group/comment flex gap-2.5 ${arrived ? 'update-arrive' : ''}`}>
      <Avatar name={update.authorName} src={userMap.get(update.authorUserId)?.avatarUrl} size={size} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 text-xs">
          <span className="font-semibold text-ink">{update.authorName}</span>
          <time dateTime={update.createdAt} className="text-pencil">
            {formatDateTime(update.createdAt)}
          </time>
          <button
            type="button"
            onClick={onReply}
            className="pressable ms-auto inline-flex shrink-0 items-center gap-1 rounded-sm px-1 py-0.5 text-xs text-pencil opacity-0 hover:bg-paper-2 hover:text-accent focus-visible:opacity-100 group-hover/comment:opacity-100"
          >
            <ArrowBendUpLeft size={12} aria-hidden />
            תגובה
          </button>
        </div>
        {/*
          Naming the author is not enough - the same person writes several comments in a thread, and
          then every reply says "בתגובה ל-עמית רוזן" and none of them says which one. So the quote
          carries the answered comment's own words, and clicking it jumps to that comment and flashes
          it, which settles the question for a quote too long to fit on the line.
        */}
        {answering && (
          <button
            type="button"
            onClick={() => jumpToUpdate(answering.id)}
            title={`מעבר לתגובה של ${answering.authorName}`}
            className="pressable mt-0.5 flex w-full items-baseline gap-1.5 rounded-sm border-s-2 border-rule-strong bg-paper-2/60 py-0.5 pe-1.5 ps-2 text-start text-xs text-pencil hover:border-accent hover:text-ink-2"
          >
            <span className="shrink-0 font-semibold">{answering.authorName}</span>
            <span className="min-w-0 flex-1 truncate">{answering.text}</span>
          </button>
        )}
        <p className="mt-0.5 text-sm leading-6 text-ink">
          {splitMentions(update.text, users).map((seg, i) =>
            seg.kind === 'mention' ? (
              <span key={i} className="rounded-sm bg-accent-soft px-0.5 font-semibold text-accent-strong" title={seg.user.title}>
                {seg.text}
              </span>
            ) : (
              <span key={i}>{seg.text}</span>
            ),
          )}
        </p>
      </div>
    </div>
  )
}

interface ReplyComposerProps {
  to: ItemUpdate
  users: User[]
  isPosting: boolean
  onSubmit: (text: string) => Promise<void>
  onCancel: () => void
}

function ReplyComposer({ to, users, isPosting, onSubmit, onCancel }: ReplyComposerProps) {
  const [text, setText] = useState('')
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    formRef.current?.querySelector('textarea')?.focus()
  }, [to.id])

  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    const trimmed = text.trim()
    if (!trimmed) return
    await onSubmit(trimmed)
    setText('')
  }

  return (
    <form ref={formRef} onSubmit={submit} className="mt-2 ms-8 ps-3">
      {/* The same quote the posted reply will carry, so what you are answering is settled before you send. */}
      <div className="flex items-center gap-2 border-s-2 border-accent bg-paper-2/60 py-1 pe-1 ps-2 text-xs text-pencil">
        {/* line-clamp makes this span a -webkit-box, so the name and the text must sit inside it. */}
        <span className="line-clamp-2 min-w-0 flex-1">
          <span className="font-semibold text-ink-2">{to.authorName}</span>{' '}
          {to.text}
        </span>
        <button
          type="button"
          onClick={onCancel}
          aria-label="ביטול התגובה"
          className="pressable shrink-0 self-start rounded-sm p-0.5 hover:bg-paper-2 hover:text-ink"
        >
          <X size={12} aria-hidden />
        </button>
      </div>
      <div className="mt-1.5 flex items-end gap-2">
        <MentionTextarea
          value={text}
          onChange={setText}
          users={users}
          onSubmit={() => void submit()}
          rows={1}
          placeholder="תגובה, @ לתיוג"
          aria-label={`תגובה ל${to.authorName}`}
          className="min-h-9 flex-1 resize-none rounded-sm border border-rule bg-paper px-2 py-1.5 text-sm text-ink placeholder:text-pencil focus:border-accent"
        />
        <Button type="submit" variant="primary" size="sm" disabled={!text.trim() || isPosting} aria-label="שליחת התגובה">
          <PaperPlaneTilt size={14} aria-hidden />
        </Button>
      </div>
    </form>
  )
}
