import { usePortfolioData } from '@/hooks/usePortfolioData'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { AddBatchDialog } from './AddBatchDialog'
import { BatchListView } from './BatchListView'

export function ManagePage() {
  const { data, isLoading, error } = usePortfolioData()

  if (isLoading) return <LoadingSpinner />
  if (error || !data) return <div className="text-destructive p-8">載入失敗</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">管理</h1>
          <p className="text-sm text-muted-foreground">新增、編輯和刪除投入記錄</p>
        </div>
        <AddBatchDialog />
      </div>

      <BatchListView data={data} />
    </div>
  )
}
