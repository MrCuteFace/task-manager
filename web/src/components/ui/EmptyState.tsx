import type { ReactNode } from 'react'

interface EmptyStateProps {
  title: string
  description?: string
  action?: ReactNode
  tone?: 'neutral' | 'error'
}

/** An empty or error state that says what is here and how to fill it. */
export function EmptyState({ title, description, action, tone = 'neutral' }: EmptyStateProps) {
  return (
    <div
      role={tone === 'error' ? 'alert' : undefined}
      className="flex flex-col items-start gap-2 border border-dashed border-rule-strong px-5 py-6 text-start"
    >
      <p className={`text-base font-semibold ${tone === 'error' ? 'text-stuck' : 'text-ink'}`}>{title}</p>
      {description && <p className="max-w-[60ch] text-sm text-ink-2">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
