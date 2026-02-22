import { useState } from 'react'
import { usePortfolioData } from '@/hooks/usePortfolioData'
import { calculateInvestmentValues, calculateCategorySummary } from '@/utils/calculations'
import { formatTWD, formatPercent } from '@/utils/currency'
import { getLatestDate } from '@/utils/dateUtils'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { CurrencyDisplay } from '@/components/common/CurrencyDisplay'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export function CategoryPage() {
  const { data, isLoading, error } = usePortfolioData()
  const [expandedTags, setExpandedTags] = useState<Set<string>>(new Set())

  if (isLoading) return <LoadingSpinner />
  if (error || !data) return <div className="text-destructive p-8">載入失敗</div>

  const targetDate = getLatestDate(data.prices)
  const investmentsWithValue = calculateInvestmentValues(data.investments, data.prices, data.exchange_rates, targetDate)
  const categories = calculateCategorySummary(investmentsWithValue)

  const totalValue = investmentsWithValue.reduce((s, i) => s + i.marketValueTWD, 0)

  const toggleExpand = (tag: string) => {
    setExpandedTags((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">分類分析</h1>
        <p className="text-sm text-muted-foreground">依標籤分組顯示價值和獲利</p>
      </div>

      <div className="space-y-3">
        {categories.map((cat) => (
          <Card key={cat.tag} className="cursor-pointer" onClick={() => toggleExpand(cat.tag)}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">{cat.tag}</CardTitle>
                  <Badge variant="secondary" className="text-xs">{cat.investments.length} 檔</Badge>
                </div>
                <span className="text-xs text-muted-foreground">
                  {totalValue > 0 ? formatPercent(cat.totalValue / totalValue) : '0%'} 佔比
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">市值</p>
                  <p className="font-medium tabular-nums">{formatTWD(cat.totalValue)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">成本</p>
                  <p className="font-medium tabular-nums">{formatTWD(cat.totalCost)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">損益</p>
                  <CurrencyDisplay value={cat.totalProfit} showSign className="font-medium" />
                  <span className={`ml-1 text-xs ${cat.totalProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {formatPercent(cat.profitPercent)}
                  </span>
                </div>
              </div>

              {/* Expanded: show individual investments */}
              {expandedTags.has(cat.tag) && (
                <div className="mt-4 space-y-2 border-t border-border pt-3">
                  {cat.investments.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between text-sm">
                      <div>
                        <span className="font-medium">{inv.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{inv.ticker}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="tabular-nums">{formatTWD(inv.marketValueTWD)}</span>
                        <CurrencyDisplay value={inv.profitTWD} showSign className="text-xs" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
