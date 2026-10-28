import type { MouseEvent } from 'react'

const INTERACTIVE =
  'button, a, input, select, textarea, label, [role="button"], [role="menuitem"], [role="option"], [role="checkbox"], [contenteditable="true"]'

/**
 * Whether a click on an item's row (or kanban line) should open the item: anywhere on the row
 * that is not one of its own controls. The title stays the keyboard path; this is the pointer's.
 *
 * React bubbles events out of portals, so a click inside a cell's popover reaches the row too -
 * those are not in the row's DOM and are ignored. So is the end of a text selection.
 */
export function opensFromRow(e: MouseEvent<HTMLElement>) {
  const row = e.currentTarget
  const target = e.target as Element
  if (!row.contains(target)) return false
  const control = target.closest(INTERACTIVE)
  if (control && row.contains(control)) return false
  if (window.getSelection()?.toString()) return false
  return true
}
