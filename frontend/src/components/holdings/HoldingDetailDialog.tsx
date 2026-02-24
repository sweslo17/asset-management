import { useHoldingDetail } from '@/hooks/useHoldingDetail'
import { formatTWD, formatPercent } from '@/utils/currency'
import { CurrencyDisplay } from '@/components/common/CurrencyDisplay'
import { PriceChart } from '@/components/charts/PriceChart'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

interface HoldingDetailDialogProps {
  ticker: string | null
  onClose: () => void
}

export function HoldingDetailDialog({ ticker, onClose }: HoldingDetailDialogProps) {
  const detail = useHoldingDetail(ticker)

  return (
    <Dialog open={ticker !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        {detail ? (
          <>
            {/* Header */}
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {detail.name}
                <Badge variant="outline" className="text-xs">{detail.ticker}</Badge>
                <Badge variant="secondary" className="text-xs">{detail.market}</Badge>
              </DialogTitle>
              <DialogDescription>
                標的明細與價格走勢
              </DialogDescription>
            </DialogHeader>

            {/* Summary grid */}
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">持有單位</p>
                <p className="font-medium tabular-nums">
                  {detail.totalUnits}{detail.market === 'TW' ? '張' : '股'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">平均成本 <span className="text-xs">({detail.market === 'TW' ? 'TWD/股' : 'USD/股'})</span></p>
                <p className="font-medium tabular-nums">
                  {new Intl.NumberFormat('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(detail.avgCostPerUnit)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">現價 <span className="text-xs">({detail.market === 'TW' ? 'TWD/股' : 'USD/股'})</span></p>
                <p className="font-medium tabular-nums">
                  {detail.currentPrice !== null
                    ? new Intl.NumberFormat('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(detail.currentPrice)
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">市值 (TWD)</p>
                <p className="font-medium tabular-nums">{formatTWD(detail.totalMarketValueTWD)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">損益</p>
                <CurrencyDisplay value={detail.profitTWD} showSign className="font-medium" />
              </div>
              <div>
                <p className="text-muted-foreground">報酬率</p>
                <p className={`font-medium tabular-nums ${detail.profitTWD >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {formatPercent(detail.profitPercent)}
                </p>
              </div>
            </div>

            <Separator />

            {/* Price chart */}
            <div>
              <h3 className="text-sm font-medium mb-2">價格走勢</h3>
              <PriceChart data={detail.priceHistory} buyPoints={detail.buyPoints} />
            </div>

            <Separator />

            {/* Purchase history table */}
            <div>
              <h3 className="text-sm font-medium mb-2">購買紀錄</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>日期</TableHead>
                    <TableHead>批次說明</TableHead>
                    <TableHead className="text-right">數量</TableHead>
                    <TableHead className="text-right">買價</TableHead>
                    <TableHead className="text-right">成本 (TWD)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.purchases.map((p, i) => (
                    <TableRow key={`${p.date}-${i}`}>
                      <TableCell className="tabular-nums">{p.date}</TableCell>
                      <TableCell>{p.batchDesc}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p.units}{detail.market === 'TW' ? '張' : '股'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {new Intl.NumberFormat('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(p.pricePerUnit)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatTWD(p.costTWD)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        ) : ticker ? (
          <div className="py-8 text-center text-muted-foreground text-sm">查無此標的資料</div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
