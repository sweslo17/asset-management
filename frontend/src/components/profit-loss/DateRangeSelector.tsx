import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// Usage:
// <DateRangeSelector
//   startDate="2024-01-01"
//   endDate="2024-12-31"
//   onStartDateChange={(d) => setStart(d)}
//   onEndDateChange={(d) => setEnd(d)}
// />

interface DateRangeSelectorProps {
  startDate: string
  endDate: string
  onStartDateChange: (date: string) => void
  onEndDateChange: (date: string) => void
}

export function DateRangeSelector({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
}: DateRangeSelectorProps) {
  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="space-y-1.5">
        <Label htmlFor="start-date" className="text-sm">
          開始日期
        </Label>
        <Input
          id="start-date"
          type="date"
          value={startDate}
          onChange={(e) => onStartDateChange(e.target.value)}
          className="w-40"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="end-date" className="text-sm">
          結束日期
        </Label>
        <Input
          id="end-date"
          type="date"
          value={endDate}
          onChange={(e) => onEndDateChange(e.target.value)}
          className="w-40"
        />
      </div>
    </div>
  )
}
