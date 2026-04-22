import AllocationManager from '../../components/allocations/AllocationManager'
import { useT } from '../../store/i18n.store'

export default function Wallets() {
  const t = useT()
  return (
    <div className="px-4 pt-6 pb-4 space-y-4 animate-fade-in">
      <h1 className="text-2xl font-extrabold text-base-theme tracking-tight">
        {t('wallets_title')}
      </h1>
      <AllocationManager />
    </div>
  )
}
