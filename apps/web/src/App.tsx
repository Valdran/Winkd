import { useAuthStore } from './stores/authStore'
import { BuddyListPage } from './pages/BuddyListPage'
import { LoginPage } from './pages/LoginPage'

export function App() {
  const session = useAuthStore((s) => s.session)

  if (!session) {
    return <LoginPage />
  }

  return <BuddyListPage />
}
