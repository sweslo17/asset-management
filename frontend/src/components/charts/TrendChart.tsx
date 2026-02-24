import type { TimeSeriesPoint } from '@/utils/calculations'
import { formatTWD } from '@/utils/currency'
import { ChartTooltip } from './ChartTooltip'
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  ReferenceLine, Tooltip, ResponsiveContainer, Label,
} from 'recharts'

export interface BatchMarker {
  date: string
  label: string
}

interface TrendChartProps {
  data: TimeSeriesPoint[]
  batches?: BatchMarker[]
  showCostLine?: boolean
  showProfitArea?: boolean
  height?: number
}

/** Format date string (YYYY-MM-DD) for X-axis display */
function formatDateTick(date: string): string {
  const parts = date.split('-')
  return `${parts[1]}/${parts[2]}`
}

export function TrendChart({
  data,
  batches,
  showCostLine = true,
  showProfitArea = false,
  height = 300,
}: TrendChartProps) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">無趨勢資料</p>
  }

  // For profit mode, transform data to include a profit field
  const chartData = showProfitArea
    ? data.map((d) => ({ ...d, profit: d.totalValue - d.totalCost }))
    : data

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 20, bottom: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="date"
          tickFormatter={formatDateTick}
          style={{ fontSize: 12 }}
          tick={{ fill: 'var(--muted-foreground)' }}
        />
        <YAxis
          tickFormatter={(v: number) => formatTWD(v)}
          style={{ fontSize: 12 }}
          tick={{ fill: 'var(--muted-foreground)' }}
          width={90}
        />
        <Tooltip content={<ChartTooltip showSign={showProfitArea} />} />

        {showProfitArea ? (
          /* Profit mode: single area showing value - cost */
          <Area
            type="monotone"
            dataKey="profit"
            name="損益"
            stroke="var(--chart-1)"
            fill="var(--chart-1)"
            fillOpacity={0.15}
            strokeWidth={2}
          />
        ) : (
          <>
            {/* Value area */}
            <Area
              type="monotone"
              dataKey="totalValue"
              name="市值"
              stroke="var(--chart-1)"
              fill="var(--chart-1)"
              fillOpacity={0.15}
              strokeWidth={2}
            />
            {/* Cost line */}
            {showCostLine && (
              <Line
                type="monotone"
                dataKey="totalCost"
                name="成本"
                stroke="var(--chart-2)"
                strokeWidth={2}
                strokeDasharray="6 3"
                dot={false}
              />
            )}
          </>
        )}

        {/* Batch markers as vertical reference lines */}
        {batches?.map((b) => (
          <ReferenceLine
            key={b.date}
            x={b.date}
            stroke="var(--muted-foreground)"
            strokeDasharray="4 4"
            strokeOpacity={0.6}
          >
            <Label
              value={b.label}
              position="top"
              fill="var(--muted-foreground)"
              fontSize={10}
              offset={5}
            />
          </ReferenceLine>
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
