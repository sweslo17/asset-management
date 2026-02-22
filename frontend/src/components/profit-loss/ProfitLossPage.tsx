import { useState, useMemo } from 'react'
import { usePortfolioData } from '@/hooks/usePortfolioData'
import { calculateProfitLoss } from '@/utils/calculations'
import { formatTWD, formatPercent } from '@/utils/currency'
import { getLatestDate } from '@/utils/dateUtils'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { CurrencyDisplay } from '@/components/common/CurrencyDisplay'
import { DateRangeSelector } from './DateRangeSelector'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

// Usage:
// <ProfitLossPage />
// Renders a date-range picker and per-holding P&L table.
// Defaults: start = earliest investment date, end = latest price date.

export function ProfitLossPage() {
  const { data, isLoading, error } = usePortfolioData()

  // Derive default dates from data (memoised so they don't shift on re-renders)
  const defaultStartDate = useMemo(() => {
    if (!data?.investments.length) return ''
    return data.investments.reduce(
      (min, inv) => (inv.date < min ? inv.date : min),
      data.investments[0].date,
    )
  }, [data])

  const defaultEndDate = useMemo(() => {
    if (!data?.prices.length) return ''
    return getLatestDate(data.prices)
  }, [data])

  // Empty string means "use the default derived from data"
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const effectiveStart = startDate || defaultStartDate
  const effectiveEnd = endDate || defaultEndDate

  if (isLoading) return <LoadingSpinner />
  if (error || !data) return <div className="text-destructive p-8">載入失敗: {error?.message}</div>

  // Sort by profit descending so best performers appear first
  const items = calculateProfitLoss(
    data.investments,
    data.prices,
    data.exchange_rates,
    effectiveStart,
    effectiveEnd,
  ).sort((a, b) => b.profit - a.profit)

  const totalStart = items.reduce((s, i) => s + i.startValue, 0)
  const totalEnd = items.reduce((s, i) => s + i.endValue, 0)
  const totalProfit = totalEnd - totalStart
  const totalProfitPct = totalStart !== 0 ? totalProfit / totalStart : 0

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">損益分析</h1>
        <p className="text-sm text-muted-foreground">依日期區間顯示各標的損益</p>
      </div>

      {/* Date range picker */}
      <DateRangeSelector
        startDate={effectiveStart}
        endDate={effectiveEnd}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
      />

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">期初市值</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold tabular-nums">{formatTWD(totalStart)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">期末市值</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold tabular-nums">{formatTWD(totalEnd)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">區間損益</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <CurrencyDisplay value={totalProfit} showSign className="text-xl font-bold" />
              <span className={`text-sm tabular-nums ${totalProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {formatPercent(totalProfitPct)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Per-holding table */}
      <Card>
        <CardHeader>
          <CardTitle>各標的損益</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>標的</TableHead>
                <TableHead className="text-right">期初市值</TableHead>
                <TableHead className="text-right">期末市值</TableHead>
                <TableHead className="text-right">損益</TableHead>
                <TableHead className="text-right">報酬率</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.ticker}>
                  {/* Name + ticker + market badge */}
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div>
                        <p className="font-medium">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{item.ticker}</p>
                      </div>
                      <Badge variant="outline" className="text-xs">{item.market}</Badge>
                    </div>
                  </TableCell>

                  {/* Period start value */}
                  <TableCell className="text-right tabular-nums">
                    {formatTWD(item.startValue)}
                  </TableCell>

                  {/* Period end value */}
                  <TableCell className="text-right tabular-nums">
                    {formatTWD(item.endValue)}
                  </TableCell>

                  {/* P&L with sign and color via CurrencyDisplay */}
                  <TableCell className="text-right">
                    <CurrencyDisplay value={item.profit} showSign />
                  </TableCell>

                  {/* Return percentage, color-coded */}
                  <TableCell
                    className={`text-right tabular-nums ${item.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}
                  >
                    {formatPercent(item.profitPercent)}
                  </TableCell>
                </TableRow>
              ))}

              {/* Totals row */}
              {items.length > 0 && (
                <TableRow className="border-t-2 font-semibold">
                  <TableCell>合計</TableCell>
                  <TableCell className="text-right tabular-nums">{formatTWD(totalStart)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatTWD(totalEnd)}</TableCell>
                  <TableCell className="text-right">
                    <CurrencyDisplay value={totalProfit} showSign />
                  </TableCell>
                  <TableCell
                    className={`text-right tabular-nums ${totalProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}
                  >
                    {formatPercent(totalProfitPct)}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
