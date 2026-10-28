import { Moon, Sun } from '@phosphor-icons/react'
import { useTheme } from '../../context/theme'

/**
 * Light <-> dark. The icon shows the theme you would switch *to*, which is what a reader expects
 * from a one-button switch, and the label says it in words for anyone who cannot see the icon.
 */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const resolved = useTheme((s) => s.resolved)
  const toggle = useTheme((s) => s.toggle)
  const next = resolved === 'dark' ? 'בהיר' : 'כהה'

  return (
    <button
      type="button"
      onClick={toggle}
      className={`pressable rounded-sm p-1.5 text-ink-2 transition-colors hover:bg-paper-3 hover:text-ink ${className}`}
      aria-label={`מעבר למצב ${next}`}
      title={`מעבר למצב ${next}`}
    >
      {resolved === 'dark' ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
    </button>
  )
}
