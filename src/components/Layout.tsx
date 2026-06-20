import { Outlet } from 'react-router'
import ThemeProvider from './ThemeProvider'
import BottomNav from './BottomNav'

export default function Layout() {
  return (
    <ThemeProvider>
      <div
        className="relative mx-auto min-h-[100dvh] max-w-[480px]"
        style={{ backgroundColor: 'var(--bg-primary)' }}
      >
        {/* Main content area with bottom padding for nav + FAB */}
        <main className="min-h-[100dvh] pb-28">
          <Outlet />
        </main>
        <BottomNav />
      </div>
    </ThemeProvider>
  )
}
