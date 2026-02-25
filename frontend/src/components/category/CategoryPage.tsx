import { useState, useMemo } from 'react'
import { usePortfolioData } from '@/hooks/usePortfolioData'
import {
  calculateInvestmentValues,
  calculateDimensionSummary,
  type InvestmentWithValue,
  type DimensionGroup,
} from '@/utils/calculations'
import { formatTWD, formatPercent } from '@/utils/currency'
import { getLatestDate } from '@/utils/dateUtils'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { CurrencyDisplay } from '@/components/common/CurrencyDisplay'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { HoldingDetailDialog } from '@/components/holdings/HoldingDetailDialog'
import { TagManagementDialog } from './TagManagementDialog'
import { ChartTooltip } from '@/components/charts/ChartTooltip'
import {
  PieChart, Pie, Cell, Legend, Tooltip,
  ResponsiveContainer,
} from 'recharts'

const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
]

interface AggregatedHolding {
  ticker: string
  name: string
  marketValueTWD: number
  costTWD: number
  profitTWD: number
}

function aggregateByTickerForGroup(
  investments: InvestmentWithValue[],
  tickers: string[],
): AggregatedHolding[] {
  const tickerSet = new Set(tickers)
  const map = new Map<string, AggregatedHolding>()
  for (const inv of investments) {
    if (!tickerSet.has(inv.ticker)) continue
    const existing = map.get(inv.ticker)
    if (existing) {
      existing.marketValueTWD += inv.marketValueTWD
      existing.costTWD += inv.costTWD
      existing.profitTWD += inv.profitTWD
    } else {
      map.set(inv.ticker, {
        ticker: inv.ticker,
        name: inv.name,
        marketValueTWD: inv.marketValueTWD,
        costTWD: inv.costTWD,
        profitTWD: inv.profitTWD,
      })
    }
  }
  return Array.from(map.values()).sort((a, b) => b.marketValueTWD - a.marketValueTWD)
}

export function CategoryPage() {
  const { data, isLoading, error } = usePortfolioData()
  const [expandedTags, setExpandedTags] = useState<Set<string>>(new Set())
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null)
  const [tagDialogOpen, setTagDialogOpen] = useState(false)
  const [activeDimension, setActiveDimension] = useState<string>('')

  const tickerTags = data?.ticker_tags ?? []

  // Derive dimensions
  const dimensions = useMemo(() => {
    const dims = new Set<string>()
    for (const tt of tickerTags) {
      dims.add(tt.dimension)
    }
    return Array.from(dims).sort()
  }, [tickerTags])

  // Auto-select first dimension when dimensions change
  const effectiveDimension = activeDimension && dimensions.includes(activeDimension)
    ? activeDimension
    : dimensions[0] ?? ''

  if (isLoading) return <LoadingSpinner />
  if (error || !data) return <div className="text-destructive p-8">載入失敗</div>

  const targetDate = getLatestDate(data.prices)
  const investmentsWithValue = calculateInvestmentValues(
    data.investments, data.prices, data.exchange_rates, targetDate,
  )

  const totalValue = investmentsWithValue.reduce((s, i) => s + i.marketValueTWD, 0)

  const groups: DimensionGroup[] = effectiveDimension
    ? calculateDimensionSummary(investmentsWithValue, tickerTags, effectiveDimension)
    : []

  const untaggedGroup = groups.find((g) => g.tag === '未分類')
  const untaggedCount = untaggedGroup?.tickers.length ?? 0

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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">分類分析</h1>
          <p className="text-sm text-muted-foreground">依維度分組觀察資產配置</p>
        </div>
        <Button variant="outline" onClick={() => setTagDialogOpen(true)}>
          管理標籤
        </Button>
      </div>

      {/* No dimensions guide */}
      {dimensions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">
              尚未設定分類維度，點擊管理標籤開始
            </p>
            <Button onClick={() => setTagDialogOpen(true)}>管理標籤</Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Dimension selector */}
          <Tabs
            value={effectiveDimension}
            onValueChange={(v) => {
              setActiveDimension(v)
              setExpandedTags(new Set())
            }}
          >
            <TabsList>
              {dimensions.map((dim) => (
                <TabsTrigger key={dim} value={dim}>
                  {dim}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {/* Untagged warning */}
          {untaggedCount > 0 && (
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-2 text-sm">
              此維度有 {untaggedCount} 個標的尚未分類 —{' '}
              <button
                className="underline hover:no-underline"
                onClick={() => setTagDialogOpen(true)}
              >
                前往設定
              </button>
            </div>
          )}

          {/* Donut chart */}
          {groups.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{effectiveDimension} 佔比</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={groups.map((g) => ({ name: g.tag, value: g.totalValue }))}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius="60%"
                      outerRadius="80%"
                      label={({ percent }: { percent?: number }) =>
                        percent != null ? `${(percent * 100).toFixed(1)}%` : ''
                      }
                      labelLine={false}
                    >
                      {groups.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                    <Legend
                      formatter={(value) => {
                        const item = groups.find((g) => g.tag === value)
                        const pct = item && totalValue
                          ? ((item.totalValue / totalValue) * 100).toFixed(1)
                          : '0'
                        return `${value} (${pct}%)`
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Category cards */}
          <div className="space-y-3">
            {groups.map((group) => (
              <Card
                key={group.tag}
                className="cursor-pointer"
                onClick={() => toggleExpand(group.tag)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">{group.tag}</CardTitle>
                      <Badge variant="secondary" className="text-xs">
                        {group.tickers.length} 檔
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {totalValue > 0
                        ? formatPercent(group.totalValue / totalValue)
                        : '0%'}{' '}
                      佔比
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">市值</p>
                      <p className="font-medium tabular-nums">
                        {formatTWD(group.totalValue)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">成本</p>
                      <p className="font-medium tabular-nums">
                        {formatTWD(group.totalCost)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">損益</p>
                      <CurrencyDisplay
                        value={group.totalProfit}
                        showSign
                        className="font-medium"
                      />
                      <span
                        className={`ml-1 text-xs ${group.totalProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}
                      >
                        {formatPercent(group.profitPercent)}
                      </span>
                    </div>
                  </div>

                  {/* Expanded: show holdings */}
                  {expandedTags.has(group.tag) && (
                    <div className="mt-4 space-y-2 border-t border-border pt-3">
                      {aggregateByTickerForGroup(investmentsWithValue, group.tickers).map(
                        (h) => (
                          <div
                            key={h.ticker}
                            className="flex items-center justify-between text-sm cursor-pointer rounded px-1 -mx-1 hover:bg-muted/50"
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedTicker(h.ticker)
                            }}
                          >
                            <div>
                              <span className="font-medium">{h.name}</span>
                              <span className="ml-2 text-xs text-muted-foreground">
                                {h.ticker}
                              </span>
                            </div>
                            <div className="flex items-center gap-4">
                              <span className="tabular-nums">
                                {formatTWD(h.marketValueTWD)}
                              </span>
                              <CurrencyDisplay
                                value={h.profitTWD}
                                showSign
                                className="text-xs"
                              />
                            </div>
                          </div>
                        ),
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <HoldingDetailDialog
        ticker={selectedTicker}
        onClose={() => setSelectedTicker(null)}
      />

      <TagManagementDialog
        open={tagDialogOpen}
        onOpenChange={setTagDialogOpen}
        tickerTags={tickerTags}
        investments={data.investments}
      />
    </div>
  )
}
