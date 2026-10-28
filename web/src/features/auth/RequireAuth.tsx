import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useSession } from '../../context/session'

/** Redirects to the login screen when there is no session token. */
export function RequireAuth() {
  const token = useSession((s) => s.token)
  const location = useLocation()
  if (!token) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}
