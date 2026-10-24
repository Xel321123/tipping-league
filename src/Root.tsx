import { BrowserRouter } from 'react-router-dom'
import { AdminProvider } from './hooks/useAdmin'
import { AppRoutes } from './App'

export function Root() {
  const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'

  return (
    <BrowserRouter basename={basename}>
      <AdminProvider>
        <AppRoutes />
      </AdminProvider>
    </BrowserRouter>
  )
}
