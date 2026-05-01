import { useState, useMemo } from 'react'
import { LoaderCircle, RefreshCw } from 'lucide-react'
import { useCreateBatch } from '@/hooks/useMutations'
import { usePortfolioData } from '@/hooks/usePortfolioData'
import { api } from '@/api/client'
import type { CreateBatchRequest, TickerSearchResult } from '@/api/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { formatTWD } from '@/utils/currency'
import { TickerSearch } from './TickerSearch'

interface BaselineHolding {
  ticker: string
  name: string
  market: 'TW' | 'US'
  units: string
  price_per_unit: string
  exchange_rate: string
  fees: string
  fetching: boolean
  fetchError: string | null
  fetchedDate: string | null
}

function emptyHolding(): BaselineHolding {
  return {
    ticker: '',
    name: '',
    market: 'TW',
    units: '',
    price_per_unit: '',
    exchange_rate: '1',
    fees: '0',
    fetching: false,
    fetchError: null,
    fetchedDate: null,
  }
}

function calcCost(h: BaselineHolding): number {
  const units = Number(h.units) || 0
  const price = Number(h.price_per_unit) || 0
  const rate = Number(h.exchange_rate) || 1
  const fees = Number(h.fees) || 0
  if (h.market === 'TW') return units * 1000 * price + fees
  return units * price * rate + fees
}

