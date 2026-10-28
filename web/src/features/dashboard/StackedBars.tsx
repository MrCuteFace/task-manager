import { Link } from 'react-router-dom'
import type { StatusCounts } from '../../api/types'
import { STATUS_LABEL } from '../boards/status'
import { STATUS_CHART_COLOR, countOf } from './StatusBar'

const ORDER = ['Done', 'InProgress', 'Todo', 'Stuck'] as const

export interface BarRow {
  id: string
  label: string
  sublabel?: string
  counts: StatusCounts
  href?: string
}

/**
 * Horizontal stacked bars, one per row, sharing one scale. Bars are 14px thick with 2px
 * surface gaps between segments and a rounded data end; the baseline (start edge) stays square.
 * Numbers ride in text beside the bar, never inside the color. On narrow screens the label
 * sits above its bar so the bar keeps the full width.
 */
export function StackedBars({ rows, ariaLabel }: { rows: BarRow[]; ariaLabel: string }) {
  const max = Math.max(1, ...rows.map((r) => r.counts.total))
  return (
    <div role="figure" aria-label={ariaLabel} className="flex flex-col gap-3 md:gap-2.5">
      {rows.map((row, rowIndex) => (
        <div key={row.id} className="flex flex-col gap-1 text-sm md:grid md:grid-cols-[minmax(0,180px)_1fr_auto] md:items-center md:gap-3">
          <div className="min-w-0">
            {row.href ? (
              <Link to={row.href} className="block truncate text-ink hover:underline">
                {row.label}
              </Link>
            ) : (
              <span className="block truncate text-ink">{row.label}</span>
            )}
            {row.sublabel && <span className="block truncate text-xs text-pencil">{row.sublabel}</span>}
          </div>
          <div className="flex items-center gap-3 md:contents">
            <div className="flex-1 md:flex-none">
              <div className="bar-grow flex h-3.5 items-stretch gap-0.5" style={{ width: `${(row.counts.total / max) * 100}%`, ['--i' as string]: rowIndex }}>
                {ORDER.map((s) => {
                  const value = countOf(row.counts, s)
                  if (value === 0) return null
                  return (
                    <span
                      key={s}
                      title={`${STATUS_LABEL[s]}: ${value}`}
                      className="min-w-0.5 last:rounded-e-sm"
                      style={{ flexGrow: value, background: STATUS_CHART_COLOR[s] }}
                    />
                  )
                })}
              </div>
            </div>
            <span className="shrink-0 text-xs text-ink-2">
              <span className="font-semibold text-ink">{row.counts.done}</span> / {row.counts.total}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

/** The legend for the status colors, with the totals as the secondary encoding. */
export function StatusLegend({ counts }: { counts: StatusCounts }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2" aria-label="מקרא">
      {ORDER.map((s) => (
        <li key={s} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: STATUS_CHART_COLOR[s] }} aria-hidden />
          {STATUS_LABEL[s]}
          <span className="font-semibold text-ink">{countOf(counts, s)}</span>
        </li>
      ))}
    </ul>
  )
}
