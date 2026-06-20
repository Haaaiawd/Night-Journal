import { useLocation, useNavigate } from 'react-router'
import { motion } from 'framer-motion'
import { PenLine, BookOpen, Calendar, User } from 'lucide-react'

const navItems = [
  { path: '/', label: '记录', Icon: PenLine },
  { path: '/diary', label: '日记', Icon: BookOpen },
  { path: '/calendar', label: '日历', Icon: Calendar },
  { path: '/settings', label: '我的', Icon: User },
]

export default function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-nav h-16 pb-[env(safe-area-inset-bottom)]"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderTop: '1px solid var(--divider)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
    >
      <div className="mx-auto flex h-full max-w-[480px] items-center justify-around">
        {navItems.map(({ path, label, Icon }) => {
          const isActive =
            path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(path)
          return (
            <motion.button
              key={path}
              onClick={() => navigate(path)}
              className="flex flex-col items-center justify-center gap-0.5 px-4 py-1"
              whileTap={{ scale: 0.92 }}
              transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            >
              <div className="relative">
                <Icon
                  size={24}
                  strokeWidth={2}
                  style={{
                    color: isActive ? 'var(--accent)' : 'var(--text-tertiary)',
                    transition: 'color 200ms ease',
                  }}
                />
                {isActive && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute -top-0.5 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full"
                    style={{ backgroundColor: 'var(--accent)' }}
                    transition={{ type: 'spring', damping: 25, stiffness: 250 }}
                  />
                )}
              </div>
              <span
                className="text-[11px] font-medium tracking-wider"
                style={{
                  color: isActive ? 'var(--accent)' : 'var(--text-tertiary)',
                  transition: 'color 200ms ease',
                }}
              >
                {label}
              </span>
            </motion.button>
          )
        })}
      </div>
    </nav>
  )
}
