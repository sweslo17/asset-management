import { Link } from 'react-router-dom'
import { TriangleAlert } from 'lucide-react'
import { usePortfolioData } from '@/hooks/usePortfolioData'
import { getDataFreshness } from '@/utils/dateUtils'

/** 價格/匯率超過 STALE_AFTER_DAYS 沒更新時顯示警示（自動更新中斷時才會出現）。 */
export function StaleDataBanner() {
  const { data } = usePortfolioData()
  if (!data || data.investments.length === 0) return null

  const { pricesAsOf, ratesAsOf, lagDays, stale } = getDataFreshness(
    data.investments, data.prices, data.exchange_rates,
  )
  if (!stale) return null

  return (
    <div
      role="alert"
      className="mb-4 flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      <p>
        市場資料已 {lagDays ?? '?'} 天未更新（價格 {pricesAsOf ?? '無'}、匯率 {ratesAsOf ?? '無'}），
        自動更新可能中斷。可到
        <Link to="/manage" className="mx-1 font-medium underline underline-offset-2">管理</Link>
        手動回補。
      </p>
    </div>
  )
}
