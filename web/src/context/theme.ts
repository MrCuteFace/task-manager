import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

interface ThemeState {
  /** What the user chose. 'system' follows the OS. */
  preference: ThemePreference
  /** What is actually on screen once 'system' is resolved. */
  resolved: ResolvedTheme
  setPreference: (preference: ThemePreference) => void
  /** Light <-> dark, leaving 'system' behind once the user has expressed a choice. */
  toggle: () => void
}

const media = () => window.matchMedia('(prefers-color-scheme: dark)')

function resolve(preference: ThemePreference): ResolvedTheme {
  if (preference !== 'system') return preference
  return media().matches ? 'dark' : 'light'
}

/**
 * Every color in the UI is a `--color-*` token, and the dark palette redefines those tokens rather
 * than adding a second set of classes. So switching themes is one attribute on <html>, and no
 * component needs to know a theme exists.
 */
function apply(resolved: ResolvedTheme) {
  document.documentElement.dataset.theme = resolved
  // Native controls (scrollbars, form fields, the browser's own chrome) follow this.
  document.documentElement.style.colorScheme = resolved
}

export const useTheme = create<ThemeState>()(
  persist(
    (set, get) => ({
      preference: 'system',
      resolved: 'light',
      setPreference: (preference) => {
        const resolved = resolve(preference)
        apply(resolved)
        set({ preference, resolved })
      },
      toggle: () => get().setPreference(get().resolved === 'dark' ? 'light' : 'dark'),
    }),
    {
      name: 'tm-demo-theme',
      storage: createJSONStorage(() => localStorage),
      // Only the choice is persisted; what it resolves to is recomputed for the current machine.
      partialize: (state) => ({ preference: state.preference }),
      onRehydrateStorage: () => (state) => {
        state?.setPreference(state.preference)
      },
    },
  ),
)

/**
 * Keeps a 'system' preference honest when the OS flips theme mid-session. Called once, from main.
 * Returns the unsubscribe so a future caller can tear it down; the app never does.
 */
export function watchSystemTheme(): () => void {
  const mq = media()
  const onChange = () => {
    const { preference, setPreference } = useTheme.getState()
    if (preference === 'system') setPreference('system')
  }
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}
