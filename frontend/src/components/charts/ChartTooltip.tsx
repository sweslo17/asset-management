import { formatTWD } from '@/utils/currency'

interface TooltipPayloadItem {
  name: string
  value: number
  color?: string
}

interface ChartTooltipProps {
  active?: boolean
  payload?: TooltipPayloadItem[]
  label?: string
  showSign?: boolean
  formatValue?: (value: number) => string
}

export function ChartTooltip({ active, payload, label, showSign, formatValue }: ChartTooltipProps) {
  if (!active || !payload?.length) return null

  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-sm text-card-foreground shadow-md">
      {label && <p className="mb-1 font-medium">{label}</p>}
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-medium tabular-nums">
            {showSign && entry.value > 0 ? '+' : ''}
            {formatValue ? formatValue(entry.value) : formatTWD(entry.value)}
          </span>
        </div>
      ))}
    </div>
  )
}