export function AddBaselineDialog() {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(1)
  const createBatch = useCreateBatch()
  const { data: portfolio } = usePortfolioData()

  // Step 1
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [sourceName, setSourceName] = useState('')
  const [description, setDescription] = useState('初始持倉')

  // Step 2
  const [holdings, setHoldings] = useState<BaselineHolding[]>([emptyHolding()])

  const existingSourceNames = useMemo(() => {
    if (!portfolio) return []
    return [...new Set(portfolio.funding_sources.map((fs) => fs.source_name))]
  }, [portfolio])

  const totalCost = holdings.reduce((s, h) => s + calcCost(h), 0)

  const resetForm = () => {
    setStep(1)
    setDate(today)
    setSourceName('')
    setDescription('初始持倉')
    setHoldings([emptyHolding()])
  }

  /**
   * Fetches the quote for a given holding from the backend and writes the
   * result into the holding's price/exchange_rate fields.
   */
  const fetchQuoteForHolding = async (index: number) => {
    setHoldings((prev) =>
      prev.map((h, i) =>
        i === index ? { ...h, fetching: true, fetchError: null } : h,
      ),
    )

    try {
      const target = holdings[index]
      if (!target?.ticker || !date) return

      const quote = await api.fetchQuote(target.ticker, date, target.market)
      setHoldings((prev) =>
        prev.map((h, i) => {
          if (i !== index) return h
          const rate =
            h.market === 'US' && quote.usd_twd != null
              ? String(Math.round(quote.usd_twd * 100) / 100)
              : h.market === 'TW'
                ? '1'
                : h.exchange_rate
          return {
            ...h,
            price_per_unit: String(Math.round(quote.close * 10000) / 10000),
            exchange_rate: rate,
            fetching: false,
            fetchError: null,
            fetchedDate: quote.date,
          }
        }),
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : '抓取失敗'
      setHoldings((prev) =>
        prev.map((h, i) =>
          i === index ? { ...h, fetching: false, fetchError: message } : h,
        ),
      )
    }
  }

  const updateHolding = <K extends keyof BaselineHolding>(
    index: number,
    field: K,
    value: BaselineHolding[K],
  ) => {
    setHoldings((prev) =>
      prev.map((h, i) => (i === index ? { ...h, [field]: value } : h)),
    )
  }

  /** Handle selecting a ticker from Yahoo Finance search results — auto-fetch quote. */
  const handleTickerSelect = (index: number, result: TickerSearchResult) => {
    setHoldings((prev) =>
      prev.map((h, i) => {
        if (i !== index) return h
        return {
          ...h,
          ticker: result.ticker,
          name: result.name,
          market: result.market,
          exchange_rate: result.market === 'TW' ? '1' : h.exchange_rate,
          fetching: true,
          fetchError: null,
        }
      }),
    )

    // Trigger fetch using the new ticker/market values directly (state update is async).
    void (async () => {
      try {
        const quote = await api.fetchQuote(result.ticker, date, result.market)
        setHoldings((prev) =>
          prev.map((h, i) => {
            if (i !== index) return h
            const rate =
              result.market === 'US' && quote.usd_twd != null
                ? String(Math.round(quote.usd_twd * 100) / 100)
                : result.market === 'TW'
                  ? '1'
                  : h.exchange_rate
            return {
              ...h,
              price_per_unit: String(Math.round(quote.close * 10000) / 10000),
              exchange_rate: rate,
              fetching: false,
              fetchError: null,
              fetchedDate: quote.date,
            }
          }),
        )
      } catch (err) {
        const message = err instanceof Error ? err.message : '抓取失敗'
        setHoldings((prev) =>
          prev.map((h, i) =>
            i === index ? { ...h, fetching: false, fetchError: message } : h,
          ),
        )
      }
    })()
  }

  const handleSubmit = async () => {
    const validHoldings = holdings.filter(
      (h) => h.ticker && Number(h.units) > 0 && Number(h.price_per_unit) > 0,
    )
    const totalForFunding = validHoldings.reduce((s, h) => s + calcCost(h), 0)

    const request: CreateBatchRequest = {
      batch: { date, description },
      funding_sources: [{ source_name: sourceName, amount_twd: totalForFunding }],
      investments: validHoldings.map((h) => ({
        ticker: h.ticker,
        name: h.name,
        market: h.market,
        date,
        units: Number(h.units),
        price_per_unit: Number(h.price_per_unit),
        exchange_rate: Number(h.exchange_rate),
        fees: Number(h.fees),
        tags: '',
      })),
    }
    await createBatch.mutateAsync(request)
    setOpen(false)
    resetForm()
  }

  const step2HasIncompleteHolding = holdings.some(
    (h) => h.ticker && (!h.units || !h.price_per_unit),
  )
  const step2HasNoValidHolding = !holdings.some(
    (h) => h.ticker && Number(h.units) > 0 && Number(h.price_per_unit) > 0,
  )

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm() }}>
      <DialogTrigger asChild>
        <Button variant="outline">建立初始持倉</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>建立初始持倉 — 步驟 {step}/3</DialogTitle>
          <DialogDescription>
            {step === 1 && '建立系統啟用前的 baseline 持倉。每股成本將以該日的市場收盤價計算。'}
            {step === 2 && '輸入持有的標的，價格與匯率會自動從該日市場收盤帶入。'}
            {step === 3 && '確認資料並送出。'}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Basic Info */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Baseline 日期</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                成本將以該日（或最近交易日）的收盤價計算。
              </p>
            </div>
            <div className="space-y-2">
              <Label>資金來源名稱</Label>
              <Input
                value={sourceName}
                onChange={(e) => setSourceName(e.target.value)}
                placeholder="例：我的"
                list="baseline-source-names"
              />
              <datalist id="baseline-source-names">
                {existingSourceNames.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
              <p className="text-xs text-muted-foreground">
                金額會自動 = 全部標的成本總和。
              </p>
            </div>
            <div className="space-y-2">
              <Label>說明</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Step 2: Holdings */}
        {step === 2 && (
          <div className="space-y-4">
            {holdings.map((h, i) => (
              <div key={i} className="space-y-3 rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">標的 {i + 1}</span>
                  <div className="flex items-center gap-2">
                    {h.ticker && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => fetchQuoteForHolding(i)}
                        disabled={h.fetching}
                        title="重新抓取價格"
                      >
                        {h.fetching ? (
                          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    )}
                    {holdings.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setHoldings((prev) => prev.filter((_, idx) => idx !== i))
                        }
                      >
                        ✕
                      </Button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">代碼</Label>
                    <TickerSearch
                      value={h.ticker}
                      onChange={(v) => updateHolding(i, 'ticker', v)}
                      onSelect={(r) => handleTickerSelect(i, r)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">名稱</Label>
                    <Input
                      value={h.name}
                      onChange={(e) => updateHolding(i, 'name', e.target.value)}
                      placeholder="元大台灣50"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">市場</Label>
                    <Select
                      value={h.market}
                      onValueChange={(v) => {
                        updateHolding(i, 'market', v as 'TW' | 'US')
                        if (v === 'TW') updateHolding(i, 'exchange_rate', '1')
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="TW">台股</SelectItem>
                        <SelectItem value="US">美股</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{h.market === 'TW' ? '張數' : '股數'}</Label>
                    <Input
                      type="number"
                      value={h.units}
                      onChange={(e) => updateHolding(i, 'units', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">每股價格（自動帶入）</Label>
                    <Input
                      type="number"
                      value={h.price_per_unit}
                      onChange={(e) => updateHolding(i, 'price_per_unit', e.target.value)}
                      disabled={h.fetching}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">匯率 (USD/TWD)</Label>
                    <Input
                      type="number"
                      value={h.exchange_rate}
                      onChange={(e) => updateHolding(i, 'exchange_rate', e.target.value)}
                      disabled={h.market === 'TW' || h.fetching}
                    />
                  </div>
                </div>
                {h.fetchedDate && h.fetchedDate !== date && (
                  <p className="text-xs text-muted-foreground">
                    已用 {h.fetchedDate} 的收盤價（{date} 非交易日）
                  </p>
                )}
                {h.fetchError && (
                  <p className="text-xs text-destructive">
                    自動抓取失敗：{h.fetchError}。請手動輸入價格。
                  </p>
                )}
                <div className="text-right text-sm text-muted-foreground">
                  小計：{formatTWD(calcCost(h))}
                </div>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setHoldings((prev) => [...prev, emptyHolding()])}
            >
              + 新增標的
            </Button>
            <Separator />
            <div className="text-sm font-medium">
              投入金額（自動計算）：{formatTWD(totalCost)}
            </div>
          </div>
        )}

        {/* Step 3: Confirm */}
        {step === 3 && (
          <div className="space-y-4 text-sm">
            <div>
              <p className="font-medium">基本資訊</p>
              <p className="text-muted-foreground">
                日期：{date} | 來源：{sourceName} | 說明：{description}
              </p>
            </div>
            <Separator />
            <div>
              <p className="font-medium">持倉清單</p>
              {holdings
                .filter((h) => h.ticker)
                .map((h, i) => (
                  <p key={i} className="text-muted-foreground">
                    {h.name} ({h.ticker}) — {h.units}
                    {h.market === 'TW' ? '張' : '股'} @ {h.price_per_unit} ={' '}
                    {formatTWD(calcCost(h))}
                  </p>
                ))}
            </div>
            <Separator />
            <div className="space-y-1">
              <p className="font-medium">投入金額（自動計算）</p>
              <p className="text-muted-foreground">
                資金來源「{sourceName}」金額將設為 {formatTWD(totalCost)}
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
              上一步
            </Button>
          )}
          {step < 3 ? (
            <Button
              onClick={() => setStep((s) => s + 1)}
              disabled={
                (step === 1 && (!date || !sourceName)) ||
                (step === 2 && (step2HasNoValidHolding || step2HasIncompleteHolding))
              }
            >
              下一步
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={createBatch.isPending || step2HasNoValidHolding}
            >
              {createBatch.isPending ? '送出中...' : '確認送出'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
