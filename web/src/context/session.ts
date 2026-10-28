import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { User } from '../api/types'

interface SessionState {
  token: string | null
  user: User | null
  login: (token: string, user: User) => void
  logout: () => void
}

/**
 * The only global state in the app (tech doc §3.2): the demo session.
 * Persisted to sessionStorage so a page refresh keeps the user logged in
 * for the browser tab, and a new tab starts at the login screen.
 */
export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      login: (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
    }),
    {
      name: 'tm-demo-session',
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
)
