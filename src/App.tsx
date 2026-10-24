import { Suspense, lazy } from 'react'
import { Route, Routes, Link } from 'react-router-dom'
import { Layout } from './components/Layout'
import { EmptyState, Spinner } from './components/ui'
import { config } from './lib/env'
import { HistoryPage } from './pages/HistoryPage'
import { LiveBoardPage } from './pages/LiveBoardPage'
import { PlayersPage } from './pages/PlayersPage'
import { RoundDetailPage } from './pages/RoundDetailPage'
import { SetupScreen } from './pages/SetupScreen'
import { TablePage } from './pages/TablePage'

// The admin console is only used by one person, so it never blocks the public board.
const AdminPage = lazy(() =>
  import('./pages/AdminPage').then((module) => ({ default: module.AdminPage })),
)

function AdminFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-muted">
      <Spinner className="size-6" />
    </div>
  )
}

export function AppRoutes() {
  if (!config.isConfigured) {
    return <SetupScreen />
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<LiveBoardPage />} />
        <Route path="table" element={<TablePage />} />
        <Route path="players" element={<PlayersPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="history/:roundId" element={<RoundDetailPage />} />
        <Route path="round/:roundId" element={<RoundDetailPage />} />
        <Route
          path="admin"
          element={
            <Suspense fallback={<AdminFallback />}>
              <AdminPage />
            </Suspense>
          }
        />
        <Route
          path="*"
          element={
            <EmptyState
              title="Page not found"
              description="That link does not point at a round, table or player."
              action={
                <Link to="/" className="btn btn-primary btn-sm">
                  Back to the live board
                </Link>
              }
            />
          }
        />
      </Route>
    </Routes>
  )
}
