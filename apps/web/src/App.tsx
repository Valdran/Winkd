import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { LoginPage } from './pages/LoginPage'
import { BuddyListPage } from './pages/BuddyListPage'
import { useAuthStore } from './stores/authStore'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const session = useAuthStore((s) => s.session)
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <BuddyListPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
