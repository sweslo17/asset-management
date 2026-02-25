import { useState, useEffect } from 'react'
import { useUpdateInvestment, useDeleteInvestment } from '@/hooks/useMutations'
import type { Investment } from '@/api/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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

interface EditInvestmentDialogProps {
  investment: Investment | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditInvestmentDialog({
  investment,
  open,
  onOpenChange,
}: EditInvestmentDialogProps) {
  const updateMutation = useUpdateInvestment()
  const deleteMutation = useDeleteInvestment()

  const [form, setForm] = useState({
    ticker: '',
    name: '',
    market: 'TW' as 'TW' | 'US',
    units: '',
    price_per_unit: '',
    exchange_rate: '',
    fees: '',
  })

  useEffect(() => {
    if (investment) {
      setForm({
        ticker: investment.ticker,
        name: investment.name,
        market: investment.market,
        units: String(investment.units),
        price_per_unit: String(investment.price_per_unit),
        exchange_rate: String(investment.exchange_rate),
        fees: String(investment.fees),
      })
    }
  }, [investment])

  if (!investment) return null

  const handleSave = async () => {
    await updateMutation.mutateAsync({
      id: investment.id,
      data: {
        ticker: form.ticker,
        name: form.name,
        market: form.market,
        units: Number(form.units),
        price_per_unit: Number(form.price_per_unit),
        exchange_rate: Number(form.exchange_rate),
        fees: Number(form.fees),
      },
    })
    onOpenChange(false)
  }

  const handleDelete = async () => {
    if (!confirm('確定要刪除此投資記錄？')) return
    await deleteMutation.mutateAsync(investment.id)
    onOpenChange(false)
  }

  const update = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>編輯投資記錄</DialogTitle>
          <DialogDescription>
            {investment.id} — {investment.name}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">代碼</Label>
            <Input
              value={form.ticker}
              onChange={(e) => update('ticker', e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">名稱</Label>
            <Input
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">市場</Label>
            <Select value={form.market} onValueChange={(v) => update('market', v)}>
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
            <Label className="text-xs">{form.market === 'TW' ? '張數' : '股數'}</Label>
            <Input
              type="number"
              value={form.units}
              onChange={(e) => update('units', e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">每股價格</Label>
            <Input
              type="number"
              value={form.price_per_unit}
              onChange={(e) => update('price_per_unit', e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">匯率</Label>
            <Input
              type="number"
              value={form.exchange_rate}
              onChange={(e) => update('exchange_rate', e.target.value)}
              disabled={form.market === 'TW'}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">手續費</Label>
            <Input
              type="number"
              value={form.fees}
              onChange={(e) => update('fees', e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
          >
            刪除
          </Button>
          <Button onClick={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? '儲存中...' : '儲存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
