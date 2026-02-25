import { useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { usePortfolioData } from '@/hooks/usePortfolioData'
import { useBackfill } from '@/hooks/useMutations'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AddBatchDialog } from './AddBatchDialog'
import { BatchListView } from './BatchListView'

export function ManagePage() {
  const { data, isLoading, error } = usePortfolioData()
  const backfill = useBackfill()
  const [result, setResult] = useState<{ message: string; isError: boolean } | null>(null)

  if (isLoading) return <LoadingSpinner />
  if (error || !data) return <div className="text-destructive p-8">載入失敗</div>

  const handleBackfill = () => {
    setResult(null)
    backfill.mutate(undefined, {
      onSuccess: (res) => {
        setResult({ message: `已新增 ${res.prices_added} 筆價格、${res.rates_added} 筆匯率`, isError: false })
      },
      onError: (err) => {
        setResult({ message: `回補失敗：${err.message}`, isError: true })
      },
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">管理</h1>
          <p className="text-sm text-muted-foreground">新增、編輯和刪除投入記錄</p>
        </div>
        <AddBatchDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>資料維護</CardTitle>
          <CardDescription>從 Yahoo Finance 回補歷史價格與匯率數據</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <Button onClick={handleBackfill} disabled={backfill.isPending}>
            {backfill.isPending && <LoaderCircle className="animate-spin" />}
            回補歷史數據
          </Button>
          {result && (
            <p className={`text-sm ${result.isError ? 'text-destructive' : 'text-muted-foreground'}`}>
              {result.message}
            </p>
          )}
        </CardContent>
      </Card>

      <BatchListView data={data} />
    </div>
  )
}
