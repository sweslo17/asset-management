import { usePortfolioData } from '@/hooks/usePortfolioData'
import { calculateBatchSummary } from '@/utils/calculations'
import { formatTWD, formatPercent } from '@/utils/currency'
import { getLatestDate } from '@/utils/dateUtils'
import { buildNavState, calculateNav } from '@/utils/navCalculator'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { CurrencyDisplay } from '@/components/common/CurrencyDisplay'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export function BatchPage() {
  const { data, isLoading, error } = usePortfolioData()

  if (isLoading) return <LoadingSpinner />
  if (error || !data) return <div className="text-destructive p-8">載入失敗</div>

  const targetDate = getLatestDate(data.prices)
  const navState = buildNavState(data.batches, data.funding_sources, data.investments, data.prices, data.exchange_rates)
  const currentNav = calculateNav(data.investments, data.prices, data.exchange_rates, targetDate, navState.cash, navState.totalUnits)
  const batchSummary = calculateBatchSummary(navState, currentNav, data.batches)
    .sort((a, b) => a.date.localeCompare(b.date))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">投入紀錄</h1>
        <p className="text-sm text-muted-foreground">各次投入的 NAV 單位制損益</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>日期</TableHead>
                <TableHead>說明</TableHead>
                <TableHead className="text-right">投入金額</TableHead>
                <TableHead className="text-right">目前價值</TableHead>
                <TableHead className="text-right">損益</TableHead>
                <TableHead className="text-right">報酬率</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batchSummary.map((b) => (
                <TableRow key={b.batchId}>
                  <TableCell className="tabular-nums">{b.date}</TableCell>
                  <TableCell>{b.description}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatTWD(b.totalFunded)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatTWD(b.currentValue)}</TableCell>
                  <TableCell className="text-right">
                    <CurrencyDisplay value={b.profit} showSign />
                  </TableCell>
                  <TableCell className={`text-right tabular-nums ${b.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {formatPercent(b.profitPercent)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
