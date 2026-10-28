import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from './features/auth/RequireAuth'
import { AppShell } from './components/AppShell'
import { LoginPage } from './pages/LoginPage'
import { OverviewPage } from './pages/OverviewPage'
import { BoardPage } from './pages/BoardPage'
import { DashboardPage } from './pages/DashboardPage'
import { OrgChartPage } from './pages/OrgChartPage'
import { ProfilePage } from './pages/ProfilePage'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<OverviewPage />} />
          <Route path="/boards/:boardId" element={<BoardPage />} />
          <Route path="/dashboards/:dashboardId" element={<DashboardPage />} />
          <Route path="/org-chart" element={<OrgChartPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
