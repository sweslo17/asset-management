import { useState } from 'react'
import { usePortfolioData } from '@/hooks/usePortfolioData'
import { calculateSourceAllocations } from '@/utils/calculations'
import { formatTWD, formatPercent } from '@/utils/currency'
import { getLatestDate } from '@/utils/dateUtils'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { CurrencyDisplay } from '@/components/common/CurrencyDisplay'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export function FundingPage() {
  const { data, isLoading, error } = usePortfolioData()
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set())

  if (isLoading) return <LoadingSpinner />
  if (error || !data) return <div className="text-destructive p-8">載入失敗</div>

  const targetDate = getLatestDate(data.prices)
  const allocations = calculateSourceAllocations(
    data.batches, data.funding_sources, data.investments,
    data.prices, data.exchange_rates, targetDate,
  )

  const totalInvested = allocations.reduce((s, a) => s + a.investedAmount, 0)
  const totalCurrentValue = allocations.reduce((s, a) => s + a.currentValue, 0)
  const totalProfit = totalCurrentValue - totalInvested
  const totalProfitPercent = totalInvested !== 0 ? totalProfit / totalInvested : 0

  const toggleExpand = (sourceName: string) => {
    setExpandedSources((prev) => {
      const next = new Set(prev)
      if (next.has(sourceName)) next.delete(sourceName)
      else next.add(sourceName)
      return next
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">資金來源</h1>
        <p className="text-sm text-muted-foreground">依比例分配計算各來源的投資價值</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">總投入</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold tabular-nums">{formatTWD(totalInvested)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">總市值</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold tabular-nums">{formatTWD(totalCurrentValue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">總損益</CardTitle>
          </CardHeader>
          <CardContent>
            <CurrencyDisplay value={totalProfit} showSign className="text-xl font-bold" />
            <span className={`ml-2 text-sm ${totalProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {formatPercent(totalProfitPercent)}
            </span>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>各來源明細</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>來源</TableHead>
                <TableHead className="text-right">投入金額</TableHead>
                <TableHead className="text-right">持股成本</TableHead>
                <TableHead className="text-right">市值</TableHead>
                <TableHead className="text-right">損益</TableHead>
                <TableHead className="text-right">報酬率</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allocations.map((alloc) => (
                <>
                  <TableRow
                    key={alloc.sourceName}
                    className="cursor-pointer"
                    onClick={() => toggleExpand(alloc.sourceName)}
                  >
                    <TableCell className="font-medium">
                      <span className="mr-1 text-muted-foreground">
                        {expandedSources.has(alloc.sourceName) ? '▼' : '▶'}
                      </span>
                      {alloc.sourceName}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatTWD(alloc.investedAmount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatTWD(alloc.totalCostTWD)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatTWD(alloc.currentValue)}</TableCell>
                    <TableCell className="text-right">
                      <CurrencyDisplay value={alloc.profit} showSign />
                    </TableCell>
                    <TableCell className={`text-right tabular-nums ${alloc.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {formatPercent(alloc.profitPercent)}
                    </TableCell>
                  </TableRow>
                  {expandedSources.has(alloc.sourceName) && alloc.holdings.map((h) => (
                    <TableRow key={`${alloc.sourceName}-${h.ticker}`} className="bg-muted/30">
                      <TableCell className="pl-8 text-sm">
                        <span className="font-medium">{h.name}</span>
                        <span className="ml-1 text-xs text-muted-foreground">{h.ticker}</span>
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                        {h.market === 'TW' ? `${h.units.toFixed(3)} 張` : `${h.units.toFixed(3)} 股`}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{formatTWD(h.costTWD)}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{formatTWD(h.marketValueTWD)}</TableCell>
                      <TableCell className="text-right text-sm">
                        <CurrencyDisplay value={h.profitTWD} showSign />
                      </TableCell>
                      <TableCell className={`text-right text-sm tabular-nums ${h.profitTWD >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {formatPercent(h.profitPercent)}
                      </TableCell>
                    </TableRow>
                  ))}
                </>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
