import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

interface PopoverProps {
  anchorRef: RefObject<HTMLElement | null>
  open: boolean
  onClose: () => void
  children: ReactNode
  /** Width in px; defaults to the content width with a minimum. */
  width?: number
  label: string
}

/**
 * A portal-positioned popover anchored below its trigger, aligned to the trigger's
 * start edge (right edge in RTL), clamped to the viewport. Escapes any overflow container.
 */
export function Popover({ anchorRef, open, onClose, children, width, label }: PopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; right: number; origin: string } | null>(null)

  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const anchor = anchorRef.current
      const panel = panelRef.current
      if (!anchor || !panel) return
      const rect = anchor.getBoundingClientRect()
      const panelWidth = panel.offsetWidth
      const panelHeight = panel.offsetHeight
      const gap = 6
      let right = window.innerWidth - rect.right
      right = Math.max(8, Math.min(right, window.innerWidth - panelWidth - 8))
      let top = rect.bottom + gap
      let origin = 'top right'
      if (top + panelHeight > window.innerHeight - 8) {
        top = Math.max(8, rect.top - gap - panelHeight)
        origin = 'bottom right'
      }
      setPosition({ top, right, origin })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, anchorRef])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        anchorRef.current?.focus()
      }
    }
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return
      onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open, onClose, anchorRef])

  useEffect(() => {
    if (!open) return
    const first = panelRef.current?.querySelector<HTMLElement>('button, input, [tabindex]:not([tabindex="-1"])')
    first?.focus()
  }, [open])

  if (!open) return null

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={label}
      className="popover-enter fixed z-50 rounded-md border border-rule-strong bg-paper p-1 text-sm shadow-(--shadow-popover)"
      style={{
        top: position?.top ?? -9999,
        right: position?.right ?? -9999,
        width,
        minWidth: width ? undefined : 160,
        visibility: position ? 'visible' : 'hidden',
        ['--origin' as string]: position?.origin ?? 'top right',
      }}
    >
      {children}
    </div>,
    document.body,
  )
}
