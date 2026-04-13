import { useEffect } from 'react'

function resolveLegacyTarget(pathname: string) {
  const baseUrl = import.meta.env.BASE_URL || '/'
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`

  const isLoginPath = pathname === '/login' || pathname === '/login/'
  const relativeTarget = isLoginPath ? 'login.html' : 'winkd_website.html'

  return new URL(relativeTarget, window.location.origin + normalizedBase).toString()
}

export function App() {
  useEffect(() => {
    const target = resolveLegacyTarget(window.location.pathname)
    if (window.location.href !== target) {
      window.location.replace(target)
    }
  }, [])

  return null
}
