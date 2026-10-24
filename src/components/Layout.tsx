import { NavLink, Outlet } from 'react-router-dom'
import { Logo } from './Logo'
import { cn } from './ui'

const NAV = [
  { to: '/', label: 'Live', end: true },
  { to: '/table', label: 'Table' },
  { to: '/players', label: 'Players' },
  { to: '/history', label: 'History' },
  { to: '/admin', label: 'Admin' },
]

export function Layout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-line-soft bg-ink/85 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-3">
          <Logo />
          <nav className="ml-auto hidden items-center gap-1 sm:flex">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => cn('nav-pill', isActive && 'nav-pill-active')}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto text-[11px] text-muted-2 sm:hidden">Tipping League</div>
        </div>

        <nav className="mx-auto flex w-full max-w-6xl gap-1 overflow-x-auto px-3 pb-2 sm:hidden">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => cn('nav-pill', isActive && 'nav-pill-active')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-8">
        <Outlet />
      </main>

      <footer className="border-t border-line-soft">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-5 text-[11px] text-muted-2">
          <span>Eight players. Four teams. One coupon a weekend.</span>
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>Results via Svenska Spel</span>
            <span aria-hidden="true">·</span>
            <span>
              Data in Supabase schema <code className="text-muted">tipping</code>
            </span>
          </span>
        </div>
      </footer>
    </div>
  )
}
