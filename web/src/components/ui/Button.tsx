import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'outline' | 'ghost'
type Size = 'sm' | 'md'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: ReactNode
  children?: ReactNode
}

const variantClass: Record<Variant, string> = {
  primary:
    'bg-accent text-white border border-accent hover:bg-accent-strong hover:border-accent-strong disabled:bg-pencil disabled:border-pencil',
  outline: 'bg-paper text-ink border border-rule-strong hover:bg-paper-2 disabled:text-pencil',
  ghost: 'bg-transparent text-ink-2 border border-transparent hover:bg-paper-2 hover:text-ink disabled:text-pencil',
}

const sizeClass: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-[0.8125rem] gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
}

export function Button({ variant = 'outline', size = 'md', icon, children, className = '', type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={`pressable inline-flex items-center justify-center rounded-sm font-semibold whitespace-nowrap ${variantClass[variant]} ${sizeClass[size]} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
}
