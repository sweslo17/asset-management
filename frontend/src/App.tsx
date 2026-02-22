import { Routes, Route } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { DashboardPage } from '@/components/dashboard/DashboardPage'
import { ProfitLossPage } from '@/components/profit-loss/ProfitLossPage'
import { CategoryPage } from '@/components/category/CategoryPage'
import { FundingPage } from '@/components/funding/FundingPage'
import { BatchPage } from '@/components/batch/BatchPage'
import { ManagePage } from '@/components/manage/ManagePage'

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/profit-loss" element={<ProfitLossPage />} />
        <Route path="/category" element={<CategoryPage />} />
        <Route path="/funding" element={<FundingPage />} />
        <Route path="/batch" element={<BatchPage />} />
        <Route path="/manage" element={<ManagePage />} />
      </Routes>
    </AppShell>
  )
}
