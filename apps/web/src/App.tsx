import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useEffect } from 'react'

function LegacyPageRedirect({ to }: { to: string }) {
  useEffect(() => {
    window.location.replace(to)
  }, [to])

  return null
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LegacyPageRedirect to="/login.html" />} />
        <Route path="*" element={<LegacyPageRedirect to="/winkd_website.html" />} />
      </Routes>
    </BrowserRouter>
  )
}
