export interface Person {
  name: string
  avatarUrl?: string | null
}

/** A profile photo when there is one, otherwise initials in an ink circle. The full name lives in the title. */
export function Avatar({ name, src, size = 24, muted = false }: { name: string; src?: string | null; size?: number; muted?: boolean }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        title={name}
        width={size}
        height={size}
        className="inline-block shrink-0 rounded-full border border-rule-strong object-cover"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <span
      title={name}
      aria-label={name}
      className={`inline-flex shrink-0 items-center justify-center rounded-full border font-semibold ${
        muted ? 'border-rule-strong bg-paper-2 text-pencil' : 'border-ink-2 bg-paper text-ink'
      }`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
      {initials}
    </span>
  )
}

export function AvatarStack({ people, max = 3, size = 24 }: { people: Person[]; max?: number; size?: number }) {
  const shown = people.slice(0, max)
  const rest = people.length - shown.length
  return (
    <span className="inline-flex items-center">
      {shown.map((p, i) => (
        <span key={p.name + i} className={i > 0 ? '-ms-1.5' : ''}>
          <Avatar name={p.name} src={p.avatarUrl} size={size} />
        </span>
      ))}
      {rest > 0 && <span className="ms-1 text-xs text-ink-2">+{rest}</span>}
    </span>
  )
}
