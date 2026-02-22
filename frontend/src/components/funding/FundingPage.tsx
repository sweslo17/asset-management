import { usePortfolioData } from '@/hooks/usePortfolioData'
import { calculateFundingSummary } from '@/utils/calculations'
import { formatTWD, formatPercent } from '@/utils/currency'
import { getLatestDate } from '@/utils/dateUtils'
import { buildNavState, calculateNav } from '@/utils/navCalculator'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { CurrencyDisplay } from '@/components/common/CurrencyDisplay'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export function FundingPage() {
  const { data, isLoading, error } = usePortfolioData()

  if (isLoading) return <LoadingSpinner />
  if (error || !data) return <div className="text-destructive p-8">載入失敗</div>

  const targetDate = getLatestDate(data.prices)
  const navState = buildNavState(data.batches, data.funding_sources, data.investments, data.prices, data.exchange_rates)
  const currentNav = calculateNav(data.investments, data.prices, data.exchange_rates, targetDate, navState.cash, navState.totalUnits)
  const fundingSummary = calculateFundingSummary(navState, currentNav)

  const totalInvested = fundingSummary.reduce((s, f) => s + f.investedAmount, 0)
  const totalCurrentValue = fundingSummary.reduce((s, f) => s + f.currentValue, 0)
  const totalProfit = totalCurrentValue - totalInvested

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">資金來源</h1>
        <p className="text-sm text-muted-foreground">依 NAV 單位制計算各來源的投資價值</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">目前 NAV</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold tabular-nums">{currentNav.toFixed(4)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">總發行單位</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold tabular-nums">{navState.totalUnits.toFixed(2)}</p>
          </CardContent>
        </Card>
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
            <CardTitle className="text-sm text-muted-foreground">總損益</CardTitle>
          </CardHeader>
          <CardContent>
            <CurrencyDisplay value={totalProfit} showSign className="text-xl font-bold" />
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
                <TableHead className="text-right">持有單位</TableHead>
                <TableHead className="text-right">投入金額</TableHead>
                <TableHead className="text-right">目前價值</TableHead>
                <TableHead className="text-right">損益</TableHead>
                <TableHead className="text-right">報酬率</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fundingSummary.map((fs) => (
                <TableRow key={fs.sourceName}>
                  <TableCell className="font-medium">{fs.sourceName}</TableCell>
                  <TableCell className="text-right tabular-nums">{fs.units.toFixed(2)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatTWD(fs.investedAmount)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatTWD(fs.currentValue)}</TableCell>
                  <TableCell className="text-right">
                    <CurrencyDisplay value={fs.profit} showSign />
                  </TableCell>
                  <TableCell className={`text-right tabular-nums ${fs.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {formatPercent(fs.profitPercent)}
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
