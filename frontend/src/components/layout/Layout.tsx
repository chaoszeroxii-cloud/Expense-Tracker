import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import Icon from '@mdi/react'
import {
  mdiViewDashboard, mdiHistory, mdiWallet,
  mdiCog, mdiPlus,
} from '@mdi/js'
import clsx from 'clsx'
import { useT } from '../../store/i18n.store'

const NAV = [
  { to: '/',         icon: mdiViewDashboard, key: 'nav_dashboard' as const },
  { to: '/history',  icon: mdiHistory,       key: 'nav_history'  as const },
  { to: '/wallets',  icon: mdiWallet,        key: 'nav_wallets'  as const },
  { to: '/settings', icon: mdiCog,           key: 'nav_settings' as const },
]

export default function Layout() {
  const navigate = useNavigate()
  const t = useT()

  return (
    <div className="flex flex-col h-dvh max-w-md mx-auto bg-app relative">
      <main className="flex-1 scroll-area pb-24 pt-safe">
        <Outlet />
      </main>

      {/* ── Bottom navigation — 4 items + centre FAB ── */}
      <nav
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-50 pb-safe"
        style={{ background: 'var(--nav-bg)', backdropFilter: 'blur(12px)',
                 borderTop: '1px solid var(--border)' }}
      >
        <div className="flex items-center h-16 px-1">
          {/* Left two items */}
          {NAV.slice(0, 2).map(item => (
            <NavItem key={item.to} to={item.to} icon={item.icon} label={t(item.key)} />
          ))}

          {/* Centre FAB */}
          <div className="flex-1 flex justify-center">
            <button
              onClick={() => navigate('/add')}
              aria-label={t('add_transaction')}
              className="w-14 h-14 -mt-5 rounded-full bg-brand-600 shadow-xl shadow-brand-500/40
                         flex items-center justify-center ring-4 ring-[var(--bg-app)]
                         active:scale-95 transition-transform duration-150"
            >
              <Icon path={mdiPlus} size={1.2} color="white" />
            </button>
          </div>

          {/* Right two items */}
          {NAV.slice(2).map(item => (
            <NavItem key={item.to} to={item.to} icon={item.icon} label={t(item.key)} />
          ))}
        </div>
      </nav>
    </div>
  )
}

function NavItem({ to, icon, label }: { to: string; icon: string; label: string }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        clsx('flex-1 flex flex-col items-center gap-0.5 py-1 rounded-xl transition-colors',
          isActive ? 'text-brand-600' : 'text-muted-theme')
      }
    >
      {({ isActive }) => (
        <>
          <div className={clsx('p-1.5 rounded-xl transition-colors', isActive && 'bg-brand-50 dark:bg-brand-900/30')}>
            <Icon
              path={icon}
              size={0.85}
              color={isActive ? '#4f46e5' : 'currentColor'}
            />
          </div>
          <span className={clsx('text-[10px] font-semibold tracking-wide',
            isActive ? 'text-brand-600' : 'text-muted-theme')}>
            {label}
          </span>
        </>
      )}
    </NavLink>
  )
}
