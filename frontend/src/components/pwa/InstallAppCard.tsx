import { useId, useState } from 'react'
import Icon from '@mdi/react'
import { mdiCellphoneArrowDown } from '@mdi/js'
import clsx from 'clsx'
import { useT } from '../../store/i18n.store'
import { requestAppInstallation, useInstallStore, type InstallPlatform } from '../../store/install.store'

export default function InstallAppCard({ className }: { className?: string }) {
  const t = useT()
  const { platform, standalone, browserAccepted, canPrompt, online, secure, status } = useInstallStore()
  const [showHelp, setShowHelp] = useState(false)
  const [helpPlatform, setHelpPlatform] = useState<InstallPlatform>(platform)
  const titleId = useId()
  const helpId = useId()
  const busy = status === 'prompting'

  if (standalone || browserAccepted) return null

  const install = async () => {
    if (!canPrompt || !online || !secure || platform === 'ios') {
      setShowHelp(true)
      return
    }
    const result = await requestAppInstallation()
    if (result === 'failed' || result === 'unavailable') setShowHelp(true)
  }
  const steps = helpPlatform === 'ios'
    ? [t('install_ios_1'), t('install_ios_2'), t('install_ios_3')]
    : helpPlatform === 'android'
      ? [t('install_android_1'), t('install_android_2'), t('install_android_3')]
      : [t('install_desktop_1'), t('install_desktop_2')]

  return (
    <section className={clsx('surface p-5 text-base-theme', className)} aria-labelledby={titleId} data-testid="install-app">
      <div className="flex items-start gap-3 mb-4">
        <img src="/app_icon.svg" alt="" width="44" height="44" className="shrink-0 rounded-xl" />
        <div>
          <h2 id={titleId} className="text-sm font-bold">{t('install_title')}</h2>
          <p className="text-xs leading-relaxed text-muted-theme mt-1">{t('install_hint')}</p>
        </div>
      </div>
      <button type="button" className="primary-action w-full" onClick={() => { void install() }} disabled={busy}>
        <Icon path={mdiCellphoneArrowDown} size={0.8} aria-hidden="true" />
        {t(busy ? 'install_prompting' : platform === 'ios' ? 'install_ios_button' : 'install_button')}
      </button>
      <p role="status" className="text-xs leading-relaxed text-muted-theme mt-3" hidden={secure && online && status !== 'accepted' && status !== 'dismissed' && status !== 'failed'}>
        {t(!secure ? 'install_https' : !online ? 'install_offline' : status === 'accepted' ? 'install_accepted' : status === 'dismissed' ? 'install_dismissed' : 'install_failed')}
      </p>
      <button type="button" className="text-action w-full mt-1" aria-expanded={showHelp} aria-controls={helpId} onClick={() => setShowHelp(value => !value)}>
        {t(showHelp ? 'install_hide_help' : 'install_help')}
      </button>
      {showHelp && (
        <div id={helpId} className="pt-4 mt-2 border-t border-theme">
          <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label={t('install_device')}>
            {(['android', 'ios', 'desktop'] as const).map(device => (
              <button key={device} type="button" aria-pressed={helpPlatform === device} onClick={() => setHelpPlatform(device)}
                className={clsx('rounded-xl px-3 py-2.5 text-xs font-semibold border border-theme', helpPlatform === device ? 'bg-brand-600 text-white' : 'bg-input text-sub')}>
                {device === 'ios' ? 'iPhone / iPad' : device === 'android' ? 'Android' : t('install_desktop')}
              </button>
            ))}
          </div>
          <ol className="list-decimal pl-5 space-y-2 text-sm leading-relaxed text-sub">
            {steps.map(step => <li key={step}>{step}</li>)}
          </ol>
          <p className="text-xs leading-relaxed text-muted-theme mt-3">{t(helpPlatform === 'ios' ? 'install_ios_tip' : 'install_browser_tip')}</p>
          <p className="text-xs leading-relaxed text-muted-theme mt-3">{t('install_launch_help')}</p>
        </div>
      )}
    </section>
  )
}
