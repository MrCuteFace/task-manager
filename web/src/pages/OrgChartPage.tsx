import { useMemo } from 'react'
import { useOrgTree } from '../api/hooks'
import type { OrgNode } from '../api/types'
import { EmptyState } from '../components/ui/EmptyState'
import { PageLoading } from '../components/brand/Logo'
import { useSession } from '../context/session'
import { useMediaQuery } from '../components/ui/useMediaQuery'

const NODE_W = 172
const NODE_H = 58
const GAP_X = 20
const GAP_Y = 44

interface Placed {
  node: OrgNode
  x: number
  y: number
}

/** Tidy top-down layout: each subtree gets the width of its leaves; parents center over children. */
function layout(root: OrgNode) {
  const placed: Placed[] = []
  const edges: { from: Placed; to: Placed }[] = []

  const width = (n: OrgNode): number =>
    n.children.length === 0 ? NODE_W + GAP_X : n.children.reduce((sum, c) => sum + width(c), 0)

  const place = (n: OrgNode, left: number, depth: number, parent?: Placed) => {
    const w = width(n)
    const me: Placed = { node: n, x: left + w / 2 - NODE_W / 2, y: depth * (NODE_H + GAP_Y) }
    placed.push(me)
    if (parent) edges.push({ from: parent, to: me })
    let cursor = left
    for (const child of n.children) {
      place(child, cursor, depth + 1, me)
      cursor += width(child)
    }
  }

  place(root, 0, 0)
  const totalW = width(root)
  const totalH = Math.max(...placed.map((p) => p.y)) + NODE_H
  return { placed, edges, totalW, totalH }
}

function countVisible(n: OrgNode): number {
  return (n.visible ? 1 : 0) + n.children.reduce((s, c) => s + countVisible(c), 0)
}

/** The tree as the coordinator draws it: who reports to whom, and which sheets are yours to read. */
export function OrgChartPage() {
  const tree = useOrgTree()
  const user = useSession((s) => s.user)
  const model = useMemo(() => (tree.data ? layout(tree.data) : null), [tree.data])
  const isWide = useMediaQuery('(min-width: 768px)')

  if (tree.isPending) return <PageLoading />

  if (tree.isError || !model) {
    return <EmptyState tone="error" title="לא ניתן לטעון את התרשים הארגוני" description="בדקו שהשרת פועל ונסו שוב." />
  }

  const visibleCount = countVisible(tree.data)
  const totalCount = model.placed.length
  const pad = 12

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-5">
        <h1 className="stamp text-3xl leading-none">תרשים ארגוני</h1>
        <p className="mt-2 max-w-[62ch] text-sm leading-6 text-ink-2">
          כל משתמש רואה את הלוחות שלו ושל כל מי שכפוף לו, בכל עומק. {user?.fullName}, מתוך {totalCount} מנהלים בארגון,{' '}
          {visibleCount === 1 ? 'הלוחות של אדם אחד' : `הלוחות של ${visibleCount} אנשים`} גלויים לכם, והם מסומנים בדיו. השאר מצוירים בעיפרון.
        </p>
      </header>

      <div className="sheet sheet-margin overflow-x-auto p-4 ps-11 md:p-6 md:ps-16">
        <svg
          viewBox={`${-pad} ${-pad} ${model.totalW + pad * 2} ${model.totalH + pad * 2}`}
          width="100%"
          style={{
            // Phones: the tree scales down to the sheet so the viewer's own node is never cut off; wider screens keep it legible and scroll.
            minWidth: isWide ? Math.min(model.totalW + pad * 2, 900) : undefined,
            maxWidth: model.totalW + pad * 2,
            display: 'block',
            margin: '0 auto',
          }}
          role="img"
          aria-label={`תרשים ארגוני: ${totalCount} מנהלים, ${visibleCount} גלויים לכם`}
          direction="rtl"
        >
          {model.edges.map(({ from, to }) => {
            const x1 = from.x + NODE_W / 2
            const y1 = from.y + NODE_H
            const x2 = to.x + NODE_W / 2
            const y2 = to.y
            const midY = y1 + GAP_Y / 2
            const visible = to.node.visible
            return (
              <path
                key={`${from.node.id}-${to.node.id}`}
                d={`M ${x1} ${y1} V ${midY} H ${x2} V ${y2}`}
                fill="none"
                stroke={visible ? 'var(--color-ink)' : 'var(--color-pencil)'}
                strokeWidth={1}
                strokeDasharray={visible ? undefined : '3 3'}
              />
            )
          })}
          {model.placed.map(({ node, x, y }) => {
            const current = node.isCurrentUser
            const visible = node.visible
            return (
              <g key={node.id} transform={`translate(${x} ${y})`}>
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx={2}
                  fill={visible ? 'var(--color-paper)' : 'var(--color-paper-2)'}
                  stroke={current ? 'var(--color-accent)' : visible ? 'var(--color-ink)' : 'var(--color-pencil)'}
                  strokeWidth={current ? 2 : 1}
                  strokeDasharray={visible ? undefined : '3 3'}
                />
                <text
                  x={NODE_W / 2}
                  y={24}
                  textAnchor="middle"
                  fontSize={14}
                  fontWeight={600}
                  fill={visible ? 'var(--color-ink)' : 'var(--color-pencil)'}
                >
                  {node.fullName}
                </text>
                <text
                  x={NODE_W / 2}
                  y={43}
                  textAnchor="middle"
                  fontSize={11.5}
                  fill={visible ? 'var(--color-ink-2)' : 'var(--color-pencil)'}
                >
                  {node.title}
                </text>
                {current && (
                  <g transform={`translate(${NODE_W - 6} -9)`}>
                    <rect x={-30} width={30} height={16} rx={2} fill="var(--color-accent)" />
                    <text x={-15} y={11.5} textAnchor="middle" fontSize={10} fontWeight={700} fill="#fff">
                      אני
                    </text>
                  </g>
                )}
              </g>
            )
          })}
        </svg>

        <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-ink-2" aria-label="מקרא">
          <li className="inline-flex items-center gap-2">
            <span className="inline-block h-3.5 w-6 rounded-sm border-2 border-accent bg-paper" aria-hidden />
            המשתמש הנוכחי
          </li>
          <li className="inline-flex items-center gap-2">
            <span className="inline-block h-3.5 w-6 rounded-sm border border-ink bg-paper" aria-hidden />
            הלוחות שלהם גלויים לכם
          </li>
          <li className="inline-flex items-center gap-2">
            <span className="inline-block h-3.5 w-6 rounded-sm border border-dashed border-pencil bg-paper-2" aria-hidden />
            מחוץ לתחום האחריות שלכם
          </li>
        </ul>
      </div>
    </div>
  )
}
