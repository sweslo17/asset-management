import { usePortfolioData } from '@/hooks/usePortfolioData'
import { calculateInvestmentValues } from '@/utils/calculations'
import { formatTWD, formatPercent } from '@/utils/currency'
import { getLatestDate } from '@/utils/dateUtils'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { CurrencyDisplay } from '@/components/common/CurrencyDisplay'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

// Usage:
// <DashboardPage />
// Renders portfolio overview with summary cards and holdings table.
// Data is fetched via usePortfolioData(); no props required.

export function DashboardPage() {
  const { data, isLoading, error } = usePortfolioData()

  if (isLoading) return <LoadingSpinner />
  if (error || !data) return <div className="text-destructive p-8">載入失敗: {error?.message}</div>

  const targetDate = getLatestDate(data.prices)
  const investments = calculateInvestmentValues(
    data.investments,
    data.prices,
    data.exchange_rates,
    targetDate,
  ).sort((a, b) => b.marketValueTWD - a.marketValueTWD)

  const totalValue = investments.reduce((s, i) => s + i.marketValueTWD, 0)
  const totalCost = investments.reduce((s, i) => s + i.costTWD, 0)
  const totalProfit = totalValue - totalCost
  const totalProfitPct = totalCost !== 0 ? totalProfit / totalCost : 0

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">投資總覽</h1>
        <p className="text-sm text-muted-foreground">截至 {targetDate}</p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">總市值</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">{formatTWD(totalValue)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">總成本</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">{formatTWD(totalCost)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">總損益</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <CurrencyDisplay value={totalProfit} showSign className="text-2xl font-bold" />
              <span className={`text-sm tabular-nums ${totalProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {formatPercent(totalProfitPct)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Holdings table */}
      <Card>
        <CardHeader>
          <CardTitle>持倉明細</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>標的</TableHead>
                <TableHead className="text-right">持有</TableHead>
                <TableHead className="text-right">市值</TableHead>
                <TableHead className="text-right">損益</TableHead>
                <TableHead className="text-right">報酬率</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {investments.map((inv) => (
                <TableRow key={inv.id}>
                  {/* Name + ticker + market badge */}
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div>
                        <p className="font-medium">{inv.name}</p>
                        <p className="text-xs text-muted-foreground">{inv.ticker}</p>
                      </div>
                      <Badge variant="outline" className="text-xs">{inv.market}</Badge>
                    </div>
                  </TableCell>

                  {/* Holdings: TW uses 張, US uses 股 */}
                  <TableCell className="text-right tabular-nums">
                    {inv.units}{inv.market === 'TW' ? '張' : '股'}
                  </TableCell>

                  {/* Market value in TWD */}
                  <TableCell className="text-right">
                    <CurrencyDisplay value={inv.marketValueTWD} />
                  </TableCell>

                  {/* Profit/loss with sign and color */}
                  <TableCell className="text-right">
                    <CurrencyDisplay value={inv.profitTWD} showSign />
                  </TableCell>

                  {/* Return percentage */}
                  <TableCell
                    className={`text-right tabular-nums ${inv.profitTWD >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}
                  >
                    {formatPercent(inv.profitPercent)}
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
