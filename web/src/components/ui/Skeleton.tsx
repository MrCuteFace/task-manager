/** Ruled-line skeletons shaped like the lists they stand in for. */
export function RuledSkeleton({ rows = 6, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="ruled" aria-busy="true" aria-label="טוען">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex h-10 items-center gap-4 px-3">
          <div className="skeleton h-3.5 flex-1" style={{ maxWidth: `${52 - r * 4}%` }} />
          {Array.from({ length: columns - 1 }, (_, c) => (
            <div key={c} className="skeleton h-3.5 w-20 shrink-0" />
          ))}
        </div>
      ))}
    </div>
  )
}

export function BlockSkeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-busy="true" />
}
