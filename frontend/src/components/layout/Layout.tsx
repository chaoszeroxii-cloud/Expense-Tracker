import { Suspense, lazy } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import Icon from '@mdi/react'
import {
  mdiViewDashboard, mdiHistory, mdiChartBar,
  mdiDotsHorizontal, mdiPlus, mdiCog,
} from '@mdi/js'
import clsx from 'clsx'
import { useT, TKey } from '../../store/i18n.store'
import { usePanels } from '../../store/panels.store'
// Both are overlays that render only once the user opens them, but importing them
// statically put them — and react-markdown + remark-gfm with them — in the entry chunk
// for every visitor, including anyone who never taps the assistant.
const ChatPanel = lazy(() => import('../chat/ChatPanel'))
const WorkTimeCalculator = lazy(() => import('../calculator/WorkTimeCalculator'))

/**
 * One question per destination: Home = today, History = what happened,
 * Plan = this month, More = everything else.
 *
 * Wallets left the primary bar (it is an advanced, envelope-mode concept and was also
 * duplicated inside Finance), and Settings is no longer listed twice on desktop.
 */
const NAV: { to: string; icon: string; labelKey: TKey }[] = [
  { to: '/',        icon: mdiViewDashboard,  labelKey: 'nav_home' },
  { to: '/history', icon: mdiHistory,        labelKey: 'nav_transactions' },
  { to: '/budget',  icon: mdiChartBar,       labelKey: 'nav_plan' },
  { to: '/more',    icon: mdiDotsHorizontal, labelKey: 'nav_more' },
]

export default function Layout() {
  const navigate = useNavigate()
  const t = useT()
  const { chatOpen, calcOpen, closeChat, closeCalc } = usePanels()

  return (
    <div className="flex h-dvh bg-app">
      {/* ── Sidebar — desktop only ── */}
      <aside className="hidden lg:flex flex-col w-60 shrink-0 border-r border-[var(--border)] bg-card">
        <div className="px-6 py-5 border-b border-[var(--border)]">
          <div className="flex items-center gap-2.5">
            <img src="/icon.svg" alt="" className="w-7 h-auto" />
            <span className="text-xl font-extrabold text-brand-600">MoneyFlow</span>
          </div>
        </div>
        <div className="px-3 pt-4 pb-2">
          <button
            onClick={() => navigate('/add')}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-brand-600 text-white font-semibold text-sm
                       hover:bg-brand-700 active:scale-95 transition-all"
          >
            <Icon path={mdiPlus} size={0.85} color="white" />
            {t('add_transaction')}
          </button>
        </div>
        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
          {NAV.map(item => (
            <SideNavItem key={item.to} to={item.to} icon={item.icon} label={t(item.labelKey)} />
          ))}
        </nav>
        <div className="px-3 py-4 border-t border-[var(--border)]">
          <SideNavItem to="/settings" icon={mdiCog} label={t('nav_settings')} />
        </div>
      </aside>

      {/* ── Content area ── */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        <main className="flex-1 overflow-y-auto pb-24 lg:pb-0">
          <div className="max-w-2xl mx-auto w-full">
            <Outlet />
          </div>
        </main>

        {/* ── Bottom navigation — mobile only ── */}
        <nav
          className="lg:hidden fixed bottom-0 left-0 right-0 z-50 pb-safe"
          style={{ background: 'var(--nav-bg)', backdropFilter: 'blur(12px)',
                   borderTop: '1px solid var(--border)' }}
        >
          <div className="flex items-center h-16 px-1 max-w-2xl mx-auto">
            {NAV.slice(0, 2).map(item => (
              <BottomNavItem key={item.to} to={item.to} icon={item.icon} label={t(item.labelKey)} />
            ))}
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
            {NAV.slice(2).map(item => (
              <BottomNavItem key={item.to} to={item.to} icon={item.icon} label={t(item.labelKey)} />
            ))}
          </div>
        </nav>

        {/* Overlays are opened from More (and, later, from Home's capture bar) rather than
            from floating buttons that competed with Add for attention. */}
        {/* No fallback: these are overlays, and a spinner flashing over the page is
            worse than the panel simply appearing a moment later. */}
        <Suspense fallback={null}>
          {chatOpen && <ChatPanel onClose={closeChat} />}
          {calcOpen && <WorkTimeCalculator onClose={closeCalc} />}
        </Suspense>
      </div>
    </div>
  )
}

function SideNavItem({ to, icon, label }: { to: string; icon: string; label: string }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        clsx('flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-sm font-semibold',
          isActive
            ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600'
            : 'text-muted-theme hover:bg-[var(--input)] hover:text-base-theme')
      }
    >
      {({ isActive }) => (
        <>
          <Icon path={icon} size={0.85} color={isActive ? '#4f46e5' : 'currentColor'} />
          {label}
        </>
      )}
    </NavLink>
  )
}

function BottomNavItem({ to, icon, label }: { to: string; icon: string; label: string }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        clsx('flex-1 flex flex-col items-center gap-0.5 py-1 rounded-xl transition-colors',
          isActive ? 'text-brand-600' : 'text-muted-theme')
      }
    >
      {({ isActive }) => (
        <>
          <div className={clsx('p-1.5 rounded-xl transition-colors', isActive && 'bg-brand-50 dark:bg-brand-900/30')}>
            <Icon path={icon} size={0.85} color={isActive ? '#4f46e5' : 'currentColor'} />
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
