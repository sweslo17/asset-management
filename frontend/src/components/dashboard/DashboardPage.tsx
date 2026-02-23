import { usePortfolioData } from '@/hooks/usePortfolioData'
import { calculateInvestmentValues, type InvestmentWithValue } from '@/utils/calculations'
import { formatTWD, formatPercent } from '@/utils/currency'
import { getLatestDate } from '@/utils/dateUtils'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { CurrencyDisplay } from '@/components/common/CurrencyDisplay'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

interface AggregatedHolding {
  ticker: string
  name: string
  market: 'TW' | 'US'
  units: number
  costTWD: number
  marketValueTWD: number
  profitTWD: number
  profitPercent: number
}

function aggregateByTicker(investments: InvestmentWithValue[]): AggregatedHolding[] {
  const map = new Map<string, AggregatedHolding>()
  for (const inv of investments) {
    const existing = map.get(inv.ticker)
    if (existing) {
      existing.units += inv.units
      existing.costTWD += inv.costTWD
      existing.marketValueTWD += inv.marketValueTWD
      existing.profitTWD += inv.profitTWD
    } else {
      map.set(inv.ticker, {
        ticker: inv.ticker,
        name: inv.name,
        market: inv.market,
        units: inv.units,
        costTWD: inv.costTWD,
        marketValueTWD: inv.marketValueTWD,
        profitTWD: inv.profitTWD,
        profitPercent: 0,
      })
    }
  }
  for (const h of map.values()) {
    h.profitPercent = h.costTWD !== 0 ? h.profitTWD / h.costTWD : 0
  }
  return Array.from(map.values()).sort((a, b) => b.marketValueTWD - a.marketValueTWD)
}

export function DashboardPage() {
  const { data, isLoading, error } = usePortfolioData()

  if (isLoading) return <LoadingSpinner />
  if (error || !data) return <div className="text-destructive p-8">載入失敗: {error?.message}</div>

  const targetDate = getLatestDate(data.prices)
  const rawInvestments = calculateInvestmentValues(
    data.investments,
    data.prices,
    data.exchange_rates,
    targetDate,
  )
  const holdings = aggregateByTicker(rawInvestments)

  const totalValue = holdings.reduce((s, i) => s + i.marketValueTWD, 0)
  const totalCost = holdings.reduce((s, i) => s + i.costTWD, 0)
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
              {holdings.map((h) => (
                <TableRow key={h.ticker}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div>
                        <p className="font-medium">{h.name}</p>
                        <p className="text-xs text-muted-foreground">{h.ticker}</p>
                      </div>
                      <Badge variant="outline" className="text-xs">{h.market}</Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {h.units}{h.market === 'TW' ? '張' : '股'}
                  </TableCell>
                  <TableCell className="text-right">
                    <CurrencyDisplay value={h.marketValueTWD} />
                  </TableCell>
                  <TableCell className="text-right">
                    <CurrencyDisplay value={h.profitTWD} showSign />
                  </TableCell>
                  <TableCell
                    className={`text-right tabular-nums ${h.profitTWD >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}
                  >
                    {formatPercent(h.profitPercent)}
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
