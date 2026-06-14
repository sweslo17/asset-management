import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { usePortfolioData } from '@/hooks/usePortfolioData'
import { calculateInvestmentValues } from '@/utils/calculations'
import { getLatestDate } from '@/utils/dateUtils'
import { formatTWD } from '@/utils/currency'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { RebalanceResponse } from '@/api/types'

interface Leg {
  ticker: string
  market: 'TW' | 'US'
  units_delta: string   // 字串以利輸入；正買負賣
  price_per_unit: string
  exchange_rate: string
}

const emptyLeg = (): Leg => ({ ticker: '', market: 'US', units_delta: '', price_per_unit: '', exchange_rate: '' })

export function RebalancePage() {
  const { data, isLoading } = usePortfolioData()
  const queryClient = useQueryClient()
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState('')
  const [legs, setLegs] = useState<Leg[]>([emptyLeg()])
  const [result, setResult] = useState<RebalanceResponse | null>(null)

  const mutation = useMutation({
    mutationFn: api.rebalance,
    onSuccess: (res) => {
      setResult(res)
      queryClient.invalidateQueries({ queryKey: ['portfolio'] })
      setLegs([emptyLeg()])
      setDescription('')
    },
  })

  if (isLoading || !data) return <LoadingSpinner />

  // 當前持股（供參考，知道每檔有多少可賣）
  const targetDate = getLatestDate(data.prices)
  const valued = calculateInvestmentValues(data.investments, data.prices, data.exchange_rates, targetDate)
  const held = new Map<string, { units: number; market: 'TW' | 'US' }>()
  for (const v of valued) {
    const cur = held.get(v.ticker) ?? { units: 0, market: v.market }
    cur.units += v.units
    held.set(v.ticker, cur)
  }

  const updateLeg = (i: number, patch: Partial<Leg>) =>
    setLegs((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))

  const submit = () => {
    const trades = legs
      .filter((l) => l.ticker && l.units_delta && l.price_per_unit)
      .map((l) => ({
        ticker: l.ticker.trim().toUpperCase(),
        market: l.market,
        units_delta: Number(l.units_delta),
        price_per_unit: Number(l.price_per_unit),
        exchange_rate: l.market === 'US' ? Number(l.exchange_rate || '0') || undefined : 1,
      }))
    if (trades.length === 0) return
    mutation.mutate({ date, description: description || '調整/轉換', trades })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">記錄調整 / 轉換</h1>
        <p className="text-sm text-muted-foreground">
          重組持股（賣出填負數、買入填正數）。不計入新資金；系統自動算已實現損益。
        </p>
      </div>

      {result && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">轉換已記錄（{result.batch_id}）</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold tabular-nums">
              已實現損益 {result.realized_pl_twd >= 0 ? '+' : ''}{formatTWD(result.realized_pl_twd)}
            </p>
            <ul className="mt-2 text-sm text-muted-foreground space-y-1">
              {result.legs.map((l) => (
                <li key={l.ticker}>
                  {l.units_delta >= 0 ? '買' : '賣'} {l.ticker} {Math.abs(l.units_delta)}
                  {l.realized_pl_twd !== null && `　已實現 ${l.realized_pl_twd >= 0 ? '+' : ''}${formatTWD(l.realized_pl_twd)}`}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>轉換內容</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="date">日期</Label>
              <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="desc">說明</Label>
              <Input id="desc" placeholder="如：依建議降槓桿" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>

          <div className="space-y-3">
            {legs.map((l, i) => (
              <div key={i} className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end border-b border-border pb-3">
                <div className="space-y-1">
                  <Label className="text-xs">標的</Label>
                  <Input placeholder="TQQQ" value={l.ticker} onChange={(e) => updateLeg(i, { ticker: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">市場</Label>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                    value={l.market}
                    onChange={(e) => updateLeg(i, { market: e.target.value as 'TW' | 'US' })}
                  >
                    <option value="US">US</option>
                    <option value="TW">TW</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">數量(±)</Label>
                  <Input placeholder="正買負賣" value={l.units_delta} onChange={(e) => updateLeg(i, { units_delta: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">成交價</Label>
                  <Input placeholder="76.1" value={l.price_per_unit} onChange={(e) => updateLeg(i, { price_per_unit: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">匯率(US)</Label>
                  <Input placeholder="31.6" value={l.exchange_rate} disabled={l.market === 'TW'} onChange={(e) => updateLeg(i, { exchange_rate: e.target.value })} />
                </div>
                <Button variant="ghost" onClick={() => setLegs((ls) => ls.filter((_, idx) => idx !== i))}>移除</Button>
                {l.ticker && held.get(l.ticker.trim().toUpperCase()) && (
                  <p className="col-span-full text-xs text-muted-foreground">
                    目前持有 {held.get(l.ticker.trim().toUpperCase())!.units}（{l.market === 'TW' ? '張' : '股'}）
                  </p>
                )}
              </div>
            ))}
            <Button variant="outline" onClick={() => setLegs((ls) => [...ls, emptyLeg()])}>+ 新增一筆</Button>
          </div>

          {mutation.isError && (
            <p className="text-sm text-destructive">送出失敗：{(mutation.error as Error)?.message}</p>
          )}
          <Button onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? '記錄中…' : '記錄轉換'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
