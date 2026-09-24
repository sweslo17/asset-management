import type { TimeSeriesPoint } from '@/utils/calculations'
import { formatTWD } from '@/utils/currency'
import { ChartTooltip } from './ChartTooltip'
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  ReferenceLine, Tooltip, ResponsiveContainer, Label,
  type LabelProps, type CartesianViewBox,
} from 'recharts'

export interface BatchMarker {
  date: string
  label: string
  amount?: number  // funded amount (TWD) to display at marker
  kind?: 'contribution' | 'rebalance'  // 轉換用不同顏色
}

interface TrendChartProps {
  data: TimeSeriesPoint[]
  batches?: BatchMarker[]
  showCostLine?: boolean
  showProfitArea?: boolean
  showCounterfactual?: boolean  // 顯示「若未轉換」對照線
  showExpected?: boolean        // 顯示「預期增長」未來線
  height?: number
}

/** X 軸刻度：資料跨年時顯示 YYYY/MM（否則 MM/DD 會看不出年份、像時間倒退），同一年內顯示 MM/DD。 */
function makeDateTickFormatter(firstDate: string, lastDate: string): (date: string) => string {
  const spansYears = firstDate.slice(0, 4) !== lastDate.slice(0, 4)
  return (date: string) => {
    const [y, m, d] = date.split('-')
    return spansYears ? `${y}/${m}` : `${m}/${d}`
  }
}

const markerColor = (b: BatchMarker) => (b.kind === 'rebalance' ? 'var(--chart-3)' : 'var(--muted-foreground)')

const BADGE_RADIUS = 8
const BADGE_ROW_GAP = 18
/** 相鄰標記在 X 軸上的距離小於資料點數的這個比例時，改放到第二排避免重疊。 */
const BADGE_MIN_GAP_RATIO = 0.06

interface PlacedMarker extends BatchMarker {
  no: number
  row: 0 | 1
}

/** 依日期編號，並以貪婪法把太靠近的標記交錯放到兩排。 */
function placeMarkers(batches: BatchMarker[], dates: string[]): PlacedMarker[] {
  const indexOf = new Map(dates.map((d, i) => [d, i]))
  const minGap = Math.max(1, Math.ceil(dates.length * BADGE_MIN_GAP_RATIO))
  const lastIndexInRow: [number, number] = [-Infinity, -Infinity]
  return [...batches]
    .filter((b) => indexOf.has(b.date))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((b, i) => {
      const idx = indexOf.get(b.date)!
      const row: 0 | 1 = idx - lastIndexInRow[0] >= minGap || idx - lastIndexInRow[1] < minGap ? 0 : 1
      lastIndexInRow[row] = idx
      return { ...b, no: i + 1, row }
    })
}

/** 圖上方的編號圓章（ReferenceLine 的 Label content）。 */
function markerBadge(m: PlacedMarker) {
  return function MarkerBadge({ viewBox }: LabelProps) {
    const { x = 0, y = 0 } = (viewBox ?? {}) as CartesianViewBox
    const cy = y - BADGE_RADIUS - 4 - m.row * BADGE_ROW_GAP
    return (
      <g>
        <circle cx={x} cy={cy} r={BADGE_RADIUS} fill={markerColor(m)} />
        <text x={x} y={cy} dy="0.35em" textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--card)">
          {m.no}
        </text>
      </g>
    )
  }
}

function markerText(m: BatchMarker): string {
  return m.amount ? `${m.label}（${formatTWD(m.amount)}）` : m.label
}

function MarkerLegend({ markers, showTodayNote }: { markers: PlacedMarker[]; showTodayNote: boolean }) {
  return (
    <ul className="mt-3 flex flex-col gap-1.5 text-xs text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-x-5">
      {markers.map((m) => (
        <li key={m.date} className="flex items-start gap-1.5">
          <span
            className="mt-px inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-card"
            style={{ backgroundColor: markerColor(m) }}
          >
            {m.no}
          </span>
          <span className="whitespace-nowrap tabular-nums">{m.date}</span>
          <span className="text-foreground">{m.kind === 'rebalance' ? '轉換：' : ''}{markerText(m)}</span>
        </li>
      ))}
      {showTodayNote && (
        <li className="flex items-start gap-1.5">
          <span className="mt-1.5 h-0.5 w-4 shrink-0" style={{ backgroundColor: 'var(--chart-4)' }} />
          <span>「今天」之後為預期增長，每點 1 個月（時間軸壓縮）</span>
        </li>
      )}
    </ul>
  )
}

