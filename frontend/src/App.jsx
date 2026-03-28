import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import AuthPage from './pages/AuthPage'
import DashboardPage from './pages/DashboardPage'

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="page-loading"><span>Loading…</span></div>
  return user ? children : <Navigate to="/auth" replace />
}

export default function App() {
  return (
    <>
      <style>{`
        .page-loading {
          display: flex; align-items: center; justify-content: center;
          height: 100vh; font-family: var(--font-display);
          font-size: 1.25rem; color: var(--muted);
          letter-spacing: 0.05em;
        }
      `}</style>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
