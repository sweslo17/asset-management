import { useState } from 'react'
import type { PortfolioData, Investment } from '@/api/types'
import { useDeleteBatch } from '@/hooks/useMutations'
import { formatTWD, investmentCostTWD } from '@/utils/currency'
import { EditInvestmentDialog } from './EditInvestmentDialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface BatchListViewProps {
  data: PortfolioData
}

export function BatchListView({ data }: BatchListViewProps) {
  const deleteBatchMutation = useDeleteBatch()
  const [editingInvestment, setEditingInvestment] = useState<Investment | null>(null)

  const sortedBatches = [...data.batches].sort((a, b) =>
    b.date.localeCompare(a.date)
  )

  const handleDeleteBatch = async (batchId: string) => {
    if (
      !confirm(
        `確定要刪除此筆投入 (${batchId})？將同時刪除相關的資金來源和投資記錄。`
      )
    )
      return
    await deleteBatchMutation.mutateAsync(batchId)
  }

  return (
    <>
      <div className="space-y-4">
        {sortedBatches.map((batch) => {
          const batchSources = data.funding_sources.filter(
            (fs) => fs.batch_id === batch.batch_id
          )
          const batchInvestments = data.investments.filter(
            (inv) => inv.batch_id === batch.batch_id
          )
          const totalFunded = batchSources.reduce(
            (s, fs) => s + fs.amount_twd,
            0
          )
          const totalInvested = batchInvestments.reduce(
            (s, inv) => s + investmentCostTWD(inv),
            0
          )

          return (
            <Card key={batch.batch_id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">
                      {batch.description || batch.batch_id}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {batch.date} — {batch.batch_id}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleDeleteBatch(batch.batch_id)}
                    disabled={deleteBatchMutation.isPending}
                  >
                    刪除
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Funding sources */}
                <div className="text-sm">
                  <p className="text-muted-foreground mb-1">
                    資金來源：{formatTWD(totalFunded)}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {batchSources.map((fs, i) => (
                      <Badge key={i} variant="secondary">
                        {fs.source_name}: {formatTWD(fs.amount_twd)}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Investments */}
                <div className="text-sm">
                  <p className="text-muted-foreground mb-1">
                    投資標的：{formatTWD(totalInvested)}
                  </p>
                  <div className="space-y-1">
                    {batchInvestments.map((inv) => (
                      <div
                        key={inv.id}
                        className="flex items-center justify-between rounded-md border border-border p-2 cursor-pointer hover:bg-accent/50 transition-colors"
                        onClick={() => setEditingInvestment(inv)}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{inv.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {inv.ticker}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {inv.market}
                          </Badge>
                        </div>
                        <div className="text-right">
                          <span className="tabular-nums">
                            {inv.units}
                            {inv.market === 'TW' ? '張' : '股'}
                          </span>
                          <span className="ml-2 text-muted-foreground">
                            {formatTWD(investmentCostTWD(inv))}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <EditInvestmentDialog
        investment={editingInvestment}
        open={editingInvestment !== null}
        onOpenChange={(open) => {
          if (!open) setEditingInvestment(null)
        }}
      />
    </>
  )
}
