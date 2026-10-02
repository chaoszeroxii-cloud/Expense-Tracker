import AllocationManager from '../../components/allocations/AllocationManager'
import { useT } from '../../store/i18n.store'
import { Link } from 'react-router-dom'

export default function Wallets() {
  const t = useT()
  return (
    <div className="px-4 pt-6 pb-4 space-y-4 animate-fade-in">
      <h1 className="text-2xl font-extrabold text-base-theme tracking-tight">
        {t('wallets_title')}
      </h1>
      <div className="surface p-5 space-y-3">
        <p className="text-sm text-muted-theme leading-relaxed">{t('life_wallet_explain')}</p>
        <Link className="text-action" to="/budget">{t('life_back_plan')} →</Link>
      </div>
      <AllocationManager />
    </div>
  )
}
