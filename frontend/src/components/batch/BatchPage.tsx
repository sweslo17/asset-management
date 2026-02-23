import { useState } from 'react'
import { usePortfolioData } from '@/hooks/usePortfolioData'
import { calculateBatchSummary } from '@/utils/calculations'
import { formatTWD, formatPercent } from '@/utils/currency'
import { getLatestDate } from '@/utils/dateUtils'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { CurrencyDisplay } from '@/components/common/CurrencyDisplay'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export function BatchPage() {
  const { data, isLoading, error } = usePortfolioData()
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set())

  if (isLoading) return <LoadingSpinner />
  if (error || !data) return <div className="text-destructive p-8">載入失敗</div>

  const targetDate = getLatestDate(data.prices)
  const batchSummary = calculateBatchSummary(
    data.batches, data.funding_sources, data.investments,
    data.prices, data.exchange_rates, targetDate,
  ).sort((a, b) => a.date.localeCompare(b.date))

  const toggleExpand = (batchId: string) => {
    setExpandedBatches((prev) => {
      const next = new Set(prev)
      if (next.has(batchId)) next.delete(batchId)
      else next.add(batchId)
      return next
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">投入紀錄</h1>
        <p className="text-sm text-muted-foreground">各次投入的比例分配損益</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>日期</TableHead>
                <TableHead>說明</TableHead>
                <TableHead className="text-right">投入金額</TableHead>
                <TableHead className="text-right">投資成本</TableHead>
                <TableHead className="text-right">市值</TableHead>
                <TableHead className="text-right">損益</TableHead>
                <TableHead className="text-right">報酬率</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batchSummary.map((b) => (
                <>
                  <TableRow
                    key={b.batchId}
                    className="cursor-pointer"
                    onClick={() => toggleExpand(b.batchId)}
                  >
                    <TableCell className="tabular-nums">
                      <span className="mr-1 text-muted-foreground">
                        {expandedBatches.has(b.batchId) ? '▼' : '▶'}
                      </span>
                      {b.date}
                    </TableCell>
                    <TableCell>{b.description}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatTWD(b.totalFunded)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatTWD(b.totalCostTWD)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatTWD(b.currentValue)}</TableCell>
                    <TableCell className="text-right">
                      <CurrencyDisplay value={b.profit} showSign />
                    </TableCell>
                    <TableCell className={`text-right tabular-nums ${b.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {formatPercent(b.profitPercent)}
                    </TableCell>
                  </TableRow>
                  {expandedBatches.has(b.batchId) && (
                    <>
                      {/* Funding sources */}
                      <TableRow key={`${b.batchId}-sources-header`} className="bg-muted/30">
                        <TableCell colSpan={7} className="pl-8 text-xs font-semibold text-muted-foreground">
                          資金來源
                        </TableCell>
                      </TableRow>
                      {b.sources.map((src) => (
                        <TableRow key={`${b.batchId}-src-${src.sourceName}`} className="bg-muted/30">
                          <TableCell colSpan={2} className="pl-10 text-sm">{src.sourceName}</TableCell>
                          <TableCell className="text-right text-sm tabular-nums">{formatTWD(src.amount)}</TableCell>
                          <TableCell colSpan={2} className="text-right text-sm tabular-nums text-muted-foreground">
                            {formatPercent(src.proportion)}
                          </TableCell>
                          <TableCell colSpan={2} />
                        </TableRow>
                      ))}
                      {/* Investments */}
                      <TableRow key={`${b.batchId}-inv-header`} className="bg-muted/30">
                        <TableCell colSpan={7} className="pl-8 text-xs font-semibold text-muted-foreground">
                          投資標的
                        </TableCell>
                      </TableRow>
                      {b.investments.map((inv) => (
                        <TableRow key={`${b.batchId}-inv-${inv.id}`} className="bg-muted/30">
                          <TableCell colSpan={2} className="pl-10 text-sm">
                            <span className="font-medium">{inv.name}</span>
                            <span className="ml-1 text-xs text-muted-foreground">{inv.ticker}</span>
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                            {inv.market === 'TW' ? `${inv.units} 張` : `${inv.units} 股`}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">{formatTWD(inv.costTWD)}</TableCell>
                          <TableCell className="text-right text-sm tabular-nums">{formatTWD(inv.marketValueTWD)}</TableCell>
                          <TableCell className="text-right text-sm">
                            <CurrencyDisplay value={inv.profitTWD} showSign />
                          </TableCell>
                          <TableCell className={`text-right text-sm tabular-nums ${inv.profitTWD >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {formatPercent(inv.profitPercent)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </>
                  )}
                </>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
