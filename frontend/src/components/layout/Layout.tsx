import { Suspense, lazy, useEffect, useRef } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import Icon from '@mdi/react'
import {
  mdiHomeOutline,
  mdiHistory,
  mdiChartBar,
  mdiViewGridOutline,
  mdiPlus,
  mdiCogOutline,
  mdiChartTimelineVariant,
  mdiLeaf,
  mdiChevronRight,
} from '@mdi/js'
import clsx from 'clsx'
import { useT, TKey } from '../../store/i18n.store'
import { useAuthStore } from '../../store/auth.store'
import { usePanels } from '../../store/panels.store'
import { useThemeStore } from '../../store/theme.store'

const ChatPanel = lazy(() => import('../chat/ChatPanel'))
const WorkTimeCalculator = lazy(() => import('../calculator/WorkTimeCalculator'))

const NAV: { to: string; icon: string; labelKey: TKey }[] = [
  { to: '/', icon: mdiHomeOutline, labelKey: 'nav_home' },
  { to: '/history', icon: mdiHistory, labelKey: 'nav_transactions' },
  { to: '/budget', icon: mdiChartBar, labelKey: 'nav_plan' },
  { to: '/more', icon: mdiViewGridOutline, labelKey: 'nav_more' },
]

export default function Layout() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  const t = useT()
  const user = useAuthStore((s) => s.user)
  useThemeStore((s) => s.theme)
  const { chatOpen, calcOpen, closeChat, closeCalc } = usePanels()
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [pathname])

  return (
    <div className="flex h-dvh bg-app">
      <a href="#main-content" className="skip-link">
        {t('ux_skip')}
      </a>
      <aside className="hidden lg:flex flex-col w-64 shrink-0 border-r border-theme bg-card px-5 py-8 overflow-y-auto">
        <NavLink to="/" className="flex items-center gap-2.5 px-2" aria-label="MoneyFlow">
          <span className="flex items-center justify-center w-10 h-10 rounded-2xl bg-brand-600 text-white">
            <Icon path={mdiLeaf} size={1} />
          </span>
          <span className="text-xl font-extrabold tracking-tight text-base-theme">
            MoneyFlow<span className="text-brand-500">.</span>
          </span>
        </NavLink>
        <p className="text-xs text-muted-theme px-2 mt-3">{t('ux_tagline')}</p>
        <button onClick={() => navigate('/add')} className="primary-action mt-8 w-full shrink-0">
          <Icon path={mdiPlus} size={0.8} />
          {t('add_transaction')}
        </button>
        <nav aria-label={t('ux_daily')} className="mt-8 space-y-1">
          <p className="section-kicker px-4 mb-3">{t('ux_daily')}</p>
          {NAV.slice(0, 3).map((item) => (
            <SideNavItem key={item.to} {...item} label={t(item.labelKey)} />
          ))}
        </nav>
        <nav aria-label={t('ux_explore')} className="mt-8 space-y-1">
          <p className="section-kicker px-4 mb-3">{t('ux_explore')}</p>
          <SideNavItem to="/reports" icon={mdiChartTimelineVariant} label={t('reports_title')} />
          <SideNavItem to="/more" icon={mdiViewGridOutline} label={t('nav_more')} />
          <SideNavItem to="/settings" icon={mdiCogOutline} label={t('nav_settings')} />
        </nav>
        <div className="mt-auto pt-8">
          <div className="rounded-2xl bg-[var(--accent-soft)] px-4 py-5">
            <Icon path={mdiLeaf} size={0.9} className="text-brand-600 mb-2" />
            <p className="text-sm font-bold text-base-theme leading-relaxed">{t('ux_today_sub')}</p>
            <p className="text-xs text-muted-theme mt-2 leading-relaxed">{t('ux_habit_sub')}</p>
          </div>
          <button
            onClick={() => navigate('/settings')}
            className="flex items-center gap-3 w-full text-left mt-5 px-2 py-2"
          >
            <span className="rounded-full bg-[var(--input)] w-10 h-10 flex items-center justify-center font-bold text-base-theme shrink-0">
              {user?.name?.slice(0, 1).toUpperCase() || 'M'}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold truncate">{user?.name}</span>
              <span className="block text-xs text-muted-theme mt-0.5">{t('nav_settings')}</span>
            </span>
            <Icon path={mdiChevronRight} size={0.7} className="text-muted-theme" />
          </button>
        </div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0 relative">
        <main
          id="main-content"
          tabIndex={-1}
          ref={mainRef}
          className="flex-1 overflow-y-auto pb-nav-sheet lg:pb-8"
        >
          <div
            className={clsx(
              'mx-auto w-full lg:px-8 lg:pt-6',
              pathname === '/' ? 'max-w-[1240px]' : 'max-w-[960px]',
            )}
          >
            <Outlet />
          </div>
        </main>
        <nav
          aria-label={t('ux_daily')}
          className="lg:hidden fixed bottom-0 left-0 right-0 z-50 pb-safe border-t border-theme"
          style={{ background: 'var(--nav-bg)', backdropFilter: 'blur(16px)' }}
        >
          <div className="flex items-center h-[var(--bottom-nav-height)] px-2 max-w-2xl mx-auto">
            {NAV.slice(0, 2).map((item) => (
              <BottomNavItem key={item.to} {...item} label={t(item.labelKey)} />
            ))}
            <div className="flex-1 flex justify-center">
              <button
                onClick={() => navigate('/add')}
                className="flex flex-col items-center gap-1 text-brand-600 font-bold text-[11px]"
                aria-label={t('add_transaction')}
              >
                <span className="w-12 h-10 rounded-2xl bg-brand-600 flex items-center justify-center text-white">
                  <Icon path={mdiPlus} size={1} />
                </span>
                {t('ux_add_short')}
              </button>
            </div>
            {NAV.slice(2).map((item) => (
              <BottomNavItem key={item.to} {...item} label={t(item.labelKey)} />
            ))}
          </div>
        </nav>
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
    <NavLink to={to} end={to === '/'} className={({ isActive }) => clsx('nav-item', isActive && 'active')}>
      <Icon path={icon} size={0.9} />
      {label}
    </NavLink>
  )
}

function BottomNavItem({ to, icon, label }: { to: string; icon: string; label: string }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        clsx(
          'flex-1 flex flex-col items-center gap-1 py-2 rounded-2xl',
          isActive ? 'text-brand-600' : 'text-muted-theme',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span className={clsx('px-3 py-1 rounded-xl', isActive && 'bg-[var(--accent-soft)]')}>
            <Icon path={icon} size={0.9} />
          </span>
          <span className="text-[11px] font-bold">{label}</span>
        </>
      )}
    </NavLink>
  )
}
