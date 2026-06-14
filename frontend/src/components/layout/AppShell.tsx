import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'

const navItems = [
  { path: '/', label: '總覽', icon: '📊' },
  { path: '/profit-loss', label: '損益', icon: '📈' },
  { path: '/category', label: '分類', icon: '🏷️' },
  { path: '/funding', label: '來源', icon: '💰' },
  { path: '/batch', label: '投入', icon: '📦' },
  { path: '/rebalance', label: '轉換', icon: '🔄' },
  { path: '/manage', label: '管理', icon: '⚙️' },
]

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-56 border-r border-border bg-card md:block">
        <div className="flex h-14 items-center border-b border-border px-4">
          <h1 className="text-lg font-semibold tracking-tight">投資管理</h1>
        </div>
        <nav className="flex flex-col gap-1 p-2">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                pathname === item.path
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <main className="pb-20 md:pb-0 md:pl-56">
        <div className="mx-auto max-w-5xl px-4 py-6">
          {children}
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card md:hidden">
        <div className="flex items-center justify-around">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors ${
                pathname === item.path
                  ? 'text-primary font-medium'
                  : 'text-muted-foreground'
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  )
}
