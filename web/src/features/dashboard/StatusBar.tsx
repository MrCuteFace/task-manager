import type { StatusCounts } from '../../api/types'
import { STATUS_LABEL } from '../boards/status'

/** Chart colors for the status law, validated with the dataviz palette script. */
export const STATUS_CHART_COLOR = {
  Todo: 'var(--color-todo)',
  InProgress: 'var(--color-progress-chart)',
  Done: 'var(--color-done)',
  Stuck: 'var(--color-stuck)',
} as const

const ORDER = ['Done', 'InProgress', 'Todo', 'Stuck'] as const

/** A thin stacked bar of the four statuses with 2px surface gaps. Always paired with numbers in text. */
export function StatusBar({ counts, height = 6 }: { counts: StatusCounts; height?: number }) {
  const total = counts.total
  const label = ORDER.map((s) => `${STATUS_LABEL[s]} ${countOf(counts, s)}`).join(', ')
  if (total === 0) {
    return <div role="img" aria-label="אין פריטים" className="w-full rounded-sm bg-paper-3" style={{ height }} />
  }
  return (
    <div role="img" aria-label={label} className="bar-grow flex w-full gap-0.5 overflow-hidden rounded-sm" style={{ height }}>
      {ORDER.map((s) => {
        const value = countOf(counts, s)
        if (value === 0) return null
        return (
          <span
            key={s}
            title={`${STATUS_LABEL[s]}: ${value}`}
            style={{ flexGrow: value, background: STATUS_CHART_COLOR[s] }}
            className="min-w-0.5"
          />
        )
      })}
    </div>
  )
}

export function countOf(counts: StatusCounts, status: (typeof ORDER)[number]): number {
  switch (status) {
    case 'Todo':
      return counts.todo
    case 'InProgress':
      return counts.inProgress
    case 'Done':
      return counts.done
    case 'Stuck':
      return counts.stuck
  }
}