export function TrendChart({
  data,
  batches,
  showCostLine = true,
  showProfitArea = false,
  showCounterfactual = false,
  showExpected = false,
  height = 300,
}: TrendChartProps) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">無趨勢資料</p>
  }

  // For profit mode, transform data to include a profit field
  const chartData = showProfitArea
    ? data.map((d) => ({ ...d, profit: d.totalValue - d.totalCost }))
    : data

  const dates = data.map((d) => d.date)
  const markers = placeMarkers(batches ?? [], dates)
  const markerByDate = new Map(markers.map((m) => [m.date, m]))
  const hasSecondRow = markers.some((m) => m.row === 1)
  // 歷史（逐日）與預測（逐月）的分界：最後一個有實際市值的點
  const lastActual = showExpected
    ? [...data].reverse().find((d) => d.totalValue !== undefined)?.date
    : undefined
  const showTodayLine = !!lastActual && lastActual !== dates[dates.length - 1]

  const renderMarkerInfo = (date: string) => {
    const m = markerByDate.get(date)
    if (!m) return null
    return (
      <p className="mb-1 text-xs" style={{ color: markerColor(m) }}>
        {m.no}. {m.kind === 'rebalance' ? '轉換：' : ''}{markerText(m)}
      </p>
    )
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart
          data={chartData}
          margin={{ top: markers.length ? (hasSecondRow ? 44 : 26) : 10, right: 20, left: 20, bottom: 10 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="date"
            tickFormatter={makeDateTickFormatter(dates[0], dates[dates.length - 1])}
            minTickGap={16}
            style={{ fontSize: 12 }}
            tick={{ fill: 'var(--muted-foreground)' }}
          />
          <YAxis
            tickFormatter={(v: number) => formatTWD(v)}
            style={{ fontSize: 12 }}
            tick={{ fill: 'var(--muted-foreground)' }}
            width={90}
          />
          <Tooltip content={<ChartTooltip showSign={showProfitArea} renderExtra={renderMarkerInfo} />} />

          {showProfitArea ? (
            <>
              {/* Zero reference line for break-even */}
              <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeWidth={1} />
              {/* Profit mode: single area showing value - cost */}
              <Area
                type="monotone"
                dataKey="profit"
                name="損益"
                stroke="var(--chart-1)"
                fill="var(--chart-1)"
                fillOpacity={0.15}
                strokeWidth={2}
              />
            </>
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
              {/* Counterfactual line: 若未轉換 */}
              {showCounterfactual && (
                <Line
                  type="monotone"
                  dataKey="counterfactualValue"
                  name="若未轉換"
                  stroke="var(--muted-foreground)"
                  strokeWidth={2}
                  strokeDasharray="2 3"
                  dot={false}
                  connectNulls
                />
              )}
              {/* Expected growth line: 預期增長（未來）*/}
              {showExpected && (
                <Line
                  type="monotone"
                  dataKey="expectedValue"
                  name="預期增長"
                  stroke="var(--chart-4)"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={false}
                  connectNulls
                />
              )}
            </>
          )}

          {/* 今天：左側為逐日歷史，右側預測線每點為一個月（時間軸在此之後被壓縮，說明在圖例）*/}
          {showTodayLine && (
            <ReferenceLine x={lastActual} stroke="var(--chart-4)" strokeOpacity={0.6}>
              <Label
                value="今天"
                position="insideBottomLeft"
                fill="var(--chart-4)"
                fontSize={10}
              />
            </ReferenceLine>
          )}

          {/* Batch markers：編號圓章＋虛線（轉換用強調色），說明見下方圖例與 tooltip */}
          {markers.map((m) => {
            const isReb = m.kind === 'rebalance'
            return (
              <ReferenceLine
                key={m.date}
                x={m.date}
                stroke={markerColor(m)}
                strokeDasharray="4 4"
                strokeOpacity={isReb ? 0.9 : 0.6}
                strokeWidth={isReb ? 2 : 1}
              >
                <Label content={markerBadge(m)} />
              </ReferenceLine>
            )
          })}
        </ComposedChart>
      </ResponsiveContainer>
      {(markers.length > 0 || showTodayLine) && <MarkerLegend markers={markers} showTodayNote={showTodayLine} />}
    </div>
  )
}
