import { useState } from 'react'
import { useCreateBatch } from '@/hooks/useMutations'
import type { CreateBatchRequest } from '@/api/types'
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

interface FundingSourceEntry {
  source_name: string
  amount_twd: string
}

interface InvestmentEntry {
  ticker: string
  name: string
  market: 'TW' | 'US'
  units: string
  price_per_unit: string
  exchange_rate: string
  fees: string
  tags: string
}

function emptyFundingSource(): FundingSourceEntry {
  return { source_name: '', amount_twd: '' }
}

function emptyInvestment(): InvestmentEntry {
  return {
    ticker: '',
    name: '',
    market: 'TW',
    units: '',
    price_per_unit: '',
    exchange_rate: '1',
    fees: '0',
    tags: '',
  }
}

function calcInvestmentCost(inv: InvestmentEntry): number {
  const units = Number(inv.units) || 0
  const price = Number(inv.price_per_unit) || 0
  const rate = Number(inv.exchange_rate) || 1
  const fees = Number(inv.fees) || 0
  if (inv.market === 'TW') return units * 1000 * price + fees
  return units * price * rate + fees
}

export function AddBatchDialog() {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(1)
  const createBatch = useCreateBatch()

  // Step 1
  const [date, setDate] = useState('')
  const [description, setDescription] = useState('')

  // Step 2
  const [sources, setSources] = useState<FundingSourceEntry[]>([emptyFundingSource()])

  // Step 3
  const [investments, setInvestments] = useState<InvestmentEntry[]>([emptyInvestment()])

  const totalFunded = sources.reduce((s, src) => s + (Number(src.amount_twd) || 0), 0)
  const totalInvested = investments.reduce((s, inv) => s + calcInvestmentCost(inv), 0)

  const resetForm = () => {
    setStep(1)
    setDate('')
    setDescription('')
    setSources([emptyFundingSource()])
    setInvestments([emptyInvestment()])
  }

  const handleSubmit = async () => {
    const request: CreateBatchRequest = {
      batch: { date, description },
      funding_sources: sources
        .filter((s) => s.source_name && Number(s.amount_twd) > 0)
        .map((s) => ({ source_name: s.source_name, amount_twd: Number(s.amount_twd) })),
      investments: investments
        .filter((inv) => inv.ticker && Number(inv.units) > 0)
        .map((inv) => ({
          ticker: inv.ticker,
          name: inv.name,
          market: inv.market,
          date,
          units: Number(inv.units),
          price_per_unit: Number(inv.price_per_unit),
          exchange_rate: Number(inv.exchange_rate),
          fees: Number(inv.fees),
          tags: inv.tags,
        })),
    }
    await createBatch.mutateAsync(request)
    setOpen(false)
    resetForm()
  }

  const updateSource = (index: number, field: keyof FundingSourceEntry, value: string) => {
    setSources((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)))
  }

  const updateInvestment = (index: number, field: keyof InvestmentEntry, value: string) => {
    setInvestments((prev) =>
      prev.map((inv, i) => {
        if (i !== index) return inv
        const updated = { ...inv, [field]: value }
        // Auto-set exchange rate when market changes
        if (field === 'market') {
          updated.exchange_rate = value === 'TW' ? '1' : '30'
        }
        return updated
      })
    )
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm() }}>
      <DialogTrigger asChild>
        <Button>新增投入</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>新增投入 — 步驟 {step}/4</DialogTitle>
          <DialogDescription>
            {step === 1 && '輸入基本資訊'}
            {step === 2 && '設定資金來源'}
            {step === 3 && '新增投資標的'}
            {step === 4 && '確認並送出'}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Basic Info */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>投入日期</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>說明</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="例：年初定期投入"
              />
            </div>
          </div>
        )}

        {/* Step 2: Funding Sources */}
        {step === 2 && (
          <div className="space-y-4">
            {sources.map((src, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">來源名稱</Label>
                  <Input
                    value={src.source_name}
                    onChange={(e) => updateSource(i, 'source_name', e.target.value)}
                    placeholder="例：我的"
                  />
                </div>
                <div className="w-36 space-y-1">
                  <Label className="text-xs">金額 (TWD)</Label>
                  <Input
                    type="number"
                    value={src.amount_twd}
                    onChange={(e) => updateSource(i, 'amount_twd', e.target.value)}
                  />
                </div>
                {sources.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSources((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    ✕
                  </Button>
                )}
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSources((prev) => [...prev, emptyFundingSource()])}
            >
              + 新增來源
            </Button>
            <Separator />
            <div className="text-sm font-medium">
              合計：{formatTWD(totalFunded)}
            </div>
          </div>
        )}

        {/* Step 3: Investments */}
        {step === 3 && (
          <div className="space-y-4">
            {investments.map((inv, i) => (
              <div key={i} className="space-y-3 rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">標的 {i + 1}</span>
                  {investments.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setInvestments((prev) => prev.filter((_, idx) => idx !== i))
                      }
                    >
                      ✕
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">代碼</Label>
                    <Input
                      value={inv.ticker}
                      onChange={(e) => updateInvestment(i, 'ticker', e.target.value)}
                      placeholder="0050.TW"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">名稱</Label>
                    <Input
                      value={inv.name}
                      onChange={(e) => updateInvestment(i, 'name', e.target.value)}
                      placeholder="元大台灣50"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">市場</Label>
                    <Select
                      value={inv.market}
                      onValueChange={(v) => updateInvestment(i, 'market', v)}
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
                    <Label className="text-xs">{inv.market === 'TW' ? '張數' : '股數'}</Label>
                    <Input
                      type="number"
                      value={inv.units}
                      onChange={(e) => updateInvestment(i, 'units', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">每股價格</Label>
                    <Input
                      type="number"
                      value={inv.price_per_unit}
                      onChange={(e) => updateInvestment(i, 'price_per_unit', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">匯率 (USD/TWD)</Label>
                    <Input
                      type="number"
                      value={inv.exchange_rate}
                      onChange={(e) => updateInvestment(i, 'exchange_rate', e.target.value)}
                      disabled={inv.market === 'TW'}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">手續費 (TWD)</Label>
                    <Input
                      type="number"
                      value={inv.fees}
                      onChange={(e) => updateInvestment(i, 'fees', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">標籤</Label>
                    <Input
                      value={inv.tags}
                      onChange={(e) => updateInvestment(i, 'tags', e.target.value)}
                      placeholder="台灣,ETF"
                    />
                  </div>
                </div>
                <div className="text-right text-sm text-muted-foreground">
                  小計：{formatTWD(calcInvestmentCost(inv))}
                </div>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setInvestments((prev) => [...prev, emptyInvestment()])}
            >
              + 新增標的
            </Button>
            <Separator />
            <div className="flex justify-between text-sm">
              <span>投資合計：{formatTWD(totalInvested)}</span>
              <span>資金來源合計：{formatTWD(totalFunded)}</span>
            </div>
            <div className="text-sm font-medium">
              剩餘未投入：{formatTWD(totalFunded - totalInvested)}
            </div>
          </div>
        )}

        {/* Step 4: Review */}
        {step === 4 && (
          <div className="space-y-4 text-sm">
            <div>
              <p className="font-medium">基本資訊</p>
              <p className="text-muted-foreground">
                日期：{date} | 說明：{description}
              </p>
            </div>
            <Separator />
            <div>
              <p className="font-medium">資金來源</p>
              {sources
                .filter((s) => s.source_name)
                .map((s, i) => (
                  <p key={i} className="text-muted-foreground">
                    {s.source_name}：{formatTWD(Number(s.amount_twd))}
                  </p>
                ))}
            </div>
            <Separator />
            <div>
              <p className="font-medium">投資標的</p>
              {investments
                .filter((inv) => inv.ticker)
                .map((inv, i) => (
                  <p key={i} className="text-muted-foreground">
                    {inv.name} ({inv.ticker}) — {inv.units}
                    {inv.market === 'TW' ? '張' : '股'} @ {inv.price_per_unit} ={' '}
                    {formatTWD(calcInvestmentCost(inv))}
                  </p>
                ))}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
              上一步
            </Button>
          )}
          {step < 4 ? (
            <Button
              onClick={() => setStep((s) => s + 1)}
              disabled={step === 1 && !date}
            >
              下一步
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={createBatch.isPending}>
              {createBatch.isPending ? '送出中...' : '確認送出'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
