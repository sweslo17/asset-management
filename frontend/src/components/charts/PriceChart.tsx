import {
  ComposedChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceDot,
} from 'recharts'

interface PriceChartProps {
  data: { date: string; close: number }[]
  buyPoints?: { date: string; close: number; units: number; label: string; batchDesc: string }[]
  height?: number
}

function formatDateTick(date: string): string {
  const parts = date.split('-')
  if (parts.length < 3) return date
  return `${parts[1]}/${parts[2]}`
}

function formatPrice(value: number): string {
  return new Intl.NumberFormat('zh-TW', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)
}

interface PriceTooltipProps {
  active?: boolean
  payload?: { name: string; value: number; color?: string }[]
  label?: string
}

function PriceTooltip({ active, payload, label }: PriceTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-sm text-card-foreground shadow-md">
      {label && <p className="mb-1 font-medium">{label}</p>}
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-medium tabular-nums">{formatPrice(entry.value)}</span>
        </div>
      ))}
    </div>
  )
}

export function PriceChart({ data, buyPoints, height = 250 }: PriceChartProps) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">無價格資料</p>
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 10, right: 20, left: 20, bottom: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="date"
          tickFormatter={formatDateTick}
          style={{ fontSize: 12 }}
          tick={{ fill: 'var(--muted-foreground)' }}
        />
        <YAxis
          tickFormatter={formatPrice}
          style={{ fontSize: 12 }}
          tick={{ fill: 'var(--muted-foreground)' }}
          width={70}
          domain={['auto', 'auto']}
        />
        <Tooltip content={<PriceTooltip />} />
        <Area
          type="monotone"
          dataKey="close"
          name="收盤價"
          stroke="var(--chart-1)"
          fill="var(--chart-1)"
          fillOpacity={0.12}
          strokeWidth={2}
        />
        {buyPoints?.map((bp, i) => (
          <ReferenceDot
            key={`${bp.date}-${i}`}
            x={bp.date}
            y={bp.close}
            r={5}
            fill="var(--chart-3)"
            stroke="var(--background)"
            strokeWidth={2}
            label={{
              value: bp.label,
              position: 'top',
              fill: 'var(--chart-3)',
              fontSize: 11,
              fontWeight: 600,
              offset: 8,
            }}
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
